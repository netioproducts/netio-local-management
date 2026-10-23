import { ConfigService } from "../config/ConfigService";
import { DeviceManager } from "./DeviceManager";
import { User, Device } from "../config/ConfigModel";
import { DeviceDTO, DeviceGroupDTO } from "../types/DTOs";
import { DeviceOfflineError, UnauthorizedError } from "../netio-api/types/Errors";
import { getBasicDeviceInfo } from "../netio-api/transport/univarsal";
import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { DeviceEventService } from "./DeviceEventService";
import { DeviceControlService } from "./DeviceControlService";
import { DeviceDiscoveryService } from "./DeviceDiscoveryService";

export class DeviceService {
  public errorBroadcast?: (message: string, macAddress?: string) => void;

  constructor(
    private configService: ConfigService,
    private deviceManager: DeviceManager,
    private deviceEventService: DeviceEventService,
    private deviceControlService: DeviceControlService,
    private deviceDiscoveryService: DeviceDiscoveryService,
  ) {}

  private onConfigChange = (newConfig: Device) => {
    try {
      this.configService.addOrUpdateDevice(newConfig);
      console.debug("[DeviceService] Device config updated:", newConfig);
    } catch (error) {
      console.error("[DeviceService] Failed to save device config:", error);
      this.errorBroadcast?.(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  private attachDeviceListeners(device: RuntimeDevice): void {
    device.removeAllListeners("config_change");
    device.on("config_change", this.onConfigChange);
    device.removeAllListeners("output_change");
    device.on("output_change", this.deviceEventService.onOutputChange);
    device.removeAllListeners("busy_change");
    device.on("busy_change", this.deviceEventService.onBusyChange);
  }

  private onDevicesLoaded = (devices: RuntimeDevice[]) => {
    devices.forEach((device) => {
      this.attachDeviceListeners(device);

      const [username, password] = [
        device.getConfig().username,
        device.getConfig().password,
      ];
      if (username !== undefined && password !== undefined) {
        device.setupCredentials(username, password, this.deviceManager.clientFactory);
      }
    });
  };

  private getDeviceRuntime(mac: string): RuntimeDevice {
    const device = this.deviceManager.getDevice(
      DeviceManager.normalizeMac(mac),
    );
    if (!device) {
      console.debug(`[DeviceService] Device with MAC ${mac} not found.`);
      throw new Error(`Device with MAC ${mac} does not exist.`);
    }
    return device;
  }

  private getUser(name: string): User {
    const user = this.configService.getUser(name);
    if (!user) {
      console.debug(`[DeviceService] User ${name} not found.`);
      throw new Error(`User ${name} does not exist.`);
    }
    return user;
  }

  public start(): void {
    this.deviceManager.loadFromConfig(
      this.configService.getDevices().map((d) => ({
        ...d,
        username: this.configService.getUser(d.user)?.username,
        password: this.configService.getUser(d.user)?.password,
      })),
      this.onDevicesLoaded,
    );
  }

  public async loginToDevice(
    mac: string,
    userName: string,
  ): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);
    device.assertNotBusy();
    const user = this.getUser(userName);

    try {
      await device.setupCredentials(user.username, user.password, this.deviceManager.clientFactory);
      this.attachDeviceListeners(device);
      await device.syncState();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to login to device ${mac}: ${reason}`);
    }

    // syncState does not throw, it only records the result
    if (!device.isOnline) {
      throw new DeviceOfflineError(`Device ${mac} is offline.`);
    }
    if (!device.isLoggedIn) {
      throw new UnauthorizedError(`Wrong credentials for device ${mac}.`);
    }
    console.log(`[DeviceService] Login to device ${mac} successful.`);
    
    const info = await device.getClient().getSystemInfo();
    device.originalName = info.name;
    device.getConfig().model = info.model;

    const socketInfos = await device.getClient().getOutputs();
    device.sockets = socketInfos.reduce(
      (acc, s) => {
        const customLabel = device.getConfig().sockets?.[s.id - 1] || s.name;
        acc[s.id] = {
          id: [device.getConfig().macAddress, s.id],
          originalLabel: s.name,
          customLabel: customLabel,
          state: s.state,
        };
        return acc;
      },
      {} as any,
    );

    device.getConfig().user = user.name;
    device.emit("config_change", device.getConfig());
    return device.toDTO();
  }

  public async logoutFromDevice(mac: string): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);
    device.assertNotBusy();

    this.deviceManager.setVisibleDevices([]);
    this.deviceEventService.clearOutputThrottler(mac);
    device.clearCredentials();

    const config = device.getConfig();
    delete config.user;
    device.emit("config_change", config);

    console.log(`[DeviceService] Device ${mac} logged out.`);
    return device.toDTO();
  }

  public async updateCredentialsForUser(user: string): Promise<void> {
    this.getUser(user);

    await this.runInBackground(
      this.deviceManager
        .getAllDevices()
        .filter((d) => d.getConfig().user === user),
      async (d) => {
        await this.logoutFromDevice(d.getConfig().macAddress);
        await this.loginToDevice(d.getConfig().macAddress, user);
      },
    );
  }

  public async clearCredentialsForUser(userName: string): Promise<void> {
    this.getUser(userName);

    await this.runInBackground(
      this.deviceManager
        .getAllDevices()
        .filter((d) => d.getConfig().user === userName),
      async (d) => {
        await this.logoutFromDevice(d.getConfig().macAddress);
      },
    );
  }

  /**
   * Runs an operation nobody waits for on each device. Waits for a running exclusive
   * operation instead of failing, failures are reported to the frontend.
   */
  private async runInBackground(
    devices: RuntimeDevice[],
    operation: (device: RuntimeDevice) => Promise<void>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      devices.map(async (d) => {
        await d.whenIdle();
        await operation(d);
      }),
    );

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") return;
      const config = devices[idx].getConfig();
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      console.error(
        `[DeviceService] Background operation failed for ${config.macAddress}:`,
        result.reason,
      );
      this.errorBroadcast?.(
        `Failed to update credentials for device ${config.name || config.macAddress}: ${reason}`,
        config.macAddress,
      );
    });
  }

  public async changeDeviceUser(
    mac: string,
    newUserName: string,
  ): Promise<DeviceDTO> {
    this.getUser(newUserName);
    await this.logoutFromDevice(mac);
    return await this.loginToDevice(mac, newUserName);
  }

  public async createDevice(deviceData: {
    ipAddress: string;
  }): Promise<DeviceDTO> {
    try {
      const basicDeviceInfo = await getBasicDeviceInfo({
        host: deviceData.ipAddress,
      });
      const newDeviceConfig = {
        ip: deviceData.ipAddress,
        mac: basicDeviceInfo.data.deviceSN,
        fwversion: basicDeviceInfo.data.version,
        hostname: basicDeviceInfo.data.hostname,
      };

      await this.deviceManager.loadFromDiscover([newDeviceConfig]);
      console.log(
        `[DeviceService] Added new device with IP ${deviceData.ipAddress}.`,
      );
      return (await this.getDeviceRuntime(newDeviceConfig.mac)).toDTO();
    } catch (error) {
      console.error(
        `[DeviceService] Failed to create device ${deviceData.ipAddress}:`,
        error,
      );
      throw new Error(`Failed to create device ${deviceData.ipAddress}`);
    }
  }

  public async updateDevice(deviceData: {
    macAddress: string;
    ipAddress: string;
  }): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(deviceData.macAddress);
    device.assertNotBusy();

    const config = device.getConfig();
    config.ipAddress = deviceData.ipAddress;
    device.emit("config_change", config);
    console.log(
      `[DeviceService] Device ${deviceData.macAddress} IP updated to "${deviceData.ipAddress}".`,
    );
    return device.toDTO();
  }

  public async removeDevice(macAddress: string): Promise<void> {
    this.getDeviceRuntime(macAddress).assertNotBusy();
    await this.logoutFromDevice(macAddress);
    this.deviceManager.removeDevice(macAddress);
    this.configService.removeDevice(macAddress);
    console.log(`[DeviceService] Device ${macAddress} removed.`);
  }

  public async updateDeviceName(
    mac: string,
    newName: string,
  ): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);

    device.getConfig().name = newName;
    device.emit("config_change", device.getConfig());
    return device.toDTO();
  }

  public async updateSocketNames(
    mac: string,
    socketNames: string[],
  ): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);

    const config = device.getConfig();
    config.sockets = socketNames;

    socketNames.forEach((name, idx) => {
      const socket = device.sockets[idx + 1];
      if (socket) {
        socket.customLabel = name;
      }
    });

    device.emit("config_change", config);
    return device.toDTO();
  }

  public getDeviceGroupsDTO(): DeviceGroupDTO[] {
    return this.configService.getConfig().deviceGroups.map((group, index) => ({
      id: index,
      name: group.name,
      devices: group.devices,
    }));
  }

  public async getDevice(mac: string): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);
    await device.syncState();
    return device.toDTO();
  }

  public async getDeviceDetails(mac: string): Promise<DeviceDTO | any> {
    const device = this.getDeviceRuntime(mac);
    device.assertNotBusy();
    const info = await device.getAllInfo();
    return info || device.toDTO();
  }

  public async getDevices(): Promise<DeviceDTO[]> {
    const devices = this.deviceManager.getAllDevices();
    const online = await this.deviceDiscoveryService.discoverOnlineDevices(devices);
    await this.deviceControlService.syncInBatches(online);
    return [...devices]
      .sort((dev1, dev2) => Number(dev2.isOnline) - Number(dev1.isOnline))
      .map((device) => device.toDTO());
  }

  public async getUngroupedDevices(): Promise<DeviceDTO[]> {
    const ungroupedDevices = this.deviceDiscoveryService.getUngroupedDevicesList();
    const onlineDevices = await this.deviceDiscoveryService.discoverOnlineDevices(ungroupedDevices);
    await this.deviceControlService.syncInBatches(onlineDevices);
    return ungroupedDevices.map((device) => device.toDTO());
  }

  public async getFoundDevices(): Promise<DeviceDTO[]> {
    const onlineDevices = await this.deviceDiscoveryService.discoverOnlineDevices(
      this.deviceDiscoveryService.getUngroupedDevicesList(),
    );
    await this.deviceControlService.syncInBatches(onlineDevices);

    const onlineMacs = onlineDevices.map((d) => d.getConfig().macAddress);
    console.debug("Ungrouped online:", onlineMacs);
    return onlineDevices.map((device) => device.toDTO());
  }

  public async getDevicesInGroup(groupIdx: number): Promise<DeviceDTO[]> {
    const group = this.configService.getConfig().deviceGroups[groupIdx];
    if (!group) {
      throw new Error(`Group index ${groupIdx} does not exist.`);
    }

    const chosenDevices = group.devices
      .map((mac) => this.deviceManager.getDevice(mac))
      .filter((device): device is RuntimeDevice => device !== undefined);

    const online = await this.deviceDiscoveryService.discoverOnlineDevices(chosenDevices);
    await this.deviceControlService.syncInBatches(online);

    return chosenDevices.map((device) => device.toDTO());
  }
}

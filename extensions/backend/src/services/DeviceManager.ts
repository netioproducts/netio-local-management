import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { Device } from "../netio-api/types/Device";
import { DeviceInfo } from "../netio-api/discover/NetioParser";
import { DeviceStatusDTO } from "../types/DTOs";
import { IDeviceClient } from "../netio-api/types/IDeviceClient";

export class DeviceManager {
  private devices = new Map<string, RuntimeDevice>();
  private visibleDevices = new Set<string>();

  constructor(
    public readonly clientFactory: (
      ip: string,
      mac: string,
      user: string,
      pass: string,
      fw?: string,
    ) => IDeviceClient,
  ) {}

  public static normalizeMac(mac: string): string {
    return mac.toLowerCase().replace(/[-:]/g, "");
  }

  public async loadFromConfig(
    devices: Device[],
    onDevicesLoaded?: (devices: RuntimeDevice[]) => void,
  ) {
    for (const device of devices) {
      const normalizedMac = DeviceManager.normalizeMac(device.macAddress);
      const newRuntime = new RuntimeDevice(device);
      this.devices.set(normalizedMac, newRuntime);
    }
    onDevicesLoaded?.(Array.from(this.devices.values()));
  }

  public async loadFromDiscover(devices: DeviceInfo[]) {
    //{ mac: string; ip: string; fwversion: string }[]
    const newDevices: [string, RuntimeDevice][] = [];

    for (const device of devices) {
      if (!device.mac || !device.ip || !device.fwversion) continue;
      const normalizedMac = DeviceManager.normalizeMac(device.mac);

      if (this.devices.has(normalizedMac)) {
        const runtime = this.devices.get(normalizedMac)!;

        if (runtime.getConfig().ipAddress !== device.ip) {
          const newConfig: Device = {
            ...runtime.getConfig(),
            macAddress: normalizedMac,
            ipAddress: device.ip,
            fwVersion: device.fwversion,
          };

          // Cleanup old runtime
          runtime.clearCredentials();

          const newRuntime = new RuntimeDevice(newConfig);
          runtime.listeners("config_change").forEach(l => newRuntime.on("config_change", l as any));
          runtime.listeners("output_change").forEach(l => newRuntime.on("output_change", l as any));
          runtime.listeners("busy_change").forEach(l => newRuntime.on("busy_change", l as any));
          newRuntime.emit("config_change", newConfig);

          if (
            newConfig.username !== undefined &&
            newConfig.password !== undefined
          ) {
            newRuntime.setupCredentials(
              newConfig.username,
              newConfig.password,
              this.clientFactory,
            );
          }
          this.devices.set(normalizedMac, newRuntime);
        }
      } else {
        const newRuntime = new RuntimeDevice({
          macAddress: normalizedMac,
          ipAddress: device.ip,
          fwVersion: device.fwversion,
          model: device.model,
        });
        newRuntime.originalName = device.hostname || null;
        console.log(
          `Discovered new device: ${normalizedMac} at ${device.ip} with name ${device.hostname}`,
        );
        newDevices.push([normalizedMac, newRuntime]);
      }
    }

    // Merge new devices and add them to top of list
    if (newDevices.length > 0) {
      const newMap = new Map<string, RuntimeDevice>(newDevices);
      for (const [key, value] of this.devices) {
        newMap.set(key, value);
      }
      this.devices = newMap;
    }
  }

  public getDevice(mac: string): RuntimeDevice | undefined {
    const normalizedMac = DeviceManager.normalizeMac(mac);
    return this.devices.get(normalizedMac);
  }

  public removeDevice(mac: string) {
    const normalizedMac = DeviceManager.normalizeMac(mac);
    this.devices.delete(normalizedMac);
    this.visibleDevices.delete(normalizedMac);
  }

  public getAllDevices(): RuntimeDevice[] {
    return Array.from(this.devices.values());
  }

  public getOnlineDevices(): RuntimeDevice[] {
    return this.getAllDevices().filter((d) => d.isOnline);
  }

  private updateDeviceVisibility(macs: string[], visibility: boolean): void {
    console.debug(
      `Updating visibility for devices: ${macs.join(", ")} to ${visibility}`,
    );
    macs.forEach((mac) => {
      const normalizedMac = DeviceManager.normalizeMac(mac);
      if (this.devices.has(normalizedMac)) {
        visibility
          ? this.devices.get(normalizedMac)!.enablePolling()
          : this.devices.get(normalizedMac)!.disablePolling();
      }
    });
  }

  /**
   * Replace the set of currently visible devices with the given MAC addresses.
   * Previous visible devices are invalidated.
   */
  public setVisibleDevices(macs: string[]): void {
    this.updateDeviceVisibility(Array.from(this.visibleDevices), false);
    this.visibleDevices.clear();
    this.updateDeviceVisibility(macs, true);
    for (const mac of macs) {
      this.visibleDevices.add(DeviceManager.normalizeMac(mac));
    }
  }

  /**
   * Returns the RuntimeDevices that are currently marked as visible.
   */
  public getVisibleDevices(): RuntimeDevice[] {
    return Array.from(this.visibleDevices)
      .map((mac) => this.devices.get(mac))
      .filter((d): d is RuntimeDevice => d !== undefined);
  }

  /**
   * Check whether a device is currently visible on screen.
   */
  public isDeviceVisible(mac: string): boolean {
    return this.visibleDevices.has(DeviceManager.normalizeMac(mac));
  }
}

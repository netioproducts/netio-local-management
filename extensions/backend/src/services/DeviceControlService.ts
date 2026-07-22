import { DeviceManager } from "./DeviceManager";
import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { DeviceDTO } from "../types/DTOs";
import { SocketId } from "../types/SocketId";
import { DeviceEventService } from "./DeviceEventService";

export class DeviceControlService {
  constructor(
    private deviceManager: DeviceManager,
    private deviceEventService: DeviceEventService,
  ) {}

  private getDeviceRuntime(mac: string): RuntimeDevice {
    const device = this.deviceManager.getDevice(
      DeviceManager.normalizeMac(mac),
    );
    if (!device) {
      console.debug(`[DeviceControlService] Device with MAC ${mac} not found.`);
      throw new Error(`Device with MAC ${mac} does not exist.`);
    }
    return device;
  }

  public async syncInBatches(
    devices: RuntimeDevice[],
    batchSize = 8,
    delayMs = 200,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      batch.forEach((device) => promises.push(device.syncState()));
      if (i + batchSize < devices.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    await Promise.allSettled(promises);
  }

  public async controlDeviceSockets(
    mac: string,
    newState?: boolean,
  ): Promise<DeviceDTO> {
    const device = this.getDeviceRuntime(mac);
    if (!device.isOnline) {
      throw new Error(`Device ${mac} is not online. Cannot control sockets.`);
    }

    if (newState !== undefined) {
      await device.setAllSocketsState(newState);
    } else {
      await device.toggleAllSockets();
    }
    this.deviceEventService.clearOutputThrottler(mac); // Dont update state from old data
    return device.toDTO();
  }

  public async controlSocket(
    socketId: SocketId,
    status?: boolean,
  ): Promise<DeviceDTO> {
    const [deviceMac, socketIndex] = socketId;
    const device = this.getDeviceRuntime(deviceMac);
    if (!device.isOnline) {
      throw new Error(
        `Device ${deviceMac} is not online. Cannot control sockets.`,
      );
    }
    if (!device.sockets?.[socketIndex]) {
      throw new Error(
        `Socket ${socketIndex} not present on device ${deviceMac}.`,
      );
    }

    if (status !== undefined) {
      await device.setSocketState(socketIndex, status);
    } else {
      await device.toggleSocket(socketIndex);
    }
    this.deviceEventService.clearOutputThrottler(deviceMac); // Dont update state from old data
    return device.toDTO();
  }

  public factoryReset(mac: string): Promise<void> {
    const device = this.getDeviceRuntime(mac);
    return device.factoryReset();
  }

  public async locateDevices(macs: string[]): Promise<void> {
    const normalizedMacs = macs.map((mac) => DeviceManager.normalizeMac(mac));
    const devicesToLocate = this.deviceManager
      .getAllDevices()
      .filter((device) =>
        normalizedMacs.includes(device.getConfig().macAddress),
      );

    return Promise.allSettled(
      devicesToLocate.map((device) => device.locateDevice()),
    ).then(() => undefined);
  }
}

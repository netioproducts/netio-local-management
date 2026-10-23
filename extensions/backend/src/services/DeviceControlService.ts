import { DeviceManager } from "./DeviceManager";
import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { DeviceDTO } from "../types/DTOs";
import { SocketId } from "../types/SocketId";
import { DeviceEventService } from "./DeviceEventService";
import { createLogger } from "../logging/Logger";

const log = createLogger("DeviceControlService");

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
      log.debug("Device not found", { mac });
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
    log.debug("Syncing devices", { count: devices.length, batchSize });

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
    device.assertNotBusy();
    if (!device.isOnline) {
      log.warn("Cannot control sockets, device is offline", { mac });
      throw new Error(`Device ${mac} is not online. Cannot control sockets.`);
    }

    log.info("Switching all sockets", {
      mac,
      state: newState === undefined ? "toggle" : newState,
    });
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
    device.assertNotBusy();
    if (!device.isOnline) {
      log.warn("Cannot control socket, device is offline", {
        mac: deviceMac,
        socket: socketIndex,
      });
      throw new Error(
        `Device ${deviceMac} is not online. Cannot control sockets.`,
      );
    }
    if (!device.sockets?.[socketIndex]) {
      log.warn("Cannot control socket, socket not present", {
        mac: deviceMac,
        socket: socketIndex,
      });
      throw new Error(
        `Socket ${socketIndex} not present on device ${deviceMac}.`,
      );
    }

    log.info("Switching socket", {
      mac: deviceMac,
      socket: socketIndex,
      state: status === undefined ? "toggle" : status,
    });
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
    const startedAt = Date.now();
    log.info("Factory reset started", { mac });
    return device.factoryReset().then(
      () => {
        log.info("Factory reset finished", {
          mac,
          durationMs: Date.now() - startedAt,
        });
      },
      (error) => {
        log.warn("Factory reset failed", {
          mac,
          durationMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      },
    );
  }

  public async locateDevices(macs: string[]): Promise<void> {
    const normalizedMacs = macs.map((mac) => DeviceManager.normalizeMac(mac));
    const devicesToLocate = this.deviceManager
      .getAllDevices()
      .filter((device) =>
        normalizedMacs.includes(device.getConfig().macAddress),
      )
      .filter((device) => !device.isBusy);
    log.info("Locating devices", {
      macs: devicesToLocate.map((device) => device.getConfig().macAddress),
      skipped: normalizedMacs.length - devicesToLocate.length,
    });

    return Promise.allSettled(
      devicesToLocate.map((device) => device.locateDevice()),
    ).then(() => undefined);
  }
}

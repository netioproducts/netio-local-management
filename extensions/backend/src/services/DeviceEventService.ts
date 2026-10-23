import { throttle } from "lodash";
import { DeviceBusyDTO, DeviceStatusDTO } from "../types/DTOs";
import { TransportService } from "../transport/TransportService";
import { DeviceManager } from "./DeviceManager";
import { createLogger } from "../logging/Logger";

const log = createLogger("DeviceEventService");

export class DeviceEventService {
  private static readonly OUTPUT_BROADCAST_THROTTLE_MS = 3000;
  private outputBroadcastThrottleMs: number =
    DeviceEventService.OUTPUT_BROADCAST_THROTTLE_MS;
  private outputChangeThrottlers = new Map<
    string,
    ReturnType<typeof throttle>
  >();

  constructor(
    private transportService: TransportService,
    private deviceManager: DeviceManager,
  ) {}

  public onBusyChange = (status: DeviceBusyDTO) => {
    // Not throttled nor filtered by visibility, lock changes are rare
    if (status.busyOperation) {
      log.info("Device locked", {
        mac: status.macAddress,
        operation: status.busyOperation,
      });
    } else {
      log.info("Device unlocked", { mac: status.macAddress });
    }
    this.transportService.broadcast("device_busy", status);
  };

  public onOutputChange = (status: DeviceStatusDTO) => {
    const mac = DeviceManager.normalizeMac(status.macAddress);
    if (!this.deviceManager.isDeviceVisible(mac)) {
      return;
    }
    log.debug("Processing output change", { mac: status.macAddress });
    const throttledBroadcast = this.getOrCreateOutputThrottler(mac);
    throttledBroadcast(status);
  };

  private getOrCreateOutputThrottler(
    macAddress: string,
  ): ReturnType<typeof throttle> {
    const normalizedMac = DeviceManager.normalizeMac(macAddress);
    const existing = this.outputChangeThrottlers.get(normalizedMac);
    if (existing) {
      return existing;
    }

    const throttled = throttle(
      (status: DeviceStatusDTO) => {
        log.debug("Broadcasting throttled device update", {
          mac: status.macAddress,
        });
        this.transportService.broadcast("device_update", status);
      },
      this.outputBroadcastThrottleMs,
      {
        leading: false,
        trailing: true,
      },
    );

    this.outputChangeThrottlers.set(normalizedMac, throttled);
    return throttled;
  }

  public clearOutputThrottler(macAddress: string): void {
    const normalizedMac = DeviceManager.normalizeMac(macAddress);
    const throttled = this.outputChangeThrottlers.get(normalizedMac);
    if (!throttled) {
      return;
    }

    throttled.cancel();
    this.outputChangeThrottlers.delete(normalizedMac);
    log.debug("Output throttler cleared", { mac: normalizedMac });
  }

  public subscribeToDeviceUpdates(
    macs: string[],
    throttleTime: number = DeviceEventService.OUTPUT_BROADCAST_THROTTLE_MS,
  ): void {
    const normalizedMacs = macs.map((mac) => DeviceManager.normalizeMac(mac));
    log.debug("Subscribing to device updates", {
      macs: normalizedMacs,
      throttleMs: throttleTime,
    });
    this.deviceManager.getVisibleDevices().forEach((device) => {
      this.clearOutputThrottler(device.getConfig().macAddress);
    });
    this.outputBroadcastThrottleMs = throttleTime;
    this.deviceManager.setVisibleDevices(normalizedMacs);
  }
}

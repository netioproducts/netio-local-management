import { throttle } from "lodash";
import { DeviceStatusDTO } from "../types/DTOs";
import { TransportService } from "../transport/TransportService";
import { DeviceManager } from "./DeviceManager";

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

  public onOutputChange = (status: DeviceStatusDTO) => {
    const mac = DeviceManager.normalizeMac(status.macAddress);
    if (!this.deviceManager.isDeviceVisible(mac)) {
      return;
    }
    console.debug(
      `[DeviceEventService] Processing output change for device ${status.macAddress}`,
    );
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
  }

  public subscribeToDeviceUpdates(
    macs: string[],
    throttleTime: number = DeviceEventService.OUTPUT_BROADCAST_THROTTLE_MS,
  ): void {
    const normalizedMacs = macs.map((mac) => DeviceManager.normalizeMac(mac));
    this.deviceManager.getVisibleDevices().forEach((device) => {
      this.clearOutputThrottler(device.getConfig().macAddress);
    });
    this.outputBroadcastThrottleMs = throttleTime;
    this.deviceManager.setVisibleDevices(normalizedMacs);
  }
}

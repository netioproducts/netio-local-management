import { DeviceStatusDTO } from "./DeviceUpdate";

export type EventMap = {
  device_update: DeviceStatusDTO;
  backendError: { error: string; macAddress?: string };
  backendWarning: { message: string };
  device_busy: { macAddress: string; busyOperation: string | null };
  firmware_progress: { macAddress: string; progress: number; status: string };
  config_progress: { macAddress: string; progress: number; status: string };
};

export type EventKey = keyof EventMap;

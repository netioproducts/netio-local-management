import { DeviceStatusDTO } from "./DeviceUpdate";

export type EventMap = {
  device_update: DeviceStatusDTO;
  backendError: { error: string };
  firmware_progress: { macAddress: string; progress: number; status: string };
  config_progress: { macAddress: string; progress: number; status: string };
};

export type EventKey = keyof EventMap;

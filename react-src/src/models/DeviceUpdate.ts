import { SocketId } from "./Socket";

export interface DeviceStatusDTO {
  macAddress: string;
  isOnline: boolean;
  sockets: {
    id: SocketId;
    status: boolean;
    load?: number;
  }[];
}

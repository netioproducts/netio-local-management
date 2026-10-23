import { SocketId } from "./SocketId";

export interface SocketGroupDTO {
  id: number;
  name: string;
  sockets: SocketId[];
}

export interface DeviceGroupDTO {
  id: number;
  name: string;
  devices: string[];
}

export interface DeviceDTO {
  macAddress: string;
  ipAddress: string;
  fwVersion: string;
  name: string;
  originalName: string;
  model: string;
  sockets: SocketDTO[];
  isOnline: boolean;
  isLoggedIn: boolean;
  user?: string;
  busyOperation: string | null; // Running exclusive operation, null when idle
}

export interface DeviceBusyDTO {
  macAddress: string;
  busyOperation: string | null;
}

export interface SocketDTO {
  id: SocketId;
  label: string;
  originalLabel: string;
  status: boolean;
  load?: number;
}

export interface DeviceStatusDTO {
  macAddress: string;
  isOnline: boolean;
  sockets: {
    id: SocketId;
    status: boolean;
    load?: number;
  }[];
}

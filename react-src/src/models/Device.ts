import { Socket } from "./Socket";

export interface Device {
  macAddress: string;
  ipAddress: string;
  fwVersion: string;
  name: string;
  originalName: string;
  model: string;
  sockets: Socket[];
  isOnline: boolean;
  isLoggedIn: boolean;
  user?: string;
}

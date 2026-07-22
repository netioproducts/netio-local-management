export interface Device {
  macAddress: string;
  ipAddress: string;
  fwVersion?: string;
  name?: string;
  model?: string;
  sockets?: string[]; // Socket name array

  user?: string;
  username?: string;
  password?: string;
}

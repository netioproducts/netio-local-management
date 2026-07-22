export interface Socket {
  id: SocketId;
  label: string;
  originalLabel: string;
  status: boolean;
  load?: number;
}

export type SocketId = [string, number];

// types/Runtime.ts
import { SocketId } from "../../types/SocketId";

export interface RuntimeSocket {
  id: SocketId;
  state?: boolean;
  originalLabel?: string;
  customLabel: string;
  load?: number;
}

import { Device } from "../models/Device";
import { DeviceStatusDTO } from "../models/DeviceUpdate";
import { SocketId } from "../models/Socket";

export const normalizeMac = (mac: string): string =>
  mac.toLowerCase().replace(/[-:]/g, "");

const socketKey = (id: SocketId): string => `${normalizeMac(id[0])}:${id[1]}`;

export const mergeDeviceWithSocketPreserve = (
  current: Device,
  incoming: Device,
): Device => {
  const incomingById = new Map(
    incoming.sockets.map((socket) => [socketKey(socket.id), socket]),
  );

  const mergedSockets = current.sockets.map((socket) => {
    const nextSocket = incomingById.get(socketKey(socket.id));
    if (!nextSocket) {
      return socket;
    }

    return {
      ...socket,
      ...nextSocket,
      load: nextSocket.load ?? socket.load,
    };
  });

  return {
    ...current,
    ...incoming,
    sockets: mergedSockets,
  };
};

export const applyDeviceStatusUpdate = (
  current: Device,
  status: DeviceStatusDTO,
): Device => {
  if (normalizeMac(current.macAddress) !== normalizeMac(status.macAddress)) {
    return current;
  }

  return {
    ...current,
    isOnline: status.isOnline,
    sockets: current.sockets.map((socket) => {
      const updatedSocket = status.sockets.find(
        (s) => socketKey(s.id) === socketKey(socket.id),
      );

      if (!updatedSocket) {
        return socket;
      }

      return {
        ...socket,
        status: updatedSocket.status,
        load: updatedSocket.load,
      };
    }),
  };
};

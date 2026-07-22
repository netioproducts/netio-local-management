import { deviceService } from '../../services/deviceService';
import { Device } from '../../models/Device';
import { Socket, SocketId } from '../../models/Socket';
import { Group } from '../../models/Group';
import { handleLoadingAction } from '../../utils/asyncUtils';

export const toggleSocket = async (
  id: SocketId,
  setSockets: React.Dispatch<React.SetStateAction<Socket[]>>,
  newState?: boolean
): Promise<void> => {
  try {
    const updatedDevice: Device = await deviceService.controlSocket(id, newState);
    if (!updatedDevice || (newState && updatedDevice.sockets[id[1] - 1].status !== newState)) return;
    setSockets(prev => prev.map(s => s.id === id ? { ...s, status: updatedDevice.sockets[id[1] - 1].status } : s));
  } catch (err) {
    console.error('Toggle failed for', id, err);
    throw err;
  }
};

export async function handleTopButtonClick(): Promise<void> {
  console.log(deviceService.pingService());
  return handleLoadingAction<void>({}, deviceService.searchDevices);
}

export async function getSocketGroups(): Promise<Group[]> {
  try {
    const groups: Group[] = await deviceService.getSocketGroups();
    return groups;
  } catch (err) {
    console.error('Failed to load socket groups', err);
    throw err;
  }
}

export async function getDeviceGroups(): Promise<Group[]> {
  try {
    const groups: Group[] = await deviceService.getDeviceGroups();
    return groups;
  } catch (err) {
    console.error('Failed to load device groups', err);
    throw err;
  }
}

export async function getSocketsByDeviceGroup(id: number): Promise<Device[]> {
  try {
    const devices: Device[] = await deviceService.getSocketsByDeviceGroup(id);
    return devices;
  } catch (err) {
    console.error(`Failed to load devices in group ${id}`, err);
    throw err;
  }
}

export async function getSocketsInGroup(id: number): Promise<Socket[]> {
  try {
    const sockets: Socket[] = await deviceService.getSocketsInGroup(id);
    return sockets;
  } catch (err) {
    console.error(`Failed to load sockets in group ${id}`, err);
    throw err;
  }
}
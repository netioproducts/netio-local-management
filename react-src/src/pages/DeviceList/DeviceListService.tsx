// ...existing code...
import { deviceService } from '../../services/deviceService';
import { Device } from '../../models/Device';
import { Group } from '../../models/Group';
import { handleLoadingAction } from '../../utils/asyncUtils';
import { SocketId } from '../../models/Socket';
import { notify } from '../../services/notificationService';
import { mergeDeviceWithSocketPreserve } from '../../utils/deviceStateUtils';

export const toggleDeviceSocket = async (
  id: SocketId,
  newState: boolean,
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>
): Promise<void> => {
  const [deviceId, _] = id;

  try {
    const updatedDevice: Device = await deviceService.controlSocket(id, newState);

    if (!updatedDevice) return;
    setDevices((prevDevices) =>
      prevDevices.map((device) => {
        if (device.macAddress === deviceId) {
          return mergeDeviceWithSocketPreserve(device, updatedDevice);
        }
        return device;
      })
    );
  } catch (err) {
    console.error("Toggle failed for", id, err);
  }
};

export async function handleTopButtonClick(): Promise<void> {
  return handleLoadingAction({}, deviceService.searchDevices);
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

export async function handleLogin(macAddress: string, userName: string, setDevices: React.Dispatch<React.SetStateAction<Device[]>>): Promise<void> {
  await handleLoadingAction<Device | null>(
    {
      onError: () => notify.error("Login failed", `Failed to login to device`),
      onLoaded: (device) => {
        if (!device) {
          notify.error("Login failed", "Failed to login to device");
        }
        else {
          setDevices((prev) => prev.map((d) => d.macAddress === device.macAddress ? device : d));
          notify.success("Login successful", `Logged in as ${userName} on device ${device.name}`);
        }
      }
    },
    () => deviceService.loginToDevice(macAddress, userName)
  ).catch(() => { });
};

export async function handleMultipleLogin(macAddresses: string[], userName: string, setDevices: React.Dispatch<React.SetStateAction<Device[]>>): Promise<void> {
  await Promise.all(macAddresses.map((mac) => handleLogin(mac, userName, setDevices)));
}

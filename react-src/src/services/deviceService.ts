import { Device } from "../models/Device";
import { Group } from "../models/Group";
import { SocketId } from "../models/Socket";
import { request } from "./neutralinoTransport";

const searchDevices = (): Promise<void> => {
  return request("searchDevices", undefined, 30000);
};

const pingService = () => {
  return request("ping");
};

const getConfig = () => {
  return request("getConfig");
};

const getDevice = (id: string): Promise<Device> => {
  return request("getDevice", { macAddress: id }, 10000);
};

const updateDevice = (device: {
  ipAddress: string;
  macAddress: string;
}): Promise<void> => {
  return request("updateDevice", { device });
};

const createDevice = (device: { ipAddress: string }): Promise<void> => {
  return request("createDevice", { device });
};

const removeDevice = (macAddress: string): Promise<void> => {
  return request("removeDevice", { macAddress });
};

const getDevices = (): Promise<Device[]> => {
  return request("getDevices", {}, 10000);
};

const getSocketGroups = () => {
  return request("getSocketGroups");
};

const getSocketsInGroup = (groupId: number) => {
  return request("getSocketsInGroup", { groupId });
};

const getDeviceGroups = (): Promise<Group[]> => {
  return request("getDeviceGroups");
};

const getDeviceGroupsP = (): Promise<Group[]> => {
  return request("getDeviceGroupsP");
};

const createDeviceGroup = (groupName: string): Promise<void> => {
  return request("createDeviceGroup", { groupName });
};

const updateDeviceGroup = (group: Group): Promise<void> => {
  return request("updateDeviceGroup", { group });
};

const removeDeviceGroup = (groupId: number): Promise<void> => {
  return request("removeDeviceGroup", { groupId });
};

const addDevicesToGroup = (
  groupId: number,
  deviceMacs: string[],
): Promise<void> => {
  return request("addDevicesToGroup", { groupId, deviceMacs });
};

const removeDevicesFromGroup = (
  groupId: number,
  deviceMacs: string[],
): Promise<void> => {
  return request("removeDevicesFromGroup", { groupId, deviceMacs });
};

const getDevicesInGroup = (groupId: number): Promise<Device[]> => {
  return request("getDevicesInGroup", { groupId }, 15000);
};

const getSocketsByDeviceGroup = (groupId: number) => {
  return request("getSocketsByDeviceGroup", { groupId });
};

const controlSocket = (
  socketId: SocketId,
  status?: boolean,
): Promise<Device> => {
  return request("controlSocket", { socketId, status }, 10000);
};

const controlDeviceSockets = (
  deviceMac: string,
  status?: boolean,
): Promise<Device> => {
  return request("controlDeviceSockets", { deviceMac, status }, 10000);
};

const loginToDevice = (
  macAddress: string,
  userName: string,
): Promise<Device> => {
  return request("loginToDevice", { macAddress, userName });
};

const getUngroupedDevices = (): Promise<Device[]> => {
  return request("getUngroupedDevices", {}, 30000);
};

const getFoundDevices = (): Promise<Device[]> => {
  return request("getFoundDevices", {}, 30000);
};

const getDeviceDetails = (id: string): Promise<any> => {
  return request("getDeviceDetails", { macAddress: id }, 15000);
};

const uploadFirmware = (
  macAddress: string,
  filePath: string,
): Promise<void> => {
  return request("uploadFirmware", { macAddress, filePath }, 600000);
};

const importConfig = (
  macAddress: string,
  filePath: string,
): Promise<void> => {
  return request("importConfig", { macAddress, filePath }, 180000);
};

const exportConfig = (macAddress: string): Promise<{ success: boolean, filePath: string }> => {
  return request("exportConfig", { macAddress }, 60000);
};

const restoreConfig = (macAddress: string): Promise<void> => {
  return request("restoreConfig", { macAddress }, 180000);
};

const updateDeviceName = (
  macAddress: string,
  name: string,
): Promise<Device> => {
  return request("updateDeviceName", { macAddress, name }, 10000);
};

const updateSocketNames = (
  macAddress: string,
  socketNames: string[],
): Promise<Device> => {
  return request("updateSocketNames", { macAddress, socketNames }, 10000);
};

const logoutFromDevice = (macAddress: string): Promise<Device> => {
  return request("logoutFromDevice", { macAddress }, 10000);
};

const changeDeviceUser = (
  macAddress: string,
  newUserName: string,
): Promise<Device> => {
  return request("changeDeviceUser", { macAddress, newUserName }, 15000);
};

const factoryReset = (macAddress: string): Promise<void> => {
  return request("factoryResetDevice", { macAddress }, 20000);
};

const subscribeToDeviceUpdates = (
  macs: string[],
  throttleTime?: number,
): Promise<void> => {
  return request("subscribeToDeviceUpdates", { macs, throttleTime });
};

const unsubscribeFromDeviceUpdates = (): Promise<void> => {
  return request("unsubscribeFromDeviceUpdates", {});
};

const locateDevices = (macs: string[]): Promise<void> => {
  return request("locateDevices", { macs });
};

export const deviceService = {
  searchDevices,
  pingService,
  getConfig,
  getSocketGroups,
  getDeviceGroups,
  getDeviceGroupsP,
  getDevicesInGroup,
  getSocketsInGroup,
  controlSocket,
  controlDeviceSockets,
  loginToDevice,
  getSocketsByDeviceGroup,
  createDeviceGroup,
  updateDeviceGroup,
  removeDeviceGroup,
  addDevicesToGroup,
  removeDevicesFromGroup,
  getUngroupedDevices,
  getDevice,
  getDeviceDetails,
  uploadFirmware,
  importConfig,
  exportConfig,
  restoreConfig,
  getFoundDevices,
  updateDeviceName,
  updateSocketNames,
  logoutFromDevice,
  changeDeviceUser,
  getDevices,
  updateDevice,
  createDevice,
  removeDevice,
  factoryReset,
  subscribeToDeviceUpdates,
  unsubscribeFromDeviceUpdates,
  locateDevices,
};

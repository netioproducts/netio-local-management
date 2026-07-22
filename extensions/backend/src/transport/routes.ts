import { RequestContext } from "./TransportService";
import { DeviceDTO, DeviceGroupDTO } from "../types/DTOs";
import { SocketId } from "../types/SocketId";
import { DeviceService } from "../services/DeviceService";
import { UserService } from "../services/UserService";
import { GroupService } from "../services/GroupService";
import { DeviceControlService } from "../services/DeviceControlService";
import { DeviceDiscoveryService } from "../services/DeviceDiscoveryService";
import { DeviceFileService } from "../services/DeviceFileService";
import { DeviceEventService } from "../services/DeviceEventService";

export type Handler = (ctx: RequestContext, data: any) => Promise<void> | void;

export const createRoutes = (
  deviceService: DeviceService,
  userService: UserService,
  groupService: GroupService,
  deviceControlService: DeviceControlService,
  deviceDiscoveryService: DeviceDiscoveryService,
  deviceFileService: DeviceFileService,
  deviceEventService: DeviceEventService,
): Record<string, Handler> => {
  return {
    ping: async (ctx, data) => {
      ctx.sendMessage({ pong: data });
    },
    searchDevices: async (ctx) => {
      await deviceDiscoveryService.searchDevices();
      ctx.sendMessage({ success: true });
    },
    getDeviceGroups: async (ctx) => {
      const groups: DeviceGroupDTO[] = groupService.getDeviceGroupsDTO();
      ctx.sendMessage(groups);
    },
    getDeviceGroupsP: async (ctx) => {
      const groups: DeviceGroupDTO[] = groupService.getDeviceGroupsDTO();
      ctx.sendMessage(groups);
    },
    getDevicesInGroup: async (ctx, data) => {
      const groupId = data.groupId;
      const devices: DeviceDTO[] =
        await deviceService.getDevicesInGroup(groupId);
      ctx.sendMessage(devices);
    },
    createDeviceGroup: async (ctx, data) => {
      const group = data as { groupName: string };
      groupService.createDeviceGroup(group.groupName);
      ctx.sendMessage({});
    },
    updateDeviceGroup: async (ctx, data) => {
      const group = data.group as { id: number; name: string };
      groupService.updateDeviceGroup(group);
      ctx.sendMessage({});
    },
    removeDeviceGroup: async (ctx, data) => {
      const groupId = data.groupId as number;
      groupService.removeDeviceGroup(groupId);
      ctx.sendMessage({});
    },
    addDevicesToGroup: async (ctx, data) => {
      const { groupId, deviceMacs } = data as {
        groupId: number;
        deviceMacs: string[];
      };
      groupService.addDevicesToGroup(groupId, deviceMacs);
      ctx.sendMessage({});
    },
    removeDevicesFromGroup: async (ctx, data) => {
      const { groupId, deviceMacs } = data as {
        groupId: number;
        deviceMacs: string[];
      };
      groupService.removeDevicesFromGroup(groupId, deviceMacs);
      ctx.sendMessage({});
    },
    controlSocket: async (ctx, data) => {
      const { socketId, status } = data as {
        socketId: SocketId;
        status?: boolean;
      };
      const device = await deviceControlService.controlSocket(socketId, status);
      ctx.sendMessage(device);
    },
    controlDeviceSockets: async (ctx, data) => {
      const { deviceMac, status } = data as {
        deviceMac: string;
        status?: boolean;
      };
      const device = await deviceControlService.controlDeviceSockets(
        deviceMac,
        status,
      );
      ctx.sendMessage(device);
    },
    saveUser: async (ctx, data) => {
      const { name, username, password } = data as {
        name: string;
        username: string;
        password: string;
      };
      userService.saveUser({ name, username, password });
      ctx.sendMessage({});
    },
    getUsers: async (ctx) => {
      const users = userService.getUsers();
      ctx.sendMessage(users);
    },
    removeUser: async (ctx, data) => {
      const { name } = data as { name: string };
      userService.removeUser(name);
      ctx.sendMessage({ success: true });
    },
    loginToDevice: async (ctx, data) => {
      const { macAddress, userName } = data as {
        macAddress: string;
        userName: string;
      };
      const device = await deviceService.loginToDevice(macAddress, userName);
      ctx.sendMessage(device);
    },
    getUngroupedDevices: async (ctx) => {
      const devices = await deviceService.getUngroupedDevices();
      ctx.sendMessage(devices);
    },
    getFoundDevices: async (ctx) => {
      const devices = await deviceService.getFoundDevices();
      ctx.sendMessage(devices);
    },
    getDevice: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      const device = await deviceService.getDevice(macAddress);
      ctx.sendMessage(device);
    },
    getDeviceDetails: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      const detail = await deviceService.getDeviceDetails(macAddress);
      ctx.sendMessage(detail);
    },
    uploadFirmware: async (ctx, data) => {
      const { macAddress, filePath } = data as {
        macAddress: string;
        filePath: string;
      };
      const device = await deviceFileService.uploadFirmware(macAddress, filePath);
      ctx.sendMessage(device);
    },
    importConfig: async (ctx, data) => {
      const { macAddress, filePath } = data as {
        macAddress: string;
        filePath: string;
      };
      const device = await deviceFileService.importConfig(macAddress, filePath);
      ctx.sendMessage(device);
    },
    exportConfig: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      const filePath = await deviceFileService.exportConfig(macAddress);
      ctx.sendMessage({ success: true, filePath });
    },
    restoreConfig: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      const device = await deviceFileService.restoreConfig(macAddress);
      ctx.sendMessage(device);
    },
    updateDeviceName: async (ctx, data) => {
      const { macAddress, name } = data as { macAddress: string; name: string };
      const device = await deviceService.updateDeviceName(macAddress, name);
      ctx.sendMessage(device);
    },
    updateSocketNames: async (ctx, data) => {
      const { macAddress, socketNames } = data as {
        macAddress: string;
        socketNames: string[];
      };
      const device = await deviceService.updateSocketNames(
        macAddress,
        socketNames,
      );
      ctx.sendMessage(device);
    },
    logoutFromDevice: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      const device = await deviceService.logoutFromDevice(macAddress);
      ctx.sendMessage(device);
    },
    changeDeviceUser: async (ctx, data) => {
      const { macAddress, newUserName } = data as {
        macAddress: string;
        newUserName: string;
      };
      const device = await deviceService.changeDeviceUser(
        macAddress,
        newUserName,
      );
      ctx.sendMessage(device);
    },
    getDevices: async (ctx) => {
      const devices = await deviceService.getDevices();
      ctx.sendMessage(devices);
    },
    updateDevice: async (ctx, data) => {
      const device = data.device as { macAddress: string; ipAddress: string };
      const updatedDevice = await deviceService.updateDevice(device);
      ctx.sendMessage(updatedDevice);
    },
    createDevice: async (ctx, data) => {
      const device = data.device as { ipAddress: string };
      const createdDevice = await deviceService.createDevice(device);
      ctx.sendMessage(createdDevice);
    },
    removeDevice: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      await deviceService.removeDevice(macAddress);
      ctx.sendMessage({ success: true });
    },
    factoryResetDevice: async (ctx, data) => {
      const { macAddress } = data as { macAddress: string };
      await deviceControlService.factoryReset(macAddress);
      ctx.sendMessage({ success: true });
    },
    subscribeToDeviceUpdates: async (ctx, data) => {
      const { macs, throttleTime } = data as {
        macs: string[];
        throttleTime?: number;
      };
      deviceEventService.subscribeToDeviceUpdates(macs, throttleTime);
      ctx.sendMessage({ success: true });
    },
    unsubscribeFromDeviceUpdates: async (ctx) => {
      deviceEventService.subscribeToDeviceUpdates([]);
      ctx.sendMessage({ success: true });
    },
    locateDevices: async (ctx, data) => {
      const { macs } = data as { macs: string[] };
      await deviceControlService.locateDevices(macs);
      ctx.sendMessage({ success: true });
    },
  };
};

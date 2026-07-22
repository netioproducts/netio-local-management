import { DeviceGroup } from "../config/ConfigModel";
import { ConfigService } from "../config/ConfigService";
import { DeviceGroupDTO } from "../types/DTOs";

export class GroupService {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  // helper metods
  private getDeviceGroup(id: number): DeviceGroup {
    const group = this.configService.getConfig().deviceGroups[id];
    if (!group) {
      console.debug(`[GroupService] Group ${id} not found.`);
      throw new Error(`Group ${id} does not exist.`);
    }
    return group;
  }

  public getDeviceGroups(): DeviceGroup[] {
    return this.configService.getConfig().deviceGroups;
  }

  public getDeviceGroupsDTO(): DeviceGroupDTO[] {
    return this.getDeviceGroups().map((group, index) => ({
      id: index,
      name: group.name,
      devices: group.devices,
    }));
  }

  public createDeviceGroup(groupName: string): void {
    this.configService.addDeviceGroup({ name: groupName, devices: [] });
  }

  public updateDeviceGroup(group: { id: number; name: string }): void {
    this.getDeviceGroup(group.id); // Ensure group exists
    const devices =
      this.configService.getConfig().deviceGroups[group.id].devices;
    this.configService.updateDeviceGroup(group.id, {
      name: group.name,
      devices: devices,
    });
  }

  public removeDeviceGroup(groupId: number): void {
    this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.removeDeviceGroup(groupId);
  }

  public addDevicesToGroup(groupId: number, deviceMacs: string[]): void {
    this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.addDevicesToGroup(groupId, deviceMacs);
  }

  public removeDevicesFromGroup(groupId: number, deviceMacs: string[]): void {
    this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.removeDevicesFromGroup(groupId, deviceMacs);
  }
}

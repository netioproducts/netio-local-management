import { DeviceGroup } from "../config/ConfigModel";
import { ConfigService } from "../config/ConfigService";
import { DeviceGroupDTO } from "../types/DTOs";
import { createLogger } from "../logging/Logger";

const log = createLogger("GroupService");

export class GroupService {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  // helper metods
  private getDeviceGroup(id: number): DeviceGroup {
    const group = this.configService.getConfig().deviceGroups[id];
    if (!group) {
      log.debug("Group not found", { group: id });
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
    log.info("Group created", { name: groupName });
  }

  public updateDeviceGroup(group: { id: number; name: string }): void {
    this.getDeviceGroup(group.id); // Ensure group exists
    const devices =
      this.configService.getConfig().deviceGroups[group.id].devices;
    this.configService.updateDeviceGroup(group.id, {
      name: group.name,
      devices: devices,
    });
    log.info("Group renamed", { group: group.id, name: group.name });
  }

  public removeDeviceGroup(groupId: number): void {
    const group = this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.removeDeviceGroup(groupId);
    log.info("Group removed", { group: groupId, name: group.name });
  }

  public addDevicesToGroup(groupId: number, deviceMacs: string[]): void {
    this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.addDevicesToGroup(groupId, deviceMacs);
    log.info("Devices added to group", { group: groupId, macs: deviceMacs });
  }

  public removeDevicesFromGroup(groupId: number, deviceMacs: string[]): void {
    this.getDeviceGroup(groupId); // Ensure group exists
    this.configService.removeDevicesFromGroup(groupId, deviceMacs);
    log.info("Devices removed from group", { group: groupId, macs: deviceMacs });
  }
}

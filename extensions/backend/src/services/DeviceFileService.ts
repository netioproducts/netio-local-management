import * as fs from "fs";
import * as path from "path";
import { DeviceManager } from "./DeviceManager";
import { ConfigService } from "../config/ConfigService";
import { TransportService } from "../transport/TransportService";
import {
  ExclusiveSession,
  RuntimeDevice,
} from "../netio-api/services/RuntimeDevice";
import { DeviceOfflineError, UnauthorizedError } from "../netio-api/types/Errors";
import { DeviceDTO } from "../types/DTOs";

export class DeviceFileService {
  private static readonly MAX_REBOOT_RETRIES = 30;
  private static readonly MAX_CONFIG_REBOOT_RETRIES = 15;
  private static readonly REBOOT_POLL_INTERVAL_MS = 5000;
  private static readonly CONFIG_REBOOT_POLL_INTERVAL_MS = 2000;

  constructor(
    private deviceManager: DeviceManager,
    private configService: ConfigService,
    private transportService: TransportService,
  ) {}

  private getDeviceRuntime(mac: string): RuntimeDevice {
    const device = this.deviceManager.getDevice(
      DeviceManager.normalizeMac(mac),
    );
    if (!device) {
      console.debug(`[DeviceFileService] Device with MAC ${mac} not found.`);
      throw new Error(`Device with MAC ${mac} does not exist.`);
    }
    return device;
  }

  /**
   * Syncs the device inside an exclusive operation and checks it can be operated.
   */
  private async ensureDeviceReady(
    device: RuntimeDevice,
    session: ExclusiveSession,
    mac: string,
  ): Promise<void> {
    await session.syncState();
    if (!device.isOnline) {
      throw new DeviceOfflineError(`Device ${mac} is offline.`);
    }
    if (!device.isLoggedIn) {
      throw new UnauthorizedError(`Wrong credentials for device ${mac}.`);
    }
  }

  public async uploadFirmware(
    mac: string,
    filePath: string,
  ): Promise<DeviceDTO> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }
    const device = this.getDeviceRuntime(mac);
    const client = device.getClient();

    console.log(`[DeviceFileService] Preparing firmware upload: ${filePath}`);
    const firmwareBuffer = fs.readFileSync(filePath);

    const onProgress = (progress: number, status: string) => {
      this.transportService.broadcast("firmware_progress", {
        macAddress: device.getConfig().macAddress,
        progress: progress,
        status: status,
      });
    };

    await device.runExclusive("firmware update", async (session) => {
      try {
        await this.ensureDeviceReady(device, session, mac);
        const fwBefore = device.getConfig().fwVersion;

        await client.updateFirmware(firmwareBuffer, onProgress);

        for (let i = 0; i < DeviceFileService.MAX_REBOOT_RETRIES; i++) {
          console.debug(
            `[${mac}] Waiting for device to come back online... (${i + 1}/${DeviceFileService.MAX_REBOOT_RETRIES})`,
          );
          onProgress(
            80 +
              Math.floor(((i + 1) / DeviceFileService.MAX_REBOOT_RETRIES) * 20),
            "Checking...",
          );
          await new Promise((res) =>
            setTimeout(res, DeviceFileService.REBOOT_POLL_INTERVAL_MS),
          );

          const timeout = await client.checkConnectivity(1);
          if (timeout !== -1) {
            await session.syncState();
            if (device.getConfig().fwVersion !== fwBefore) {
              onProgress(100, "Completed");

              // Reinitialize client connection as protocol might have changed (HTTP vs WS)
              await client.reconnect();

              console.log(`[${mac}] Firmware updated successfully.`);
              break;
            } else if (
              device.isOnline === true &&
              i >= DeviceFileService.MAX_REBOOT_RETRIES * 0.3
            ) {
              throw new Error(
                "Device is back online but firmware version did not change.",
              );
            }
          }
        }

        if (device.isOnline === false) {
          throw new Error(
            `Device did not come back online after firmware update after ${(DeviceFileService.MAX_REBOOT_RETRIES * DeviceFileService.REBOOT_POLL_INTERVAL_MS) / 1000} seconds.`,
          );
        }
      } catch (error) {
        onProgress(99, "Failed");
        console.error(`[${mac}] Failed update the firmware:`, error);
        throw error;
      }
    });

    await device.syncState();
    return device.toDTO();
  }

  public async importConfig(
    mac: string,
    filePath: string,
    stripSpecifics: boolean = true,
  ): Promise<DeviceDTO> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }
    const device = this.getDeviceRuntime(mac);
    const client = device.getClient();

    const rawData = fs.readFileSync(filePath, "utf-8");
    let configObj: any;
    try {
      configObj = JSON.parse(rawData);
    } catch (e) {
      throw new Error(`Invalid JSON in config file: ${filePath}`);
    }

    if (stripSpecifics) {
      if (configObj.config?.system?.settings) {
        delete configObj.config.system.settings.alias;
        delete configObj.config.system.settings.hostname;
      }
      if (configObj.config?.network) {
        delete configObj.config.network;
      }
    }

    const configBuffer = Buffer.from(JSON.stringify(configObj));

    const onProgress = (progress: number, status: string) => {
      this.transportService.broadcast("config_progress", {
        macAddress: device.getConfig().macAddress,
        progress: progress,
        status: status,
      });
    };

    await device.runExclusive("configuration import", async (session) => {
      try {
        await this.ensureDeviceReady(device, session, mac);
        await client.importConfig(configBuffer, onProgress);

        for (let i = 0; i < DeviceFileService.MAX_CONFIG_REBOOT_RETRIES; i++) {
          console.debug(
            `[${mac}] Waiting for device to come back online... (${i + 1}/${DeviceFileService.MAX_CONFIG_REBOOT_RETRIES})`,
          );
          onProgress(
            80 +
              Math.floor(
                ((i + 1) / DeviceFileService.MAX_CONFIG_REBOOT_RETRIES) * 20,
              ),
            "Checking...",
          );
          await new Promise((res) =>
            setTimeout(res, DeviceFileService.CONFIG_REBOOT_POLL_INTERVAL_MS),
          );

          const timeout = await client.checkConnectivity(1);
          if (timeout !== -1) {
            await session.syncState();
            console.log(`[${mac}] Device is back online after config import.`);
            break;
          }
        }
        onProgress(100, "Completed");
        console.log(`[${mac}] Config imported successfully.`);
      } catch (error) {
        onProgress(99, "Failed");
        console.error(`[${mac}] Failed to import config:`, error);
        throw error;
      }
    });

    await device.syncState();
    return device.toDTO();
  }

  public async restoreConfig(mac: string): Promise<DeviceDTO> {
    const sanitizedMac = DeviceManager.normalizeMac(mac);
    const configDir = path.join(this.configService.getConfigDir(), "configs");
    const filePath = path.join(configDir, `config-${sanitizedMac}.json`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup configuration not found for device ${mac}.`);
    }

    return this.importConfig(mac, filePath, false);
  }

  public async exportConfig(mac: string): Promise<string> {
    const device = this.getDeviceRuntime(mac);
    device.assertNotBusy();
    const client = device.getClient();

    await device.syncState();
    const configData = await client.exportConfig();

    const configDir = path.join(this.configService.getConfigDir(), "configs");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const sanitizedMac = DeviceManager.normalizeMac(mac);
    const filePath = path.join(configDir, `config-${sanitizedMac}.json`);
    fs.writeFileSync(filePath, JSON.stringify(configData, null, 4), "utf-8");

    console.log(`[DeviceFileService] Config exported to: ${filePath}`);
    return filePath;
  }
}

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
import { createLogger } from "../logging/Logger";

const log = createLogger("DeviceFileService");

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
      log.debug("Device not found", { mac });
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
      log.warn("Firmware file not found", { mac, file: filePath });
      throw new Error(`File not found at path: ${filePath}`);
    }
    const device = this.getDeviceRuntime(mac);
    const client = device.getClient();

    log.debug("Reading firmware file", { mac, file: filePath });
    const firmwareBuffer = fs.readFileSync(filePath);

    let lastStatus: string | undefined;
    const onProgress = (progress: number, status: string) => {
      if (status !== lastStatus) {
        lastStatus = status;
        log.debug("Firmware update progress", { mac, progress, status });
      }
      this.transportService.broadcast("firmware_progress", {
        macAddress: device.getConfig().macAddress,
        progress: progress,
        status: status,
      });
    };

    await device.runExclusive("firmware update", async (session) => {
      const startedAt = Date.now();
      log.info("Firmware update started", {
        mac,
        file: filePath,
        size: firmwareBuffer.length,
        fwVersion: device.getConfig().fwVersion,
      });
      try {
        await this.ensureDeviceReady(device, session, mac);
        const fwBefore = device.getConfig().fwVersion;

        await client.updateFirmware(firmwareBuffer, onProgress);

        for (let i = 0; i < DeviceFileService.MAX_REBOOT_RETRIES; i++) {
          log.debug("Waiting for device to come back online", {
            mac,
            attempt: i + 1,
            maxAttempts: DeviceFileService.MAX_REBOOT_RETRIES,
          });
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

              log.debug("Device is back online with new firmware", {
                mac,
                fwVersion: device.getConfig().fwVersion,
              });
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
        log.info("Firmware update finished", {
          mac,
          fwBefore,
          fwAfter: device.getConfig().fwVersion,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        onProgress(99, "Failed");
        log.warn("Firmware update failed", {
          mac,
          durationMs: Date.now() - startedAt,
          reason: errorReason(error),
        });
        log.debug("Firmware update failure details", error);
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
      log.warn("Configuration file not found", { mac, file: filePath });
      throw new Error(`File not found at path: ${filePath}`);
    }
    const device = this.getDeviceRuntime(mac);
    const client = device.getClient();

    log.debug("Reading configuration file", { mac, file: filePath });
    const rawData = fs.readFileSync(filePath, "utf-8");
    let configObj: any;
    try {
      configObj = JSON.parse(rawData);
    } catch (e) {
      log.warn("Invalid JSON in configuration file", {
        mac,
        file: filePath,
        reason: errorReason(e),
      });
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

    let lastStatus: string | undefined;
    const onProgress = (progress: number, status: string) => {
      if (status !== lastStatus) {
        lastStatus = status;
        log.debug("Configuration import progress", { mac, progress, status });
      }
      this.transportService.broadcast("config_progress", {
        macAddress: device.getConfig().macAddress,
        progress: progress,
        status: status,
      });
    };

    await device.runExclusive("configuration import", async (session) => {
      const startedAt = Date.now();
      log.info("Configuration import started", {
        mac,
        file: filePath,
        stripSpecifics,
      });
      try {
        await this.ensureDeviceReady(device, session, mac);
        await client.importConfig(configBuffer, onProgress);

        for (let i = 0; i < DeviceFileService.MAX_CONFIG_REBOOT_RETRIES; i++) {
          log.debug("Waiting for device to come back online", {
            mac,
            attempt: i + 1,
            maxAttempts: DeviceFileService.MAX_CONFIG_REBOOT_RETRIES,
          });
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
            log.debug("Device is back online after configuration import", {
              mac,
            });
            break;
          }
        }
        onProgress(100, "Completed");
        log.info("Configuration import finished", {
          mac,
          online: device.isOnline,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        onProgress(99, "Failed");
        log.warn("Configuration import failed", {
          mac,
          durationMs: Date.now() - startedAt,
          reason: errorReason(error),
        });
        log.debug("Configuration import failure details", error);
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
      log.warn("Configuration backup not found", { mac, file: filePath });
      throw new Error(`Backup configuration not found for device ${mac}.`);
    }

    log.info("Configuration restore requested", { mac, file: filePath });
    return this.importConfig(mac, filePath, false);
  }

  public async exportConfig(mac: string): Promise<string> {
    const device = this.getDeviceRuntime(mac);
    device.assertNotBusy();
    const client = device.getClient();

    const startedAt = Date.now();
    log.info("Configuration export started", { mac });
    try {
      await device.syncState();
      const configData = await client.exportConfig();

      const configDir = path.join(this.configService.getConfigDir(), "configs");
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const sanitizedMac = DeviceManager.normalizeMac(mac);
      const filePath = path.join(configDir, `config-${sanitizedMac}.json`);
      fs.writeFileSync(filePath, JSON.stringify(configData, null, 4), "utf-8");

      log.info("Configuration export finished", {
        mac,
        file: filePath,
        durationMs: Date.now() - startedAt,
      });
      return filePath;
    } catch (error) {
      log.warn("Configuration export failed", {
        mac,
        durationMs: Date.now() - startedAt,
        reason: errorReason(error),
      });
      log.debug("Configuration export failure details", error);
      throw error;
    }
  }
}

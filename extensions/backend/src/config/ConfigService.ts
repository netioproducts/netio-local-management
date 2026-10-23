// src/ConfigService.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import {
  AppConfig,
  Device,
  DeviceGroup,
  AppConfigSchema,
  Settings,
  User,
  createDefaultConfig,
  parseAppConfig,
} from "./ConfigModel";

type ConfigFileResult =
  | { status: "ok"; config: AppConfig; issues: string[] }
  | { status: "missing" }
  | { status: "unreadable"; error: unknown }
  | { status: "corrupt"; error: unknown };

export class ConfigService {
  private _warningBroadcast?: (message: string) => void;

  private static readonly PASSWORD_ENCRYPTION_PREFIX = "enc.v1";
  private static readonly HARD_CODED_CREDENTIALS_KEY_B64 =
    "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  private static readonly AES_ALGORITHM = "aes-256-gcm";
  private static readonly GCM_IV_LENGTH = 12;

  private config: AppConfig;
  private configPath: string;
  private backupPath: string;
  private tempPath: string;
  private credentialsKey?: Buffer;
  // Set when the config file exists but cannot be read, so it is never overwritten
  private writeBlocked = false;

  public constructor(fileName: string = "data.json") {
    this.configPath = this.getStandardPath("netio-local-management", fileName);
    this.backupPath = `${this.configPath}.bak`;
    this.tempPath = `${this.configPath}.tmp`;
    this.config = createDefaultConfig();
  }

  private getStandardPath(appName: string, fileName: string): string {
    const homedir = os.homedir();
    let dataDir = "";

    if (process.platform === "win32") {
      // Windows: C:\Users\Name\AppData\Local\netio-local-management
      dataDir = path.join(
        process.env.LOCALAPPDATA || path.join(homedir, "AppData", "Local"),
        appName,
      );
    } else if (process.platform === "darwin") {
      // macOS: ~/Library/Application Support/netio-local-management
      dataDir = path.join(homedir, "Library", "Application Support", appName);
    } else {
      // Linux: ~/.local/share/netio-local-management
      dataDir = path.join(
        process.env.XDG_DATA_HOME || path.join(homedir, ".local", "share"),
        appName,
      );
    }

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    return path.join(dataDir, fileName);
  }

  public init(): void {
    this.config = this.load();
  }

  private getHardcodedCredentialsKey(): Buffer {
    if (this.credentialsKey) {
      return this.credentialsKey;
    }

    const parsed = this.parseCredentialsKey(
      ConfigService.HARD_CODED_CREDENTIALS_KEY_B64,
      "hardcoded constant",
    );
    this.credentialsKey = parsed;
    return parsed;
  }

  private parseCredentialsKey(base64Key: string, source: string): Buffer {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new Error(
        `Invalid credentials encryption key in ${source}. Expected 32 bytes in base64 format.`,
      );
    }
    return key;
  }

  private isEncryptedPassword(password: string): boolean {
    return password.startsWith(`${ConfigService.PASSWORD_ENCRYPTION_PREFIX}:`);
  }

  private encryptPassword(password: string): string {
    if (this.isEncryptedPassword(password)) {
      return password;
    }

    const iv = randomBytes(ConfigService.GCM_IV_LENGTH);
    const cipher = createCipheriv(
      ConfigService.AES_ALGORITHM,
      this.getHardcodedCredentialsKey(),
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(password, "utf-8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      ConfigService.PASSWORD_ENCRYPTION_PREFIX,
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  private decryptPasswordWithKey(password: string, key: Buffer): string {
    const parts = password.split(":");
    if (parts.length !== 4) {
      throw new Error("Stored password has invalid encrypted format.");
    }

    const [, ivB64, authTagB64, encryptedB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = createDecipheriv(ConfigService.AES_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf-8");
  }

  private decryptPassword(password: string): string {
    if (!this.isEncryptedPassword(password)) {
      return password;
    }

    try {
      return this.decryptPasswordWithKey(
        password,
        this.getHardcodedCredentialsKey(),
      );
    } catch (error) {
      console.error("Failed to decrypt stored password.", error);
      return password;
    }
  }

  private serializeConfigForDisk(config: AppConfig): AppConfig {
    return {
      ...config,
      users: config.users.map((user) => ({
        ...user,
        password: this.encryptPassword(user.password),
      })),
    };
  }

  private deserializeConfigFromDisk(config: AppConfig): AppConfig {
    return {
      ...config,
      users: config.users.map((user) => ({
        ...user,
        password: this.decryptPassword(user.password),
      })),
    };
  }

  // Loading configuration from disk
  private load(): AppConfig {
    const warnings: string[] = [];
    const config = this.loadWithFallback(warnings);

    if (warnings.length > 0) {
      console.warn("Configuration warnings:\n" + warnings.join("\n"));
      this._warningBroadcast?.(warnings.join("\n"));
    }
    return config;
  }

  private loadWithFallback(warnings: string[]): AppConfig {
    const main = this.readConfigFile(this.configPath);
    if (main.status === "ok") {
      return this.prepareLoadedConfig(main.config, main.issues, warnings);
    }

    if (main.status === "missing" && !fs.existsSync(this.backupPath)) {
      // Fresh installation, nothing to warn about
      console.log("Creating default configuration.");
      const defaults = createDefaultConfig();
      try {
        this.saveInternal(defaults);
      } catch (error) {
        console.error("Error saving default configuration:", error);
      }
      return defaults;
    }

    if (main.status === "unreadable") {
      console.error("Error reading configuration:", main.error);
      this.writeBlocked = true;
      warnings.push(
        `Configuration file ${this.configPath} could not be read (${this.errorMessage(main.error)}). Saving is disabled until the application is restarted.`,
      );
    } else if (main.status === "corrupt") {
      console.error("Configuration file is corrupted:", main.error);
      warnings.push(this.moveCorruptFile(this.configPath));
    } else {
      warnings.push(`Configuration file ${this.configPath} is missing.`);
    }

    // When is the main file not usable
    const backup = this.readConfigFile(this.backupPath);
    if (backup.status === "ok") {
      warnings.push(`Configuration was restored from backup ${this.backupPath}.`);
      return this.prepareLoadedConfig(backup.config, backup.issues, warnings);
    }

    warnings.push(
      backup.status === "missing"
        ? "No backup is available. Starting with the default configuration."
        : `Backup ${this.backupPath} could not be loaded either. Starting with the default configuration.`,
    );
    return createDefaultConfig();
  }

  private readConfigFile(filePath: string): ConfigFileResult {
    if (!fs.existsSync(filePath)) {
      return { status: "missing" };
    }

    let rawData: string;
    try {
      rawData = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      return { status: "unreadable", error };
    }

    try {
      const { config, issues } = parseAppConfig(JSON.parse(rawData));
      return { status: "ok", config, issues };
    } catch (error) {
      return { status: "corrupt", error };
    }
  }

  /**
   * Moves a corrupted config file aside so it is not overwritten by the next save.
   * Returns a warning message for the user.
   */
  private moveCorruptFile(filePath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const corruptPath = `${filePath}.corrupt-${timestamp}`;
    try {
      fs.renameSync(filePath, corruptPath);
      return `Configuration file ${filePath} is corrupted and was moved to ${corruptPath}.`;
    } catch (error) {
      console.error("Error moving corrupted configuration:", error);
      this.writeBlocked = true;
      return `Configuration file ${filePath} is corrupted and could not be moved aside (${this.errorMessage(error)}). Saving is disabled until the application is restarted.`;
    }
  }

  private prepareLoadedConfig(
    config: AppConfig,
    issues: string[],
    warnings: string[],
  ): AppConfig {
    if (issues.length > 0) {
      warnings.push(
        "Some entries in the configuration are invalid and were ignored. " +
          "They will be removed from the file the next time the configuration is saved:\n" +
          issues.map((issue) => `- ${issue}`).join("\n"),
      );
    }

    const consistent = this.consistencyMaker(config);
    const deserialized = this.deserializeConfigFromDisk(consistent);

    const hasPlaintextPasswords = consistent.users.some(
      (user) => !this.isEncryptedPassword(user.password),
    );
    if (hasPlaintextPasswords && !this.writeBlocked) {
      try {
        this.saveInternal(deserialized);
      } catch (error) {
        console.error("Error saving migrated passwords:", error);
      }
    }

    console.log("Configuration loaded.");
    return deserialized;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private consistencyMaker(config: AppConfig): AppConfig {
    const macSet = new Set<string>();
    const consistentDevices = config.devices.filter((device) => {
      if (macSet.has(device.macAddress)) {
        console.warn(
          `Duplicate MAC address found in config: ${device.macAddress}. Skipping this entry.`,
        );
        return false;
      }

      if (device.user && !config.users.find((u) => u.name === device.user)) {
        console.warn(
          `Device with MAC ${device.macAddress} references non-existent user "${device.user}". Removing user reference from this device.`,
        );
        device.user = undefined;
      }
      macSet.add(device.macAddress);
      return true;
    });

    const consistentGroups = config.deviceGroups.map((group) => ({
      ...group,
      devices: group.devices.filter((mac) => {
        if (!macSet.has(mac)) {
          console.warn(
            `Device with MAC ${mac} in group "${group.name}" is not defined in config. Skipping this MAC in the group.`,
          );
          return false;
        }
        return true;
      }),
    }));

    return {
      ...config,
      devices: consistentDevices,
      deviceGroups: consistentGroups,
    };
  }

  // Save current configuration
  public save(): void {
    this.saveInternal(this.config);
  }

  /**
   * Writes the config atomically (temp file + fsync + rename) and keeps the previous
   * version as a backup. Throws when the config cannot be saved.
   */
  private saveInternal(data: AppConfig): void {
    if (this.writeBlocked) {
      throw new Error(
        "Saving configuration is disabled because the configuration file could not be read at startup.",
      );
    }

    const validated = AppConfigSchema.parse(data);
    const serialized = JSON.stringify(
      this.serializeConfigForDisk(validated),
      null,
      4,
    );

    try {
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, this.backupPath);
      }

      const fd = fs.openSync(this.tempPath, "w");
      try {
        fs.writeFileSync(fd, serialized, "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(this.tempPath, this.configPath);
      console.log("Configuration saved.");
    } catch (error) {
      console.error("Error saving configuration:", error);
      throw new Error(
        `Error saving configuration: ${this.errorMessage(error)}`,
      );
    }
  }

  // --- Public API ---

  public getConfig(): AppConfig {
    return this.config;
  }

  public getConfigDir(): string {
    return path.dirname(this.configPath);
  }

  // // Devices
  // public getDevice(mac: string): Device | undefined {
  //   return this.config.devices[mac];
  // }

  public addOrUpdateDevice(device: Device): void {
    this.config.devices = this.config.devices.filter(
      (d) => d.macAddress !== device.macAddress,
    );
    this.config.devices.push(device);
    this.save();
  }

  public removeDevice(mac: string): void {
    this.config.devices = this.config.devices.filter(
      (d) => d.macAddress !== mac,
    );
    this.config.deviceGroups.forEach((group) => {
      group.devices = group.devices.filter((devMAC) => devMAC !== mac);
    });
    // this.config.socketGroups.forEach((group) => {
    //   group.sockets = group.sockets.filter(([devMAC, _]) => devMAC !== mac);
    // });
    this.save();
  }

  public getDevices(): Device[] {
    return this.config.devices;
  }

  // Users
  public addOrUpdateUser(
    name: string,
    username: string,
    password: string,
  ): void {
    this.config.users = this.config.users.filter((u) => u.name !== name);
    this.config.users.push({ name, username, password });
    this.save();
  }

  public removeUser(name: string): void {
    this.config.users = this.config.users.filter((u) => u.name !== name);
    this.config.devices.forEach((device) => {
      if (device.user === name) {
        device.user = undefined;
      }
    });
    this.save();
  }

  public getUsers() {
    return this.config.users;
  }

  public getUser(name: string | undefined): User | undefined {
    if (!name) return undefined;
    return this.config.users.find((u) => u.name === name);
  }

  // Groups
  public addDeviceGroup(group: DeviceGroup) {
    this.config.deviceGroups.push(group);
    this.save();
  }

  public updateDeviceGroup(index: number, updatedGroup: DeviceGroup) {
    this.config.deviceGroups[index] = updatedGroup;
    this.save();
  }

  public removeDeviceGroup(index: number) {
    this.config.deviceGroups.splice(index, 1);
    this.save();
  }

  public addDeviceToGroup(groupIndex: number, deviceMac: string) {
    const group = this.config.deviceGroups[groupIndex];
    if (group && !group.devices.includes(deviceMac)) {
      group.devices.push(deviceMac);
      this.save();
    }
  }

  public addDevicesToGroup(groupIndex: number, deviceMacs: string[]): void {
    const group = this.config.deviceGroups[groupIndex];
    deviceMacs.forEach((mac) => {
      if (group && !group.devices.includes(mac)) {
        group.devices.push(mac);
      }
    });
    this.save();
  }

  public removeDeviceFromGroup(groupIndex: number, deviceMac: string) {
    const group = this.config.deviceGroups[groupIndex];
    if (group) {
      group.devices = group.devices.filter((mac) => mac !== deviceMac);
      this.save();
    }
  }

  public removeDevicesFromGroup(
    groupIndex: number,
    deviceMacs: string[],
  ): void {
    const group = this.config.deviceGroups[groupIndex];
    if (group) {
      group.devices = group.devices.filter((mac) => !deviceMacs.includes(mac));
      this.save();
    }
  }

  public getSettings(): Settings {
    return this.config.settings ?? {};
  }

  public getDeviceGroups(): DeviceGroup[] {
    return this.config.deviceGroups;
  }

  public set warningBroadcast(broadcastFn: (message: string) => void) {
    console.debug("ConfigService: Setting warning broadcast function.");
    this._warningBroadcast = broadcastFn;
  }
}

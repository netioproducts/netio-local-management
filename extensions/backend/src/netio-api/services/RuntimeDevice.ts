import { EventEmitter } from "events";
import {
  DeviceBusyDTO,
  DeviceDTO,
  DeviceStatusDTO,
  SocketDTO,
} from "../../types/DTOs";
import { SocketId } from "../../types/SocketId";
import { NormalizedOutputStatus } from "../providers/NetioProvider";
import { checkConnectivity } from "../transport/univarsal";
import { Device } from "../types/Device";
import {
  ClientNotInitializedError,
  DeviceBusyError,
  DeviceOfflineError,
  errorMessage,
  UnauthorizedError,
} from "../types/Errors";
import { RuntimeSocket } from "../types/Runtime";
import { IDeviceClient } from "../types/IDeviceClient";
import { createLogger } from "../../logging/Logger";

const log = createLogger("RuntimeDevice");

// Last logged connection state, used to log only changes
type ReportedStatus = "online" | "unauthorized" | "offline";

/**
 * Access to the device granted to an exclusive operation while the device is locked.
 */
export interface ExclusiveSession {
  syncState(): Promise<void>;
}

export class RuntimeDevice extends EventEmitter {
  private _config!: Device;
  private client?: IDeviceClient;

  // Runtime properties
  public isOnline: boolean = false;
  public isLoggedIn: boolean = false;
  private _originalName: string | null = null;
  public outputCount: number = 0;
  public sockets: Record<number, RuntimeSocket> = {};

  private pollingEnabled: boolean = false;
  private busyOperation: string | null = null; // Name of the running exclusive operation
  private idleWaiters: (() => void)[] = [];
  private idleTimeout?: NodeJS.Timeout; // Timeout for idle
  private static readonly IDLE_TIMEOUT_MS = 60000;
  private reportedStatus: ReportedStatus | null = null;

  constructor(device: Device) {
    super();
    this.config = device;
  }

  private get logContext(): { mac: string; ip: string } {
    return { mac: this._config.macAddress, ip: this._config.ipAddress };
  }

  /**
   * Logs a change of the online / login state, repeated results are not logged.
   */
  private reportStatus(reason?: unknown): void {
    const status: ReportedStatus = !this.isOnline
      ? "offline"
      : this.isLoggedIn
        ? "online"
        : "unauthorized";
    if (status === this.reportedStatus) return;

    const context = {
      ...this.logContext,
      previous: this.reportedStatus ?? undefined,
      reason: reason !== undefined ? errorMessage(reason) : undefined,
    };
    this.reportedStatus = status;

    if (status === "online") {
      log.info("Device online", context);
    } else if (status === "unauthorized") {
      log.info("Device reachable, login failed: wrong credentials", context);
    } else {
      log.info("Device offline", context);
    }
  }

  public setupCredentials(
    username: string,
    password: string,
    clientFactory: (
      ip: string,
      mac: string,
      user: string,
      pass: string,
      fw?: string,
    ) => IDeviceClient,
  ) {
    this._config.username = username;
    this._config.password = password;
    this.reportedStatus = null;
    log.debug("Credentials set up", { ...this.logContext, username });

    this.client = clientFactory(
      this._config.ipAddress,
      this._config.macAddress,
      username,
      password,
      this._config.fwVersion,
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.client) return;

    this.client.on("error", (error) => {
      this.isOnline = false;
      this.disablePolling();
      log.warn("Device communication error", {
        ...this.logContext,
        reason: errorMessage(error),
      });
      this.reportStatus(error);
    });

    this.client.on("output_change", (output: NormalizedOutputStatus[]) => {
      this.isOnline = true;
      this.reportStatus();
      for (const out of output) {
        if (this.sockets[out.id]) {
          this.sockets[out.id].state = out.state;
          this.sockets[out.id].load = out.load;
        }
      }
      this.emit("output_change", {
        macAddress: this._config.macAddress,
        isOnline: this.isOnline,
        sockets: Object.values(this.sockets).map((s) => ({
          id: s.id,
          status: s.state,
          load: s.load,
        })),
      } as DeviceStatusDTO);
    });
  }

  public clearCredentials(): void {
    log.debug("Credentials cleared", this.logContext);
    this.disablePolling();
    this._config.user = undefined;
    this._config.username = undefined;
    this._config.password = undefined;
    this.client?.disconnect().catch((err) =>
      log.warn("Failed to disconnect client", {
        ...this.logContext,
        reason: errorMessage(err),
      }),
    );
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.client = undefined;
    this.isLoggedIn = false;
    this.reportedStatus = null;
  }

  public set config(config: Device) {
    this._config = config;

    if (config.sockets) {
      this.sockets = config.sockets.reduce(
        (acc, customLabel, idx) => {
          const socketId: SocketId = [this._config.macAddress, idx + 1];
          acc[socketId[1]] = {
            id: socketId,
            customLabel: customLabel,
          };
          return acc;
        },
        {} as Record<number, RuntimeSocket>,
      );
    }
  }

  public get isBusy(): boolean {
    return this.busyOperation !== null;
  }

  public assertNotBusy(): void {
    if (this.busyOperation) {
      throw new DeviceBusyError(
        `Device ${this._config.name || this._config.macAddress} is busy: ${this.busyOperation}.`,
        {
          macAddress: this._config.macAddress,
          operation: this.busyOperation,
        },
      );
    }
  }

  /**
   * Resolves when no exclusive operation is running on the device.
   */
  public whenIdle(): Promise<void> {
    if (!this.busyOperation) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /**
   * Runs an operation which needs the device for itself (firmware update, config import, ...).
   * Polling and outside syncs are paused, the device is always unlocked afterwards.
   * Throws DeviceBusyError when another exclusive operation is running.
   */
  public async runExclusive<T>(
    operation: string,
    fn: (session: ExclusiveSession) => Promise<T>,
  ): Promise<T> {
    if (this.busyOperation) {
      log.warn("Exclusive operation rejected, device is busy", {
        ...this.logContext,
        operation,
        busyOperation: this.busyOperation,
      });
    }
    this.assertNotBusy();
    this.lockConnection(operation);
    log.info("Device locked for exclusive operation", {
      ...this.logContext,
      operation,
    });
    const startedAt = performance.now();
    try {
      const result = await fn({ syncState: () => this.performSyncState() });
      log.info("Exclusive operation finished, device unlocked", {
        ...this.logContext,
        operation,
        ms: Math.round(performance.now() - startedAt),
        ok: true,
      });
      return result;
    } catch (error) {
      log.info("Exclusive operation failed, device unlocked", {
        ...this.logContext,
        operation,
        ms: Math.round(performance.now() - startedAt),
        ok: false,
        reason: errorMessage(error),
      });
      throw error;
    } finally {
      this.unlockConnection();
    }
  }

  private emitBusyChange(): void {
    this.emit("busy_change", {
      macAddress: this._config.macAddress,
      busyOperation: this.busyOperation,
    } as DeviceBusyDTO);
  }

  private lockConnection(operation: string): void {
    this.busyOperation = operation;
    this.emitBusyChange();

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    this.client?.stopAskingStatus().catch((err) =>
      log.warn("Failed to stop polling", {
        ...this.logContext,
        reason: errorMessage(err),
      }),
    );
  }

  private unlockConnection(): void {
    this.busyOperation = null;
    this.emitBusyChange();

    this.keepConnectionAlive();
    if (this.pollingEnabled) {
      log.debug("Polling resumed after exclusive operation", this.logContext);
      this.client?.startAskingStatus().catch((err) =>
        log.warn("Failed to start polling", {
          ...this.logContext,
          reason: errorMessage(err),
        }),
      );
    }

    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  public enablePolling(): void {
    if (this.pollingEnabled) return;
    this.pollingEnabled = true;
    // Polling is started when the running exclusive operation unlocks the device
    if (this.busyOperation) {
      log.debug("Polling enabled, start deferred until device is unlocked", {
        ...this.logContext,
        busyOperation: this.busyOperation,
      });
      return;
    }

    log.debug("Polling enabled", this.logContext);
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    this.client?.startAskingStatus().catch((err) =>
      log.warn("Failed to start polling", {
        ...this.logContext,
        reason: errorMessage(err),
      }),
    );
  }

  public disablePolling(): void {
    if (!this.pollingEnabled) return;
    this.pollingEnabled = false;

    log.debug("Polling disabled", this.logContext);
    this.keepConnectionAlive();
    this.client?.stopAskingStatus().catch((err) =>
      log.warn("Failed to stop polling", {
        ...this.logContext,
        reason: errorMessage(err),
      }),
    );
  }

  public get isPollingEnabled(): boolean {
    return this.pollingEnabled;
  }

  public set originalName(name: string | null) {
    this._originalName = name;
    if (name && !this._config.name) {
      this._config.name = name;
      this.emit("config_change", this._config);
    }
  }

  public get originalName(): string | null {
    return this._originalName;
  }

  public toDTO(): DeviceDTO {
    return {
      macAddress: this._config.macAddress,
      ipAddress: this._config.ipAddress,
      fwVersion: this._config.fwVersion,
      name: this._config.name ?? "",
      originalName: this.originalName ?? "",
      model: this._config.model ?? "",
      user: this._config.user,
      isOnline: this.isOnline,
      isLoggedIn: this.isLoggedIn,
      busyOperation: this.busyOperation,
      sockets: Object.values(this.sockets ?? {}).map(
        (s) =>
          ({
            id: s.id,
            label: s.customLabel,
            originalLabel: s.originalLabel,
            status: s.state,
          }) as SocketDTO,
      ),
    } as DeviceDTO;
  }

  public getClient(): IDeviceClient {
    if (!this.client) {
      log.warn("Client is not initialized", this.logContext);
      throw new ClientNotInitializedError("Client is not initialized");
    }
    return this.client;
  }

  public getConfig(): Device {
    return this._config;
  }

  /**
   * Syncs state from the device. Skipped while an exclusive operation is running,
   * the last known state is kept.
   */
  public async syncState(): Promise<void> {
    if (this.busyOperation) {
      log.debug("Sync skipped, device is busy", {
        ...this.logContext,
        busyOperation: this.busyOperation,
      });
      return;
    }
    return this.performSyncState();
  }

  private async performSyncState(): Promise<void> {
    if (!this.client) {
      log.debug("Sync skipped, no credentials", this.logContext);
      return;
    }

    const startedAt = performance.now();
    try {
      const client = this.getClient();
      await client.initialize();
      this.isOnline = true;
      this.isLoggedIn = true;

      this.keepConnectionAlive(); // Reset idle timer

      const sysInfo = await client.getSystemInfo();
      this.outputCount = sysInfo.outputCount;
      this.originalName = sysInfo.name;
      const fwVersionNumber =
        sysInfo.firmwareVersion?.match(/^(\d+\.\d+\.\d+)/)?.[1] ??
        sysInfo.firmwareVersion;

      let changed =
        this._config.fwVersion !== fwVersionNumber ||
        this._config.model !== sysInfo.model ||
        !this._config.name;

      this._config.fwVersion = fwVersionNumber;
      if (!this._config.model) this._config.model = sysInfo.model;
      if (!this._config.name) this._config.name = sysInfo.name;

      const outputs = await client.getOutputs();

      if (outputs.length !== Object.keys(this.sockets).length) {
        this._config.sockets = outputs.map((out) => out.name);
        changed = true;
      }

      outputs.forEach((out) => {
        if (!this.sockets[out.id]) {
          this.sockets[out.id] = {
            id: [this._config.macAddress, out.id],
            customLabel: out.name,
          };
        }

        this.sockets[out.id].state = out.state;
        this.sockets[out.id].originalLabel = out.name;
        this.sockets[out.id].load = out.load;
      });

      if (changed) {
        log.debug("Device config changed, emitting config_change", {
          ...this.logContext,
          fwVersion: this._config.fwVersion,
          model: this._config.model,
          name: this._config.name,
          sockets: this._config.sockets?.length,
        });
        this.emit("config_change", this._config);
      }

      log.debug("State synced", {
        ...this.logContext,
        ms: Math.round(performance.now() - startedAt),
        fwVersion: fwVersionNumber,
        outputs: outputs.length,
      });
      this.reportStatus();
    } catch (error) {
      const ms = Math.round(performance.now() - startedAt);
      if (error instanceof UnauthorizedError) {
        log.debug("Sync failed, wrong credentials", {
          ...this.logContext,
          ms,
          reason: error.message,
        });
        this.isOnline = true;
        this.isLoggedIn = false;
      } else if (error instanceof DeviceOfflineError) {
        log.debug("Sync failed, device is offline", {
          ...this.logContext,
          ms,
          reason: error.message,
        });
        this.isOnline = false;
        this.isLoggedIn = false;
      } else {
        log.error(
          `Failed to sync state of device ${this._config.ipAddress}`,
          error,
        );
        this.isOnline = false;
        this.isLoggedIn = false;
      }
      this.reportStatus(error);
    }
  }

  public async getAllInfo(): Promise<any> {
    try {
      const client = this.getClient();
      await this.syncState();
      const info = await client.getAllInfo();
      return info;
    } catch (error) {
      log.warn("Failed to get all info", {
        ...this.logContext,
        reason: errorMessage(error),
      });
      return null;
    }
  }

  private keepConnectionAlive() {
    if (this.busyOperation) return;
    if (this.pollingEnabled) return;
    if (!this.client) return;

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }

    this.idleTimeout = setTimeout(() => {
      log.debug("Device is idle, disconnecting", {
        ...this.logContext,
        idleMs: RuntimeDevice.IDLE_TIMEOUT_MS,
      });
      this.client?.disconnect().catch((err) =>
        log.warn("Failed to disconnect client", {
          ...this.logContext,
          reason: errorMessage(err),
        }),
      );
    }, RuntimeDevice.IDLE_TIMEOUT_MS);
  }

  public async setSocketState(
    socketIndex: number,
    targetState: boolean,
  ): Promise<void> {
    const client = this.getClient();

    await client.initialize();
    this.keepConnectionAlive(); // Reset idle timer

    if (!this.sockets[socketIndex]) {
      throw new Error(
        `Socket index ${socketIndex} does not exist on device ${this._config.macAddress}`,
      );
    }

    try {
      await client.setOutput(socketIndex, targetState);

      this.sockets[socketIndex].state = targetState;
      this.isOnline = true;
      log.debug("Socket state set", {
        ...this.logContext,
        socket: socketIndex,
        state: targetState,
      });
      this.reportStatus();
    } catch (error) {
      log.warn("Failed to set socket state, syncing state", {
        ...this.logContext,
        socket: socketIndex,
        state: targetState,
        reason: errorMessage(error),
      });
      await this.syncState();
    }
  }

  public async setAllSocketsState(targetState: boolean): Promise<void> {
    const client = this.getClient();

    await client.initialize();
    this.keepConnectionAlive(); // Reset idle timer

    const socketIndices = Object.keys(this.sockets).map((key) =>
      parseInt(key, 10),
    );

    try {
      await Promise.all(
        socketIndices.map((idx) => client.setOutput(idx, targetState)),
      );

      socketIndices.forEach((idx) => {
        if (this.sockets[idx]) {
          this.sockets[idx].state = targetState;
        }
      });
      this.isOnline = true;
      log.debug("All sockets state set", {
        ...this.logContext,
        sockets: socketIndices.length,
        state: targetState,
      });
      this.reportStatus();
    } catch (error) {
      log.warn("Failed to set all sockets state, syncing state", {
        ...this.logContext,
        state: targetState,
        reason: errorMessage(error),
      });
      await this.syncState();
    }
  }

  public async toggleSocket(socketIndex: number): Promise<void> {
    await this.syncState();
    const state = this.sockets[socketIndex]?.state;
    await this.setSocketState(socketIndex, !state);
  }

  public async toggleAllSockets(): Promise<void> {
    await this.syncState();
    const socketIndices = Object.keys(this.sockets).map((key) =>
      parseInt(key, 10),
    );
    const states = socketIndices.every((idx) => this.sockets[idx]?.state);
    await this.setAllSocketsState(!states);
  }

  public async factoryReset(): Promise<void> {
    const client = this.getClient();
    await this.runExclusive("factory reset", async () => {
      await client.factoryReset();
      await client.disconnect();
    });
  }

  public async locateDevice(): Promise<void> {
    const client = this.getClient();
    await client.locateDevice();
  }
}

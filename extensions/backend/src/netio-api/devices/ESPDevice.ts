import { EventEmitter } from "events";
import {
  INetioProvider,
  NormalizedOutput,
  NormalizedSystemInfo,
} from "../providers/NetioProvider";
import { HttpProvider } from "../providers/HttpProvider";
import { WsProvider } from "../providers/WsProvider";
import { getBasicDeviceInfo } from "../transport/univarsal";
import { MacAddressMismatchError } from "../types/Errors";
import { IDeviceClient } from "../types/IDeviceClient";

export type ProtocolType = "http" | "ws";
interface INetioDeviceConnection {
  ipAddress: string;
  macAddress: string;
  username: string;
  password: string;
  fwVersion?: string;
}

export class ESPDevice extends EventEmitter implements IDeviceClient {
  private provider?: INetioProvider;

  private config: INetioDeviceConnection;
  private useHttps: boolean = false;
  private protocol?: ProtocolType;

  constructor(config: INetioDeviceConnection, useHttps: boolean = false) {
    super();
    this.config = config;
    this.useHttps = useHttps;
  }

  public async connectOnly(): Promise<void> {
    try {
      console.log(`[${this.config.ipAddress}] Trying WS...`);
      const wsProvider = new WsProvider(
        this.config.ipAddress,
        this.config.username,
        this.config.password,
      );

      await wsProvider.connectOnly();

      this.provider = wsProvider;
      this.protocol = "ws";
      console.log(`[${this.config.ipAddress}] Connected via WS.`);
      this.setupEvents();
    } catch (wsError: any) {
      console.log(`[${this.config.ipAddress}] Trying HTTP...`);

      const httpProvider = new HttpProvider(
        this.config.ipAddress,
        this.config.username,
        this.config.password,
        this.useHttps,
      );

      await httpProvider.connect();

      this.provider = httpProvider;
      this.protocol = "http";
      console.log(`[${this.config.ipAddress}] Connected via HTTP.`);
      this.setupEvents();
    }
  }

  public async initialize() {
    if (this.provider) {
      await this.provider.connect();
      return;
    } else {
      await this.connectOnly().then(() => {
        return this.provider?.connect();
      });
    }
  }

  private setupEvents() {
    if (!this.provider) return;
    this.provider.on("output_change", (data) =>
      this.emit("output_change", data),
    );
    this.provider.on("disconnected", () => this.emit("disconnected"));
    this.provider.on("error", (err) => this.emitProviderError(err));
  }

  private emitProviderError(error: unknown): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
      return;
    }
  }

  public async disconnect() {
    this.provider?.disconnect();
  }

  public async reconnect(): Promise<void> {
    await this.disconnect();
    this.provider = undefined;
    this.protocol = undefined;
    await this.initialize();
  }

  public async getSystemInfo(): Promise<NormalizedSystemInfo> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return this.provider.getSystemInfo();
  }

  public async getAllInfo(): Promise<any> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return this.provider.getAllInfo();
  }

  public async getOutputs(): Promise<NormalizedOutput[]> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return this.provider.getOutputs();
  }

  public async setOutput(outputId: number, state: boolean): Promise<void> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return this.provider.setOutput(outputId, state);
  }

  public async toggleOutput(outputId: number): Promise<void> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    const outputs = await this.getOutputs();
    const current = outputs.find((o) => o.id === outputId);
    if (current) {
      await this.setOutput(outputId, !current.state);
    }
  }

  public async checkConnectivity(timeoutSec?: number): Promise<number> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return await this.provider.checkConnectivity(timeoutSec);
  }

  public async updateFirmware(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    await this.provider.updateFirmware(fileBuffer, onProgress);
  }

  public async importConfig(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    await this.provider.importConfig(fileBuffer, onProgress);
  }

  public async exportConfig(): Promise<any> {
    if (!this.provider)
      return Promise.reject(new Error("Device not initialized"));
    return this.provider.exportConfig();
  }

  public async stopAskingStatus(): Promise<void> {
    if (!this.provider) {
      return;
    }
    await this.provider.stopAskingStatus();
  }

  public async startAskingStatus(): Promise<void> {
    if (!this.provider) {
      return;
    }
    await this.provider.startAskingStatus();
  }

  public async factoryReset(): Promise<void> {
    if (!this.provider) {
      return;
    }
    await this.provider.factoryReset();
  }

  public async locateDevice(): Promise<void> {
    if (!this.provider) {
      return;
    }
    await this.provider.locateDevice();
  }
}

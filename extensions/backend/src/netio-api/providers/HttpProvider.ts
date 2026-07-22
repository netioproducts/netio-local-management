import {
  INetioProvider,
  NormalizedOutput,
  NormalizedOutputStatus,
  NormalizedSystemInfo,
} from "./NetioProvider";
import { EventEmitter } from "events";
import * as HttpClient from "../transport/HttpClient";
import { checkConnectivity, sendFile } from "../transport/univarsal";

export class HttpProvider
  extends EventEmitter
  implements INetioProvider, HttpClient.INetioDevice
{
  private static readonly OUTPUT_STATUS_POLL_MS = 1000;

  public host: string;
  public username: string;
  public password: string;
  public useHttps: boolean;
  public sessionId: string | null = null;

  private outputStatusPollTimer?: NodeJS.Timeout;
  private outputStatusPollInFlight: boolean = false;

  constructor(
    host: string,
    user: string,
    pass: string,
    useHttps: boolean = false,
  ) {
    super();
    this.host = host;
    this.username = user;
    this.password = pass;
    this.useHttps = useHttps;
  }

  public async login(
    user: string,
    pass: string,
    logout: boolean = false,
  ): Promise<string> {
    if (logout) await this.disconnect();
    const resp = await HttpClient.sendRequest(this, "login", {
      username: user,
      password: pass,
    });
    this.sessionId = resp.data.sessionId;
    return this.sessionId!;
  }

  public async connect(): Promise<void> {
    if (!this.sessionId) {
      await this.login(this.username, this.password);
      return;
    }
  }

  public disconnect(): void {
    this.stopOutputStatusPolling();

    if (this.sessionId) {
      HttpClient.sendRequest(this, "logout").catch(() => {});
      this.sessionId = null;
    }
  }

  public async getSystemInfo(): Promise<NormalizedSystemInfo> {
    const version = await HttpClient.sendRequest(this, "getVersion");
    const dName = await HttpClient.sendRequest(this, "getDeviceName");
    const features = await HttpClient.sendRequest(this, "getFeatures");

    return {
      model: dName.data.brandName,
      serialNumber: version.data.deviceSN,
      firmwareVersion: version.data.version,
      name: dName.data.deviceName,
      outputCount: features.data.outputCount,
    };
  }

  public async getAllInfo(): Promise<any> {
    const version = await HttpClient.sendRequest(this, "getVersion");
    const dName = await HttpClient.sendRequest(this, "getDeviceName");
    const features = await HttpClient.sendRequest(this, "getFeatures");
    const userList = await HttpClient.sendRequest(this, "getUserList");
    const pabList = await HttpClient.sendRequest(this, "getPABList");
    const watchdogList = await HttpClient.sendRequest(this, "getWatchdogList");
    const rulesList = await HttpClient.sendRequest(this, "getRules");
    const outputDetails = await HttpClient.sendRequest(
      this,
      "getOutputDetailList",
    );
    const outputStatus = await HttpClient.sendRequest(
      this,
      "getOutputStatusList",
    );
    const inputDetails = await HttpClient.sendRequest(
      this,
      "getInputDetailList",
    );
    const schedulesList = await HttpClient.sendRequest(this, "getScheduleList");

    return {
      version: version.data,
      deviceName: dName.data,
      outputDetails: outputDetails.data,
      outputStatus: outputStatus.data,
      inputDetails: inputDetails.data,
      schedulesList: schedulesList.data,
      features: features.data,
      userList: userList.data,
      pabList: pabList.data,
      watchdogList: watchdogList.data,
      rulesList: rulesList.data,
    };
  }

  public async getOutputs(): Promise<NormalizedOutput[]> {
    const resp = await HttpClient.sendRequest(this, "getOutputDetailList");

    return resp.data.map((o: any) => ({
      id: o.outputId,
      name: o.name,
      state: o.on === 1 || o.on === true,
    }));
  }

  public async setOutput(id: number, state: boolean): Promise<void> {
    await HttpClient.sendRequest(this, "setOutputState", {
      output: id,
      value: state,
    });
  }

  public async checkConnectivity(timeoutSec?: number): Promise<number> {
    return checkConnectivity({ host: this.host }, timeoutSec);
  }

  public async updateFirmware(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    await this.connect();
    await this.stopAskingStatus();

    console.log(`[HttpProvider] Preparing for firmware upgrade...`);
    onProgress && onProgress(1, "Preparing...");
    await HttpClient.sendRequest(this, "prepFwUpgrade");

    let simulatedProgress = 1;
    const expectedDurationMs = 90000;
    const updateIntervalMs = 5000;
    const step = 80 / (expectedDurationMs / updateIntervalMs);

    const progressTimer = setInterval(() => {
      simulatedProgress += step;
      if (simulatedProgress >= 80) {
        simulatedProgress = 80;
      }
      onProgress && onProgress(Math.floor(simulatedProgress), "Uploading...");
    }, updateIntervalMs);

    try {
      await sendFile(
        {
          uploadUrl: `${this.useHttps ? "https" : "http"}://${this.host}/upload/firmware`,
          sessionId: this.sessionId,
        },
        fileBuffer,
        "firmware.bin",
      );
    } catch (err) {
      clearInterval(progressTimer);
      throw err;
    } finally {
      clearInterval(progressTimer);
    }

    console.log(`[HttpProvider] Starting firmware upgrade (startUpgrade)...`);
    onProgress && onProgress(80, "Starting...");
    const res = await HttpClient.sendRequest(this, "startUpgrade");
  }

  public async importConfig(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    await this.connect();

    console.log(`[HttpProvider] Importing configuration...`);
    onProgress && onProgress(1, "Uploading...");

    await sendFile(
      {
        uploadUrl: `${this.useHttps ? "https" : "http"}://${this.host}/upload/config`,
        sessionId: this.sessionId,
      },
      fileBuffer,
      "config.json",
    );

    onProgress && onProgress(100, "Done...");
    console.log(`[HttpProvider] Configuration imported successfully.`);
  }

  public async exportConfig(): Promise<any> {
    await this.connect();

    console.log(`[HttpProvider] Exporting configuration...`);
    const protocol = this.useHttps ? "https" : "http";
    const url = `${protocol}://${this.host}/files/config.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Cookie: `sessionId=${this.sessionId}`
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async stopAskingStatus(): Promise<void> {
    this.stopOutputStatusPolling();
  }

  public async startAskingStatus(): Promise<void> {
    this.startOutputStatusPolling();
  }

  private startOutputStatusPolling(): void {
    this.stopOutputStatusPolling();

    this.outputStatusPollTimer = setInterval(() => {
      void this.pollOutputStatusList();
    }, HttpProvider.OUTPUT_STATUS_POLL_MS);

    void this.pollOutputStatusList();
  }

  private stopOutputStatusPolling(): void {
    if (this.outputStatusPollTimer) {
      clearInterval(this.outputStatusPollTimer);
      this.outputStatusPollTimer = undefined;
    }
    this.outputStatusPollInFlight = false;
  }

  private async pollOutputStatusList(): Promise<void> {
    if (!this.sessionId || this.outputStatusPollInFlight) {
      return;
    }

    this.outputStatusPollInFlight = true;
    try {
      const response = await HttpClient.sendRequest(
        this,
        "getOutputStatusList",
      );
      const outputs = this.parseOutputStatusList(response?.data?.outputs);

      this.emit("output_change", outputs);
    } catch (error) {
      this.emitProviderError(error);
    } finally {
      this.outputStatusPollInFlight = false;
    }
  }

  private emitProviderError(error: unknown): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
      return;
    }
  }

  private parseOutputStatusList(outputs: unknown): NormalizedOutputStatus[] {
    if (!Array.isArray(outputs)) {
      return [];
    }

    return outputs.reduce<NormalizedOutputStatus[]>((acc, entry) => {
      if (!entry || typeof entry !== "object") {
        return acc;
      }

      const output = entry as Record<string, unknown>;
      if (typeof output.outputId !== "number") {
        return acc;
      }

      acc.push({
        id: output.outputId,
        state: output.on === true,
        load: typeof output.load === "number" ? output.load : undefined,
        energy: typeof output.energy === "number" ? output.energy : undefined,
        reverseEnergy:
          typeof output.reverseEnergy === "number"
            ? output.reverseEnergy
            : undefined,
        energyNR:
          typeof output.energyNR === "number" ? output.energyNR : undefined,
        reverseEnergyNR:
          typeof output.reverseEnergyNR === "number"
            ? output.reverseEnergyNR
            : undefined,
        current:
          typeof output.current === "number" ? output.current : undefined,
        voltage:
          typeof output.voltage === "number" ? output.voltage : undefined,
        powerFactor:
          typeof output.powerFactor === "number"
            ? output.powerFactor
            : undefined,
        phase: typeof output.phase === "number" ? output.phase : undefined,
        frequency:
          typeof output.frequency === "number" ? output.frequency : undefined,
      });

      return acc;
    }, []);
  }

  async factoryReset(): Promise<void> {
    await HttpClient.sendRequest(this, "factoryReset", { keepNetwork: false });
  }

  async locateDevice(): Promise<void> {
    await HttpClient.sendRequest(this, "locate");
  }
}

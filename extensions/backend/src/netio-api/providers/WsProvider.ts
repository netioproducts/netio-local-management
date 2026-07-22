import {
  INetioProvider,
  NormalizedOutput,
  NormalizedOutputStatus,
  NormalizedSystemInfo,
} from "./NetioProvider";
import { EventEmitter } from "events";
import { NetioWsApi } from "../transport/WsClient";
import { checkConnectivity, sendFile } from "../transport/univarsal";

interface OutputCacheItem extends NormalizedOutputStatus {
  name: string;
}

export class WsProvider extends EventEmitter implements INetioProvider {
  private api: NetioWsApi;
  private outputsCache = new Map<number, OutputCacheItem>();
  private systemInfoCache: Partial<NormalizedSystemInfo> = {};
  private allInfoCache: any = null;

  constructor(host: string, user: string, pass: string) {
    super();
    this.api = new NetioWsApi({ host, username: user, password: pass });

    this.api.on("message", (msg) => this.handleWsMessage(msg));
    this.api.on("disconnected", () => this.emit("disconnected"));
    this.api.on("error", (err) => this.emitProviderError(err));
  }

  public async connectOnly(timeoutMs: number = 5000): Promise<void> {
    await this.api.connect(timeoutMs);
  }

  public async connect(): Promise<void> {
    await this.api.connect();

    // Subscribe to all topics - sendRequest returns a promise with the reply data
    const [sysInfoReply, outputListReply, outputMeasureReply] =
      await Promise.all([
        this.api.sendRequest("SUBSCRIBE", "system/info"),
        this.api.sendRequest("SUBSCRIBE", "outputs/list"),
        this.api.sendRequest("SUBSCRIBE", "outputs/measure"),
      ]);

    // Parse initial data directly from subscribe replies
    this.processSystemInfo(sysInfoReply.data);
    this.processOutputList(outputListReply.data);
    this.processOutputMeasure(outputMeasureReply.data);

    console.log("[WsProvider] Connected and initial data received.");
    console.log("[WsProvider] System Info:", this.systemInfoCache);
  }

  public disconnect(): void {
    this.api.disconnect();
  }

  public async getSystemInfo(): Promise<NormalizedSystemInfo> {
    if (!this.systemInfoCache.serialNumber) {
      const reply = await this.api.sendRequest("SUBSCRIBE", "system/info");
      this.processSystemInfo(reply.data);
    }
    return this.systemInfoCache as NormalizedSystemInfo;
  }

  public async getAllInfo(): Promise<any> {
    const safeSub = async (topic: string, unsubscribe: boolean) => {
      try {
        const res = await this.api.sendRequest(
          "SUBSCRIBE",
          topic,
          undefined,
          2000,
        );
        if (unsubscribe) {
          await this.api
            .sendRequest("UNSUBSCRIBE", topic, undefined, 1000)
            .catch(() => {});
        }
        return res.data;
      } catch (err) {
        return null;
      }
    };

    const info = await safeSub("system/info", false);
    const outputList = await safeSub("outputs/list", false);
    const inputList = await safeSub("inputs/list", true);
    const outputMeasure = await safeSub("outputs/measure", false);
    const protocolsInfo = await safeSub("protocols/info", true);
    const pabList = await safeSub("pab/list", true);
    const rulesList = await safeSub("rules/list", true);
    const wdtList = await safeSub("wdtpingers/list", true);
    const userList = await safeSub("users/list", true);
    const schedulesList = await safeSub("schedules/list", true);
    const outputGlobalMeasure = await safeSub("outputs/globalmeasure", true);

    this.allInfoCache = {
      systemInfo: info,
      outputList: outputList,
      inputList: inputList,
      outputMeasure: outputMeasure,
      outputGlobalMeasure: outputGlobalMeasure,
      schedulesList: schedulesList,
      protocolsInfo: protocolsInfo,
      userList: userList,
      pabList: pabList,
      wdtList: wdtList,
      rulesList: rulesList,
    };
    return this.allInfoCache;
  }

  public async getOutputs(): Promise<NormalizedOutput[]> {
    return Array.from(this.outputsCache.values());
  }

  public async setOutput(id: number, state: boolean): Promise<void> {
    const action = state ? "on" : "off";
    const topic = `outputs/id/${id}/ctrl`;
    await this.api.sendRequest("SET", topic, { request: action });
  }

  public async checkConnectivity(timeoutSec?: number): Promise<number> {
    return checkConnectivity({ host: this.api.config.host }, timeoutSec);
  }

  public async updateFirmware(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    await this.api.connect();

    console.log(`[WsProvider] Getting upload path (SET system/fwupdate)...`);
    onProgress && onProgress(0, "Preparing...");
    const response = await this.api.sendRequest("SET", "system/fwupdate", {});

    let simulatedProgress = 1;
    const expectedDurationMs = 90000;
    const updateIntervalMs = 5000;
    const step = 80 / (expectedDurationMs / updateIntervalMs);

    if (response.data.uploadPath) {
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
            uploadUrl: `http://${this.api.config.host}${response.data.uploadPath}`,
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
    } else if (response.data.uploadId !== undefined) {
      await this.api.uploadFile(
        fileBuffer,
        "upload/chunk",
        response.data.uploadId,
        (progressInfo) => {
          const percent =
            (progressInfo.uploadedBytes / progressInfo.totalBytes) * 80;
          onProgress && onProgress(Math.floor(percent), "Uploading...");
        },
      );
    } else {
      throw new Error(
        "Invalid response from system/fwupdate: missing uploadPath and uploadId",
      );
    }

    onProgress && onProgress(80, "Starting...");
    console.log(`[WsProvider] File uploaded successfully.`);
  }

  public async importConfig(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void> {
    await this.api.connect();

    onProgress && onProgress(0, "Preparing...");
    const response = await this.api.sendRequest("SET", "system/cfgimport", {});

    if (response.data.uploadPath) {
      let simulatedProgress = 1;
      const expectedDurationMs = 15000;
      const updateIntervalMs = 2000;
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
            uploadUrl: `http://${this.api.config.host}${response.data.uploadPath}`,
          },
          fileBuffer,
          "config.json",
        );
      } catch (err) {
        clearInterval(progressTimer);
        throw err;
      } finally {
        clearInterval(progressTimer);
      }
    } else if (response.data.uploadId !== undefined) {
      await this.api.uploadFile(
        fileBuffer,
        "upload/chunk",
        response.data.uploadId,
        (progressInfo) => {
          const percent =
            (progressInfo.uploadedBytes / progressInfo.totalBytes) * 80;
          onProgress && onProgress(Math.floor(percent), "Uploading...");
        },
      );
    } else {
      throw new Error(
        "Invalid response from system/cfgimport: missing uploadPath and uploadId",
      );
    }

    onProgress && onProgress(100, "Done...");
    console.log(`[WsProvider] Configuration imported successfully.`);
  }

  private isVersion52OrHigher(version: string): boolean {
    if (!version) return false;
    const match = version.match(/^(\d+)\.(\d+)/);
    if (!match) return false;
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major > 5) return true;
    if (major === 5 && minor >= 2) return true;
    return false;
  }

  public async exportConfig(): Promise<any> {
    await this.api.connect();

    if (!this.systemInfoCache.firmwareVersion) {
      await this.getSystemInfo();
    }

    if (this.isVersion52OrHigher(this.systemInfoCache.firmwareVersion || "")) {
      const EXPORT_TOPICS = [
        "export/config/inputs",
        "export/config/network",
        "export/config/outputs",
        "export/config/PAB",
        "export/config/protocols",
        "export/config/rules",
        "export/config/schedules",
        "export/config/system",
        "export/config/users",
        "export/config/wdtpingers",
        "export/config/mqtt",
        "export/config/nbus",
      ];

      const assembledConfig: any = {};
      for (const topic of EXPORT_TOPICS) {
        try {
          const res = await this.api.sendRequest("SET", topic, {}, 2000);

          if (res && res.data) {
            const keyName = topic.split("/").pop()!; // e.g. "network"
            if (Object.keys(res.data).length === 1 && res.data[keyName]) {
              assembledConfig[keyName] = res.data[keyName];
            } else {
              assembledConfig[keyName] = res.data;
            }
          }
        } catch (e) {
          console.warn(`[WsProvider] Failed to export topic ${topic}`, e);
        }
      }
      return { config: assembledConfig };
    }

    const response = await this.api.sendRequest("SET", "system/cfgexport", {});

    if (response && response.data && response.data.config) {
      if (typeof response.data.config === "string") {
        try {
          return JSON.parse(response.data.config);
        } catch (e) {
          try {
            // Workaround for NETIO firmware bug where it exports invalid JSON like '{"config":{,"schedules":...'
            const cleanedStr = response.data.config.replace(/{\s*,/g, "{");
            return JSON.parse(cleanedStr);
          } catch (e2) {
            console.warn(
              "[WsProvider] Failed to parse exported config even after cleanup:",
              e2,
            );
            return response.data.config;
          }
        }
      }
      return response.data.config;
    } else {
      throw new Error(
        "Invalid response from system/cfgexport: missing data.config",
      );
    }
  }

  public async stopAskingStatus(): Promise<void> {
    await this.api.sendRequest("UNSUBSCRIBE", "outputs/measure");
  }

  public async startAskingStatus(): Promise<void> {
    await this.api.sendRequest("SUBSCRIBE", "outputs/measure");
  }

  private processSystemInfo(data: any): void {
    if (!data) return;
    this.systemInfoCache = {
      model: data.brandName,
      serialNumber: data.deviceSN,
      firmwareVersion: data.fwVersion,
      name: data.deviceName,
      outputCount: data.outputCount,
    };
  }

  private processOutputList(data: any): void {
    if (!data?.items) return;
    data.items.forEach((item: any) => {
      const existing = this.outputsCache.get(item.id) || {
        id: item.id,
        state: false,
        name: "",
      };
      existing.name = item.name;
      this.outputsCache.set(item.id, existing);
    });
  }

  private processOutputMeasure(data: any): void {
    if (!data?.items) return;
    data.items.forEach((item: any) => {
      const existing = this.outputsCache.get(item.id) || {
        id: item.id,
        state: false,
        name: "",
      };
      const newState = {
        id: item.id,
        name: existing.name,
        state: item.state === "on",
        load: item.measure?.power,
        voltage: item.measure?.voltage,
        current: item.measure?.current,
        energy: item.measure?.energy,
        reverseEnergy: item.measure?.reverseEnergy,
        energyNR: item.measure?.energyNR,
        reverseEnergyNR: item.measure?.reverseEnergyNR,
        frequency: item.measure?.frequency,
        phase: item.measure?.phase,
        powerFactor: item.measure?.powerFactor,
      };
      this.outputsCache.set(item.id, newState);
    });
    this.emit(
      "output_change",
      Array.from(this.outputsCache.values()) as NormalizedOutputStatus[],
    );
  }

  private handleWsMessage(msg: any) {
    if (!msg.data) return;
    if (msg.topic === "system/info") this.processSystemInfo(msg.data);
    if (msg.topic === "outputs/list") this.processOutputList(msg.data);
    if (msg.topic === "outputs/measure") this.processOutputMeasure(msg.data);
  }

  private emitProviderError(error: unknown): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
      return;
    }

    console.warn("[WsProvider] Received error without listeners:", error);
  }

  public async factoryReset(): Promise<void> {
    await this.api.sendRequest("SET", "system/loaddefaults", {
      loadDefaults: true,
    });
  }

  public async locateDevice(): Promise<void> {
    await this.api.sendRequest("SET", "system/locate", { locate: true });
  }
}

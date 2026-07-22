import WebSocket from "ws";
import { EventEmitter } from "events";
import { createHash, randomBytes } from "crypto";
import { DeviceOfflineError, UnauthorizedError } from "../types/Errors";

export interface WsConfig {
  host: string;
  username: string;
  password: string;
  port?: number;
}

export interface WsMessage {
  type:
    | "HELO"
    | "REPLY"
    | "AUTH"
    | "SUBSCRIBE"
    | "SET"
    | "EVENT"
    | "KEEP-ALIVE"
    | "ERROR";
  reqId?: number;
  topic?: string;
  data?: any;
  status?: "OK" | "ERROR";
  error?: { code: string; message: string };
  username?: string;
  token?: string;
}

export class WsCommunicationError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "WsCommunicationError";
  }
}

export class NetioWsApi extends EventEmitter {
  private ws: WebSocket | null = null;
  private _config: WsConfig;

  private reqIdCounter: number = 0;

  private pendingRequests = new Map<
    number,
    {
      resolve: (msg: WsMessage) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  private isAuthenticated: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(config: WsConfig) {
    super();
    this._config = { port: 80, ...config };
  }

  public async connect(timeoutMs: number = 2000): Promise<void> {
    if (this.ws) return;

    return new Promise((resolve, reject) => {
      const url = `ws://${this._config.host}:${this._config.port}/emweb`;
      console.debug(`[WsApi] Connecting to ${url} (timeout: ${timeoutMs}ms)`);

      this.ws = new WebSocket(url, {
        handshakeTimeout: timeoutMs,
      });

      let isConnected = false;

      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          console.warn(`[WsApi] Connection timed out after ${timeoutMs}ms`);
          if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.terminate();
            this.ws = null;
          }
          this.cleanup();
          reject(
            new DeviceOfflineError(`Connection timeout (${timeoutMs}ms)`),
          );
        }
      }, timeoutMs);

      this.ws.on("open", async () => {
        isConnected = true;
        clearTimeout(connectionTimeout);

        console.debug("[WsApi] Socket opened, starting handshake...");
        try {
          await this.performHandshake();
          this.startKeepAlive();
          this.emit("connected");
          resolve();
        } catch (e) {
          this.disconnect();
          reject(e);
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => this.handleMessage(data));

      this.ws.on("error", (err) => {
        if (isConnected) {
          console.error("[WsApi] Error:", err.message);
          this.emit("error", err);
        } else {
          isConnected = true;
          clearTimeout(connectionTimeout);

          console.warn(`[WsApi] Connect failed: ${err.message}`);
          this.ws = null; // important - clean reference
          this.cleanup();
          reject(new DeviceOfflineError(`Connect failed: ${err.message}`));
        }
      });

      this.ws.on("close", (code, reason) => {
        if (!isConnected) {
          isConnected = true;
          clearTimeout(connectionTimeout);
          reject(
            new WsCommunicationError("Connection closed before handshake"),
          );
        }

        console.debug(`[WsApi] Closed: ${code} ${reason}`);
        this.cleanup();
        this.emit("disconnected");
      });
    });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopKeepAlive();
    this.ws = null;
    this.isAuthenticated = false;
    this.pendingRequests.forEach((req) => {
      clearTimeout(req.timer);
      req.reject(new WsCommunicationError("Connection closed"));
    });
    this.pendingRequests.clear();
  }

  public sendRequest(
    type: string,
    topic?: string,
    data?: any,
    timeoutMs: number = 5000,
  ): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new WsCommunicationError("WebSocket is not connected"));
      }

      const reqId = this.reqIdCounter++;
      const msg: WsMessage = {
        type: type as any,
        reqId: reqId,
      };

      if (topic) msg.topic = topic;
      if (data) msg.data = data;

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new WsCommunicationError(`Request timeout (reqId: ${reqId})`));
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        reject(new WsCommunicationError("Send failed: " + e.message));
      }
    });
  }

  public async uploadFile(
    fileBuffer: Buffer,
    topic: string,
    uploadId: number | string,
    onProgress?: (progress: {
      uploadedBytes: number;
      totalBytes: number;
      chunksCompleted: number;
      totalChunks: number;
    }) => void,
    abortSignal?: AbortSignal,
    chunkSizeBytes = 2048,
  ): Promise<void> {
    const MAX_RETRIES = 3;
    const TIMEOUT_MS = 30000;
    const fileSize = fileBuffer.length;
    const totalChunks = Math.ceil(fileSize / chunkSizeBytes);

    onProgress &&
      onProgress({
        uploadedBytes: 0,
        totalBytes: fileSize,
        chunksCompleted: 0,
        totalChunks,
      });

    console.log(
      `[WsApi] Starting chunked upload (${fileSize} bytes in ${totalChunks} chunks)`,
    );

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (abortSignal?.aborted) {
        throw new Error("Upload aborted by user.");
      }

      const bytesFrom = chunkIndex * chunkSizeBytes;
      const bytesTo = Math.min(bytesFrom + chunkSizeBytes, fileSize);
      const isComplete = chunkIndex === totalChunks - 1;

      const chunkBuffer = fileBuffer.subarray(bytesFrom, bytesTo);
      const b64Data = chunkBuffer.toString("base64");

      const payload = {
        uploadId: uploadId,
        chunkIndex: chunkIndex,
        chunksTotal: totalChunks,
        bytesFrom: bytesFrom,
        bytesTo: bytesTo,
        bytesTotal: fileSize,
        b64Data: b64Data,
        complete: isComplete,
      };

      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (abortSignal?.aborted) {
          throw new Error("Upload aborted by user.");
        }

        try {
          console.debug(
            `[WsApi] Uploading chunk ${chunkIndex + 1}/${totalChunks} (bytes ${bytesFrom}-${bytesTo}) attempt ${attempt}`,
          );
          await this.sendRequest("SET", topic, payload, TIMEOUT_MS);
          lastError = null;
          break;
        } catch (err: any) {
          console.warn(
            `[WsApi] Error uploading chunk ${chunkIndex + 1}, attempt ${attempt}:`,
            err.message,
          );
          lastError = err;
        }
      }

      if (lastError !== null) {
        throw lastError;
      }

      onProgress &&
        onProgress({
          uploadedBytes: bytesTo,
          totalBytes: fileSize,
          chunksCompleted: chunkIndex + 1,
          totalChunks,
        });
    }
  }

  private async performHandshake(): Promise<void> {
    const heloResp = await this.sendRequest("HELO");

    if (!heloResp.data || !heloResp.data.publicKey) {
      throw new WsCommunicationError(
        "Invalid HELO response (missing publicKey)",
      );
    }

    const { publicKey, localTimestamp } = heloResp.data;
    const token = this.computeAuthToken(publicKey, localTimestamp);
    const authPayload = {
      username: this._config.username,
      token: token,
    };
    const authResp = await this.sendSpecificAuthRequest(authPayload);

    if (authResp.status !== "OK") {
      throw new UnauthorizedError("Authentication failed");
    }

    this.isAuthenticated = true;
  }

  private sendSpecificAuthRequest(payload: {
    username: string;
    token: string;
  }): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
      const reqId = this.reqIdCounter++;
      const msg = {
        type: "AUTH",
        reqId: reqId,
        ...payload,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new WsCommunicationError("Auth timeout"));
      }, 5000);

      this.pendingRequests.set(reqId, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  private computeAuthToken(publicKey: string, localTimestamp: number): string {
    function sha256Hex(data: string): string {
      return createHash("sha256").update(data).digest("hex");
    }

    const timeMark = Math.floor(localTimestamp / 10).toString();
    const clientSalt = randomBytes(4).toString("hex");

    const passwordHash = createHash("sha256")
      .update(`${this._config.username}${publicKey}${this._config.password}`)
      .digest("base64");

    const passwordToken = sha256Hex(`${clientSalt}${passwordHash}`);
    const authToken = `${clientSalt}.${sha256Hex(`${timeMark}${passwordToken}`)}`;
    return authToken;
  }

  private handleMessage(rawData: WebSocket.Data) {
    let msg: WsMessage;
    try {
      msg = JSON.parse(rawData.toString());
    } catch (e) {
      console.warn("[WsApi] Invalid JSON received");
      return;
    }

    if (msg.reqId !== undefined && this.pendingRequests.has(msg.reqId)) {
      console.debug(
        `[WsApi] Received response for request ${msg.reqId}, ${JSON.stringify(msg.data)}`,
      );
      const req = this.pendingRequests.get(msg.reqId)!;
      clearTimeout(req.timer);
      this.pendingRequests.delete(msg.reqId);

      if (msg.status === "ERROR" || msg.error) {
        req.reject(
          new WsCommunicationError(
            msg.error?.message || "Unknown API Error",
            msg.error?.code,
          ),
        );
      } else {
        req.resolve(msg);
      }
      return;
    }

    this.emit("message", msg);
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  public get config(): WsConfig {
    return this._config;
  }
}

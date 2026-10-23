import WebSocket from "ws";
import { EventEmitter } from "events";
import { createHash, randomBytes } from "crypto";
import {
  DeviceOfflineError,
  errorMessage,
  UnauthorizedError,
} from "../types/Errors";
import { createLogger } from "../../logging/Logger";

const log = createLogger("WsClient");

/**
 * Request payload for the log, file content of upload chunks is replaced by size.
 */
function describePayload(data: any): unknown {
  if (data && typeof data === "object" && typeof data.b64Data === "string") {
    return { ...data, b64Data: `[${data.b64Data.length} base64 chars]` };
  }
  return data;
}

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
      const host = this._config.host;
      const startedAt = performance.now();
      log.debug("Connecting", { host, url, timeoutMs });

      this.ws = new WebSocket(url, {
        handshakeTimeout: timeoutMs,
      });

      let isConnected = false;

      const connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          log.debug("Connection timed out", { host, timeoutMs });
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

        log.debug("Socket opened, starting handshake", {
          host,
          ms: Math.round(performance.now() - startedAt),
        });
        try {
          await this.performHandshake();
          this.startKeepAlive();
          log.debug("Connected and authenticated", {
            host,
            username: this._config.username,
            ms: Math.round(performance.now() - startedAt),
          });
          this.emit("connected");
          resolve();
        } catch (e) {
          log.debug("Handshake failed", { host, reason: errorMessage(e) });
          this.disconnect();
          reject(e);
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => this.handleMessage(data));

      this.ws.on("error", (err) => {
        if (isConnected) {
          // Reported by the consumer of the "error" event
          log.debug("Socket error", { host, reason: err.message });
          this.emit("error", err);
        } else {
          isConnected = true;
          clearTimeout(connectionTimeout);

          log.debug("Connect failed", {
            host,
            ms: Math.round(performance.now() - startedAt),
            reason: err.message,
          });
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

        log.debug("Connection closed", {
          host,
          code,
          reason: reason.toString(),
        });
        this.cleanup();
        this.emit("disconnected");
      });
    });
  }

  public disconnect() {
    if (this.ws) {
      log.debug("Disconnecting", { host: this._config.host });
      this.ws.close();
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopKeepAlive();
    this.ws = null;
    this.isAuthenticated = false;
    if (this.pendingRequests.size > 0) {
      log.debug("Rejecting pending requests, connection closed", {
        host: this._config.host,
        pending: this.pendingRequests.size,
      });
    }
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
      const host = this._config.host;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        log.debug("WS request rejected, not connected", { host, type, topic });
        return reject(new WsCommunicationError("WebSocket is not connected"));
      }

      const reqId = this.reqIdCounter++;
      const startedAt = performance.now();
      const msg: WsMessage = {
        type: type as any,
        reqId: reqId,
      };

      if (topic) msg.topic = topic;
      if (data) msg.data = data;

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          log.warn("WS request timed out", {
            host,
            type,
            topic,
            reqId,
            timeoutMs,
          });
          reject(new WsCommunicationError(`Request timeout (reqId: ${reqId})`));
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: (reply) => {
          log.debug("WS request", {
            host,
            type,
            topic,
            reqId,
            data: describePayload(data),
            ms: Math.round(performance.now() - startedAt),
            ok: true,
          });
          resolve(reply);
        },
        reject: (err) => {
          log.debug("WS request failed", {
            host,
            type,
            topic,
            reqId,
            data: describePayload(data),
            ms: Math.round(performance.now() - startedAt),
            ok: false,
            error: err.message,
            code: (err as WsCommunicationError).code,
          });
          reject(err);
        },
        timer,
      });

      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        log.warn("WS send failed", {
          host,
          type,
          topic,
          reqId,
          reason: e.message,
        });
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

    const host = this._config.host;
    const startedAt = performance.now();
    log.debug("Chunked upload started", {
      host,
      topic,
      uploadId,
      bytes: fileSize,
      chunks: totalChunks,
      chunkSizeBytes,
    });

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (abortSignal?.aborted) {
        log.debug("Chunked upload aborted", { host, uploadId, chunkIndex });
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
          log.debug("Chunked upload aborted", { host, uploadId, chunkIndex });
          throw new Error("Upload aborted by user.");
        }

        try {
          await this.sendRequest("SET", topic, payload, TIMEOUT_MS);
          lastError = null;
          break;
        } catch (err: any) {
          log.warn("Chunk upload failed", {
            host,
            uploadId,
            chunk: chunkIndex + 1,
            chunks: totalChunks,
            attempt,
            maxAttempts: MAX_RETRIES,
            reason: err.message,
          });
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

    log.debug("Chunked upload finished", {
      host,
      uploadId,
      bytes: fileSize,
      ms: Math.round(performance.now() - startedAt),
    });
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
      log.debug("Authentication rejected", {
        host: this._config.host,
        username: this._config.username,
        status: authResp.status,
      });
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
      const host = this._config.host;
      const startedAt = performance.now();
      const msg = {
        type: "AUTH",
        reqId: reqId,
        ...payload,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        log.warn("WS authentication timed out", {
          host,
          reqId,
          timeoutMs: 5000,
        });
        reject(new WsCommunicationError("Auth timeout"));
      }, 5000);

      this.pendingRequests.set(reqId, {
        resolve: (reply) => {
          log.debug("WS request", {
            host,
            type: "AUTH",
            reqId,
            username: payload.username,
            ms: Math.round(performance.now() - startedAt),
            ok: true,
          });
          resolve(reply);
        },
        reject: (err) => {
          log.debug("WS request failed", {
            host,
            type: "AUTH",
            reqId,
            username: payload.username,
            ms: Math.round(performance.now() - startedAt),
            ok: false,
            error: err.message,
            code: (err as WsCommunicationError).code,
          });
          reject(err);
        },
        timer,
      });
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
      log.warn("Invalid JSON received", {
        host: this._config.host,
        bytes: rawData.toString().length,
      });
      return;
    }

    if (msg.reqId !== undefined && this.pendingRequests.has(msg.reqId)) {
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

    log.debug("WS event", {
      host: this._config.host,
      type: msg.type,
      topic: msg.topic,
      reqId: msg.reqId,
    });
    this.emit("message", msg);
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        log.debug("Keep-alive ping", { host: this._config.host });
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

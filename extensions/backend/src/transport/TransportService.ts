import { ConfigService } from "../config/ConfigService";
import NeutralinoExtension from "./NeutralinoExtension";
import process from "process";

const BROADCAST_CHANNEL = "backendEvent";

export interface RequestContext {
  requestId?: number;
  sendMessage: (data: any) => void;
  broadcast: (eventType: string, payload: any) => void;
}

export type Handler = (ctx: RequestContext, data: any) => Promise<void> | void;

export class TransportService {
  private ext: NeutralinoExtension;
  private messageQueue: Array<{ eventType: string; payload: any }> = [];
  private routes: Record<string, Handler> = {};

  private debug: boolean;
  private frontendConnected = false;

  constructor(
    private configService: ConfigService,
    debug = true,
  ) {
    this.debug = debug;
    this.ext = new NeutralinoExtension(debug);
  }

  /**
   * listening from frontend
   */
  public start() {
    this.ext.run(async (msg: any) => {
      this.handleIncomingMessage(msg);
    });
  }

  public registerRoutes(routes: Record<string, Handler>) {
    this.routes = routes;
  }

  /**
   * Mark frontend as connected and flush queued messages
   */
  private onFrontendConnected() {
    if (this.frontendConnected) return;
    this.frontendConnected = true;
    console.log(
      `[Transport] Frontend connected. Flushing ${this.messageQueue.length} queued message(s).`,
    );
    for (const msg of this.messageQueue) {
      this.sendBroadcast(msg.eventType, msg.payload);
    }
    this.messageQueue = [];
  }

  /**
   * Broadcast event - queues if frontend is not yet connected
   */
  public broadcast(eventType: string, payload: any) {
    if (!this.frontendConnected) {
      if (this.debug) {
        console.log(
          `[Transport] Queuing broadcast (frontend not connected): ${eventType}`,
        );
      }
      this.messageQueue.push({ eventType, payload });
      return;
    }
    this.sendBroadcast(eventType, payload);
  }

  /**
   * Actually send broadcast to frontend
   */
  private sendBroadcast(eventType: string, payload: any) {
    if (this.debug) {
      console.log(`[Transport] Broadcasting: ${eventType}`);
    }
    this.ext.sendMessage(BROADCAST_CHANNEL, {
      type: eventType,
      payload: payload,
    });
  }

  /**
   * Message processing
   */
  private async handleIncomingMessage(msg: any) {
    if (msg.event !== "runNode" || !msg.data?.function) {
      if (msg.event === "windowClose") process.exit(0);
      return;
    }

    if (!this.frontendConnected) this.onFrontendConnected();

    const funcName = msg.data.function;
    const requestId = msg.data.requestId;
    const params = msg.data.parameter;

    const handler: Handler = this.routes[funcName];

    if (!handler) {
      console.warn(`[Transport] Unknown function: ${funcName}`);
      this.sendError(
        requestId,
        `Function '${funcName}' not found`,
        "UnknownFunction",
      );
      return;
    }

    const context: RequestContext = {
      requestId,
      sendMessage: (responseData) => {
        this.ext.sendMessage("responseNode", {
          data: responseData,
          requestId: requestId,
          success: true,
        });
      },
      broadcast: this.broadcast.bind(this),
    };

    // Execute handler
    try {
      if (this.debug) console.log(`[Transport] Executing: ${funcName}`);
      await handler(context, params);
    } catch (err) {
      console.debug(`[Transport] Error in '${funcName}': ${String(err)}`);
      this.sendError(
        requestId,
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err.name : "Error",
        (err as { details?: unknown } | undefined)?.details,
      );
    }
  }

  /**
   * Sends a failed response. `code` is the error class name, so the frontend can react
   * to specific errors (e.g. DeviceBusyError), `details` carries its structured data.
   */
  private sendError(
    requestId: number | undefined,
    errorMessage: string,
    code: string,
    details?: unknown,
  ) {
    this.ext.sendMessage("responseNode", {
      success: false,
      error: errorMessage,
      code: code,
      details: details,
      requestId: requestId,
    });
  }

  public broadcastError(errorMessage: string, macAddress?: string) {
    this.broadcast("backendError", { error: errorMessage, macAddress });
  }

  public broadcastWarning(message: string) {
    this.broadcast("backendWarning", { message });
  }
}

import { extensions, events } from "@neutralinojs/lib";
import { notify } from "./notificationService";
import { eventService } from "./eventService";
import { EventKey } from "../models/Events";
import { BackendError } from "./BackendError";
import { createLogger } from "./logger";

const log = createLogger("Transport");

const EXTENSION = "extNode"; //'extPython';
const EVENT_REQUEST = "runNode"; //'runPython';
const EVENT_RESPONSE = "responseNode"; //'responsePython';

const BACKEND_EVENT = "backendEvent";

type PendingHandlers = {
  resolve: (v: any) => void;
  reject: (err: any) => void;
  timeout?: ReturnType<typeof setTimeout>;
  functionName: string;
  startedAt: number;
};

const pendingRequests = new Map<number, PendingHandlers>();

let requestIdCounter = 1;

const handleResponse = (event: CustomEvent<any>) => {
  const response = event.detail; //JSON.parse(event.detail);
  const requestId = response?.requestId;

  if (requestId === undefined) {
    log.warn("Response without request ID", response);
    return;
  }
  const promiseHandlers = pendingRequests.get(requestId);
  if (!promiseHandlers) {
    log.warn(`Response #${requestId} for an unknown or timed out request`, response);
    return;
  }
  const duration = Math.round(performance.now() - promiseHandlers.startedAt);
  // clear timeout if present
  if (promiseHandlers.timeout) {
    clearTimeout(promiseHandlers.timeout);
  }
  if (!response.error) {
    log.debug(`${promiseHandlers.functionName} #${requestId} succeeded (${duration} ms)`, response.data);
    promiseHandlers.resolve(response.data);
  } else {
    log.warn(
      `${promiseHandlers.functionName} #${requestId} failed (${duration} ms): ${response.code}: ${response.error}`,
      response.details,
    );
    promiseHandlers.reject(
      new BackendError(
        response.error || "Unknown error",
        response.code || "Error",
        response.details,
      ),
    );
  }
  pendingRequests.delete(requestId);
};

const handleBackendEvent = (event: CustomEvent) => {
  const detail = event.detail;

  log.debug(`Event ${detail?.type}`, detail?.payload);

  if (detail.type && detail.payload) {
    if (detail.type === "backendError") {
      notify.error(
        "Backend Error",
        detail.payload.error || "Unknown error from backend",
      );
    }
    else if (detail.type === "backendWarning") {
      notify.warning("Warning", detail.payload.message);
    }
    eventService.emit(detail.type as EventKey, detail.payload);
  } else {
    log.warn("Unknown event format from backend", detail);
  }
};

/**
 * Initialize Neutralino transport layer.
 */
export const initTransport = () => {
  log.debug("Initializing transport");
  events.off(EVENT_RESPONSE, handleResponse);
  events.on(EVENT_RESPONSE, handleResponse);

  events.off(BACKEND_EVENT, handleBackendEvent);
  events.on(BACKEND_EVENT, handleBackendEvent);
};

/**
 * Generic function to send a request.
 * @param {string} functionName Function name to call in extension
 * @param {object} params Data to send
 * @param {number} timeoutMs milliseconds to wait before rejecting (default 5000)
 * @returns {Promise<any>}
 */
export const request = (
  functionName: string,
  params: { [key: string]: any } = {},
  timeoutMs: number = 5000,
): Promise<any> => {
  const requestId = requestIdCounter++;

  const promise = new Promise<any>((resolve, reject) => {
    // reserve entry so other code can access it
    pendingRequests.set(requestId, {
      resolve,
      reject,
      timeout: undefined,
      functionName,
      startedAt: performance.now(),
    });
    log.debug(`${functionName} #${requestId}`, params);

    // start timeout
    const timeoutId = setTimeout(() => {
      const handlers = pendingRequests.get(requestId);
      if (!handlers) return;
      log.warn(`${functionName} #${requestId} timed out after ${timeoutMs} ms`);
      handlers.reject(
        new BackendError(
          `Request to ${functionName} timed out after ${timeoutMs}ms`,
          "Timeout",
        ),
      );
      pendingRequests.delete(requestId);
    }, timeoutMs);
    const handlers = pendingRequests.get(requestId);
    if (handlers) handlers.timeout = timeoutId;
  });

  extensions
    .dispatch(EXTENSION, EVENT_REQUEST, {
      function: functionName,
      parameter: params,
      requestId: requestId,
    })
    .catch((err) => {
      const handlers = pendingRequests.get(requestId);
      log.error(`${functionName} #${requestId} could not be sent`, err);
      if (handlers) {
        if (handlers.timeout) clearTimeout(handlers.timeout);
        handlers.reject(
          new BackendError(
            err instanceof Error ? err.message : String(err),
            "TransportError",
          ),
        );
      }
      pendingRequests.delete(requestId);
    });

  return promise;
};

export const broadcastRaw = (event: string) => {
  return extensions.broadcast(event);
};

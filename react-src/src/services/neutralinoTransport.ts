import { extensions, events } from "@neutralinojs/lib";
import { notify } from "./notificationService";
import { eventService } from "./eventService";
import { EventKey } from "../models/Events";

const EXTENSION = "extNode"; //'extPython';
const EVENT_REQUEST = "runNode"; //'runPython';
const EVENT_RESPONSE = "responseNode"; //'responsePython';

const BACKEND_EVENT = "backendEvent";

type PendingHandlers = {
  resolve: (v: any) => void;
  reject: (err: any) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<number, PendingHandlers>();

let requestIdCounter = 1;

const handleResponse = (event: CustomEvent<any>) => {
  const response = event.detail; //JSON.parse(event.detail);
  const requestId = response?.requestId;

  console.log("Received response:", response);

  console.log("Handling response for request ID:", requestId);
  if (requestId === undefined) return;
  const promiseHandlers = pendingRequests.get(requestId);
  console.log("Promise handlers found:", promiseHandlers);
  if (!promiseHandlers) return;
  // clear timeout if present
  if (promiseHandlers.timeout) {
    clearTimeout(promiseHandlers.timeout);
  }
  if (!response.error) {
    promiseHandlers.resolve(response.data);
  } else {
    promiseHandlers.reject(new Error(response.error || "Unknown error"));
    console.log("Request resulted in error:", response.error);
  }
  console.log("Clearing pending request for ID:", requestId);
  pendingRequests.delete(requestId);
};

const handleBackendEvent = (event: CustomEvent) => {
  const detail = event.detail;

  console.log(
    `[NeutralinoTransport] Incoming event: ${detail.type}`,
    detail.payload,
  );

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
    console.warn("Unknown event format from backend:", detail);
  }
};

/**
 * Initialize Neutralino transport layer.
 */
export const initTransport = () => {
  console.log("Init Neutralino Transport Layer...");
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
    pendingRequests.set(requestId, { resolve, reject, timeout: undefined });

    // start timeout
    const timeoutId = setTimeout(() => {
      const handlers = pendingRequests.get(requestId);
      if (!handlers) return;
      handlers.reject(
        new Error(`Request to ${functionName} timed out after ${timeoutMs}ms`),
      );
      notify.error(
        "Something went wrong!",
        `Request to app backend timed out.`,
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
      if (handlers) {
        if (handlers.timeout) clearTimeout(handlers.timeout);
        handlers.reject(err);
      }
      pendingRequests.delete(requestId);
    });

  return promise;
};

export const broadcastRaw = (event: string) => {
  return extensions.broadcast(event);
};

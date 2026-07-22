import { checkConnectivity } from "./univarsal";
import * as http from "http";
import { DeviceOfflineError, UnauthorizedError } from "../types/Errors";

export class CommunicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationError";
  }
}

export interface INetioDevice {
  host: string;
  useHttps: boolean;
  sessionId: string | null;
  username: string;
  password: string;
  login(user: string, pass: string, logout?: boolean): Promise<string>;
}

interface ApiResponse {
  errors?: Array<{ code: number; message: string }>;
  status?: string;
  [key: string]: any;
}

function getProtocol(device: INetioDevice): string {
  return device.useHttps ? "https" : "http";
}

export async function sendRequest(
  device: INetioDevice,
  command: string,
  data: any = null,
  timeoutSec: number = 3,
  endpoint: string = "api",
  close: boolean = false,
): Promise<any> {
  const protocol = getProtocol(device);
  const url = `${protocol}://${device.host}/${endpoint}`;

  let jsonPayload: any = {};
  if (endpoint === "api") {
    jsonPayload = {
      sessionId: device.sessionId,
      action: command,
    };
  }

  if (data !== null) {
    jsonPayload["data"] = data;
  }

  const performRequest = async (shouldRetry: boolean): Promise<any> => {
    try {
      // console.debug(`Sending request to ${url} with payload`, jsonPayload);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedError(`HTTP Error: ${response.status}`);
        }
        throw new CommunicationError(`HTTP Error: ${response.status}`);
      }

      const responseJson = (await response.json()) as ApiResponse;

      if (responseJson.errors && responseJson.errors.length > 0) {
        const error = responseJson.errors[0];

        // Code 1000 = Session expired
        if (error.code === 1000 && shouldRetry) {
          console.info("Session expired, logging in again");

          const newSessionId = await device.login(
            device.username,
            device.password,
          );

          if (endpoint === "api") {
            jsonPayload.sessionId = newSessionId;
          }

          return await performRequest(false);
        } else if (error.message === "Already logged in") {
          console.debug("Already logged in, continuing with existing session");
          return responseJson;
        } else if (error.code === 1004) {
          throw new UnauthorizedError(
            error.message || "Invalid username or password",
          );
        } else if (error.code === 1022) {
          throw new UnauthorizedError(
            error.message || "Too many failed login attempts.",
          );
        } else {
          throw new CommunicationError(
            "Error " + error.code + " in response: " + error.message,
          );
        }
      }

      return responseJson;
    } catch (error: any) {
      if (
        error instanceof CommunicationError ||
        error instanceof UnauthorizedError
      )
        throw error;
      console.error(`Cannot connect to device ${device.host}`);
      throw new DeviceOfflineError(
        "Cannot connect to device: " + error.message,
      );
    }
  };

  const result = await performRequest(true);

  if (close) {
    console.debug(`Closing logical session with ${url}`);
  }

  return result;
}

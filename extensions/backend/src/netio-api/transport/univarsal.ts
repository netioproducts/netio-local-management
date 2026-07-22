import { BadResponseError } from "../types/Errors";
import { INetioDevice } from "./HttpClient";
import * as http from "http";

export async function checkConnectivity(
  device: { host: string },
  timeoutSec: number = 2,
): Promise<number> {
  const url = `http://${device.host}/`;

  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const end = performance.now();
    const durationSec = (end - start) / 1000;

    return durationSec;
  } catch (error) {
    console.warn(`Couldn't connect to device ${device.host}.`);

    return -1;
  }
}

interface BasicInfo {
  data: {
    version: string;
    revision: string;
    buildDate: string;
    hostname: string;
    deviceSN: string;
    platform: string;
    variant: string;
  };
}

export async function getBasicDeviceInfo(
  device: {
    host: string;
  },
  timeoutSec: number = 2,
): Promise<BasicInfo> {
  const url = `http://${device.host}/api`;
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        action: "getVersion",
        sessionId: "",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return Promise.reject(
        new BadResponseError(
          `Failed to get device info: ${response.statusText}`,
        ),
      );
    }
    const res = await response.json();
    if (!res || !res.data || !res.data.deviceSN) {
      return Promise.reject(new BadResponseError("Invalid response format"));
    }
    return res as BasicInfo;
  } catch (err) {
    throw err;
  } finally {
    clearTimeout(timeoutId);

    const end = performance.now();
    const durationSec = (end - start) / 1000;
    console.debug(`[${device.host}] responded in ${durationSec.toFixed(2)}s.`);
  }
}

export async function sendFile(
  device: {
    uploadUrl: string;
    sessionId?: string | null;
  },
  fileBuffer: Buffer,
  filename: string,
): Promise<void> {
  const boundary = `----NetioFormBoundary${Math.random().toString(16).slice(2)}`;
  const bodyStart = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

  await fetch(device.uploadUrl, {
    method: "POST",
    headers: {
      Cookie: `sessionId=${device.sessionId}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": payload.length.toString(),
    },
    body: payload,
  });
}

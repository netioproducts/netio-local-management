/**
 * TransportService tests – error responses sent to the frontend.
 * The constructor reads Neutralino settings from stdin, so the service is created
 * from its prototype with a stubbed extension.
 */
import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logManager } from "../src/logging/Logger";
import { TransportService } from "../src/transport/TransportService";
import { DeviceBusyError } from "../src/netio-api/types/Errors";

function createTransport(
  routes: Record<string, any>,
  readOnlyRoutes: string[] = [],
) {
  const sent: { event: string; data: any }[] = [];
  const transport = Object.create(TransportService.prototype) as any;
  transport.ext = {
    sendMessage: (event: string, data: any) => sent.push({ event, data }),
  };
  transport.registerRoutes(routes, readOnlyRoutes);
  transport.frontendConnected = true;
  transport.messageQueue = [];
  return { transport, sent };
}

const call = (transport: any, fn: string) =>
  transport.handleIncomingMessage({
    event: "runNode",
    data: { function: fn, requestId: 7, parameter: {} },
  });

describe("TransportService – error responses", () => {
  it("sends message, code and details of a thrown error", async () => {
    const { transport, sent } = createTransport({
      busy: () => {
        throw new DeviceBusyError("Device Lab is busy: firmware update.", {
          macAddress: "aabbccddeeff",
          operation: "firmware update",
        });
      },
    });

    await call(transport, "busy");

    expect(sent).toEqual([
      {
        event: "responseNode",
        data: {
          success: false,
          error: "Device Lab is busy: firmware update.",
          code: "DeviceBusyError",
          details: { macAddress: "aabbccddeeff", operation: "firmware update" },
          requestId: 7,
        },
      },
    ]);
  });

  it("uses a generic code for non-Error throws", async () => {
    const { transport, sent } = createTransport({
      weird: () => {
        throw "plain string";
      },
    });

    await call(transport, "weird");
    expect(sent[0].data.error).toBe("plain string");
    expect(sent[0].data.code).toBe("Error");
  });

  it("reports unknown functions", async () => {
    const { transport, sent } = createTransport({});
    await call(transport, "missing");
    expect(sent[0].data.code).toBe("UnknownFunction");
  });
});

describe("TransportService – request logging", () => {
  let tempDir: string;
  let logPath: string;

  const useLogFile = (level: "info" | "debug") => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "transport-log-test-"));
    logPath = path.join(tempDir, "backend.log");
    logManager.configure({ filePath: logPath, level });
  };

  afterEach(() => {
    logManager.configure({ filePath: "", level: "info" });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("logs changing requests on info and read-only ones on debug", async () => {
    useLogFile("info");
    const { transport } = createTransport(
      {
        controlSocket: (ctx: any) => ctx.sendMessage({}),
        getDevices: (ctx: any) => ctx.sendMessage([]),
      },
      ["getDevices"],
    );

    await call(transport, "controlSocket");
    await call(transport, "getDevices");

    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).toMatch(/INFO  \[Transport\] Request controlSocket #7 succeeded \(\d+ ms\)/);
    expect(content).not.toContain("getDevices");
  });

  it("logs failures with the error, parameters only on debug and masked", async () => {
    useLogFile("debug");
    const { transport } = createTransport({
      saveUser: () => {
        throw new Error("disk full");
      },
    });

    await transport.handleIncomingMessage({
      event: "runNode",
      data: {
        function: "saveUser",
        requestId: 8,
        parameter: { name: "A", username: "admin", password: "secret" },
      },
    });

    const content = fs.readFileSync(logPath, "utf-8");
    expect(content).toContain("WARN  [Transport] Request saveUser #8 failed");
    expect(content).toContain("Error: disk full");
    expect(content).toContain('"password":"***"');
    expect(content).not.toContain("secret");
  });
});

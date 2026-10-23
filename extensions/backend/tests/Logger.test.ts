import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  LogManager,
  createLogger,
  maskSensitive,
  resolveLogLevel,
} from "../src/logging/Logger";

describe("Logger", () => {
  let tempDir: string;
  let logPath: string;
  let manager: LogManager;

  const readLog = () => fs.readFileSync(logPath, "utf-8");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
    logPath = path.join(tempDir, "backend.log");
    manager = new LogManager();
    manager.configure({ filePath: logPath, level: "info" });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes formatted lines with level, module and context", () => {
    const log = createLogger("DeviceService", manager);
    log.info("Login successful", { mac: "aabbccddeeff" });

    expect(readLog()).toMatch(
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z INFO  \[DeviceService\] Login successful {"mac":"aabbccddeeff"}\n$/,
    );
  });

  it("filters records below the configured level", () => {
    const log = createLogger("Test", manager);
    log.debug("hidden");
    log.info("shown");
    log.error("also shown");

    const content = readLog();
    expect(content).not.toContain("hidden");
    expect(content).toContain("INFO  [Test] shown");
    expect(content).toContain("ERROR [Test] also shown");
    expect(log.isDebugEnabled()).toBe(false);

    manager.configure({ level: "debug" });
    log.debug("now visible");
    expect(readLog()).toContain("DEBUG [Test] now visible");
  });

  it("writes error stack traces", () => {
    createLogger("Test", manager).error("Failed", new Error("boom"));
    const content = readLog();
    expect(content).toContain("ERROR [Test] Failed Error: boom");
    expect(content).toContain("Logger.test.ts");
  });

  it("masks sensitive values in context, case-insensitive and nested", () => {
    createLogger("Test", manager).info("Request", {
      function: "saveUser",
      parameter: { name: "A", username: "admin", password: "secret" },
      accessToken: "tok",
      data: [{ sessionId: "abc" }],
    });

    const content = readLog();
    expect(content).not.toContain("secret");
    expect(content).not.toContain("tok\"");
    expect(content).not.toContain("abc");
    expect(content).toContain('"password":"***"');
    expect(content).toContain('"username":"admin"');
  });

  it("masks sensitive key=value pairs in messages and error texts", () => {
    const log = createLogger("Test", manager);
    log.error(
      "Connection to ws://127.0.0.1:1/?extensionId=extNode&connectToken=abc123 failed",
    );
    log.error("Request failed", new Error("Cookie sessionId=xyz789; rejected"));

    const content = readLog();
    expect(content).toContain("extensionId=extNode&connectToken=***");
    expect(content).toContain("sessionId=***");
    expect(content).not.toContain("abc123");
    expect(content).not.toContain("xyz789");
  });

  it("masks without modifying the original object and handles cycles", () => {
    const original: any = { password: "secret" };
    original.self = original;
    const masked: any = maskSensitive(original);

    expect(original.password).toBe("secret");
    expect(masked.password).toBe("***");
    expect(masked.self).toBe("[Circular]");
  });

  it("trims the file to its newer half when exceeding the limit", () => {
    manager.configure({ maxFileSize: 1000 });
    const log = createLogger("Test", manager);
    for (let i = 0; i < 50; i++) {
      log.info(`message number ${i}`);
    }

    const content = readLog();
    expect(Buffer.byteLength(content)).toBeLessThanOrEqual(1000);
    expect(content.startsWith("--- log trimmed ---\n")).toBe(true);
    expect(content).toContain("message number 49");
    expect(content).not.toContain("message number 0\n");
    // Every kept line is complete
    content
      .split("\n")
      .slice(1, -1)
      .forEach((line) => expect(line).toMatch(/^\d{4}-.* INFO  \[Test\] message number \d+$/));
  });

  it("continues the size of an existing file", () => {
    fs.writeFileSync(logPath, "x".repeat(950) + "\n");
    const other = new LogManager();
    other.configure({ filePath: logPath, maxFileSize: 1000 });
    createLogger("Test", other).info("message which exceeds the limit");

    expect(readLog().startsWith("--- log trimmed ---\n")).toBe(true);
  });
});

describe("resolveLogLevel", () => {
  it("prefers NETIO_DEBUG env variable", () => {
    expect(resolveLogLevel({ NETIO_DEBUG: "1" }, "warn")).toEqual({
      level: "debug",
      source: "env",
    });
    expect(resolveLogLevel({ NETIO_DEBUG: "true" }, undefined).level).toBe(
      "debug",
    );
  });

  it("uses the config level, then defaults to info", () => {
    expect(resolveLogLevel({ NETIO_DEBUG: "0" }, "warn")).toEqual({
      level: "warn",
      source: "config",
    });
    expect(resolveLogLevel({}, undefined)).toEqual({
      level: "info",
      source: "default",
    });
  });
});

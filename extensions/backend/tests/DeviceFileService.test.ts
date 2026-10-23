/**
 * DeviceFileService tests – exclusive access to the device during file operations
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DeviceFileService } from "../src/services/DeviceFileService";
import { DeviceManager } from "../src/services/DeviceManager";
import { ConfigService } from "../src/config/ConfigService";
import { RuntimeDevice } from "../src/netio-api/services/RuntimeDevice";
import {
  DeviceBusyError,
  DeviceOfflineError,
  UnauthorizedError,
} from "../src/netio-api/types/Errors";
import { makeFakeClient, FakeClient } from "./helpers/fakeDeviceClient";

const MAC = "aabbccddeeff";

describe("DeviceFileService – device lock", () => {
  let tempDir: string;
  let filePath: string;
  let service: DeviceFileService;
  let manager: DeviceManager;
  let broadcasts: { type: string; payload: any }[];

  const addDevice = (client: FakeClient) => {
    const dev = new RuntimeDevice({ macAddress: MAC, ipAddress: "192.168.1.10" });
    dev.setupCredentials("admin", "admin", () => client as any);
    (manager as any).devices.set(MAC, dev);
    return dev;
  };

  /** Starts an exclusive operation which runs until release() is called */
  const holdLock = (dev: RuntimeDevice) => {
    let release!: () => void;
    const done = dev.runExclusive(
      "test operation",
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    return { release: () => release(), done };
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dfs-test-"));
    filePath = path.join(tempDir, "upload.json");
    fs.writeFileSync(filePath, "{}", "utf-8");

    const orig = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = tempDir;
    const cfg = new ConfigService();
    if (orig === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = orig;
    cfg.init();

    manager = new DeviceManager((() => {}) as any);
    broadcasts = [];
    const transport = {
      broadcast: (type: string, payload: any) =>
        broadcasts.push({ type, payload }),
    };
    service = new DeviceFileService(manager, cfg, transport as any);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("firmware upload to an offline device fails and leaves it unlocked", async () => {
    const client = makeFakeClient({
      initialize: async () => {
        throw new DeviceOfflineError();
      },
    });
    const dev = addDevice(client);

    await expect(service.uploadFirmware(MAC, filePath)).rejects.toThrow(
      `Device ${MAC} is offline.`,
    );
    expect(dev.isBusy).toBe(false);
    expect(client.calls.updateFirmware).toBe(0);
    expect(broadcasts[broadcasts.length - 1]?.payload.status).toBe("Failed");
  });

  it("firmware upload with wrong credentials reports it", async () => {
    const client = makeFakeClient({
      initialize: async () => {
        throw new UnauthorizedError();
      },
    });
    const dev = addDevice(client);

    await expect(service.uploadFirmware(MAC, filePath)).rejects.toThrow(
      `Wrong credentials for device ${MAC}.`,
    );
    expect(dev.isBusy).toBe(false);
  });

  it("config import to an offline device fails and leaves it unlocked", async () => {
    const dev = addDevice(
      makeFakeClient({
        initialize: async () => {
          throw new DeviceOfflineError();
        },
      }),
    );

    await expect(service.importConfig(MAC, filePath)).rejects.toThrow(
      "offline",
    );
    expect(dev.isBusy).toBe(false);
  });

  it("rejects file operations while the device is busy", async () => {
    const client = makeFakeClient();
    const dev = addDevice(client);
    const lock = holdLock(dev);

    await expect(service.uploadFirmware(MAC, filePath)).rejects.toThrow(
      DeviceBusyError,
    );
    await expect(service.importConfig(MAC, filePath)).rejects.toThrow(
      DeviceBusyError,
    );
    await expect(service.exportConfig(MAC)).rejects.toThrow(DeviceBusyError);
    expect(client.calls.updateFirmware).toBe(0);

    lock.release();
    await lock.done;
  });
});

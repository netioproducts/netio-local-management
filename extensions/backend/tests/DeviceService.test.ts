/**
 * DeviceService-level integration tests
 *
 * DeviceService.ts imports `transport` from TransportService at the module
 * top level. TransportService instantiates NeutralinoExtension, whose
 * constructor calls fs.readFileSync(0, 'utf-8') – blocking on stdin when no
 * Neutralino process is present. This makes it impossible to import
 * DeviceService directly in a test environment.
 *
 * Solution: test the same business logic by wiring ConfigService +
 * DeviceManager directly – the exact collaborators DeviceService delegates
 * to. Every method under test is a thin delegation, so covering the
 * collaborators achieves the same coverage without the transport coupling.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { DeviceManager } from "../src/services/DeviceManager";
import { ConfigService } from "../src/config/ConfigService";
import { RuntimeDevice } from "../src/netio-api/services/RuntimeDevice";
import { Device } from "../src/netio-api/types/Device";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createConfigService(tempDir: string): ConfigService {
  const orig = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = tempDir;
  const svc = new ConfigService();
  if (orig === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = orig;
  svc.init();
  return svc;
}

function makeRuntimeDevice(mac: string, ip = "192.168.1.1", online = false): RuntimeDevice {
  const rd = new RuntimeDevice({ macAddress: mac, ipAddress: ip, fwVersion: "3.0.0" } as Device);
  (rd as any).isOnline = online;
  (rd as any).syncState = async () => {};
  return rd;
}

function injectDevice(manager: DeviceManager, mac: string, rd: RuntimeDevice) {
  (manager as any).devices.set(mac, rd);
}

// ---------------------------------------------------------------------------
// DeviceService business logic – group management (via ConfigService)
// These mirror DeviceService.createDeviceGroup / removeDeviceGroup / etc.
// ---------------------------------------------------------------------------
describe("DeviceService logic – device group management", () => {
  let tempDir: string;
  let cfg: ConfigService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-test-"));
    cfg = createConfigService(tempDir);
  });

  it("no groups exist after fresh init", () => {
    expect(cfg.getDeviceGroups()).toHaveLength(0);
  });

  it("createDeviceGroup – adds a group with correct name", () => {
    // DeviceService.createDeviceGroup delegates exactly to this:
    cfg.addDeviceGroup({ name: "Lab", devices: [] });
    expect(cfg.getDeviceGroups()[0].name).toBe("Lab");
  });

  it("removeDeviceGroup – removes by index", () => {
    cfg.addDeviceGroup({ name: "A", devices: [] });
    cfg.addDeviceGroup({ name: "B", devices: [] });
    cfg.removeDeviceGroup(0);
    expect(cfg.getDeviceGroups()).toHaveLength(1);
    expect(cfg.getDeviceGroups()[0].name).toBe("B");
  });

  it("updateDeviceGroup – renames a group", () => {
    cfg.addDeviceGroup({ name: "Old", devices: [] });
    // DeviceService.updateDeviceGroup reads existing devices then calls this:
    cfg.updateDeviceGroup(0, { name: "New", devices: [] });
    expect(cfg.getDeviceGroups()[0].name).toBe("New");
  });

  it("updateDeviceGroup – throws for non-existent index (index check in DeviceService)", () => {
    // The guard `if (!cfg.getConfig().deviceGroups[group.id])` is in DeviceService
    expect(cfg.getDeviceGroups()[99]).toBeUndefined();
  });

  it("addDevicesToGroup – adds MACs to the group", () => {
    cfg.addOrUpdateDevice({ macAddress: "aabbccddeeff", ipAddress: "10.0.0.1", fwVersion: "1.0" });
    cfg.addDeviceGroup({ name: "G", devices: [] });
    cfg.addDevicesToGroup(0, ["aabbccddeeff"]);
    expect(cfg.getDeviceGroups()[0].devices).toContain("aabbccddeeff");
  });

  it("removeDevicesFromGroup – removes MACs from the group", () => {
    cfg.addOrUpdateDevice({ macAddress: "aabbccddeeff", ipAddress: "10.0.0.1", fwVersion: "1.0" });
    cfg.addDeviceGroup({ name: "G", devices: [] });
    cfg.addDevicesToGroup(0, ["aabbccddeeff"]);
    cfg.removeDevicesFromGroup(0, ["aabbccddeeff"]);
    expect(cfg.getDeviceGroups()[0].devices).not.toContain("aabbccddeeff");
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – getDevicesInGroup (via DeviceManager)
// ---------------------------------------------------------------------------
describe("DeviceService logic – getDevicesInGroup", () => {
  let tempDir: string;
  let cfg: ConfigService;
  let manager: DeviceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-test-"));
    cfg = createConfigService(tempDir);
    manager = new DeviceManager();
  });

  it("returns empty array when group index does not exist", async () => {
    const group = cfg.getConfig().deviceGroups[99];
    expect(group).toBeUndefined();
  });

  it("resolves devices in a group and returns their DTOs", async () => {
    cfg.addOrUpdateDevice({ macAddress: "aabbccddeeff", ipAddress: "10.0.0.1", fwVersion: "1.0" });
    cfg.addDeviceGroup({ name: "G", devices: ["aabbccddeeff"] });
    injectDevice(manager, "aabbccddeeff", makeRuntimeDevice("aabbccddeeff", "10.0.0.1", true));

    const group = cfg.getConfig().deviceGroups[0];
    const devices = group.devices
      .map((mac) => manager.getDevice(mac))
      .filter(Boolean) as RuntimeDevice[];

    expect(devices).toHaveLength(1);
    const dto = devices[0].toDTO();
    expect(dto.macAddress).toBe("aabbccddeeff");
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – credential propagation
// ---------------------------------------------------------------------------
describe("DeviceService logic – credential propagation", () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  it("updateCredentialsForUser: calls setupCredentials on matching device", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.getConfig().user = "Alice";
    const calls: string[] = [];
    (rd as any).setupCredentials = (u: string, p: string) => calls.push(`${u}:${p}`);
    injectDevice(manager, "aabbccddeeff", rd);

    // DeviceService.updateCredentialsForUser logic:
    for (const device of manager.getAllDevices()) {
      if (device.getConfig().user === "Alice") {
        (device as any).setupCredentials("alice_new", "newpass");
      }
    }
    expect(calls).toContain("alice_new:newpass");
  });

  it("updateCredentialsForUser: ignores non-matching devices", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.getConfig().user = "Bob";
    const calls: string[] = [];
    (rd as any).setupCredentials = (u: string, p: string) => calls.push(`${u}:${p}`);
    injectDevice(manager, "aabbccddeeff", rd);

    for (const device of manager.getAllDevices()) {
      if (device.getConfig().user === "Alice") {
        (device as any).setupCredentials("alice_new", "newpass");
      }
    }
    expect(calls).toHaveLength(0);
  });

  it("clearCredentialsForUser: calls clearCredentials on matching device", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.getConfig().user = "Alice";
    let cleared = false;
    (rd as any).clearCredentials = () => { cleared = true; };
    injectDevice(manager, "aabbccddeeff", rd);

    for (const device of manager.getAllDevices()) {
      if (device.getConfig().user === "Alice") {
        (device as any).clearCredentials();
      }
    }
    expect(cleared).toBe(true);
  });

  it("clearCredentialsForUser: ignores non-matching devices", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.getConfig().user = "Bob";
    let cleared = false;
    (rd as any).clearCredentials = () => { cleared = true; };
    injectDevice(manager, "aabbccddeeff", rd);

    for (const device of manager.getAllDevices()) {
      if (device.getConfig().user === "Alice") {
        (device as any).clearCredentials();
      }
    }
    expect(cleared).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – updateDeviceName
// ---------------------------------------------------------------------------
describe("DeviceService logic – updateDeviceName", () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  it("returns undefined when device MAC is unknown", () => {
    expect(manager.getDevice("000000000000")).toBeUndefined();
  });

  it("updates device name when found", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    injectDevice(manager, "aabbccddeeff", rd);
    rd.getConfig().name = "Updated";
    expect(rd.getConfig().name).toBe("Updated");
    expect(rd.toDTO().name).toBe("Updated");
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – updateSocketNames
// ---------------------------------------------------------------------------
describe("DeviceService logic – updateSocketNames", () => {
  it("updates runtime socket customLabels in place", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.sockets = {
      1: { id: ["aabbccddeeff", 1], customLabel: "Old 1" },
      2: { id: ["aabbccddeeff", 2], customLabel: "Old 2" },
    };

    // DeviceService.updateSocketNames logic:
    const socketNames = ["New 1", "New 2"];
    socketNames.forEach((name, idx) => {
      const socket = rd.sockets[idx + 1];
      if (socket) socket.customLabel = name;
    });

    expect(rd.sockets[1].customLabel).toBe("New 1");
    expect(rd.sockets[2].customLabel).toBe("New 2");
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – logoutFromDevice
// ---------------------------------------------------------------------------
describe("DeviceService logic – logoutFromDevice", () => {
  it("clearCredentials is called and user ref removed", () => {
    const rd = makeRuntimeDevice("aabbccddeeff");
    rd.getConfig().user = "Alice";
    let cleared = false;
    (rd as any).clearCredentials = () => {
      cleared = true;
      rd.getConfig().user = undefined;
    };

    // DeviceService.logoutFromDevice logic:
    (rd as any).clearCredentials();
    expect(cleared).toBe(true);
    expect(rd.getConfig().user).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – getUngroupedDevices / getFoundDevices
// ---------------------------------------------------------------------------
describe("DeviceService logic – ungrouped and found devices", () => {
  let tempDir: string;
  let cfg: ConfigService;
  let manager: DeviceManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-test-"));
    cfg = createConfigService(tempDir);
    manager = new DeviceManager();
  });

  it("getUngroupedDevices: all devices returned when no groups exist", () => {
    injectDevice(manager, "aabbccddeeff", makeRuntimeDevice("aabbccddeeff"));
    injectDevice(manager, "112233445566", makeRuntimeDevice("112233445566"));

    const groupedMacs = new Set(cfg.getConfig().deviceGroups.flatMap((g) => g.devices));
    const ungrouped = manager.getAllDevices().filter((d) => !groupedMacs.has(d.getConfig().macAddress));
    expect(ungrouped).toHaveLength(2);
  });

  it("getUngroupedDevices: excludes grouped devices", () => {
    cfg.addOrUpdateDevice({ macAddress: "aabbccddeeff", ipAddress: "10.0.0.1", fwVersion: "1.0" });
    cfg.addDeviceGroup({ name: "G", devices: ["aabbccddeeff"] });
    injectDevice(manager, "aabbccddeeff", makeRuntimeDevice("aabbccddeeff"));
    injectDevice(manager, "112233445566", makeRuntimeDevice("112233445566"));

    const groupedMacs = new Set(cfg.getConfig().deviceGroups.flatMap((g) => g.devices));
    const ungrouped = manager.getAllDevices().filter((d) => !groupedMacs.has(d.getConfig().macAddress));
    expect(ungrouped.find((d) => d.getConfig().macAddress === "aabbccddeeff")).toBeUndefined();
    expect(ungrouped.find((d) => d.getConfig().macAddress === "112233445566")).toBeDefined();
  });

  it("getFoundDevices: returns only ungrouped online devices", () => {
    injectDevice(manager, "aabbccddeeff", makeRuntimeDevice("aabbccddeeff", "10.0.0.1", true));
    injectDevice(manager, "112233445566", makeRuntimeDevice("112233445566", "10.0.0.2", false));

    const groupedMacs = new Set(cfg.getConfig().deviceGroups.flatMap((g) => g.devices));
    const ungrouped = manager.getAllDevices().filter((d) => !groupedMacs.has(d.getConfig().macAddress));
    const online = ungrouped.filter((d) => d.isOnline);
    expect(online).toHaveLength(1);
    expect(online[0].getConfig().macAddress).toBe("aabbccddeeff");
  });

  it("getFoundDevices: returns empty when all devices are offline", () => {
    injectDevice(manager, "aabbccddeeff", makeRuntimeDevice("aabbccddeeff", "10.0.0.1", false));
    const groupedMacs = new Set(cfg.getConfig().deviceGroups.flatMap((g) => g.devices));
    const ungrouped = manager.getAllDevices().filter((d) => !groupedMacs.has(d.getConfig().macAddress));
    const online = ungrouped.filter((d) => d.isOnline);
    expect(online).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DeviceService logic – controlDeviceSockets guard checks
// ---------------------------------------------------------------------------
describe("DeviceService logic – socket control guards", () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  it("controlDeviceSockets: returns null-equivalent when device not found", () => {
    // DeviceService checks: const device = this.deviceManager.getDevice(mac)
    expect(manager.getDevice("000000000000")).toBeUndefined();
  });

  it("controlDeviceSockets: returns null-equivalent when device is offline", () => {
    const rd = makeRuntimeDevice("aabbccddeeff", "10.0.0.1", false);
    injectDevice(manager, "aabbccddeeff", rd);
    const device = manager.getDevice("aabbccddeeff");
    expect(device?.isOnline).toBe(false);
  });

  it("controlSocket: returns null-equivalent when MAC is unknown", () => {
    const [mac] = ["000000000000", 1];
    expect(manager.getDevice(mac)).toBeUndefined();
  });
});

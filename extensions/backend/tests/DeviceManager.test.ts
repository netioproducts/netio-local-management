import { describe, it, expect, beforeEach } from "bun:test";
import { DeviceManager } from "../src/services/DeviceManager";
import { DeviceInfo } from "../src/netio-api/discover/NetioParser";
import { Device } from "../src/netio-api/types/Device";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeDevice = (mac: string, ip: string = "192.168.1.1"): Device => ({
  macAddress: mac,
  ipAddress: ip,
  fwVersion: "3.0.0",
  name: "Test Device",
});

const makeDiscoveredDevice = (
  mac: string,
  ip: string,
  fwversion: string = "3.0.0",
): DeviceInfo => ({
  mac,
  ip,
  fwversion,
  hostname: "netio-device",
  model: "NETIO4C",
});

// ---------------------------------------------------------------------------
// loadFromConfig
// ---------------------------------------------------------------------------
describe("DeviceManager – loadFromConfig", () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  it("loads a single device and retrieves it by MAC", async () => {
    await manager.loadFromConfig([makeDevice("aabbccddeeff", "10.0.0.1")]);
    const rt = manager.getDevice("aabbccddeeff");
    expect(rt).toBeDefined();
    expect(rt!.getConfig().ipAddress).toBe("10.0.0.1");
  });

  it("normalises MAC with colons when loading", async () => {
    await manager.loadFromConfig([makeDevice("AA:BB:CC:DD:EE:FF", "10.0.0.1")]);
    const rt = manager.getDevice("aabbccddeeff");
    expect(rt).toBeDefined();
  });

  it("normalises MAC with hyphens when loading", async () => {
    await manager.loadFromConfig([makeDevice("AA-BB-CC-DD-EE-FF", "10.0.0.2")]);
    const rt = manager.getDevice("aabbccddeeff");
    expect(rt).toBeDefined();
  });

  it("loads multiple devices", async () => {
    await manager.loadFromConfig([
      makeDevice("aabbccddeeff", "10.0.0.1"),
      makeDevice("112233445566", "10.0.0.2"),
    ]);
    expect(manager.getAllDevices()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// loadFromDiscover
// ---------------------------------------------------------------------------
describe("DeviceManager – loadFromDiscover", () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  it("adds discovered devices not already in manager", async () => {
    await manager.loadFromDiscover([
      makeDiscoveredDevice("AA:BB:CC:DD:EE:FF", "192.168.1.10"),
    ]);
    expect(manager.getDevice("aabbccddeeff")).toBeDefined();
  });

  it("updates IP and firmware version for an existing device", async () => {
    await manager.loadFromConfig([makeDevice("aabbccddeeff", "10.0.0.1")]);
    await manager.loadFromDiscover([
      makeDiscoveredDevice("AA:BB:CC:DD:EE:FF", "192.168.1.99", "4.0.0"),
    ]);
    const rt = manager.getDevice("aabbccddeeff");
    expect(rt!.getConfig().ipAddress).toBe("192.168.1.99");
    expect(rt!.getConfig().fwVersion).toBe("4.0.0");
  });

  it("skips entries with missing mac/ip/fwversion", async () => {
    await manager.loadFromDiscover([
      { mac: undefined, ip: "192.168.1.10", fwversion: "1.0" },
      { mac: "AA:BB:CC:DD:EE:FF", ip: undefined, fwversion: "1.0" },
    ]);
    expect(manager.getAllDevices()).toHaveLength(0);
  });

  it("preserves existing config-loaded devices after discover", async () => {
    await manager.loadFromConfig([makeDevice("aabbccddeeff", "10.0.0.1")]);
    await manager.loadFromDiscover([
      makeDiscoveredDevice("11:22:33:44:55:66", "192.168.1.20"),
    ]);
    expect(manager.getAllDevices()).toHaveLength(2);
  });

  it("calls onConfigChange when updating an existing device IP", async () => {
    const calls: string[] = [];
    await manager.loadFromConfig(
      [makeDevice("aabbccddeeff", "10.0.0.1")],
      (cfg) => cfg[0].on("config_change", (nC) => calls.push(nC.ipAddress)),
    );
    await manager.loadFromDiscover([
      makeDiscoveredDevice("AA:BB:CC:DD:EE:FF", "192.168.1.99"),
    ]);
    expect(calls).toContain("192.168.1.99");
  });

  it("keeps busy_change listeners when updating an existing device IP", async () => {
    const listener = () => {};
    await manager.loadFromConfig(
      [makeDevice("aabbccddeeff", "10.0.0.1")],
      (cfg) => cfg[0].on("busy_change", listener),
    );
    await manager.loadFromDiscover([
      makeDiscoveredDevice("AA:BB:CC:DD:EE:FF", "192.168.1.99"),
    ]);
    const updated = manager.getDevice("aabbccddeeff")!;
    expect(updated.getConfig().ipAddress).toBe("192.168.1.99");
    expect(updated.listeners("busy_change")).toEqual([listener]);
  });
});

// ---------------------------------------------------------------------------
// getDevice / getAllDevices / getOnlineDevices
// ---------------------------------------------------------------------------
describe("DeviceManager – querying", () => {
  let manager: DeviceManager;

  beforeEach(async () => {
    manager = new DeviceManager();
    await manager.loadFromConfig([
      makeDevice("aabbccddeeff", "10.0.0.1"),
      makeDevice("112233445566", "10.0.0.2"),
    ]);
  });

  it("returns undefined for an unknown MAC", () => {
    expect(manager.getDevice("000000000000")).toBeUndefined();
  });

  it("getDevice is case-insensitive and strips delimiters", () => {
    const rt = manager.getDevice("AA:BB:CC:DD:EE:FF");
    expect(rt).toBeDefined();
  });

  it("getAllDevices returns all loaded devices", () => {
    expect(manager.getAllDevices()).toHaveLength(2);
  });

  it("getOnlineDevices returns only devices with isOnline=true", async () => {
    const rt = manager.getDevice("aabbccddeeff")!;
    (rt as any).isOnline = true;
    expect(manager.getOnlineDevices()).toHaveLength(1);
  });

  it("getOnlineDevices returns empty when no device is online", () => {
    expect(manager.getOnlineDevices()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Visible devices tracking
// ---------------------------------------------------------------------------
describe("DeviceManager – visible devices", () => {
  let manager: DeviceManager;

  beforeEach(async () => {
    manager = new DeviceManager();
    await manager.loadFromConfig([
      makeDevice("aabbccddeeff", "10.0.0.1"),
      makeDevice("112233445566", "10.0.0.2"),
      makeDevice("ffeeddccbbaa", "10.0.0.3"),
    ]);
  });

  it("starts with no visible devices", () => {
    expect(manager.getVisibleDevices()).toHaveLength(0);
  });

  it("setVisibleDevices tracks the given MACs", () => {
    manager.setVisibleDevices(["aabbccddeeff", "112233445566"]);
    expect(manager.getVisibleDevices()).toHaveLength(2);
    expect(manager.isDeviceVisible("aabbccddeeff")).toBe(true);
    expect(manager.isDeviceVisible("112233445566")).toBe(true);
    expect(manager.isDeviceVisible("ffeeddccbbaa")).toBe(false);
  });

  it("setVisibleDevices replaces previous visible set", () => {
    manager.setVisibleDevices(["aabbccddeeff"]);
    expect(manager.isDeviceVisible("aabbccddeeff")).toBe(true);

    manager.setVisibleDevices(["112233445566"]);
    expect(manager.isDeviceVisible("aabbccddeeff")).toBe(false);
    expect(manager.isDeviceVisible("112233445566")).toBe(true);
  });

  it("normalises MACs with colons and hyphens", () => {
    manager.setVisibleDevices(["AA:BB:CC:DD:EE:FF"]);
    expect(manager.isDeviceVisible("aabbccddeeff")).toBe(true);

    manager.setVisibleDevices(["11-22-33-44-55-66"]);
    expect(manager.isDeviceVisible("112233445566")).toBe(true);
  });

  it("removeDevice also removes from visible set", () => {
    manager.setVisibleDevices(["aabbccddeeff", "112233445566"]);
    manager.removeDevice("aabbccddeeff");
    expect(manager.isDeviceVisible("aabbccddeeff")).toBe(false);
    expect(manager.getVisibleDevices()).toHaveLength(1);
  });

  it("getVisibleDevices ignores MACs not in the device map", () => {
    manager.setVisibleDevices(["aabbccddeeff", "000000000000"]);
    expect(manager.getVisibleDevices()).toHaveLength(1);
    expect(manager.getVisibleDevices()[0].getConfig().macAddress).toBe(
      "aabbccddeeff",
    );
  });

  it("setVisibleDevices with empty array clears all", () => {
    manager.setVisibleDevices(["aabbccddeeff"]);
    expect(manager.getVisibleDevices()).toHaveLength(1);

    manager.setVisibleDevices([]);
    expect(manager.getVisibleDevices()).toHaveLength(0);
  });
});

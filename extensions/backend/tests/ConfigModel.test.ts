import { describe, it, expect } from "bun:test";
import {
  AppConfigSchema,
  DEFAULT_CONFIG,
} from "../src/config/ConfigModel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const validDevice = {
  macAddress: "AA:BB:CC:DD:EE:FF",
  ipAddress: "192.168.1.100",
  fwVersion: "3.0.1",
};

const validUser = {
  name: "Alice",
  username: "alice",
  password: "secret",
};

const validConfig = {
  appSettings: { ipNet: "192.168.1.0/24" },
  devices: [validDevice],
  deviceGroups: [],
  users: [validUser],
};

// ---------------------------------------------------------------------------
// AppConfigSchema
// ---------------------------------------------------------------------------
describe("AppConfigSchema", () => {
  it("parses a valid configuration without errors", () => {
    const result = AppConfigSchema.parse(validConfig);
    expect(result).toBeDefined();
    expect(result.devices).toHaveLength(1);
    expect(result.users).toHaveLength(1);
  });

  it("normalises MAC address to lowercase without delimiters", () => {
    const result = AppConfigSchema.parse(validConfig);
    expect(result.devices[0].macAddress).toBe("aabbccddeeff");
  });

  it("accepts MAC address with hyphens", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, macAddress: "AA-BB-CC-DD-EE-FF" }],
    };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices[0].macAddress).toBe("aabbccddeeff");
  });

  it("accepts MAC address without delimiters", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, macAddress: "aabbccddeeff" }],
    };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices[0].macAddress).toBe("aabbccddeeff");
  });

  it("rejects an invalid MAC address", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, macAddress: "not-a-mac" }],
    };
    expect(() => AppConfigSchema.parse(cfg)).toThrow();
  });

  it("rejects an invalid IP address", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, ipAddress: "999.999.999.999" }],
    };
    expect(() => AppConfigSchema.parse(cfg)).toThrow();
  });

  it("rejects an empty fwVersion", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, fwVersion: "" }],
    };
    expect(() => AppConfigSchema.parse(cfg)).toThrow();
  });

  it("accepts device with optional fields omitted", () => {
    const cfg = { ...validConfig, devices: [validDevice] };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices[0].name).toBeUndefined();
    expect(result.devices[0].model).toBeUndefined();
  });

  it("accepts device with optional sockets array", () => {
    const cfg = {
      ...validConfig,
      devices: [{ ...validDevice, sockets: ["Socket 1", "Socket 2"] }],
    };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices[0].sockets).toEqual(["Socket 1", "Socket 2"]);
  });

  it("rejects user with empty username", () => {
    const cfg = {
      ...validConfig,
      users: [{ name: "Bob", username: "", password: "pass" }],
    };
    expect(() => AppConfigSchema.parse(cfg)).toThrow();
  });

  it("rejects user with empty password", () => {
    const cfg = {
      ...validConfig,
      users: [{ name: "Bob", username: "bob", password: "" }],
    };
    expect(() => AppConfigSchema.parse(cfg)).toThrow();
  });

  it("normalises MAC addresses inside deviceGroups", () => {
    const cfg = {
      ...validConfig,
      deviceGroups: [
        { name: "Group A", devices: ["AA:BB:CC:DD:EE:FF"] },
      ],
    };
    const result = AppConfigSchema.parse(cfg);
    expect(result.deviceGroups[0].devices[0]).toBe("aabbccddeeff");
  });

  it("accepts an empty devices array", () => {
    const cfg = { ...validConfig, devices: [] };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices).toHaveLength(0);
  });

  it("accepts multiple devices", () => {
    const cfg = {
      ...validConfig,
      devices: [
        validDevice,
        { macAddress: "11:22:33:44:55:66", ipAddress: "10.0.0.1", fwVersion: "2.0.0" },
      ],
    };
    const result = AppConfigSchema.parse(cfg);
    expect(result.devices).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG
// ---------------------------------------------------------------------------
describe("DEFAULT_CONFIG", () => {
  it("is a valid AppConfig", () => {
    expect(() => AppConfigSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });

  it("ships with exactly one default admin user", () => {
    expect(DEFAULT_CONFIG.users).toHaveLength(1);
    expect(DEFAULT_CONFIG.users[0].username).toBe("admin");
  });

  it("ships with no devices by default", () => {
    expect(DEFAULT_CONFIG.devices).toHaveLength(0);
  });

  it("ships with no device groups by default", () => {
    expect(DEFAULT_CONFIG.deviceGroups).toHaveLength(0);
  });
});

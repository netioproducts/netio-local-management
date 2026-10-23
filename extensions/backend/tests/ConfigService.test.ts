import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ConfigService } from "../src/config/ConfigService";
import { DEFAULT_CONFIG } from "../src/config/ConfigModel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a fresh ConfigService pointing at a temp directory */
function createService(
  tempDir: string,
  fileName: string = "config.json",
): ConfigService {
  // We override getStandardPath by injecting our own path via the fileName
  // that already resolves to tempDir. We achieve this by monkey-patching
  // process.env so the XDG_DATA_HOME resolves into our temp dir.
  const originalXDG = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = tempDir;
  const svc = new ConfigService(fileName);
  if (originalXDG === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = originalXDG;
  }
  return svc;
}

const SAMPLE_DEVICE = {
  macAddress: "aabbccddeeff",
  ipAddress: "192.168.1.10",
  fwVersion: "3.0.0",
};

const SAMPLE_USER = {
  name: "Alice",
  username: "alice",
  password: "secret",
};

// ---------------------------------------------------------------------------
// ConfigService – in-memory operations (no real file I/O)
// ---------------------------------------------------------------------------
describe("ConfigService – device CRUD", () => {
  let svc: ConfigService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-test-"));
    svc = createService(tempDir);
    svc.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("starts with no devices after fresh init", () => {
    expect(svc.getDevices()).toHaveLength(0);
  });

  it("adds a device and retrieves it", () => {
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    const devices = svc.getDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].macAddress).toBe("aabbccddeeff");
  });

  it("updates an existing device (same MAC)", () => {
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    svc.addOrUpdateDevice({
      ...SAMPLE_DEVICE,
      ipAddress: "10.0.0.1",
      fwVersion: "4.0.0",
    });
    const devices = svc.getDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].ipAddress).toBe("10.0.0.1");
    expect(devices[0].fwVersion).toBe("4.0.0");
  });

  it("removes a device by MAC", () => {
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    svc.removeDevice("aabbccddeeff");
    expect(svc.getDevices()).toHaveLength(0);
  });

  it("does nothing when removing a non-existent MAC", () => {
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    svc.removeDevice("000000000000");
    expect(svc.getDevices()).toHaveLength(1);
  });

  it("removing a device also removes it from every group", () => {
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    svc.addDeviceGroup({ name: "G1", devices: ["aabbccddeeff"] });
    svc.removeDevice("aabbccddeeff");
    expect(svc.getDeviceGroups()[0].devices).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ConfigService – user CRUD
// ---------------------------------------------------------------------------
describe("ConfigService – user CRUD", () => {
  let svc: ConfigService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-test-"));
    svc = createService(tempDir);
    svc.init();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("ships the default admin user after init", () => {
    const users = svc.getUsers();
    expect(users.some((u) => u.username === "admin")).toBe(true);
  });

  it("adds a new user", () => {
    svc.addOrUpdateUser(
      SAMPLE_USER.name,
      SAMPLE_USER.username,
      SAMPLE_USER.password,
    );
    const u = svc.getUser(SAMPLE_USER.name);
    expect(u).toBeDefined();
    expect(u!.username).toBe("alice");
  });

  it("updates an existing user (same name)", () => {
    svc.addOrUpdateUser("Alice", "alice", "old");
    svc.addOrUpdateUser("Alice", "alice2", "new");
    const u = svc.getUser("Alice");
    expect(u!.username).toBe("alice2");
    expect(u!.password).toBe("new");
  });

  it("stores user passwords encrypted on disk", () => {
    svc.addOrUpdateUser("Alice", "alice", "secret");

    const configPath = path.join(
      tempDir,
      "netio-local-management",
      "config.json",
    );
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const storedPassword = raw.users.find(
      (u: any) => u.name === "Alice",
    )?.password;

    expect(storedPassword).toBeDefined();
    expect(storedPassword).not.toBe("secret");
    expect(storedPassword.startsWith("enc.v1:")).toBe(true);
  });

  it("reloads encrypted password as plaintext via API", () => {
    svc.addOrUpdateUser("Alice", "alice", "secret");

    const svc2 = createService(tempDir);
    svc2.init();

    const reloaded = svc2.getUser("Alice");
    expect(reloaded).toBeDefined();
    expect(reloaded!.password).toBe("secret");
  });

  it("removes a user", () => {
    svc.addOrUpdateUser("Bob", "bob", "pass");
    svc.removeUser("Bob");
    expect(svc.getUser("Bob")).toBeUndefined();
  });

  it("removing a user clears the user reference on associated devices", () => {
    svc.addOrUpdateUser("Alice", "alice", "pass");
    svc.addOrUpdateDevice({ ...SAMPLE_DEVICE, user: "Alice" });
    svc.removeUser("Alice");
    expect(svc.getDevices()[0].user).toBeUndefined();
  });

  it("getUser returns undefined for unknown name", () => {
    expect(svc.getUser("nobody")).toBeUndefined();
  });

  it("getUser returns undefined when called with undefined", () => {
    expect(svc.getUser(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ConfigService – deviceGroup CRUD
// ---------------------------------------------------------------------------
describe("ConfigService – device group CRUD", () => {
  let svc: ConfigService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-test-"));
    svc = createService(tempDir);
    svc.init();
    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    svc.addOrUpdateDevice({
      macAddress: "112233445566",
      ipAddress: "10.0.0.2",
      fwVersion: "1.0.0",
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds a device group", () => {
    svc.addDeviceGroup({ name: "Lab", devices: [] });
    expect(svc.getDeviceGroups()).toHaveLength(1);
    expect(svc.getDeviceGroups()[0].name).toBe("Lab");
  });

  it("updates a device group name", () => {
    svc.addDeviceGroup({ name: "Old", devices: [] });
    svc.updateDeviceGroup(0, { name: "New", devices: [] });
    expect(svc.getDeviceGroups()[0].name).toBe("New");
  });

  it("removes a device group by index", () => {
    svc.addDeviceGroup({ name: "A", devices: [] });
    svc.addDeviceGroup({ name: "B", devices: [] });
    svc.removeDeviceGroup(0);
    expect(svc.getDeviceGroups()).toHaveLength(1);
    expect(svc.getDeviceGroups()[0].name).toBe("B");
  });

  it("adds a single device to a group", () => {
    svc.addDeviceGroup({ name: "G", devices: [] });
    svc.addDeviceToGroup(0, "aabbccddeeff");
    expect(svc.getDeviceGroups()[0].devices).toContain("aabbccddeeff");
  });

  it("does not add duplicate devices to a group", () => {
    svc.addDeviceGroup({ name: "G", devices: [] });
    svc.addDeviceToGroup(0, "aabbccddeeff");
    svc.addDeviceToGroup(0, "aabbccddeeff");
    expect(svc.getDeviceGroups()[0].devices).toHaveLength(1);
  });

  it("adds multiple devices to a group at once", () => {
    svc.addDeviceGroup({ name: "G", devices: [] });
    svc.addDevicesToGroup(0, ["aabbccddeeff", "112233445566"]);
    expect(svc.getDeviceGroups()[0].devices).toHaveLength(2);
  });

  it("removes a single device from a group", () => {
    svc.addDeviceGroup({
      name: "G",
      devices: ["aabbccddeeff", "112233445566"],
    });
    svc.removeDeviceFromGroup(0, "aabbccddeeff");
    expect(svc.getDeviceGroups()[0].devices).not.toContain("aabbccddeeff");
    expect(svc.getDeviceGroups()[0].devices).toContain("112233445566");
  });

  it("removes multiple devices from a group at once", () => {
    svc.addDeviceGroup({
      name: "G",
      devices: ["aabbccddeeff", "112233445566"],
    });
    svc.removeDevicesFromGroup(0, ["aabbccddeeff", "112233445566"]);
    expect(svc.getDeviceGroups()[0].devices).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ConfigService – consistencyMaker (via load + malformed on-disk JSON)
// ---------------------------------------------------------------------------
describe("ConfigService – consistency enforcement on load", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("drops duplicate MACs on load, keeping first occurrence", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    const configPath = path.join(dataDir, "config.json");
    const raw = {
      appSettings: { ipNet: "192.168.0.0/24" },
      devices: [
        {
          macAddress: "aabbccddeeff",
          ipAddress: "192.168.0.1",
          fwVersion: "1.0",
        },
        {
          macAddress: "aabbccddeeff",
          ipAddress: "192.168.0.2",
          fwVersion: "2.0",
        },
      ],
      deviceGroups: [],
      users: [{ name: "A", username: "a", password: "a" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw), "utf-8");

    const svc = createService(tempDir);
    svc.init();
    expect(svc.getDevices()).toHaveLength(1);
    expect(svc.getDevices()[0].ipAddress).toBe("192.168.0.1");
  });

  it("strips non-existent user reference from device on load", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    const configPath = path.join(dataDir, "config.json");
    const raw = {
      appSettings: { ipNet: "192.168.0.0/24" },
      devices: [
        {
          macAddress: "aabbccddeeff",
          ipAddress: "192.168.0.1",
          fwVersion: "1.0",
          user: "ghost",
        },
      ],
      deviceGroups: [],
      users: [{ name: "A", username: "a", password: "a" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw), "utf-8");

    const svc = createService(tempDir);
    svc.init();
    expect(svc.getDevices()[0].user).toBeUndefined();
  });

  it("strips non-existent MAC from deviceGroups on load", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    const configPath = path.join(dataDir, "config.json");
    const raw = {
      appSettings: { ipNet: "192.168.0.0/24" },
      devices: [],
      deviceGroups: [{ name: "G", devices: ["aabbccddeeff"] }],
      users: [{ name: "A", username: "a", password: "a" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw), "utf-8");

    const svc = createService(tempDir);
    svc.init();
    expect(svc.getDeviceGroups()[0].devices).toHaveLength(0);
  });

  it("falls back to default config on malformed JSON without a backup", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    const configPath = path.join(dataDir, "config.json");
    fs.writeFileSync(configPath, "NOT VALID JSON", "utf-8");

    const svc = createService(tempDir);
    svc.init();
    expect(svc.getUsers()).toEqual(DEFAULT_CONFIG.users);
    expect(svc.getDevices()).toHaveLength(0);
  });

  it("creates default config file when none exists", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    const svc = createService(tempDir);
    svc.init();
    const configPath = path.join(dataDir, "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("persists changes to disk and reloads them", () => {
    const svc = createService(tempDir);
    svc.init();
    svc.addOrUpdateDevice(SAMPLE_DEVICE);

    // Create a second instance pointing at the same directory
    const svc2 = createService(tempDir);
    svc2.init();
    expect(svc2.getDevices()).toHaveLength(1);
    expect(svc2.getDevices()[0].macAddress).toBe("aabbccddeeff");
  });

  it("migrates plaintext passwords to encrypted format on load", () => {
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    const configPath = path.join(dataDir, "config.json");
    const raw = {
      appSettings: { ipNet: "192.168.0.0/24" },
      devices: [],
      deviceGroups: [],
      users: [{ name: "A", username: "a", password: "plainpass" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw), "utf-8");

    const svc = createService(tempDir);
    svc.init();

    expect(svc.getUser("A")?.password).toBe("plainpass");

    const reloadedRaw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(reloadedRaw.users[0].password).not.toBe("plainpass");
    expect(reloadedRaw.users[0].password.startsWith("enc.v1:")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConfigService – safe writing and recovery of broken config files
// ---------------------------------------------------------------------------
describe("ConfigService – safe writing and recovery", () => {
  let tempDir: string;
  let dataDir: string;
  let configPath: string;
  let backupPath: string;

  const readJson = (filePath: string) =>
    JSON.parse(fs.readFileSync(filePath, "utf-8"));

  const listDataDir = () => fs.readdirSync(dataDir);

  /** Creates a service with a warning listener and loads the config */
  const initService = () => {
    const svc = createService(tempDir);
    const warnings: string[] = [];
    svc.warningBroadcast = (message) => warnings.push(message);
    svc.init();
    return { svc, warnings };
  };

  /** Writes a valid config with one device as both main file and backup */
  const writeValidConfigs = (backupDeviceMac: string) => {
    const svc = createService(tempDir);
    svc.init();
    svc.addOrUpdateDevice({ ...SAMPLE_DEVICE, macAddress: backupDeviceMac });
    svc.addOrUpdateDevice({ ...SAMPLE_DEVICE, macAddress: "112233445566" });
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-safe-test-"));
    dataDir = path.join(tempDir, "netio-local-management");
    configPath = path.join(dataDir, "config.json");
    backupPath = `${configPath}.bak`;
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not leave a temp file and keeps the previous version as backup", () => {
    const { svc } = initService();
    svc.addOrUpdateDevice(SAMPLE_DEVICE);

    expect(listDataDir().some((f) => f.endsWith(".tmp"))).toBe(false);
    expect(readJson(configPath).devices).toHaveLength(1);
    expect(readJson(backupPath).devices).toHaveLength(0);
  });

  it("does not warn on a fresh installation", () => {
    const { warnings } = initService();
    expect(warnings).toHaveLength(0);
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("moves a corrupted config aside and restores from backup", () => {
    writeValidConfigs("aabbccddeeff");
    fs.writeFileSync(configPath, "NOT VALID JSON", "utf-8");

    const { svc, warnings } = initService();

    // Backup contains the state before the last save (one device)
    expect(svc.getDevices().map((d) => d.macAddress)).toEqual(["aabbccddeeff"]);
    const corrupt = listDataDir().filter((f) =>
      f.startsWith("config.json.corrupt-"),
    );
    expect(corrupt).toHaveLength(1);
    expect(fs.readFileSync(path.join(dataDir, corrupt[0]), "utf-8")).toBe(
      "NOT VALID JSON",
    );
    expect(fs.existsSync(configPath)).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(corrupt[0]);
    expect(warnings[0]).toContain("restored from backup");
  });

  it("first save after restore does not overwrite the backup", () => {
    writeValidConfigs("aabbccddeeff");
    const backupBefore = fs.readFileSync(backupPath, "utf-8");
    fs.writeFileSync(configPath, "NOT VALID JSON", "utf-8");

    const { svc } = initService();
    svc.addOrUpdateUser("Bob", "bob", "pw");

    expect(fs.readFileSync(backupPath, "utf-8")).toBe(backupBefore);
    expect(readJson(configPath).users.map((u: any) => u.name)).toContain("Bob");
  });

  it("restores from backup when the main config is missing", () => {
    writeValidConfigs("aabbccddeeff");
    fs.rmSync(configPath);

    const { svc, warnings } = initService();
    expect(svc.getDevices()).toHaveLength(1);
    expect(warnings[0]).toContain("is missing");
    expect(warnings[0]).toContain("restored from backup");
  });

  it("starts with default config when both files are corrupted", () => {
    fs.writeFileSync(configPath, "NOT VALID JSON", "utf-8");
    fs.writeFileSync(backupPath, "ALSO BROKEN", "utf-8");

    const { svc, warnings } = initService();

    expect(svc.getUsers()).toEqual(DEFAULT_CONFIG.users);
    expect(svc.getDevices()).toHaveLength(0);
    // Broken backup is left in place
    expect(fs.readFileSync(backupPath, "utf-8")).toBe("ALSO BROKEN");
    expect(warnings[0]).toContain("could not be loaded either");
  });

  it("treats a missing top-level array as a corrupted file", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ devices: [], users: [] }),
      "utf-8",
    );

    const { warnings } = initService();
    expect(
      listDataDir().some((f) => f.startsWith("config.json.corrupt-")),
    ).toBe(true);
    expect(warnings[0]).toContain("No backup is available");
  });

  it("drops invalid entries, keeps the rest and reports them", () => {
    const raw = {
      devices: [
        SAMPLE_DEVICE,
        { macAddress: "112233445566", ipAddress: "not-an-ip" },
      ],
      deviceGroups: [
        { name: "G", devices: ["aabbccddeeff", "zz"] },
        { devices: [] },
      ],
      users: [SAMPLE_USER, { name: "", username: "x", password: "y" }],
    };
    fs.writeFileSync(configPath, JSON.stringify(raw), "utf-8");

    const { svc, warnings } = initService();

    expect(svc.getDevices().map((d) => d.macAddress)).toEqual(["aabbccddeeff"]);
    expect(svc.getUsers().map((u) => u.name)).toEqual(["Alice"]);
    expect(svc.getDeviceGroups()).toEqual([
      { name: "G", devices: ["aabbccddeeff"] },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("devices[1].ipAddress");
    expect(warnings[0]).toContain("deviceGroups[0].devices[1]");
    expect(warnings[0]).toContain("deviceGroups[1].name");
    expect(warnings[0]).toContain("users[1].name");
    // The file is not renamed, only the invalid entries are ignored
    expect(
      listDataDir().some((f) => f.startsWith("config.json.corrupt-")),
    ).toBe(false);
  });

  it("blocks saving when the config file cannot be read", () => {
    // A directory in place of the file makes reading fail with EISDIR
    fs.mkdirSync(configPath);

    const { svc, warnings } = initService();

    expect(warnings[0]).toContain("could not be read");
    expect(() => svc.addOrUpdateDevice(SAMPLE_DEVICE)).toThrow(
      "Saving configuration is disabled",
    );
    expect(fs.statSync(configPath).isDirectory()).toBe(true);
  });

  it("throws when the config cannot be written and keeps the file intact", () => {
    const { svc } = initService();
    const before = fs.readFileSync(configPath, "utf-8");
    // A directory in place of the temp file makes writing fail
    fs.mkdirSync(`${configPath}.tmp`);

    expect(() => svc.addOrUpdateDevice(SAMPLE_DEVICE)).toThrow(
      "Error saving configuration",
    );
    expect(fs.readFileSync(configPath, "utf-8")).toBe(before);
  });

  it("does not mutate DEFAULT_CONFIG", () => {
    const snapshot = structuredClone(DEFAULT_CONFIG);
    fs.writeFileSync(configPath, "NOT VALID JSON", "utf-8");

    const { svc } = initService();
    svc.addOrUpdateUser("Bob", "bob", "pw");
    svc.addOrUpdateDevice(SAMPLE_DEVICE);

    expect(DEFAULT_CONFIG).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// ConfigService – settings
// ---------------------------------------------------------------------------
describe("ConfigService – settings", () => {
  let tempDir: string;
  let configPath: string;

  const writeConfig = (settings: unknown) => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ devices: [], deviceGroups: [], users: [], settings }),
      "utf-8",
    );
  };

  const initService = () => {
    const svc = createService(tempDir);
    const warnings: string[] = [];
    svc.warningBroadcast = (message) => warnings.push(message);
    svc.init();
    return { svc, warnings };
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-settings-test-"));
    const dataDir = path.join(tempDir, "netio-local-management");
    fs.mkdirSync(dataDir, { recursive: true });
    configPath = path.join(dataDir, "config.json");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("has empty settings by default", () => {
    const { svc } = initService();
    expect(svc.getSettings()).toEqual({});
  });

  it("loads logLevel and keeps it on save", () => {
    writeConfig({ logLevel: "debug" });
    const { svc, warnings } = initService();

    expect(svc.getSettings()).toEqual({ logLevel: "debug" });
    expect(warnings).toHaveLength(0);

    svc.addOrUpdateDevice(SAMPLE_DEVICE);
    expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).settings).toEqual({
      logLevel: "debug",
    });
  });

  it("drops an invalid logLevel and reports it", () => {
    writeConfig({ logLevel: "verbose" });
    const { svc, warnings } = initService();

    expect(svc.getSettings()).toEqual({});
    expect(warnings[0]).toContain("settings.logLevel");
  });

  it("reports settings which are not an object", () => {
    writeConfig("debug");
    const { svc, warnings } = initService();

    expect(svc.getSettings()).toEqual({});
    expect(warnings[0]).toContain("settings: Expected an object");
  });
});

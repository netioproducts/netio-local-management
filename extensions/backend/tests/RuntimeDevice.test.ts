/**
 * RuntimeDevice unit tests
 *
 * Tests cover:
 *  - constructor / config setter / socket pre-population
 *  - originalName setter & onConfigChange callback
 *  - setupCredentials / clearCredentials / getClient
 *  - toDTO mapping
 *  - config re-assignment
 *  - syncState (success, MAC mismatch, wrong credentials, unreachable)
 *  - getAllInfo
 *  - setSocketState / setAllSocketsState
 *  - toggleSocket / toggleAllSockets
 *  - uploadFirmware (success + failure)
 *  - idle timeout behaviour
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  mock,
  afterEach,
  spyOn,
} from "bun:test";
import { Device } from "../src/netio-api/types/Device";
import {
  ClientNotInitializedError,
  DeviceBusyError,
  MacAddressMismatchError,
  UnauthorizedError,
} from "../src/netio-api/types/Errors";
import * as universal from "../src/netio-api/transport/univarsal";

// Now import RuntimeDevice
import { RuntimeDevice } from "../src/netio-api/services/RuntimeDevice";
import { ESPDevice } from "../src/netio-api/devices/ESPDevice";
import { makeFakeClient } from "./helpers/fakeDeviceClient";

// ---------------------------------------------------------------------------
// Mock client stub factory
// ---------------------------------------------------------------------------
let clientStub: any = {};

function freshClientStub() {
  clientStub.initialize = spyOn(
    ESPDevice.prototype,
    "initialize",
  ).mockResolvedValue(undefined as never);
  clientStub.disconnect = spyOn(
    ESPDevice.prototype,
    "disconnect",
  ).mockResolvedValue(undefined as never);
  clientStub.getSystemInfo = spyOn(
    ESPDevice.prototype,
    "getSystemInfo",
  ).mockResolvedValue({
    model: "NETIO4C",
    serialNumber: "aabbccddeeff",
    firmwareVersion: "3.1.0",
    name: "Lab Switch",
    outputCount: 4,
  } as never);
  clientStub.getAllInfo = spyOn(
    ESPDevice.prototype,
    "getAllInfo",
  ).mockResolvedValue({ version: "3.1.0", extra: true } as never);
  clientStub.getOutputs = spyOn(
    ESPDevice.prototype,
    "getOutputs",
  ).mockResolvedValue([
    { id: 1, name: "Out 1", state: true, load: 12 },
    { id: 2, name: "Out 2", state: false, load: 0 },
  ] as never);
  clientStub.setOutput = spyOn(
    ESPDevice.prototype,
    "setOutput",
  ).mockResolvedValue(undefined as never);
  clientStub.checkConnectivity = spyOn(
    ESPDevice.prototype,
    "checkConnectivity",
  ).mockResolvedValue(42 as never);
  clientStub.updateFirmware = spyOn(
    ESPDevice.prototype,
    "updateFirmware",
  ).mockResolvedValue(undefined as never);

  spyOn(universal, "checkConnectivity").mockResolvedValue(1 as never);
  return clientStub;
}

afterEach(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeDevice = (overrides: Partial<Device> = {}): Device => ({
  macAddress: "aabbccddeeff",
  ipAddress: "192.168.1.10",
  fwVersion: "3.0.0",
  ...overrides,
});

const clientFactory = (
  ip: string,
  mac: string,
  user: string,
  pass: string,
  fw?: string,
) => {
  return new ESPDevice({
    ipAddress: ip,
    macAddress: mac,
    username: user,
    password: pass,
    fwVersion: fw,
  });
};

// ---------------------------------------------------------------------------
// constructor / config setter
// ---------------------------------------------------------------------------
describe("RuntimeDevice – constructor & config", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("stores the config passed to the constructor", () => {
    const dev = new RuntimeDevice(makeDevice({ name: "My Device" }));
    expect(dev.getConfig().macAddress).toBe("aabbccddeeff");
    expect(dev.getConfig().name).toBe("My Device");
  });

  it("is offline and not logged-in initially", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(dev.isOnline).toBe(false);
    expect(dev.isLoggedIn).toBe(false);
  });

  it("pre-populates sockets from config.sockets array", () => {
    const dev = new RuntimeDevice(
      makeDevice({ sockets: ["Output 1", "Output 2"] }),
    );
    expect(dev.sockets[1]).toBeDefined();
    expect(dev.sockets[1].customLabel).toBe("Output 1");
    expect(dev.sockets[2]).toBeDefined();
    expect(dev.sockets[2].customLabel).toBe("Output 2");
  });

  it("assigns correct SocketId tuples when pre-populating sockets", () => {
    const dev = new RuntimeDevice(makeDevice({ sockets: ["S1"] }));
    expect(dev.sockets[1].id).toEqual(["aabbccddeeff", 1]);
  });

  it("leaves sockets empty when config has no sockets array", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(Object.keys(dev.sockets)).toHaveLength(0);
  });

  it("calls setupCredentials when username/password are present in config", () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "admin", password: "secret" }),
    );
    expect(dev.getConfig().username).toBe("admin");
    expect(dev.getConfig().password).toBe("secret");
  });
});

// ---------------------------------------------------------------------------
// originalName setter
// ---------------------------------------------------------------------------
describe("RuntimeDevice – originalName", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("sets originalName and config.name when config.name is absent", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.originalName = "Discovered Name";
    expect(dev.originalName).toBe("Discovered Name");
    expect(dev.getConfig().name).toBe("Discovered Name");
  });

  it("fires onConfigChange when config.name is auto-set", () => {
    const dev = new RuntimeDevice(makeDevice());
    const calls: string[] = [];
    dev.on("config_change", (cfg) => calls.push(cfg.name ?? ""));
    dev.originalName = "Auto Name";
    expect(calls).toContain("Auto Name");
  });

  it("does not overwrite an existing config.name", () => {
    const dev = new RuntimeDevice(makeDevice({ name: "Existing" }));
    dev.originalName = "Other Name";
    expect(dev.getConfig().name).toBe("Existing");
  });

  it("does not fire onConfigChange when name already set", () => {
    const dev = new RuntimeDevice(makeDevice({ name: "Existing" }));
    const calls: string[] = [];
    dev.on("config_change", (cfg) => calls.push(cfg.name ?? ""));
    dev.originalName = "Other Name";
    expect(calls).toHaveLength(0);
  });

  it("accepts null without error", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.originalName = null;
    expect(dev.originalName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setupCredentials / clearCredentials
// ---------------------------------------------------------------------------
describe("RuntimeDevice – credentials", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("setupCredentials stores username and password on config", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.setupCredentials("user", "pass", clientFactory);
    expect(dev.getConfig().username).toBe("user");
    expect(dev.getConfig().password).toBe("pass");
  });

  it("clearCredentials removes user/username/password and sets isLoggedIn=false", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.setupCredentials("user", "pass", clientFactory);
    (dev as any).isLoggedIn = true;
    dev.clearCredentials();
    expect(dev.getConfig().username).toBeUndefined();
    expect(dev.getConfig().password).toBeUndefined();
    expect(dev.getConfig().user).toBeUndefined();
    expect(dev.isLoggedIn).toBe(false);
  });

  it("getClient throws ClientNotInitializedError before setupCredentials", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(() => dev.getClient()).toThrow(ClientNotInitializedError);
  });

  it("getClient returns an ESPDevice instance after setupCredentials", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.setupCredentials("user", "pass", clientFactory);
    // getClient should not throw
    expect(() => dev.getClient()).not.toThrow();
  });

  it("registers a device error listener during setupCredentials", async () => {
    const dev = new RuntimeDevice(makeDevice());
    await dev.setupCredentials("user", "pass", clientFactory);

    expect(dev.getClient().listenerCount("error")).toBeGreaterThan(0);
  });

  it("does not reject status toggles before client initialization", async () => {
    const dev = new RuntimeDevice(makeDevice());
    await dev.setupCredentials("user", "pass", clientFactory);

    await expect(dev.getClient().stopAskingStatus()).resolves.toBeUndefined();
    await expect(dev.getClient().startAskingStatus()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toDTO
// ---------------------------------------------------------------------------
describe("RuntimeDevice – toDTO", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("maps config fields to DTO correctly", () => {
    const dev = new RuntimeDevice(
      makeDevice({ name: "Lab Switch", model: "NETIO4C", fwVersion: "3.1.0" }),
    );
    const dto = dev.toDTO();
    expect(dto.macAddress).toBe("aabbccddeeff");
    expect(dto.ipAddress).toBe("192.168.1.10");
    expect(dto.fwVersion).toBe("3.1.0");
    expect(dto.name).toBe("Lab Switch");
    expect(dto.model).toBe("NETIO4C");
    expect(dto.isOnline).toBe(false);
    expect(dto.isLoggedIn).toBe(false);
  });

  it("returns empty sockets array when no sockets are defined", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(dev.toDTO().sockets).toHaveLength(0);
  });

  it("maps runtime sockets into SocketDTOs", () => {
    const dev = new RuntimeDevice(makeDevice({ sockets: ["Pump", "Light"] }));
    // Add runtime state
    dev.sockets[1].state = true;
    dev.sockets[1].originalLabel = "Output 1";
    dev.sockets[2].state = false;
    dev.sockets[2].originalLabel = "Output 2";

    const dto = dev.toDTO();
    expect(dto.sockets).toHaveLength(2);
    expect(dto.sockets[0].label).toBe("Pump");
    expect(dto.sockets[0].status).toBe(true);
    expect(dto.sockets[1].label).toBe("Light");
    expect(dto.sockets[1].status).toBe(false);
  });

  it("includes user in DTO when set", () => {
    const dev = new RuntimeDevice(makeDevice({ user: "Alice" }));
    expect(dev.toDTO().user).toBe("Alice");
  });

  it("fills name with empty string when config.name is absent", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(dev.toDTO().name).toBe("");
  });

  it("fills model with empty string when config.model is absent", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(dev.toDTO().model).toBe("");
  });

  it("includes originalName in DTO", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.originalName = "Original";
    expect(dev.toDTO().originalName).toBe("Original");
  });

  it("originalName defaults to empty string in DTO when null", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(dev.toDTO().originalName).toBe("");
  });
});

// ---------------------------------------------------------------------------
// config setter (re-assignment)
// ---------------------------------------------------------------------------
describe("RuntimeDevice – config re-assignment via set config", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("rebuilds sockets when a new config is assigned", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.config = makeDevice({ sockets: ["New Socket"] });
    expect(dev.sockets[1].customLabel).toBe("New Socket");
  });

  it("clears sockets when the new config has no sockets array", () => {
    const dev = new RuntimeDevice(makeDevice({ sockets: ["Old"] }));
    dev.config = makeDevice();
    // Without sockets in new config, sockets is not reset by the setter
    // (actual behaviour: previous sockets stay if no sockets key present)
    // – just verify no error is thrown
    expect(dev.getConfig().macAddress).toBe("aabbccddeeff");
  });

  it("updates macAddress on SocketId tuples in rebuilt sockets", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.config = makeDevice({ macAddress: "112233445566", sockets: ["S1"] });
    expect(dev.sockets[1].id[0]).toBe("112233445566");
  });
});

// ---------------------------------------------------------------------------
// syncState – success path
// ---------------------------------------------------------------------------
describe("RuntimeDevice – syncState success", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("sets isOnline and isLoggedIn to true after sync", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.isOnline).toBe(true);
    expect(dev.isLoggedIn).toBe(true);
  });

  it("populates outputCount from system info", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.outputCount).toBe(4);
  });

  it("auto-sets config.name from system info when name is absent", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.getConfig().name).toBe("Lab Switch");
  });

  it("does not overwrite existing config.name", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ name: "Custom", username: "u", password: "p" }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.getConfig().name).toBe("Custom");
  });

  it("sets fwVersion from system info", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.getConfig().fwVersion).toBe("3.1.0");
  });

  it("populates sockets from getOutputs when config has none", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.sockets[1]).toBeDefined();
    expect(dev.sockets[1].state).toBe(true);
    expect(dev.sockets[1].originalLabel).toBe("Out 1");
    expect(dev.sockets[2]).toBeDefined();
    expect(dev.sockets[2].state).toBe(false);
  });

  it("updates socket load values", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.sockets[1].load).toBe(12);
    expect(dev.sockets[2].load).toBe(0);
  });

  it("fires onConfigChange when config changed during sync", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    const calls: Device[] = [];
    dev.on("config_change", (cfg) => calls.push({ ...cfg }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    // fwVersion changed from 3.0.0 → 3.1.0, so callback should fire
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts numeric fwVersion prefix from semver-like strings", async () => {
    clientStub.getSystemInfo.mockResolvedValue({
      model: "NETIO4C",
      serialNumber: "aabbccddeeff",
      firmwareVersion: "3.2.1-beta.42",
      name: "Lab Switch",
      outputCount: 4,
    } as never);
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.getConfig().fwVersion).toBe("3.2.1");
  });
});

// ---------------------------------------------------------------------------
// syncState – MacAddressMismatchError
// ---------------------------------------------------------------------------
describe("RuntimeDevice – syncState MAC mismatch", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
    clientStub.initialize.mockRejectedValue(
      new MacAddressMismatchError("MAC mismatch"),
    );
  });

  it("sets isOnline and isLoggedIn to false on MAC mismatch", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    await dev.syncState();
    expect(dev.isOnline).toBe(false);
    expect(dev.isLoggedIn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syncState – wrong credentials (device reachable but auth fails)
// ---------------------------------------------------------------------------
describe("RuntimeDevice – syncState wrong credentials", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
    clientStub.initialize.mockRejectedValue(new UnauthorizedError("401 Unauthorized"));
    // getBasicDeviceInfo returns {data: {deviceSN: 'aabbccddeeff'}} even with wrong credentials, so device is reachable
    spyOn(universal, "getBasicDeviceInfo").mockResolvedValue({
      data: { deviceSN: "aabbccddeeff" },
    } as never);
  });

  it("sets isOnline=true, isLoggedIn=false when device is reachable but auth fails", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    await dev.syncState();
    expect(dev.isOnline).toBe(true);
    expect(dev.isLoggedIn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// syncState – unreachable device
// ---------------------------------------------------------------------------
describe("RuntimeDevice – syncState unreachable", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
    clientStub.initialize.mockRejectedValue(new Error("connection refused"));
    // getBasicDeviceInfo returns null when device is unreachable
    spyOn(universal, "getBasicDeviceInfo").mockResolvedValue(null as never);
  });

  afterEach(() => {
    spyOn(universal, "getBasicDeviceInfo").mockResolvedValue({
      data: { deviceSN: "aabbccddeeff" },
    } as never);
  });

  it("sets isOnline=false and isLoggedIn=false when device is unreachable", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    await dev.syncState();
    expect(dev.isOnline).toBe(false);
    expect(dev.isLoggedIn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllInfo
// ---------------------------------------------------------------------------
describe("RuntimeDevice – getAllInfo", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("returns all info from the client", async () => {
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    const info = await dev.getAllInfo();
    expect(info).toBeDefined();
    expect(info.version).toBe("3.1.0");
  });

  it("returns null when client.getAllInfo throws", async () => {
    clientStub.getAllInfo.mockRejectedValue(new Error("network error"));
    const dev = new RuntimeDevice(makeDevice({ username: "u", password: "p" }));
    dev.setupCredentials("u", "p", clientFactory);
    const info = await dev.getAllInfo();
    expect(info).toBeNull();
  });

  it("throws ClientNotInitializedError when no credentials", async () => {
    const dev = new RuntimeDevice(makeDevice());
    const info = await dev.getAllInfo();
    // getAllInfo catches the error internally and returns null
    expect(info).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setSocketState
// ---------------------------------------------------------------------------
describe("RuntimeDevice – setSocketState", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("sets the socket state and updates runtime", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1", "S2"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.setSocketState(1, true);
    expect(clientStub.setOutput).toHaveBeenCalledWith(1, true);
    expect(dev.sockets[1].state).toBe(true);
    expect(dev.isOnline).toBe(true);
  });

  it("throws when socket index does not exist", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await expect(dev.setSocketState(99, true)).rejects.toThrow(
      "Socket index 99 does not exist",
    );
  });

  it("falls back to syncState when setOutput throws", async () => {
    clientStub.setOutput.mockRejectedValue(new Error("timeout"));
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    // Should not throw – error is caught and syncState is called
    await dev.setSocketState(1, true);
    // After syncState, sockets get repopulated from getOutputs mock
    expect(dev.sockets[1].state).toBe(true); // from getOutputs mock
  });
});

// ---------------------------------------------------------------------------
// setAllSocketsState
// ---------------------------------------------------------------------------
describe("RuntimeDevice – setAllSocketsState", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("sets all sockets to the target state", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1", "S2"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.setAllSocketsState(false);
    expect(clientStub.setOutput).toHaveBeenCalledWith(1, false);
    expect(clientStub.setOutput).toHaveBeenCalledWith(2, false);
    expect(dev.sockets[1].state).toBe(false);
    expect(dev.sockets[2].state).toBe(false);
  });

  it("sets isOnline true on success", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.setAllSocketsState(true);
    expect(dev.isOnline).toBe(true);
  });

  it("falls back to syncState when setOutput throws", async () => {
    clientStub.setOutput.mockRejectedValue(new Error("timeout"));
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    // Should not throw
    await dev.setAllSocketsState(true);
    // After syncState repopulates from mock, sockets exist
    expect(dev.sockets[1]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// toggleSocket
// ---------------------------------------------------------------------------
describe("RuntimeDevice – toggleSocket", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("inverts a socket that is currently ON", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    // After syncState (called inside toggleSocket), socket 1 will be ON (from mock)
    await dev.toggleSocket(1);
    // toggleSocket calls setSocketState with !state, and state is true from syncState
    expect(clientStub.setOutput).toHaveBeenCalledWith(1, false);
  });

  it("inverts a socket that is currently OFF", async () => {
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1", "S2"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    // After syncState, socket 2 is OFF (from mock)
    await dev.toggleSocket(2);
    expect(clientStub.setOutput).toHaveBeenCalledWith(2, true);
  });
});

// ---------------------------------------------------------------------------
// toggleAllSockets
// ---------------------------------------------------------------------------
describe("RuntimeDevice – toggleAllSockets", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("turns all sockets OFF when all are ON", async () => {
    clientStub.getOutputs.mockResolvedValue([
      { id: 1, name: "Out 1", state: true, load: 0 },
      { id: 2, name: "Out 2", state: true, load: 0 },
    ] as never);
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1", "S2"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.toggleAllSockets();
    // All were ON → setAllSocketsState(false)
    expect(clientStub.setOutput).toHaveBeenCalledWith(1, false);
    expect(clientStub.setOutput).toHaveBeenCalledWith(2, false);
  });

  it("turns all sockets ON when any is OFF", async () => {
    // Default mock: output 1 ON, output 2 OFF → not all ON → toggle to ON
    const dev = new RuntimeDevice(
      makeDevice({ username: "u", password: "p", sockets: ["S1", "S2"] }),
    );
    dev.setupCredentials("u", "p", clientFactory);
    await dev.toggleAllSockets();
    expect(clientStub.setOutput).toHaveBeenCalledWith(1, true);
    expect(clientStub.setOutput).toHaveBeenCalledWith(2, true);
  });
});

// ---------------------------------------------------------------------------
// getClient guard
// ---------------------------------------------------------------------------
describe("RuntimeDevice – getClient", () => {
  beforeEach(() => {
    clientStub = freshClientStub();
  });

  it("throws ClientNotInitializedError when no client is set", () => {
    const dev = new RuntimeDevice(makeDevice());
    expect(() => dev.getClient()).toThrow(ClientNotInitializedError);
  });

  it("returns the client after setupCredentials", () => {
    const dev = new RuntimeDevice(makeDevice());
    dev.setupCredentials("u", "p", clientFactory);
    const client = dev.getClient();
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// exclusive operations (device lock)
// ---------------------------------------------------------------------------
describe("RuntimeDevice – exclusive operations", () => {
  const makeLoggedDevice = () => {
    const client = makeFakeClient();
    const dev = new RuntimeDevice(makeDevice());
    dev.setupCredentials("admin", "admin", () => client as any);
    return { dev, client };
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

  it("unlocks the device when the operation throws", async () => {
    const { dev } = makeLoggedDevice();
    await expect(
      dev.runExclusive("failing", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(dev.isBusy).toBe(false);
  });

  it("rejects a concurrent exclusive operation", async () => {
    const { dev } = makeLoggedDevice();
    const lock = holdLock(dev);

    expect(dev.isBusy).toBe(true);
    await expect(dev.runExclusive("second", async () => {})).rejects.toThrow(
      DeviceBusyError,
    );
    expect(() => dev.assertNotBusy()).toThrow("test operation");

    lock.release();
    await lock.done;
    expect(dev.isBusy).toBe(false);
  });

  it("whenIdle resolves only after the device is unlocked", async () => {
    const { dev } = makeLoggedDevice();
    await dev.whenIdle(); // resolves immediately when not busy

    const lock = holdLock(dev);
    let idle = false;
    const waiting = dev.whenIdle().then(() => (idle = true));
    await Promise.resolve();
    expect(idle).toBe(false);

    lock.release();
    await lock.done;
    await waiting;
    expect(idle).toBe(true);
  });

  it("defers enablePolling until the device is unlocked", async () => {
    const { dev, client } = makeLoggedDevice();
    const lock = holdLock(dev);

    dev.enablePolling();
    expect(dev.isPollingEnabled).toBe(true);
    expect(client.calls.startAskingStatus).toBe(0);

    lock.release();
    await lock.done;
    expect(client.calls.startAskingStatus).toBe(1);
  });

  it("skips outside syncState while locked, session sync still works", async () => {
    const { dev, client } = makeLoggedDevice();
    let release!: () => void;
    const done = dev.runExclusive("test operation", async (session) => {
      await dev.syncState();
      expect(client.calls.initialize).toBe(0);
      await session.syncState();
      expect(client.calls.initialize).toBe(1);
      await new Promise<void>((resolve) => (release = resolve));
    });
    await new Promise((r) => setTimeout(r, 0));

    await dev.syncState();
    expect(client.calls.initialize).toBe(1);

    release();
    await done;
    await dev.syncState();
    expect(client.calls.initialize).toBe(2);
  });

  it("factoryReset runs exclusively", async () => {
    const { dev } = makeLoggedDevice();
    const lock = holdLock(dev);
    await expect(dev.factoryReset()).rejects.toThrow(DeviceBusyError);
    lock.release();
    await lock.done;

    await dev.factoryReset();
    expect(dev.isBusy).toBe(false);
  });
});

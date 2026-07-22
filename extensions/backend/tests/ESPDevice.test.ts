/**
 * ESPDevice unit tests
 *
 * ESPDevice wraps a transport provider (WsProvider → HttpProvider fallback)
 * and forwards all calls to it.  We mock the transport layer and the two
 * provider constructors so we never touch the network.
 *
 * Strategy:
 *  - `getBasicDeviceInfo` is mocked at the module level via `mock.module`.
 *  - WsProvider / HttpProvider are mocked so `new WsProvider(…)` returns a
 *    controllable EventEmitter stub.
 */
import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Stubs returned by the mocked provider constructors
// ---------------------------------------------------------------------------
let wsStub: any;
let httpStub: any;
let wsConnectBehaviour: () => Promise<void>;
let httpConnectBehaviour: () => Promise<void>;

function freshStub() {
  const emitter = new EventEmitter();
  return {
    ...emitter,
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    connect: mock(async () => {}),
    connectOnly: mock(async () => {}),
    disconnect: mock(() => {}),
    getSystemInfo: mock(async () => ({
      model: "NETIO4C",
      serialNumber: "aabbccddeeff",
      firmwareVersion: "3.1.0",
      name: "Lab Switch",
      outputCount: 4,
    })),
    getAllInfo: mock(async () => ({ version: "3.1.0" })),
    getOutputs: mock(async () => [
      { id: 1, name: "Out 1", state: true },
      { id: 2, name: "Out 2", state: false },
    ]),
    setOutput: mock(async () => {}),
    checkConnectivity: mock(async () => 42),
    updateFirmware: mock(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing ESPDevice
// ---------------------------------------------------------------------------
mock.module("../src/netio-api/transport/univarsal", () => ({
  getBasicDeviceInfo: mock(async () => ({
    data: { deviceSN: "aabbccddeeff" },
  })),
  checkConnectivity: mock(async () => 1),
}));

mock.module("../src/netio-api/providers/WsProvider", () => ({
  WsProvider: class {
    constructor() {
      Object.assign(this, wsStub);
    }
  },
}));

mock.module("../src/netio-api/providers/HttpProvider", () => ({
  HttpProvider: class {
    constructor() {
      Object.assign(this, httpStub);
    }
  },
}));

// Now import ESPDevice – the imports above are already mocked
import { ESPDevice } from "../src/netio-api/devices/ESPDevice";
import { getBasicDeviceInfo } from "../src/netio-api/transport/univarsal";
import { MacAddressMismatchError } from "../src/netio-api/types/Errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const defaultCfg = () => ({
  ipAddress: "192.168.1.10",
  macAddress: "aabbccddeeff",
  username: "admin",
  password: "pass",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ESPDevice – constructor", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("creates an instance without errors", () => {
    const dev = new ESPDevice(defaultCfg());
    expect(dev).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// initialize – MAC address verification
// ---------------------------------------------------------------------------
describe("ESPDevice – initialize MAC check", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("MAC comparison is case-insensitive", async () => {
    (getBasicDeviceInfo as any).mockImplementation(async () => ({
      data: { deviceSN: "AABBCCDDEEFF" },
    }));

    const dev = new ESPDevice({ ...defaultCfg(), macAddress: "aabbccddeeff" });
    // Should NOT throw – both refer to the same address
    await expect(dev.initialize()).resolves.toBeUndefined();

    (getBasicDeviceInfo as any).mockImplementation(async () => ({
      data: { deviceSN: "aabbccddeeff" },
    }));
  });
});

// ---------------------------------------------------------------------------
// initialize – WS success path
// ---------------------------------------------------------------------------
describe("ESPDevice – initialize WS success", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("connects via WS when WsProvider.connect resolves", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    expect(wsStub.connect).toHaveBeenCalled();
  });

  it("does not create an HttpProvider when WS succeeds", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    expect(httpStub.connect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initialize – WS failure → HTTP fallback
// ---------------------------------------------------------------------------
describe("ESPDevice – initialize HTTP fallback", () => {
  beforeEach(() => {
    wsStub = freshStub();
    wsStub.connectOnly = mock(async () => {
      throw new Error("WS unavailable");
    });
    httpStub = freshStub();
  });

  it("falls back to HTTP when WS connect fails", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    expect(httpStub.connect).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initialize – reconnection (provider already set)
// ---------------------------------------------------------------------------
describe("ESPDevice – re-initialize (reconnection)", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("calls provider.connect again without recreating provider", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize(); // first time – creates provider
    const firstCallCount = wsStub.connect.mock.calls.length;
    await dev.initialize(); // second time – reconnects
    expect(wsStub.connect.mock.calls.length).toBe(firstCallCount + 1);
  });
});

// ---------------------------------------------------------------------------
// Event forwarding
// ---------------------------------------------------------------------------
describe("ESPDevice – event forwarding", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("forwards output_change from provider", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();

    const received: any[] = [];
    dev.on("output_change", (data) => received.push(data));

    // The stub's `emit` is the real EventEmitter.emit bound to wsStub
    wsStub.emit("output_change", { id: 1, state: true });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ id: 1, state: true });
  });

  it("forwards disconnected from provider", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();

    let fired = false;
    dev.on("disconnected", () => {
      fired = true;
    });
    wsStub.emit("disconnected");
    expect(fired).toBe(true);
  });

  it("forwards error from provider", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();

    const errors: any[] = [];
    dev.on("error", (e) => errors.push(e));
    wsStub.emit("error", new Error("oops"));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("oops");
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------
describe("ESPDevice – disconnect", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("calls provider.disconnect when initialized", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    await dev.disconnect();
    expect(wsStub.disconnect).toHaveBeenCalled();
  });

  it("does not throw when disconnect is called before initialize", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.disconnect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Proxy methods – not initialized guards
// ---------------------------------------------------------------------------
describe("ESPDevice – uninitialized guards", () => {
  it("getSystemInfo rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.getSystemInfo()).rejects.toThrow("Device not initialized");
  });

  it("getAllInfo rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.getAllInfo()).rejects.toThrow("Device not initialized");
  });

  it("getOutputs rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.getOutputs()).rejects.toThrow("Device not initialized");
  });

  it("setOutput rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.setOutput(1, true)).rejects.toThrow(
      "Device not initialized",
    );
  });

  it("toggleOutput rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.toggleOutput(1)).rejects.toThrow("Device not initialized");
  });

  it("checkConnectivity rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.checkConnectivity()).rejects.toThrow(
      "Device not initialized",
    );
  });

  it("updateFirmware rejects with 'Device not initialized'", async () => {
    const dev = new ESPDevice(defaultCfg());
    await expect(dev.updateFirmware(Buffer.from("fw"))).rejects.toThrow(
      "Device not initialized",
    );
  });
});

// ---------------------------------------------------------------------------
// Proxy methods – delegations
// ---------------------------------------------------------------------------
describe("ESPDevice – proxy delegations (after initialize)", () => {
  beforeEach(() => {
    wsStub = freshStub();
    httpStub = freshStub();
  });

  it("getSystemInfo delegates to provider.getSystemInfo", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    const info = await dev.getSystemInfo();
    expect(info.model).toBe("NETIO4C");
    expect(info.outputCount).toBe(4);
    expect(wsStub.getSystemInfo).toHaveBeenCalled();
  });

  it("getAllInfo delegates to provider.getAllInfo", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    const info = await dev.getAllInfo();
    expect(info.version).toBe("3.1.0");
    expect(wsStub.getAllInfo).toHaveBeenCalled();
  });

  it("getOutputs delegates to provider.getOutputs", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    const outputs = await dev.getOutputs();
    expect(outputs).toHaveLength(2);
    expect(outputs[0].id).toBe(1);
    expect(wsStub.getOutputs).toHaveBeenCalled();
  });

  it("setOutput delegates to provider.setOutput", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    await dev.setOutput(2, true);
    expect(wsStub.setOutput).toHaveBeenCalledWith(2, true);
  });

  it("toggleOutput inverts the current state", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    // Output 1 is currently ON (state: true) according to stub
    await dev.toggleOutput(1);
    expect(wsStub.setOutput).toHaveBeenCalledWith(1, false);
  });

  it("toggleOutput does nothing for non-existent output id", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    await dev.toggleOutput(99); // no output with id 99
    expect(wsStub.setOutput).not.toHaveBeenCalled();
  });

  it("checkConnectivity delegates to provider.checkConnectivity", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    const latency = await dev.checkConnectivity(5);
    expect(latency).toBe(42);
    expect(wsStub.checkConnectivity).toHaveBeenCalledWith(5);
  });

  it("updateFirmware delegates to provider.updateFirmware", async () => {
    const dev = new ESPDevice(defaultCfg());
    await dev.initialize();
    const buf = Buffer.from("firmware-data");
    const progress = mock(() => {});
    await dev.updateFirmware(buf, progress);
    expect(wsStub.updateFirmware).toHaveBeenCalledWith(buf, progress);
  });
});

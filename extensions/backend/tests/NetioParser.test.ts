import { describe, it, expect } from "bun:test";
import { NetioParser } from "../src/netio-api/discover/NetioParser";
import { Buffer } from "buffer";

// ---------------------------------------------------------------------------
// Helpers – build minimal valid NETIO binary packets
// ---------------------------------------------------------------------------

/**
 * Build a minimal NETIO discovery packet.
 * Header: [0x02, ?, ?] then repeated [ftype, len, ...data] blocks.
 */
function buildPacket(fields: { ftype: number; data: Buffer }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const { ftype, data } of fields) {
    blocks.push(Buffer.from([ftype, data.length]), data);
  }
  // Header: magic 0x02 + two placeholder bytes
  return Buffer.concat([Buffer.from([0x02, 0x00, 0x00]), ...blocks]);
}

function ipToBytes(ip: string): Buffer {
  return Buffer.from(ip.split(".").map(Number));
}

function macToBytes(mac: string): Buffer {
  return Buffer.from(mac.split(":").map((h) => parseInt(h, 16)));
}

// ---------------------------------------------------------------------------
// parseDeviceInfo – valid packets
// ---------------------------------------------------------------------------
describe("NetioParser.parseDeviceInfo – valid packets", () => {
  it("returns empty object for non-0x02 magic byte", () => {
    const buf = Buffer.from([0x01, 0x00, 0x00]);
    const result = NetioParser.parseDeviceInfo(buf);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("parses firmware version (ftype 0x01)", () => {
    const fwBytes = Buffer.from("3.0.1", "utf-8");
    const pkt = buildPacket([{ ftype: 0x01, data: fwBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.fwversion).toBe("3.0.1");
  });

  it("parses MAC address (ftype 0x02) as colon-separated uppercase hex", () => {
    const macBytes = macToBytes("AA:BB:CC:DD:EE:FF");
    const pkt = buildPacket([{ ftype: 0x02, data: macBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.mac).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("parses IP address (ftype 0x03) as dot-separated decimal", () => {
    const ipBytes = ipToBytes("192.168.1.100");
    const pkt = buildPacket([{ ftype: 0x03, data: ipBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.ip).toBe("192.168.1.100");
  });

  it("parses netmask (ftype 0x04)", () => {
    const maskBytes = ipToBytes("255.255.255.0");
    const pkt = buildPacket([{ ftype: 0x04, data: maskBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.mask).toBe("255.255.255.0");
  });

  it("parses hostname (ftype 0x05)", () => {
    const hostBytes = Buffer.from("netio-device", "utf-8");
    const pkt = buildPacket([{ ftype: 0x05, data: hostBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.hostname).toBe("netio-device");
  });

  it("parses product/model (ftype 0x09)", () => {
    const modelBytes = Buffer.from("NETIO4C", "utf-8");
    const pkt = buildPacket([{ ftype: 0x09, data: modelBytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.model).toBe("NETIO4C");
  });

  it("parses manufacturer (ftype 0x0a)", () => {
    const bytes = Buffer.from("NETIO Products", "utf-8");
    const pkt = buildPacket([{ ftype: 0x0a, data: bytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.manufacturer).toBe("NETIO Products");
  });

  it("parses platform (ftype 0x0b)", () => {
    const bytes = Buffer.from("ESP32", "utf-8");
    const pkt = buildPacket([{ ftype: 0x0b, data: bytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.platform).toBe("ESP32");
  });

  it("parses variant (ftype 0x0c)", () => {
    const bytes = Buffer.from("V1", "utf-8");
    const pkt = buildPacket([{ ftype: 0x0c, data: bytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.variant).toBe("V1");
  });

  it("parses pretty platform name (ftype 0x12)", () => {
    const bytes = Buffer.from("NETIO Smart Socket", "utf-8");
    const pkt = buildPacket([{ ftype: 0x12, data: bytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.platformname).toBe("NETIO Smart Socket");
  });

  it("parses device name (ftype 0x13)", () => {
    const bytes = Buffer.from("MyDevice", "utf-8");
    const pkt = buildPacket([{ ftype: 0x13, data: bytes }]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.devicename).toBe("MyDevice");
  });

  it("parses multiple fields in the same packet", () => {
    const pkt = buildPacket([
      { ftype: 0x01, data: Buffer.from("3.0.1", "utf-8") },
      { ftype: 0x02, data: macToBytes("AA:BB:CC:DD:EE:FF") },
      { ftype: 0x03, data: ipToBytes("10.0.0.1") },
      { ftype: 0x05, data: Buffer.from("my-netio", "utf-8") },
      { ftype: 0x09, data: Buffer.from("NETIO4C", "utf-8") },
    ]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.fwversion).toBe("3.0.1");
    expect(result.mac).toBe("AA:BB:CC:DD:EE:FF");
    expect(result.ip).toBe("10.0.0.1");
    expect(result.hostname).toBe("my-netio");
    expect(result.model).toBe("NETIO4C");
  });

  it("silently ignores unknown field types", () => {
    const pkt = buildPacket([
      { ftype: 0xff, data: Buffer.from("unknown", "utf-8") },
      { ftype: 0x01, data: Buffer.from("2.0.0", "utf-8") },
    ]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.fwversion).toBe("2.0.0");
  });

  it("silently ignores ftype 0x06/0x07/0x08/0x0d/0x0e/0x0f", () => {
    const pkt = buildPacket([
      { ftype: 0x06, data: Buffer.from([0x01]) },
      { ftype: 0x07, data: Buffer.from([0x00]) },
      { ftype: 0x08, data: Buffer.from([0x00]) },
      { ftype: 0x01, data: Buffer.from("1.0.0", "utf-8") },
    ]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(result.fwversion).toBe("1.0.0");
    expect(result.dhcp).toBeUndefined();
  });

  it("accepts a string (binary) as input instead of Buffer", () => {
    const pkt = buildPacket([
      { ftype: 0x01, data: Buffer.from("3.0.0", "utf-8") },
    ]);
    const str = pkt.toString("binary");
    const result = NetioParser.parseDeviceInfo(str);
    expect(result.fwversion).toBe("3.0.0");
  });

  it("returns empty object for a packet with only the header", () => {
    const pkt = Buffer.from([0x02, 0x00, 0x00]);
    const result = NetioParser.parseDeviceInfo(pkt);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

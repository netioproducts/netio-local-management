import { Buffer } from "buffer";
import { createLogger } from "../../logging/Logger";

const log = createLogger("NetioParser");

export interface DeviceInfo {
  fwversion?: string;
  mac?: string;
  ip?: string;
  mask?: string;
  hostname?: string;
  model?: string;
  manufacturer?: string;
  platform?: string;
  variant?: string;
  platformname?: string;
  devicename?: string;
  [key: string]: string | undefined; // For any additional properties
}

export class NetioParser {
  /**
   * Parse NETIO Device information from data payload
   */
  public static parseDeviceInfo(data: string | Buffer): DeviceInfo {
    const binarydata = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data, "binary");

    if (binarydata[0] !== 0x02) {
      log.debug("Discovery response is not valid, unexpected header", {
        firstByte: binarydata[0],
        bytes: binarydata.length,
      });
      return {};
    }

    const params: { ftype: number; data: Buffer }[] = [];
    let i = 3; // Skip head
    const datalen = binarydata.length;

    while (i < datalen - 1) {
      const ftype = binarydata[i];
      i += 1;

      if (i >= datalen) break; // Owerflow protection

      const paramlen = binarydata[i];
      i += 1;

      if (i + paramlen <= datalen) {
        const paramData = binarydata.subarray(i, i + paramlen);
        params.push({ ftype: ftype, data: paramData });
      }

      // Move to the next block
      i += paramlen;
    }

    const device: DeviceInfo = {};

    for (const item of params) {
      switch (item.ftype) {
        case 0x01: // FIRMWARE_VERSION
          device.fwversion = item.data.toString("utf-8");
          break;
        case 0x02: // MAC
          device.mac = item.data
            .toString("hex")
            .match(/.{1,2}/g)
            ?.join(":")
            .toUpperCase();
          break;
        case 0x03: // IP
          device.ip = [...item.data].join(".");
          break;
        case 0x04: // NETMASK
          device.mask = [...item.data].join(".");
          break;
        case 0x05: // HOSTNAME
          device.hostname = item.data.toString("utf-8");
          break;
        case 0x06: // DHCP
        case 0x07: // SETUP_STATE
        case 0x08: // RESULT
          break;
        case 0x09: // PRODUCT
          device.model = item.data.toString("utf-8");
          break;
        case 0x0a: // MANUFACTURER
          device.manufacturer = item.data.toString("utf-8");
          break;
        case 0x0b: // PLATFORM
          device.platform = item.data.toString("utf-8");
          break;
        case 0x0c: // VARIANT
          device.variant = item.data.toString("utf-8");
          break;
        case 0x0d: // TIMEOUT
        case 0x0e: // GATEWAY
        case 0x0f: // DNS
          break;
        case 0x12: // PRETTY_PLATFORM_NAME
          device.platformname = item.data.toString("utf-8");
          break;
        case 0x13: // DEVICE_NAME
          device.devicename = item.data.toString("utf-8");
          break;
        default:
          // Unknown type, ignore
          break;
      }
    }

    log.debug("Discovery response parsed", {
      ip: device.ip,
      mac: device.mac,
      fwVersion: device.fwversion,
      model: device.model,
      params: params.length,
    });
    return device;
  }
}

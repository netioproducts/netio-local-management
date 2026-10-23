import { DiscoverNetio } from "../netio-api/discover/DiscoverNetio";
import { ConfigService } from "../config/ConfigService";
import { DeviceManager } from "./DeviceManager";
import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { getBasicDeviceInfo } from "../netio-api/transport/univarsal";
import { createLogger } from "../logging/Logger";

const log = createLogger("DeviceDiscoveryService");

export class DeviceDiscoveryService {
  private discover: DiscoverNetio;

  constructor(
    private deviceManager: DeviceManager,
    private configService: ConfigService,
  ) {
    this.discover = new DiscoverNetio();
  }

  public async searchDevices(): Promise<void> {
    const startedAt = Date.now();
    log.debug("Device search started");
    const knownBefore = this.deviceManager.getAllDevices().length;
    const foundDevices = (await this.discover.runAutoScan()).map((d) =>
      d.parse(),
    );
    await this.deviceManager.loadFromDiscover(foundDevices);
    log.info("Device search finished", {
      found: foundDevices.length,
      new: this.deviceManager.getAllDevices().length - knownBefore,
      total: this.deviceManager.getAllDevices().length,
      durationMs: Date.now() - startedAt,
    });
  }

  public async discoverOnlineDevices(
    devices: RuntimeDevice[],
  ): Promise<RuntimeDevice[]> {
    const uniqueIPs = new Set(devices.map((d) => d.getConfig().ipAddress));
    const activeDevicesMap = new Map<string, string>(); // mac -> ip
    await Promise.all(
      Array.from(uniqueIPs).map((ip) =>
        getBasicDeviceInfo({ host: ip })
          .then((info) => {
            log.debug("Device is online", { ip, mac: info.data.deviceSN });
            activeDevicesMap.set(
              DeviceManager.normalizeMac(info.data.deviceSN),
              ip,
            );
          })
          .catch((error) => {
            log.debug("Device is not reachable", {
              ip,
              reason: error instanceof Error ? error.message : String(error),
            });
            return undefined;
          }),
      ),
    );

    const discoveredDevices = Array.from(activeDevicesMap.keys())
      .map((mac) => devices.find((d) => d.getConfig().macAddress === mac))
      .filter((d): d is RuntimeDevice => d !== undefined);

    const updatedDevices = discoveredDevices.map((d) => {
      const newIp = activeDevicesMap.get(d.getConfig().macAddress);
      if (newIp && d.getConfig().ipAddress !== newIp) {
        log.debug("Online device answered on a different IP", {
          mac: d.getConfig().macAddress,
          oldIp: d.getConfig().ipAddress,
          ip: newIp,
        });
        this.deviceManager.loadFromDiscover([
          {
            mac: d.getConfig().macAddress,
            ip: newIp,
            fwversion: d.getConfig().fwVersion || "unknown",
            model: d.getConfig().model,
            hostname: d.originalName || undefined,
          },
        ]);
        const updated = this.deviceManager.getDevice(d.getConfig().macAddress)!;
        updated.isOnline = true;
        return updated;
      }
      d.isOnline = true;
      return d;
    });

    log.debug("Online check finished", {
      checked: devices.length,
      online: updatedDevices.length,
    });
    return updatedDevices;
  }

  public getUngroupedDevicesList(): RuntimeDevice[] {
    const groupedMacs = new Set(
      this.configService
        .getConfig()
        .deviceGroups.flatMap((group) => group.devices),
    );

    return this.deviceManager
      .getAllDevices()
      .filter((device) => !groupedMacs.has(device.getConfig().macAddress));
  }
}

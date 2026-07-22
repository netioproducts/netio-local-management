import { DiscoverNetio } from "../netio-api/discover/DiscoverNetio";
import { ConfigService } from "../config/ConfigService";
import { DeviceManager } from "./DeviceManager";
import { RuntimeDevice } from "../netio-api/services/RuntimeDevice";
import { getBasicDeviceInfo } from "../netio-api/transport/univarsal";

export class DeviceDiscoveryService {
  private discover: DiscoverNetio;

  constructor(
    private deviceManager: DeviceManager,
    private configService: ConfigService,
  ) {
    this.discover = new DiscoverNetio();
  }

  public async searchDevices(): Promise<void> {
    const foundDevices = (await this.discover.runAutoScan()).map((d) =>
      d.parse(),
    );
    await this.deviceManager.loadFromDiscover(foundDevices);
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
            console.debug(
              `[DeviceDiscoveryService] Device at IP ${ip} is online with MAC ${info.data.deviceSN}`,
            );
            activeDevicesMap.set(
              DeviceManager.normalizeMac(info.data.deviceSN),
              ip,
            );
          })
          .catch(() => undefined),
      ),
    );

    const discoveredDevices = Array.from(activeDevicesMap.keys())
      .map((mac) => devices.find((d) => d.getConfig().macAddress === mac))
      .filter((d): d is RuntimeDevice => d !== undefined);

    const updatedDevices = discoveredDevices.map((d) => {
      const newIp = activeDevicesMap.get(d.getConfig().macAddress);
      if (newIp && d.getConfig().ipAddress !== newIp) {
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

import * as dgram from "dgram";
import * as os from "os";
import { exec, execFile } from "child_process";

import { DeviceInfo, NetioParser } from "./NetioParser";

export interface DeviceResult {
  ip: string;
  rawMessage: Buffer;
  parse(): DeviceInfo;
}

interface NetioVersionResponse {
  data?: {
    version?: string;
    hostname?: string;
    platform?: string;
    variant?: string;
    deviceSN?: string;
    mac?: string;
    macAddress?: string;
  };
}

export class DiscoverNetio {
  private socket: dgram.Socket | null = null;
  private readonly LISTEN_PORT = 62386;
  private readonly PUBLISH_PORT = 62387;

  private readonly MAX_SWEEP_HOSTS_PER_INTERFACE = 4096;
  private readonly PING_SWEEP_CONCURRENCY = 64;
  private readonly PING_TIMEOUT_MS = 800;
  private readonly API_PROBE_CONCURRENCY = 24;
  private readonly API_TIMEOUT_MS = 1500;

  private isScanning = false;
  private firewallFixAttempted = false;
  private pingCommandMissingLogged = false;

  /**
   * Starts a scan, waits 'timeoutMs', and returns an array of found devices.
   * If no devices are found on Linux, attempts to open firewall ports and retries once.
   * First tries to discover devices via UDP broadcast, then falls back to ping sweep + API probe if needed.
   * @param payload The UDP payload to send for discovery.
   * @param timeoutMs How long to wait for responses (default 3000ms).
   * @returns Promise resolving to an array of found devices.
   */
  public async runAutoScan(
    payload: Buffer = Buffer.from("011100", "hex"),
    timeoutMs: number = 3000,
  ): Promise<DeviceResult[]> {
    let foundDevices: DeviceResult[] = [];
    try {
      foundDevices = await this.performScan(payload, timeoutMs);
      console.log(
        `[DiscoverNetio] Initial scan found ${foundDevices.length} device(s).`,
      );
    } catch (error: any) {
      console.warn(`[DiscoverNetio] Broadcast scan failed:`, error.message);
    }

    // If no devices found on Linux and we haven't tried fixing firewall yet
    if (
      foundDevices.length === 0 &&
      process.platform === "linux" &&
      !this.firewallFixAttempted
    ) {
      console.log(
        "[DiscoverNetio] No devices found. Attempting to open firewall ports...",
      );
      this.firewallFixAttempted = true;

      try {
        await allowPortOnLinux();

        console.log("[DiscoverNetio] Firewall ports opened. Retrying scan...");
        foundDevices = await this.performScan(payload, timeoutMs);
      } catch (error) {
        console.warn("[DiscoverNetio] Failed to open firewall ports:", error);
      }
    }

    if (foundDevices.length === 0) {
      console.log(
        "[DiscoverNetio] No devices found via broadcast. Trying ping sweep fallback...",
      );
      const fallbackDevices = await this.performPingSweepFallback(
        payload,
        timeoutMs,
      );
      if (fallbackDevices.length > 0) {
        return fallbackDevices;
      }
    }

    console.log(
      `[DiscoverNetio] Discovery complete. Total devices found: ${foundDevices.length}.`,
    );
    return foundDevices;
  }

  private performScan(
    payload: Buffer,
    timeoutMs: number,
    targets?: string[],
  ): Promise<DeviceResult[]> {
    return new Promise((resolve, reject) => {
      if (this.isScanning) {
        // If a scan is already running, immediately reject
        reject(new Error("Scan already in progress"));
        return;
      }

      this.isScanning = true;
      const foundDevices: DeviceResult[] = [];

      try {
        this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

        this.socket.on("message", (msg, rinfo) => {
          const exists = foundDevices.some((d) => d.ip === rinfo.address);
          if (!exists) {
            foundDevices.push({
              ip: rinfo.address,
              rawMessage: msg,
              parse: () => NetioParser.parseDeviceInfo(msg),
            });
          }
        });

        this.socket.on("error", (err) => {
          this.cleanup();
          reject(err);
        });

        this.socket.bind(this.LISTEN_PORT, "0.0.0.0", () => {
          if (!this.socket) return;
          this.socket.setBroadcast(true);

          if (targets && targets.length > 0) {
            this.sendToTargets(payload, targets);
          } else {
            this.broadcastToAllInterfaces(payload);
          }
        });

        setTimeout(() => {
          this.cleanup();
          resolve(foundDevices);
        }, timeoutMs);
      } catch (err) {
        this.cleanup();
        reject(err);
      }
    });
  }

  private async performPingSweepFallback(
    _payload: Buffer,
    timeoutMs: number,
  ): Promise<DeviceResult[]> {
    const sweepTargets = this.getSweepTargets();
    if (sweepTargets.length === 0) {
      return [];
    }

    console.log(
      `[DiscoverNetio] Ping sweep will check ${sweepTargets.length} host(s).`,
    );
    const responsiveTargets = await this.pingSweep(sweepTargets);

    if (responsiveTargets.length === 0) {
      console.log("[DiscoverNetio] Ping sweep found no responsive hosts.");
      return [];
    }

    console.log(
      `[DiscoverNetio] Ping sweep found ${responsiveTargets.length} responsive host(s). Verifying NETIO API...`,
    );
    return this.discoverByApi(responsiveTargets, timeoutMs);
  }

  private async discoverByApi(
    targets: string[],
    timeoutMs: number,
  ): Promise<DeviceResult[]> {
    const queue = [...targets];
    const foundDevices: DeviceResult[] = [];
    const uniqueIps = new Set<string>();

    const workers = Array.from(
      { length: Math.min(this.API_PROBE_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const target = queue.pop();
          if (!target) return;

          const result = await this.probeNetioApi(target, timeoutMs);
          if (result && !uniqueIps.has(result.ip)) {
            uniqueIps.add(result.ip);
            foundDevices.push(result);
          }
        }
      },
    );

    await Promise.all(workers);
    console.log(
      `[DiscoverNetio] API verification found ${foundDevices.length} NETIO device(s).`,
    );

    return foundDevices;
  }

  private async probeNetioApi(
    host: string,
    timeoutMs: number,
  ): Promise<DeviceResult | null> {
    let response: NetioVersionResponse;

    try {
      response = await this.fetchNetioVersion(host, timeoutMs);
    } catch (_err) {
      return null;
    }

    if (!this.looksLikeNetioResponse(response)) {
      return null;
    }

    const data = response.data ?? {};
    const resolvedMac = this.normalizeMac(
      data.mac ?? data.macAddress ?? this.macFromDeviceSerial(data.deviceSN),
    );

    if (!resolvedMac || !data.version) {
      console.debug(
        `[DiscoverNetio] Skipping ${host}: NETIO API responded but required fields are missing.`,
      );
      return null;
    }

    const parsedInfo: DeviceInfo = {
      ip: host,
      mac: resolvedMac,
      fwversion: data.version,
      hostname: data.hostname,
      platform: data.platform,
      variant: data.variant,
    };

    return {
      ip: host,
      rawMessage: Buffer.from(JSON.stringify(response), "utf-8"),
      parse: () => parsedInfo,
    };
  }

  private async fetchNetioVersion(
    host: string,
    timeoutMs: number,
  ): Promise<NetioVersionResponse> {
    const probeTimeout = Math.max(
      400,
      Math.min(timeoutMs, this.API_TIMEOUT_MS),
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), probeTimeout);

    try {
      const response = await fetch(`http://${host}/api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "getVersion",
          sessionId: "",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as NetioVersionResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private looksLikeNetioResponse(response: NetioVersionResponse): boolean {
    const data = response.data;
    if (!data) {
      return false;
    }

    return (
      !!data.version && (!!data.hostname || !!data.platform || !!data.deviceSN)
    );
  }

  private macFromDeviceSerial(serial?: string): string | null {
    if (!serial) {
      return null;
    }

    const compact = serial.replace(/[^0-9a-fA-F]/g, "");
    if (compact.length < 12) {
      return null;
    }

    const tail = compact.slice(-12).toUpperCase();
    const parts = tail.match(/.{1,2}/g);
    if (!parts || parts.length !== 6) {
      return null;
    }

    return parts.join(":");
  }

  private normalizeMac(mac: string | null | undefined): string | null {
    if (!mac) {
      return null;
    }

    const compact = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    if (compact.length !== 12) {
      return null;
    }

    const parts = compact.match(/.{1,2}/g);
    if (!parts || parts.length !== 6) {
      return null;
    }

    return parts.join(":");
  }

  private cleanup() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
    this.isScanning = false;
  }

  private broadcastToAllInterfaces(payload: Buffer) {
    if (!this.socket) return;
    const message = payload;
    const targets = this.getBroadcastAddresses();

    targets.forEach((ip) => {
      try {
        this.socket?.send(message, 0, message.length, this.PUBLISH_PORT, ip);
      } catch (e) {
        console.error(`Send error ${ip}:`, e);
      }
    });
  }

  private sendToTargets(payload: Buffer, targets: string[]) {
    if (!this.socket) return;
    const message = payload;

    targets.forEach((ip) => {
      try {
        this.socket?.send(message, 0, message.length, this.PUBLISH_PORT, ip);
      } catch (e) {
        console.error(`Send error ${ip}:`, e);
      }
    });
  }

  private async pingSweep(targets: string[]): Promise<string[]> {
    const queue = [...targets];
    const responsive = new Set<string>();
    const workers = Array.from(
      { length: Math.min(this.PING_SWEEP_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const target = queue.pop();
          if (!target) return;

          const isAlive = await this.pingHost(target);
          if (isAlive) {
            responsive.add(target);
          }
        }
      },
    );

    await Promise.all(workers);
    return [...responsive];
  }

  private pingHost(host: string): Promise<boolean> {
    const args = this.getPingArgs(host);

    return new Promise((resolve) => {
      execFile(
        "ping",
        args,
        { timeout: this.PING_TIMEOUT_MS, windowsHide: true },
        (error) => {
          if (
            error &&
            (error as NodeJS.ErrnoException).code === "ENOENT" &&
            !this.pingCommandMissingLogged
          ) {
            this.pingCommandMissingLogged = true;
            console.warn(
              "[DiscoverNetio] 'ping' command is not available. Ping sweep fallback is disabled.",
            );
          }
          resolve(!error);
        },
      );
    });
  }

  private getPingArgs(host: string): string[] {
    if (process.platform === "win32") {
      return ["-n", "1", "-w", String(this.PING_TIMEOUT_MS), host];
    }

    if (process.platform === "darwin") {
      return ["-c", "1", "-W", String(this.PING_TIMEOUT_MS), host];
    }

    // Linux uses seconds for -W, so round up from milliseconds.
    const timeoutSec = Math.max(1, Math.ceil(this.PING_TIMEOUT_MS / 1000));
    return ["-c", "1", "-W", String(timeoutSec), host];
  }

  private getSweepTargets(): string[] {
    const interfaces = os.networkInterfaces();
    const targets = new Set<string>();

    Object.keys(interfaces).forEach((ifaceName) => {
      const ifaceDetails = interfaces[ifaceName];
      if (!ifaceDetails) return;

      ifaceDetails.forEach((details) => {
        if (details.family !== "IPv4" || details.internal) {
          return;
        }

        const ipInt = this.ipToInt(details.address);
        const maskInt = this.ipToInt(details.netmask);
        const network = (ipInt & maskInt) >>> 0;
        const broadcast = (network | (~maskInt >>> 0)) >>> 0;
        const hostCount = Math.max(0, broadcast - network - 1);

        if (hostCount === 0) {
          return;
        }

        if (hostCount > this.MAX_SWEEP_HOSTS_PER_INTERFACE) {
          console.warn(
            `[DiscoverNetio] Skipping interface ${ifaceName}: ${hostCount} hosts exceeds limit ${this.MAX_SWEEP_HOSTS_PER_INTERFACE}.`,
          );
          return;
        }

        for (let hostInt = network + 1; hostInt < broadcast; hostInt += 1) {
          if (hostInt === ipInt) continue;
          targets.add(this.intToIp(hostInt));
        }
      });
    });

    return [...targets];
  }

  private ipToInt(ip: string): number {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
      return 0;
    }

    return parts.reduce((acc, part) => ((acc << 8) | (part & 255)) >>> 0, 0);
  }

  private intToIp(ip: number): string {
    return [
      (ip >>> 24) & 255,
      (ip >>> 16) & 255,
      (ip >>> 8) & 255,
      ip & 255,
    ].join(".");
  }

  private getBroadcastAddresses(): string[] {
    const interfaces = os.networkInterfaces();
    const targets: string[] = []; //['255.255.255.255'];

    Object.keys(interfaces).forEach((ifaceName) => {
      const ifaceDetails = interfaces[ifaceName];

      if (!ifaceDetails) return;

      ifaceDetails.forEach((details) => {
        if (details.family === "IPv4" && !details.internal) {
          const ipParts = details.address.split(".").map(Number);
          const maskParts = details.netmask.split(".").map(Number);
          const broadcastParts = ipParts.map(
            (part, index) => (part | (~maskParts[index] & 255)) >>> 0,
          );

          targets.push(broadcastParts.join("."));
        }
      });
    });
    return targets;
  }
}

// Helper function to allow UDP ports on Linux using pkexec
export function allowPortOnLinux() {
  return new Promise((resolve, reject) => {
    const cmd = `
      export PATH=$PATH:/usr/sbin:/sbin:/usr/local/sbin;

      if command -v firewall-cmd > /dev/null; then
        FW_CMD=$(command -v firewall-cmd)
        pkexec sh -c "$FW_CMD --zone=public --add-port=62386/udp --add-port=62387/udp && $FW_CMD --zone=public --add-port=62386/udp --add-port=62387/udp --permanent";
      elif command -v ufw > /dev/null; then
        UFW_CMD=$(command -v ufw)
        pkexec sh -c "$UFW_CMD allow 62386/udp && $UFW_CMD allow 62387/udp";
      elif command -v iptables > /dev/null; then
        IPT_CMD=$(command -v iptables)
        pkexec sh -c "$IPT_CMD -I INPUT 1 -p udp --dport 62386 -j ACCEPT && $IPT_CMD -I INPUT 1 -p udp --dport 62387 -j ACCEPT";
      else
        exit 1;
      fi
    `;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(
          "User denied permission or firewall doesn't exist:",
          error,
        );
        reject(error);
      } else {
        console.log("Ports 62386 and 62387 successfully allowed.");
        resolve(true);
      }
    });
  });
}

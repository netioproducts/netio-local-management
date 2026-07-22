import { EventEmitter } from "events";

export interface NormalizedOutput {
  id: number;
  name: string;
  state: boolean;
  load?: number;
}

export interface NormalizedSystemInfo {
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  name: string;
  outputCount: number;
}

export interface NormalizedOutputStatus {
  id: number;
  state: boolean;
  load?: number;
  energy?: number;
  reverseEnergy?: number;
  energyNR?: number;
  reverseEnergyNR?: number;
  current?: number;
  voltage?: number;
  powerFactor?: number;
  phase?: number;
  frequency?: number;
}

export interface INetioProvider extends EventEmitter {
  /**
   * Connect to the device
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the device
   */
  disconnect(): void;

  /**
   * Get device information
   * @returns NormalizedSystemInfo
   */
  getSystemInfo(): Promise<NormalizedSystemInfo>;

  /**
   * Get all available information from the device
   * @returns Any available information (structure may vary by device)
   */
  getAllInfo(): Promise<any>;

  /**
   * Get status of all outputs
   * @returns Promise<NormalizedOutput[]>
   */
  getOutputs(): Promise<NormalizedOutput[]>;

  /**
   * Set the state of an output
   * @param id Output ID
   * @param state New state (true = ON, false = OFF)
   */
  setOutput(id: number, state: boolean): Promise<void>;

  /**
   * Check device connectivity
   * @param timeoutSec Timeout in seconds
   * @returns Promise<number> Latency in milliseconds, or -1 if unreachable
   */
  checkConnectivity(timeoutSec?: number): Promise<number>;

  /**
   * Update device firmware
   * @param fileBuffer Buffer containing the firmware file
   * @param onProgress Optional callback for progress updates (0-100%)
   */
  updateFirmware(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void>;

  /**
   * Stop asking for output status updates
   */
  stopAskingStatus(): Promise<void>;

  /**
   * Start asking for output status updates (if supported by the provider)
   */
  startAskingStatus(): Promise<void>;

  /**
   * Factory reset the device to default settings
   */
  factoryReset(): Promise<void>;

  /**
   * Send a command to locate the device - blink LEDs
   */
  locateDevice(): Promise<void>;

  /**
   * Import configuration to the device
   * @param fileBuffer Buffer containing the configuration file
   * @param onProgress Optional callback for progress updates (0-100%)
   */
  importConfig(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void>;

  /**
   * Export configuration from the device
   * @returns JSON configuration object
   */
  exportConfig(): Promise<any>;
}

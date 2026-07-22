import { NormalizedOutput, NormalizedSystemInfo } from "../providers/NetioProvider";

export interface IDeviceClient {
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  getSystemInfo(): Promise<NormalizedSystemInfo>;
  getAllInfo(): Promise<any>;
  getOutputs(): Promise<NormalizedOutput[]>;
  
  setOutput(outputId: number, state: boolean): Promise<void>;
  toggleOutput(outputId: number): Promise<void>;
  
  checkConnectivity(timeoutSec?: number): Promise<number>;
  
  updateFirmware(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void>;
  
  importConfig(
    fileBuffer: Buffer,
    onProgress?: (progress: number, status: string) => void,
  ): Promise<void>;
  
  exportConfig(): Promise<any>;
  
  stopAskingStatus(): Promise<void>;
  startAskingStatus(): Promise<void>;
  
  factoryReset(): Promise<void>;
  locateDevice(): Promise<void>;
  
  on(event: string | symbol, listener: (...args: any[]) => void): this;
}

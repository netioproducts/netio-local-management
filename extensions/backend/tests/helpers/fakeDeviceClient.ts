import { EventEmitter } from "events";

/**
 * Plain device client stub independent of ESPDevice, counts calls of selected methods.
 * Methods can be replaced through overrides.
 */
export function makeFakeClient(overrides: Record<string, any> = {}) {
  const calls = {
    initialize: 0,
    startAskingStatus: 0,
    stopAskingStatus: 0,
    locateDevice: 0,
    updateFirmware: 0,
  };
  return Object.assign(new EventEmitter(), {
    calls,
    initialize: async () => {
      calls.initialize++;
    },
    disconnect: async () => {},
    reconnect: async () => {},
    startAskingStatus: async () => {
      calls.startAskingStatus++;
    },
    stopAskingStatus: async () => {
      calls.stopAskingStatus++;
    },
    factoryReset: async () => {},
    locateDevice: async () => {
      calls.locateDevice++;
    },
    updateFirmware: async () => {
      calls.updateFirmware++;
    },
    importConfig: async () => {},
    exportConfig: async () => ({}),
    checkConnectivity: async () => 1,
    setOutput: async () => {},
    getAllInfo: async () => ({}),
    getSystemInfo: async () => ({
      model: "NETIO4C",
      serialNumber: "aabbccddeeff",
      firmwareVersion: "3.0.0",
      name: "Lab",
      outputCount: 1,
    }),
    getOutputs: async () => [{ id: 1, name: "Out 1", state: true }],
    ...overrides,
  });
}

export type FakeClient = ReturnType<typeof makeFakeClient>;

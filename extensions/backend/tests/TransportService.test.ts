/**
 * TransportService tests – error responses sent to the frontend.
 * The constructor reads Neutralino settings from stdin, so the service is created
 * from its prototype with a stubbed extension.
 */
import { describe, it, expect } from "bun:test";
import { TransportService } from "../src/transport/TransportService";
import { DeviceBusyError } from "../src/netio-api/types/Errors";

function createTransport(routes: Record<string, any>) {
  const sent: { event: string; data: any }[] = [];
  const transport = Object.create(TransportService.prototype) as any;
  transport.ext = {
    sendMessage: (event: string, data: any) => sent.push({ event, data }),
  };
  transport.routes = routes;
  transport.debug = false;
  transport.frontendConnected = true;
  transport.messageQueue = [];
  return { transport, sent };
}

const call = (transport: any, fn: string) =>
  transport.handleIncomingMessage({
    event: "runNode",
    data: { function: fn, requestId: 7, parameter: {} },
  });

describe("TransportService – error responses", () => {
  it("sends message, code and details of a thrown error", async () => {
    const { transport, sent } = createTransport({
      busy: () => {
        throw new DeviceBusyError("Device Lab is busy: firmware update.", {
          macAddress: "aabbccddeeff",
          operation: "firmware update",
        });
      },
    });

    await call(transport, "busy");

    expect(sent).toEqual([
      {
        event: "responseNode",
        data: {
          success: false,
          error: "Device Lab is busy: firmware update.",
          code: "DeviceBusyError",
          details: { macAddress: "aabbccddeeff", operation: "firmware update" },
          requestId: 7,
        },
      },
    ]);
  });

  it("uses a generic code for non-Error throws", async () => {
    const { transport, sent } = createTransport({
      weird: () => {
        throw "plain string";
      },
    });

    await call(transport, "weird");
    expect(sent[0].data.error).toBe("plain string");
    expect(sent[0].data.code).toBe("Error");
  });

  it("reports unknown functions", async () => {
    const { transport, sent } = createTransport({});
    await call(transport, "missing");
    expect(sent[0].data.code).toBe("UnknownFunction");
  });
});

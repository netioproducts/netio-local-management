export class MacAddressMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacAddressMismatchError";
  }
}

export class ClientNotInitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientNotInitializedError";
  }
}

export class BadResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadResponseError";
  }
}

export class DeviceOfflineError extends Error {
  constructor(message: string = "Device is offline") {
    super(message);
    this.name = "DeviceOfflineError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class DeviceBusyError extends Error {
  constructor(
    message: string,
    public readonly details: { macAddress: string; operation: string },
  ) {
    super(message);
    this.name = "DeviceBusyError";
  }
}

/**
 * Message of an error for log context, works for any thrown value.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

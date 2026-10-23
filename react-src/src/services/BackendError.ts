/**
 * Error of a request to the app backend.
 * `code` is the backend error class name (e.g. "DeviceBusyError"), or "Timeout" / "TransportError"
 * for failures of the transport itself. `details` carries structured data of the error.
 */
export class BackendError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

import { BackendError } from "./BackendError";

type NotificationType = "success" | "error" | "info" | "warning";

interface NotificationEvent {
  type: NotificationType;
  title: string;
  message: string;
}

class NotificationService {
  private listeners: ((notification: NotificationEvent) => void)[] = [];

  subscribe(listener: (notification: NotificationEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(notification: NotificationEvent) {
    this.listeners.forEach((listener) => listener(notification));
  }

  success(title: string, message: string) {
    this.emit({ type: "success", title, message });
  }

  error(title: string, message: string) {
    this.emit({ type: "error", title, message });
  }

  info(title: string, message: string) {
    this.emit({ type: "info", title, message });
  }

  warning(title: string, message: string) {
    this.emit({ type: "warning", title, message });
  }
}

export const notify = new NotificationService();

/**
 * Shows a failed request to the user. The only place turning request errors into toasts,
 * callers pass the caught error and a title describing the failed action.
 */
export function notifyError(title: string, err: unknown): void {
  if (err instanceof BackendError) {
    if (err.code === "DeviceBusyError") {
      notify.error("Device busy", err.message);
      return;
    }
    if (err.code === "Timeout") {
      notify.error(title, "The application backend did not respond.");
      return;
    }
  }

  let message = "Unknown error";
  if (err instanceof Error) message = err.message;
  else if (typeof err === "string") message = err;
  notify.error(title, message);
}

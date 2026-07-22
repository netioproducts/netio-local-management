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
}

export const notify = new NotificationService();

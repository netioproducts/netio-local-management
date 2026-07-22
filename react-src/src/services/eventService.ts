import { EventMap, EventKey } from "../models/Events";

type Listener<K extends EventKey> = (data: EventMap[K]) => void;

class EventService {
  private listeners = new Map<EventKey, Listener<any>[]>();

  /**
   * Subscribe
   * @param event - Event name
   * @param callback - Callback function
   * @returns Function to unsubscribe (cleanup)
   */
  on<K extends EventKey>(event: K, callback: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(callback);

    console.debug(`[EventService] Subscribed: ${event}`);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe
   * @param event - Event name
   * @param callback - Specific function to remove
   */
  off<K extends EventKey>(event: K, callback: Listener<K>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    const index = eventListeners.indexOf(callback);
    if (index > -1) {
      eventListeners.splice(index, 1);
    }
  }

  /**
   * Publishing
   * @param event - Event name
   * @param data - Event data (must match the type in EventMap!)
   */
  emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    const eventListeners = this.listeners.get(event);

    if (eventListeners && eventListeners.length > 0) {
      console.debug(`[EventService] Emitting '${event}'`, data);
      eventListeners.forEach((callback) => callback(data));
    }
  }
}

export const eventService = new EventService();

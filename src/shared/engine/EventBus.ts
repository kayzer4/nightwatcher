type EventHandler = (...args: unknown[]) => void;

class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }
}

export const eventBus = new EventBus();

export const GAME_EVENTS = {
  TOGGLE_LIGHT: "toggle_light",
  CITIZEN_MOVED: "citizen_moved",
  TIME_UPDATED: "time_updated",
} as const;

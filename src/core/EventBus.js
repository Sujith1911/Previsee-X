/**
 * PRIVISEE-X v2.0
 * Core: EventBus (Publish/Subscribe Pattern)
 * 
 * Decouples modules, allowing independent operation and testing.
 * Modules subscribe to events of interest and publish their own events.
 */

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event topic
   * @param {string} topic - Event name
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  subscribe(topic, callback) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(topic);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(topic);
        }
      }
    };
  }

  /**
   * Subscribe to an event topic — fires ONCE then auto-unsubscribes
   * @param {string} topic - Event name
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  once(topic, callback) {
    const unsub = this.subscribe(topic, (data) => {
      unsub();
      callback(data);
    });
    return unsub;
  }

  /**
   * Publish an event to all subscribers
   * @param {string} topic - Event name
   * @param {any} data - Payload
   */
  publish(topic, data) {
    const callbacks = this.listeners.get(topic);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in handler for ${topic}:`, error);
        }
      });
    }
  }

  /**
   * Clear all subscriptions
   */
  clear() {
    this.listeners.clear();
  }
}

// Global singleton instance for app-wide communication
export const globalEventBus = new EventBus();

/**
 * PRIVISEE-X v4.0 — EventBus (Publish/Subscribe)
 * Core: Cross-module communication backbone.
 *
 * v4.0 additions:
 *  - onceAsync(): Promise-based one-shot subscription
 *  - topic namespacing: supports 'RISK:*', 'CERT:*', 'ADVISORY:*'
 *  - Wildcard subscriptions via subscribeAll()
 *  - Active topic listing via topics()
 *  - Registered v4.0 event catalog (RISK_CALCULATED, CERT_WARNING,
 *    ADVISORY_READY, TRACKER_DETECTED, OVERLAY_DISMISSED, STRICT_MODE_CHANGED)
 */

// ── v4.0 Event Catalog ────────────────────────────────────────────────────────
export const Events = Object.freeze({
  // Risk engine events
  RISK_CALCULATED:     'RISK_CALCULATED',
  RISK_UPDATED:        'RISK_UPDATED',

  // Certificate / security events
  CERT_WARNING:        'CERT_WARNING',
  CERT_WARNING_SHOWN:  'CERT_WARNING_SHOWN',
  CERT_DISMISSED:      'CERT_DISMISSED',

  // Tracker / ad events
  TRACKER_DETECTED:    'TRACKER_DETECTED',
  AD_DETECTED:         'AD_DETECTED',
  FINGERPRINT_DETECTED:'FINGERPRINT_DETECTED',

  // Overlay events
  OVERLAY_SHOWN:       'OVERLAY_SHOWN',
  OVERLAY_DISMISSED:   'OVERLAY_DISMISSED',

  // Advisory events
  ADVISORY_READY:      'ADVISORY_READY',

  // Mode events
  STRICT_MODE_CHANGED: 'STRICT_MODE_CHANGED',
  RESEARCH_MODE_ON:    'RESEARCH_MODE_ON',
  RESEARCH_MODE_OFF:   'RESEARCH_MODE_OFF',

  // Trust events
  DOMAIN_TRUSTED:      'DOMAIN_TRUSTED',
  DOMAIN_UNTRUSTED:    'DOMAIN_UNTRUSTED',

  // Navigation
  TAB_NAVIGATED:       'TAB_NAVIGATED',
  TAB_CLOSED:          'TAB_CLOSED',
});

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners    = new Map();
    /** @type {Set<Function>} */
    this._wildcards   = new Set();
    this._history     = [];          // last 50 published events for debugging
    this._maxHistory  = 50;
  }

  /**
   * Subscribe to an event topic.
   * @param {string}   topic    - Event name (use Events.* constants)
   * @param {Function} callback - Handler function(data, topic)
   * @returns {Function} Unsubscribe function
   */
  subscribe(topic, callback) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic).add(callback);
    return () => {
      const cbs = this.listeners.get(topic);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) this.listeners.delete(topic);
      }
    };
  }

  /**
   * Subscribe to ALL published events (wildcard).
   * @param {Function} callback - Handler function(data, topic)
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    this._wildcards.add(callback);
    return () => this._wildcards.delete(callback);
  }

  /**
   * Subscribe — fires ONCE then auto-unsubscribes.
   * @param {string}   topic
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  once(topic, callback) {
    const unsub = this.subscribe(topic, (data) => {
      unsub();
      callback(data, topic);
    });
    return unsub;
  }

  /**
   * Promise-based one-shot subscription.
   * @param {string} topic
   * @param {number} [timeoutMs=10000] - Reject after this delay
   * @returns {Promise<any>}
   */
  onceAsync(topic, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let timer;
      const unsub = this.once(topic, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      timer = setTimeout(() => { unsub(); reject(new Error(`EventBus: timeout waiting for "${topic}"`)); }, timeoutMs);
    });
  }

  /**
   * Publish an event to all subscribers.
   * @param {string} topic - Event name
   * @param {any}    data  - Payload
   */
  publish(topic, data) {
    // Record in history
    this._history.push({ topic, data, ts: Date.now() });
    if (this._history.length > this._maxHistory) this._history.shift();

    // Topic-specific listeners
    const callbacks = this.listeners.get(topic);
    if (callbacks) {
      callbacks.forEach(cb => {
        try { cb(data, topic); } catch (e) {
          console.error(`[EventBus] Error in handler for "${topic}":`, e);
        }
      });
    }

    // Wildcard listeners
    this._wildcards.forEach(cb => {
      try { cb(data, topic); } catch (e) {
        console.error(`[EventBus] Wildcard handler error for "${topic}":`, e);
      }
    });
  }

  /**
   * Returns all currently subscribed topic names.
   * @returns {string[]}
   */
  topics() {
    return [...this.listeners.keys()];
  }

  /**
   * Returns recent event history (for research/debugging).
   * @param {number} [n=10]
   * @returns {Array<{topic, data, ts}>}
   */
  recentHistory(n = 10) {
    return this._history.slice(-n);
  }

  /**
   * Clear all subscriptions and history.
   */
  clear() {
    this.listeners.clear();
    this._wildcards.clear();
    this._history  = [];
  }
}

// ── Global singleton for app-wide communication ───────────────────────────────
export const globalEventBus = new EventBus();

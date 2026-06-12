/**
 * PRIVISEE-X v5.0 — Central State Manager
 * Single source of truth for all popup UI state.
 * Flow: Storage → StateManager.setState() → subscribers → UI render
 */
'use strict';

(function () {
  class StateManager {
    constructor() {
      this._state   = {};
      this._subs    = [];
      this._prevState = {};
    }

    /** Get full current state or a single key */
    get(key) {
      return key ? this._state[key] : { ...this._state };
    }

    /**
     * Merge partial state; notify all subscribers.
     * @param {Object} partial - keys/values to merge into state
     * @param {boolean} [silent=false] - skip notifying subscribers
     */
    setState(partial, silent = false) {
      this._prevState = { ...this._state };
      Object.assign(this._state, partial);
      if (!silent) this._notify(partial);
    }

    /** Return previous state snapshot */
    getPrev() {
      return { ...this._prevState };
    }

    /**
     * Subscribe to state changes.
     * @param {(newState, changedKeys) => void} fn
     * @returns {() => void} unsubscribe function
     */
    subscribe(fn) {
      this._subs.push(fn);
      return () => { this._subs = this._subs.filter(s => s !== fn); };
    }

    _notify(changed) {
      const keys = Object.keys(changed);
      const snapshot = { ...this._state };
      for (const fn of this._subs) {
        try { fn(snapshot, keys); } catch (e) { console.error('[StateManager]', e); }
      }
    }

    /** Reset all state */
    reset() {
      this._prevState = { ...this._state };
      this._state = {};
      this._notify({});
    }
  }

  // Expose global singleton
  window.StateManager = new StateManager();
})();

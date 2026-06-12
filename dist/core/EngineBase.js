/**
 * PRIVISEE-X v2.0
 * Core: EngineBase
 * 
 * Abstract base class for all functional engines (Detectors, Risk, Graph, etc.).
 * Enforces a standard lifecycle: init -> execute -> destroy.
 * Provides access to EventBus and Logger.
 */

import { globalEventBus } from './EventBus.js';
import { createLogger } from './Logger.js';

export class EngineBase {
  /**
   * @param {string} name - Unique name of the engine
   * @param {object} config - Configuration object
   */
  constructor(name, config = {}) {
    if (new.target === EngineBase) {
      throw new TypeError("Cannot construct EngineBase instances directly");
    }
    this.name = name;
    this.config = config;
    this.eventBus = globalEventBus;
    this.logger = createLogger(name);
    this.initialized = false;
    this.subscriptions = [];
  }

  /**
   * Initialize the engine resources
   * Must be implemented by subclasses if initialization is needed.
   */
  async init() {
    this.logger.info('Initializing...');
    this.initialized = true;
  }

  /**
   * Core execution method
   * @param {object} input - Data required for execution
   */
  async execute(input) {
    throw new Error(`${this.name}: execute() not implemented`);
  }

  /**
   * Subscribe to an event on the global bus
   * Automatically tracks subscription for cleanup in destroy()
   */
  subscribe(topic, handler) {
    const unsub = this.eventBus.subscribe(topic, handler.bind(this));
    this.subscriptions.push(unsub);
  }

  /**
   * Publish an event to the global bus
   */
  emit(topic, data) {
    this.eventBus.publish(topic, {
      source: this.name,
      timestamp: Date.now(),
      payload: data
    });
  }

  /**
   * Cleanup resources and unsubscribe events
   */
  async destroy() {
    this.logger.info('Destroying...');
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions = [];
    this.initialized = false;
  }
}

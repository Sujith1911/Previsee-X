/**
 * PRIVISEE-X v2.0
 * Storage: StorageManager
 * 
 * High-performance IndexedDB wrapper with schema versioning.
 * Handles migration, LRU caching simulation, and auto-cleanup.
 */

import { createLogger } from '../core/Logger.js';

const DB_NAME = 'PriviseeX_DB';
const DB_VERSION = 2; // Incremented for v2.0 schema

export class StorageManager {
  constructor() {
    this.db = null;
    this.logger = createLogger('StorageManager');
    this.cache = new Map(); // Simple in-memory cache
    this.cacheLimit = 1000;
  }

  /**
   * Initialize Database and handle migrations
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        this.logger.error('Database error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.logger.info('Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.logger.info(`Upgrading DB from v${event.oldVersion} to v${event.newVersion}`);
        const db = event.target.result;

        // V1 Stores (create if not exists)
        if (!db.objectStoreNames.contains('sites')) {
          const sitesStore = db.createObjectStore('sites', { keyPath: 'domain' });
          sitesStore.createIndex('lastVisit', 'lastVisit', { unique: false });
        }

        // V2 New Stores
        if (!db.objectStoreNames.contains('trackers')) {
          const trackerStore = db.createObjectStore('trackers', { keyPath: 'domain' });
          trackerStore.createIndex('category', 'category', { unique: false });
        }

        if (!db.objectStoreNames.contains('riskHistory')) {
          const riskStore = db.createObjectStore('riskHistory', { keyPath: 'id', autoIncrement: true });
          riskStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('anomalies')) {
          const anomalyStore = db.createObjectStore('anomalies', { keyPath: 'id', autoIncrement: true });
          anomalyStore.createIndex('domain', 'domain', { unique: false });
        }
      };
    });
  }

  /**
   * Generic Add/Update
   */
  async put(storeName, data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic Get
   */
  async get(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all items (with optional limit)
   */
  async getAll(storeName, limit = 100) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      // Use cursor for limit
      const items = [];
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && items.length < limit) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cleanup old data (older than 7 days)
   */
  async cleanupOldData() {
    if (!this.db) await this.init();
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Example: Clean risk history
    const transaction = this.db.transaction(['riskHistory'], 'readwrite');
    const store = transaction.objectStore('riskHistory');
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(oneWeekAgo);
    
    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    
    this.logger.info('Ran cleanup of old data');
  }
}

export const storageManager = new StorageManager();

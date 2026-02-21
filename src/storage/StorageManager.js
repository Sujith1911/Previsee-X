/**
 * PRIVISEE-X v2.0
 * Storage: StorageManager
 * 
 * High-performance IndexedDB wrapper with schema versioning.
 * Handles migration, and auto-cleanup.
 * 
 * v6 adds 'models' object store for anomaly baseline and ML metadata persistence.
 */

import { createLogger } from '../core/Logger.js';

const DB_NAME    = 'PriviseeX_DB';
const DB_VERSION = 6; // v6: added 'models' store for ML/anomaly baseline persistence

export class StorageManager {
  constructor() {
    this.db     = null;
    this.logger = createLogger('StorageManager');
    this.cache  = new Map();
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
        this.logger.info(`Database initialized (v${DB_VERSION})`);
        resolve();
      };

      request.onupgradeneeded = (event) => {
        this.logger.info(`Upgrading DB from v${event.oldVersion} to v${event.newVersion}`);
        const db = event.target.result;

        // ── Sites store (v1) ────────────────────────────────────────────────
        if (!db.objectStoreNames.contains('sites')) {
          const sitesStore = db.createObjectStore('sites', { keyPath: 'domain' });
          sitesStore.createIndex('lastVisit', 'lastVisit', { unique: false });
        }

        // ── Trackers store (v2, migrated in v5) ─────────────────────────────
        if (!db.objectStoreNames.contains('trackers')) {
          const ts = db.createObjectStore('trackers', { keyPath: 'id' });
          ts.createIndex('siteDomain',    'siteDomain',    { unique: false });
          ts.createIndex('trackerDomain', 'trackerDomain', { unique: false });
          ts.createIndex('lastSeen',      'lastSeen',      { unique: false });
        } else if (event.oldVersion < 5) {
          db.deleteObjectStore('trackers');
          const ts = db.createObjectStore('trackers', { keyPath: 'id' });
          ts.createIndex('siteDomain',    'siteDomain',    { unique: false });
          ts.createIndex('trackerDomain', 'trackerDomain', { unique: false });
          ts.createIndex('lastSeen',      'lastSeen',      { unique: false });
        } else if (event.oldVersion < 6) {
          // Add lastSeen index to existing trackers store if missing
          const tx = event.target.transaction;
          const trackerStore = tx.objectStore('trackers');
          if (!trackerStore.indexNames.contains('lastSeen')) {
            trackerStore.createIndex('lastSeen', 'lastSeen', { unique: false });
          }
        }

        // ── Risk History store (v2) ──────────────────────────────────────────
        if (!db.objectStoreNames.contains('riskHistory')) {
          const riskStore = db.createObjectStore('riskHistory', { keyPath: 'id', autoIncrement: true });
          riskStore.createIndex('timestamp', 'timestamp', { unique: false });
          riskStore.createIndex('domain',    'domain',    { unique: false });
        }

        // ── Anomalies store (v3) ─────────────────────────────────────────────
        if (!db.objectStoreNames.contains('anomalies')) {
          const anomalyStore = db.createObjectStore('anomalies', { keyPath: 'id', autoIncrement: true });
          anomalyStore.createIndex('domain',    'domain',    { unique: false });
          anomalyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // ── Models store (v6) — for anomaly baseline and future ML metadata ──
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'key' });
          this.logger.info('Created "models" store for ML baseline persistence');
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
      request.onerror   = () => reject(request.error);
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
      request.onerror   = () => reject(request.error);
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
   * Cleanup stale data:
   * - riskHistory older than 7 days
   * - anomalies older than 30 days
   * - tracker entries not seen in 30 days
   */
  async cleanupOldData() {
    if (!this.db) await this.init();
    const oneWeekAgo  = Date.now() - (7  * 24 * 60 * 60 * 1000);
    const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let deleted = 0;

    // ── Clean risk history (7-day window) ────────────────────────────────
    try {
      await new Promise((resolve) => {
        const tx    = this.db.transaction(['riskHistory'], 'readwrite');
        const store = tx.objectStore('riskHistory');
        const req   = store.index('timestamp').openCursor(IDBKeyRange.upperBound(oneWeekAgo));
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) { store.delete(cursor.primaryKey); deleted++; cursor.continue(); }
          else resolve();
        };
        req.onerror = resolve;
      });
    } catch (e) { this.logger.warn('Cleanup riskHistory failed:', e.message); }

    // ── Clean anomalies (30-day window) ──────────────────────────────────
    try {
      await new Promise((resolve) => {
        const tx    = this.db.transaction(['anomalies'], 'readwrite');
        const store = tx.objectStore('anomalies');
        const req   = store.index('timestamp').openCursor(IDBKeyRange.upperBound(oneMonthAgo));
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) { store.delete(cursor.primaryKey); deleted++; cursor.continue(); }
          else resolve();
        };
        req.onerror = resolve;
      });
    } catch (e) { this.logger.warn('Cleanup anomalies failed:', e.message); }

    // ── Clean stale trackers (30-day window) ─────────────────────────────
    try {
      await new Promise((resolve) => {
        const tx    = this.db.transaction(['trackers'], 'readwrite');
        const store = tx.objectStore('trackers');
        const req   = store.index('lastSeen').openCursor(IDBKeyRange.upperBound(oneMonthAgo));
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) { store.delete(cursor.primaryKey); deleted++; cursor.continue(); }
          else resolve();
        };
        req.onerror = resolve;
      });
    } catch (e) { this.logger.warn('Cleanup trackers failed:', e.message); }

    this.logger.info(`Cleanup complete: ${deleted} stale records removed`);
    return deleted;
  }

  /**
   * Clear all data from a store (or all stores)
   */
  async clearAll(storeName) {
    if (!this.db) await this.init();
    const stores = storeName
      ? [storeName]
      : ['sites', 'trackers', 'riskHistory', 'anomalies'];  // Note: 'models' intentionally excluded (baseline preserved)
    return Promise.all(stores.map(name =>
      new Promise((resolve) => {
        try {
          const tx  = this.db.transaction([name], 'readwrite');
          const req = tx.objectStore(name).clear();
          req.onsuccess = resolve;
          req.onerror   = resolve;
        } catch { resolve(); }
      })
    ));
  }

  /**
   * Delete a single record by key
   */
  async delete(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Add a risk history data point
   */
  async addRiskHistory(entry) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(['riskHistory'], 'readwrite');
        const req = tx.objectStore('riskHistory').add(entry);
        req.onsuccess = resolve;
        req.onerror   = resolve; // non-fatal
      } catch { resolve(); }
    });
  }

  /**
   * Get risk history entries since a given timestamp
   * Uses the timestamp index with IDBKeyRange for O(log n) query (was full cursor scan).
   */
  async getRiskHistorySince(since) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const results = [];
        const tx      = this.db.transaction(['riskHistory'], 'readonly');
        const store   = tx.objectStore('riskHistory');
        const index   = store.index('timestamp');
        const range   = IDBKeyRange.lowerBound(since);  // Audit fix: use index range (was full scan)
        const req     = index.openCursor(range);

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else resolve(results);
        };
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }
}

export const storageManager = new StorageManager();

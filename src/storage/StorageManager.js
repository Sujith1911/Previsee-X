/**
 * PRIVISEE-X v3.0
 * Storage: StorageManager
 *
 * High-performance IndexedDB wrapper with schema versioning.
 * v8: adds 'blockedRequests' store for Privacy Firewall transparency panel.
 */

import { createLogger } from '../core/Logger.js';

const DB_NAME    = 'PriviseeX_DB';
const DB_VERSION = 8;

export class StorageManager {
  constructor() {
    this.db         = null;
    this.logger     = createLogger('StorageManager');
    this.cache      = new Map();
    this.cacheLimit = 1000;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = new Promise((resolve, reject) => {
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

        // ── Trackers store (v2) ──────────────────────────────────────────────
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

        // ── Models store (v6) ───────────────────────────────────────────────
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'key' });
        }

        // ── Behavioral Fingerprints store (v7) ───────────────────────────────
        if (!db.objectStoreNames.contains('behavioralFingerprints')) {
          const bfStore = db.createObjectStore('behavioralFingerprints', { keyPath: 'domain' });
          bfStore.createIndex('lastUpdated',  'lastUpdated',  { unique: false });
          bfStore.createIndex('clusterMatch', 'clusterMatch', { unique: false });
        }

        // ── Risk Projections store (v7) ──────────────────────────────────────
        if (!db.objectStoreNames.contains('riskProjections')) {
          const rpStore = db.createObjectStore('riskProjections', { keyPath: 'domain' });
          rpStore.createIndex('projectedAt', 'projectedAt', { unique: false });
        }

        // ── Blocked Requests store (v8) — Privacy Firewall transparency ──────
        if (!db.objectStoreNames.contains('blockedRequests')) {
          const brStore = db.createObjectStore('blockedRequests', { keyPath: 'id', autoIncrement: true });
          brStore.createIndex('domain',    'domain',    { unique: false });
          brStore.createIndex('timestamp', 'timestamp', { unique: false });
          brStore.createIndex('type',      'type',      { unique: false });
          this.logger.info('Created "blockedRequests" store for Privacy Firewall');
        }
      };
    });
    return this._initPromise;
  }

  async _ensureDB() {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');
  }

  /** Generic Add/Update */
  async put(storeName, data) {
    await this._ensureDB();
    if (!data || typeof data !== 'object') throw new Error('Invalid data object');
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  /** Generic Get */
  async get(storeName, key) {
    await this._ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror   = () => reject(request.error);
    });
  }

  /** Get all items (with optional limit) */
  async getAll(storeName, limit = 100) {
    await this._ensureDB();
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

  /** Delete a single record */
  async delete(storeName, key) {
    await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction([storeName], 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror   = () => reject(req.error);
    });
  }

  /** Add a risk history data point */
  async addRiskHistory(entry) {
    await this._ensureDB();
    if (!entry || !entry.domain || entry.domain.startsWith('chrome')) return;
    const safe = {
      domain:          String(entry.domain || ''),
      score:           Number(entry.score  ?? 0),
      level:           String(entry.level  || 'LOW'),
      staticScore:     Number(entry.staticScore     ?? 0),
      behavioralScore: Number(entry.behavioralScore ?? 0),
      trackers:        Number(entry.trackers ?? 0),
      cookies:         Number(entry.cookies  ?? 0),
      timestamp:       Number(entry.timestamp ?? Date.now())
    };
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(['riskHistory'], 'readwrite');
        const req = tx.objectStore('riskHistory').add(safe);
        req.onsuccess = resolve;
        req.onerror   = resolve;
      } catch { resolve(); }
    });
  }

  /** Get risk history entries since a given timestamp */
  async getRiskHistorySince(since) {
    await this._ensureDB();
    return new Promise((resolve) => {
      try {
        const results = [];
        const tx      = this.db.transaction(['riskHistory'], 'readonly');
        const store   = tx.objectStore('riskHistory');
        const index   = store.index('timestamp');
        const range   = IDBKeyRange.lowerBound(since);
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

  /** Get risk history for a specific domain (last N entries) */
  async getRiskHistoryForDomain(domain, limit = 50) {
    await this._ensureDB();
    return new Promise((resolve) => {
      try {
        const results = [];
        const tx    = this.db.transaction(['riskHistory'], 'readonly');
        const store = tx.objectStore('riskHistory');
        const index = store.index('domain');
        const req   = index.openCursor(IDBKeyRange.only(domain));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) { results.push(cursor.value); cursor.continue(); }
          else resolve(results.sort((a,b) => a.timestamp - b.timestamp));
        };
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  /** Add a blocked request entry (Privacy Firewall) */
  async addBlockedRequest(entry) {
    await this._ensureDB();
    if (!entry || !entry.domain) return;
    const safe = {
      domain:    String(entry.domain    || ''),
      fullURL:   String(entry.fullURL   || ''),
      type:      String(entry.type      || 'unknown'),
      timestamp: Number(entry.timestamp ?? Date.now())
    };
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(['blockedRequests'], 'readwrite');
        const req = tx.objectStore('blockedRequests').add(safe);
        req.onsuccess = resolve;
        req.onerror   = resolve;
      } catch { resolve(); }
    });
  }

  /** Get recent blocked requests */
  async getBlockedRequests(limit = 200) {
    await this._ensureDB();
    return new Promise((resolve) => {
      try {
        const items = [];
        const tx    = this.db.transaction(['blockedRequests'], 'readonly');
        const store = tx.objectStore('blockedRequests');
        const index = store.index('timestamp');
        // Open in descending order to get newest first
        const req   = index.openCursor(null, 'prev');
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && items.length < limit) { items.push(cursor.value); cursor.continue(); }
          else resolve(items);
        };
        req.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  /** Clear all blocked requests */
  async clearBlockedRequests() {
    await this._ensureDB();
    return new Promise((resolve) => {
      try {
        const tx  = this.db.transaction(['blockedRequests'], 'readwrite');
        const req = tx.objectStore('blockedRequests').clear();
        req.onsuccess = resolve;
        req.onerror   = resolve;
      } catch { resolve(); }
    });
  }

  /** Cleanup stale data */
  async cleanupOldData() {
    await this._ensureDB();
    const oneWeekAgo  = Date.now() - (7  * 24 * 60 * 60 * 1000);
    const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let deleted = 0;

    const deleteByTimestamp = (storeName, upperBound) => new Promise((resolve) => {
      try {
        const tx    = this.db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const req   = store.index('timestamp').openCursor(IDBKeyRange.upperBound(upperBound));
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) { store.delete(cursor.primaryKey); deleted++; cursor.continue(); }
          else resolve();
        };
        req.onerror = resolve;
      } catch { resolve(); }
    });

    await deleteByTimestamp('riskHistory', oneWeekAgo).catch(() => {});
    await deleteByTimestamp('anomalies', oneMonthAgo).catch(() => {});
    await deleteByTimestamp('blockedRequests', oneMonthAgo).catch(() => {});

    // Clean stale trackers
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

  /** Clear all data from a store (or core stores) */
  async clearAll(storeName) {
    await this._ensureDB();
    const stores = storeName
      ? [storeName]
      : ['sites', 'trackers', 'riskHistory', 'anomalies', 'blockedRequests'];
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
}

export const storageManager = new StorageManager();

/**
 * PRIVISEE-X Storage Engine
 * High-performance IndexedDB wrapper with caching and efficient queries
 * 
 * Features:
 * - Structured storage for sites, trackers, analytics
 * - LRU caching for frequently accessed data
 * - Indexed queries for performance
 * - Bulk operations support
 */

class StorageEngine {
  constructor() {
    this.db = null;
    this.dbName = 'privisee_x_db';
    this.version = 1;
    this.cache = new CacheManager(100); // LRU cache with 100 max entries
    this.initialized = false;
  }

  /**
   * Initialize IndexedDB with schema
   */
  async initialize() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Sites object store
        if (!db.objectStoreNames.contains('sites')) {
          const sitesStore = db.createObjectStore('sites', { keyPath: 'domain' });
          sitesStore.createIndex('timestamp', 'timestamp', { unique: false });
          sitesStore.createIndex('riskScore', 'riskScore', { unique: false });
          sitesStore.createIndex('lastVisit', 'lastVisit', { unique: false });
        }

        // Trackers object store (composite key: site domain + tracker domain)
        if (!db.objectStoreNames.contains('trackers')) {
          const trackersStore = db.createObjectStore('trackers', { 
            keyPath: ['siteDomain', 'trackerDomain'] 
          });
          trackersStore.createIndex('category', 'category', { unique: false });
          trackersStore.createIndex('confidence', 'confidence', { unique: false });
          trackersStore.createIndex('timestamp', 'timestamp', { unique: false });
          trackersStore.createIndex('trackerDomain', 'trackerDomain', { unique: false });
        }

        // Analytics object store (daily aggregated stats)
        if (!db.objectStoreNames.contains('analytics')) {
          const analyticsStore = db.createObjectStore('analytics', { keyPath: 'date' });
          analyticsStore.createIndex('avgRisk', 'avgRisk', { unique: false });
          analyticsStore.createIndex('totalSites', 'totalSites', { unique: false });
        }

        // Graph object store (network topology)
        if (!db.objectStoreNames.contains('graph')) {
          db.createObjectStore('graph', { keyPath: 'id' });
        }

        // Settings object store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Save or update site data
   */
  async saveSite(siteData) {
    await this.ensureInitialized();
    
    // Update cache
    this.cache.set(siteData.domain, siteData);

    const tx = this.db.transaction('sites', 'readwrite');
    const store = tx.objectStore('sites');
    await store.put(siteData);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get site data by domain
   */
  async getSite(domain) {
    await this.ensureInitialized();

    // Check cache first
    const cached = this.cache.get(domain);
    if (cached) return cached;

    const tx = this.db.transaction('sites', 'readonly');
    const store = tx.objectStore('sites');
    const request = store.get(domain);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          this.cache.set(domain, data);
        }
        resolve(data || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get sites by risk score range
   */
  async getSitesByRisk(minRisk, maxRisk, limit = 50) {
    await this.ensureInitialized();

    const tx = this.db.transaction('sites', 'readonly');
    const index = tx.objectStore('sites').index('riskScore');
    const range = IDBKeyRange.bound(minRisk, maxRisk);

    const results = [];
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'prev'); // Descending order

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all sites with pagination
   */
  async getAllSites(offset = 0, limit = 100) {
    await this.ensureInitialized();

    const tx = this.db.transaction('sites', 'readonly');
    const store = tx.objectStore('sites');

    const results = [];
    let skipped = 0;

    return new Promise((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save tracker data
   */
  async saveTracker(siteDomain, trackerData) {
    await this.ensureInitialized();

    const record = {
      siteDomain,
      trackerDomain: trackerData.domain,
      ...trackerData,
      timestamp: Date.now()
    };

    const tx = this.db.transaction('trackers', 'readwrite');
    const store = tx.objectStore('trackers');
    await store.put(record);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all trackers for a site
   */
  async getTrackersForSite(siteDomain) {
    await this.ensureInitialized();

    const tx = this.db.transaction('trackers', 'readonly');
    const store = tx.objectStore('trackers');

    const results = [];

    return new Promise((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.siteDomain === siteDomain) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all unique trackers across all sites
   */
  async getAllTrackers() {
    await this.ensureInitialized();

    const tx = this.db.transaction('trackers', 'readonly');
    const index = tx.objectStore('trackers').index('trackerDomain');

    const trackerMap = new Map();

    return new Promise((resolve, reject) => {
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const tracker = cursor.value;
          if (!trackerMap.has(tracker.trackerDomain)) {
            trackerMap.set(tracker.trackerDomain, {
              domain: tracker.trackerDomain,
              category: tracker.category,
              confidence: tracker.confidence,
              sites: []
            });
          }
          trackerMap.get(tracker.trackerDomain).sites.push(tracker.siteDomain);
          cursor.continue();
        } else {
          resolve(Array.from(trackerMap.values()));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save analytics data for a date
   */
  async saveAnalytics(date, analyticsData) {
    await this.ensureInitialized();

    const record = {
      date,
      ...analyticsData,
      timestamp: Date.now()
    };

    const tx = this.db.transaction('analytics', 'readwrite');
    const store = tx.objectStore('analytics');
    await store.put(record);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get analytics for date range
   */
  async getAnalytics(startDate, endDate) {
    await this.ensureInitialized();

    const tx = this.db.transaction('analytics', 'readonly');
    const store = tx.objectStore('analytics');
    const range = IDBKeyRange.bound(startDate, endDate);

    const results = [];

    return new Promise((resolve, reject) => {
      const request = store.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save graph data
   */
  async saveGraph(graphData) {
    await this.ensureInitialized();

    const record = {
      id: 'current_graph',
      ...graphData,
      timestamp: Date.now()
    };

    const tx = this.db.transaction('graph', 'readwrite');
    const store = tx.objectStore('graph');
    await store.put(record);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get current graph
   */
  async getGraph() {
    await this.ensureInitialized();

    const tx = this.db.transaction('graph', 'readonly');
    const store = tx.objectStore('graph');
    const request = store.get('current_graph');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Bulk update sites (optimized)
   */
  async bulkUpdateSites(sites) {
    await this.ensureInitialized();

    const tx = this.db.transaction('sites', 'readwrite');
    const store = tx.objectStore('sites');

    for (const site of sites) {
      store.put(site);
      this.cache.set(site.domain, site); // Update cache
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete old data (7 days retention)
   */
  async cleanOldData(retentionDays = 7) {
    await this.ensureInitialized();

    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Clean sites
    const sitesTx = this.db.transaction('sites', 'readwrite');
    const sitesStore = sitesTx.objectStore('sites');
    const sitesIndex = sitesStore.index('lastVisit');

    const sitesToDelete = [];

    return new Promise((resolve, reject) => {
      const request = sitesIndex.openCursor(IDBKeyRange.upperBound(cutoffDate));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          sitesToDelete.push(cursor.value.domain);
          cursor.delete();
          this.cache.delete(cursor.value.domain); // Remove from cache
          cursor.continue();
        } else {
          console.log(`Deleted ${sitesToDelete.length} old site records`);
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    await this.ensureInitialized();

    const stats = {
      totalSites: 0,
      totalTrackers: 0,
      totalAnalytics: 0,
      cacheSize: this.cache.size()
    };

    // Count sites
    const sitesTx = this.db.transaction('sites', 'readonly');
    stats.totalSites = await this.countRecords(sitesTx.objectStore('sites'));

    // Count trackers
    const trackersTx = this.db.transaction('trackers', 'readonly');
    stats.totalTrackers = await this.countRecords(trackersTx.objectStore('trackers'));

    // Count analytics
    const analyticsTx = this.db.transaction('analytics', 'readonly');
    stats.totalAnalytics = await this.countRecords(analyticsTx.objectStore('analytics'));

    return stats;
  }

  /**
   * Helper: Count records in object store
   */
  countRecords(store) {
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Ensure database is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Clear all data
   */
  async clearAll() {
    await this.ensureInitialized();

    const stores = ['sites', 'trackers', 'analytics', 'graph'];
    
    for (const storeName of stores) {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await store.clear();
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    this.cache.clear();
  }
}

/**
 * LRU Cache Manager
 * Efficient in-memory caching with Least Recently Used eviction
 */
class CacheManager {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  set(key, value) {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  has(key) {
    return this.cache.has(key);
  }
}

// Export for use in background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageEngine, CacheManager };
}

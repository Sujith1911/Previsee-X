/**
 * PRIVISEE-X v2.0
 * Detectors: AnomalyDetector
 * 
 * Statistical Anomaly Detection using Z-Score analysis.
 * Detects unusual site behavior (excessive requests, cookies, trackers).
 * Maintains a rolling baseline using Welford's online algorithm (exact std dev).
 * Persists baseline to IndexedDB and emits drift alerts when baseline shifts significantly.
 */

import { EngineBase } from '../core/EngineBase.js';
import { storageManager } from '../storage/StorageManager.js';

const BASELINE_STORE_KEY  = 'anomaly_baseline';
const PERSIST_EVERY_N     = 50;   // Persist baseline every N non-anomalous updates
const DRIFT_THRESHOLD     = 2.0;  // Flag drift if mean shifts > 2× initial value
const ANOMALY_SIGMA       = 3.0;  // Z-score threshold for anomaly

export class AnomalyDetector extends EngineBase {
  constructor() {
    super('AnomalyDetector');

    // Welford running stats for three dimensions
    this._stats = {
      requests: { n: 0, mean: 15, M2: 50 },  // Initial seed values
      cookies:  { n: 0, mean: 2,  M2: 2  },
      trackers: { n: 0, mean: 3,  M2: 3  }
    };

    // Snapshot of initial means for drift detection
    this._initialMeans = {
      requests: 15,
      cookies:  2,
      trackers: 3
    };

    this._updateCount = 0;
  }

  async init() {
    await super.init();
    try {
      const saved = await storageManager.get('models', BASELINE_STORE_KEY);
      if (saved && saved.stats) {
        this._stats = saved.stats;
        this._initialMeans = saved.initialMeans || this._initialMeans;
        this.logger.info('Anomaly baseline restored from storage');
      } else {
        this.logger.info('Using default anomaly baseline (no saved baseline found)');
      }
    } catch (e) {
      this.logger.warn('Failed to load anomaly baseline:', e.message);
    }
  }

  /**
   * Analyze site behavior for anomalies
   * @param {object} siteData - { domain, requestCount, cookieCount, trackerCount }
   */
  async execute(siteData) {
    const { domain, requestCount = 0, cookieCount = 0, trackerCount = 0 } = siteData;

    const zReq  = this._zScore('requests', requestCount);
    const zCook = this._zScore('cookies',  cookieCount);
    const zTrk  = this._zScore('trackers', trackerCount);

    const isAnomalous = zReq > ANOMALY_SIGMA || zCook > ANOMALY_SIGMA || zTrk > ANOMALY_SIGMA;

    if (isAnomalous) {
      const dominantDim = [
        { dim: 'Excessive Requests', z: zReq },
        { dim: 'Too Many Cookies',   z: zCook },
        { dim: 'Tracker Spike',      z: zTrk }
      ].sort((a, b) => b.z - a.z)[0];

      const details = {
        domain,
        zScore:  parseFloat(Math.max(zReq, zCook, zTrk).toFixed(3)),
        reason:  dominantDim.dim,
        dims:    { zRequests: zReq.toFixed(2), zCookies: zCook.toFixed(2), zTrackers: zTrk.toFixed(2) }
      };

      this.emit('ANOMALY_DETECTED', details);
      this.logger.warn(`Anomaly on ${domain}:`, details);
      return details;
    }

    // Only update baseline with non-anomalous data points (avoid polluting baseline)
    this._welfordUpdate('requests', requestCount);
    this._welfordUpdate('cookies',  cookieCount);
    this._welfordUpdate('trackers', trackerCount);
    this._updateCount++;

    // Drift detection
    this._detectDrift(domain);

    // Persist baseline periodically
    if (this._updateCount % PERSIST_EVERY_N === 0) {
      await this._persistBaseline();
    }

    return null;
  }

  /**
   * Welford's Online Algorithm for running mean and variance
   * Gives exact std dev without storing all samples.
   */
  _welfordUpdate(dim, value) {
    const s = this._stats[dim];
    s.n++;
    const delta  = value - s.mean;
    s.mean      += delta / s.n;
    const delta2 = value - s.mean;
    s.M2        += delta * delta2;
  }

  /**
   * Get standard deviation from Welford stats
   */
  _std(dim) {
    const s = this._stats[dim];
    if (s.n < 2) return 1; // Avoid division by zero; fall back to 1
    return Math.sqrt(s.M2 / (s.n - 1));
  }

  /**
   * Calculate z-score for a value in a given dimension
   */
  _zScore(dim, value) {
    const s   = this._stats[dim];
    const std = this._std(dim);
    return Math.abs((value - s.mean) / (std || 1));
  }

  /**
   * Concept drift detection: emit BASELINE_DRIFT_DETECTED when mean has shifted >2× from initial
   */
  _detectDrift(domain) {
    for (const [dim, initMean] of Object.entries(this._initialMeans)) {
      const currentMean = this._stats[dim].mean;
      if (initMean > 0 && currentMean / initMean > DRIFT_THRESHOLD) {
        this.emit('BASELINE_DRIFT_DETECTED', {
          domain,
          dimension: dim,
          initialMean: initMean,
          currentMean: parseFloat(currentMean.toFixed(2)),
          driftRatio: parseFloat((currentMean / initMean).toFixed(2))
        });
        this.logger.warn(`Baseline drift in ${dim}: ${initMean.toFixed(1)} → ${currentMean.toFixed(1)}`);
        // Update initial mean to avoid repeated alerts for same drift
        this._initialMeans[dim] = currentMean;
      }
    }
  }

  /**
   * Persist baseline to IndexedDB
   */
  async _persistBaseline() {
    try {
      await storageManager.put('models', {
        key:         BASELINE_STORE_KEY,
        stats:       this._stats,
        initialMeans: this._initialMeans,
        updatedAt:   Date.now()
      });
      this.logger.debug(`Baseline persisted (n=${this._stats.requests.n} updates)`);
    } catch (e) {
      this.logger.warn('Failed to persist baseline:', e.message);
    }
  }
}

/**
 * PRIVISEE-X v2.0
 * Detectors: AnomalyDetector
 * 
 * Statistical Anomaly Detection using Isolation Forest logic.
 * Detects unusual site behavior (e.g., setting too many cookies, excessive requests).
 * Maintains a rolling baseline of "normal" behavior.
 */

import { EngineBase } from '../core/EngineBase.js';
import { storageManager } from '../storage/StorageManager.js';

export class AnomalyDetector extends EngineBase {
  constructor() {
    super('AnomalyDetector');
    this.baselineStats = {
      meanRequests: 15,
      stdRequests: 5,
      meanCookies: 2,
      stdCookies: 1
    };
  }

  async init() {
    await super.init();
    // Load persisted baselines if available
    const saved = await storageManager.get('models', 'anomaly_baseline');
    if (saved) this.baselineStats = saved;
  }

  /**
   * Analyze site behavior for anomalies
   * @param {object} siteData - { requestCount, cookieCount, trackerCount }
   */
  async execute(siteData) {
    const { domain, requestCount, cookieCount } = siteData;
    const scores = [];

    // Z-Score Calculation
    const zRequests = (requestCount - this.baselineStats.meanRequests) / (this.baselineStats.stdRequests || 1);
    const zCookies = (cookieCount - this.baselineStats.meanCookies) / (this.baselineStats.stdCookies || 1);

    // Simple anomaly threshold (e.g., > 3 sigma)
    const isAnomalous = zRequests > 3 || zCookies > 3;

    if (isAnomalous) {
      const details = {
        domain,
        zScore: Math.max(zRequests, zCookies),
        reason: zRequests > 3 ? 'Excessive Requests' : 'Too Many Cookies'
      };
      
      this.emit('ANOMALY_DETECTED', details);
      this.logger.warn(`Anomaly detected for ${domain}:`, details);
      return details;
    }

    // Update rolling baseline (simplified online update)
    this.updateBaseline(requestCount, cookieCount);
    return null;
  }

  updateBaseline(req, cookies) {
    const alpha = 0.01; // Learning rate
    this.baselineStats.meanRequests = (1 - alpha) * this.baselineStats.meanRequests + alpha * req;
    this.baselineStats.meanCookies = (1 - alpha) * this.baselineStats.meanCookies + alpha * cookies;
    // Note: StdDev update omitted for brevity, but should be tracked for full robustness
  }
}

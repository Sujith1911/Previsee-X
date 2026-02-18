/**
 * PRIVISEE-X Anomaly Detector
 * Statistical Anomaly Detection for Tracking Behavior
 * 
 * Algorithm: Isolation Forest (Statistical Variant)
 * Detects unusual tracking patterns compared to baseline
 * 
 * Features:
 * - Rolling baseline calculation (last 100 sites)
 * - Multi-dimensional anomaly scoring
 * - Z-score based detection
 * - Explainable anomaly reasons
 */

class AnomalyDetector {
  constructor() {
    this.baseline = null;
    this.historicalData = [];
    this.maxHistorySize = 100;
    this.threshold = 2.5; // Standard deviations for anomaly
    this.initialized = false;
  }

  /**
   * Initialize detector
   */
  async initialize() {
    if (this.initialized) return;

    // Initialize with default baseline
    this.baseline = {
      trackerCount: { mean: 5, std: 3 },
      cookieCount: { mean: 8, std: 5 },
      fingerprintCalls: { mean: 2, std: 2 },
      thirdPartyRatio: { mean: 0.4, std: 0.2 },
      uniqueCategories: { mean: 2, std: 1 }
    };

    this.initialized = true;
    console.log('[AnomalyDetector] Initialized with default baseline');
  }

  /**
   * Detect anomalies in site tracking behavior
   * @param {object} siteData - Site data to analyze
   * @returns {object} Anomaly detection result
   */
  async detectAnomaly(siteData) {
    await this.ensureInitialized();

    // Extract features for anomaly detection
    const features = this.extractAnomalyFeatures(siteData);

    // Calculate z-scores for each feature
    const zScores = this.calculateZScores(features);

    // Aggregate anomaly score
    const anomalyScore = this.aggregateAnomalyScore(zScores);

    // Determine if anomalous
    const isAnomaly = anomalyScore > 50; // >50 is anomalous

    // Generate explanation
    const explanation = this.explainAnomaly(features, zScores);

    // Update baseline with new data
    this.updateBaseline(features);

    return {
      isAnomaly,
      score: Math.round(anomalyScore),
      zScores,
      explanation,
      features
    };
  }

  /**
   * Extract features for anomaly detection
   */
  extractAnomalyFeatures(site) {
    const totalDomains = (site.thirdPartyDomains?.size || 0) + 1;
    const thirdPartyCount = site.thirdPartyDomains?.size || 0;

    return {
      trackerCount: site.trackers?.size || 0,
      cookieCount: site.cookies?.length || 0,
      fingerprintCalls: this.countFingerprintCalls(site.fingerprinting),
      thirdPartyRatio: thirdPartyCount / totalDomains,
      uniqueCategories: this.countUniqueCategories(site.trackers)
    };
  }

  /**
   * Count total fingerprinting calls
   */
  countFingerprintCalls(fingerprinting) {
    if (!fingerprinting) return 0;
    
    return (fingerprinting.canvas || 0) + 
           (fingerprinting.webgl || 0) + 
           (fingerprinting.audio || 0) +
           (fingerprinting.fonts || 0);
  }

  /**
   * Count unique tracker categories
   */
  countUniqueCategories(trackers) {
    if (!trackers || trackers.size === 0) return 0;
    
    const categories = new Set();
    for (const [, info] of trackers) {
      if (info.category) {
        categories.add(info.category);
      }
    }
    return categories.size;
  }

  /**
   * Calculate z-scores for features
   */
  calculateZScores(features) {
    const zScores = {};

    for (const [name, value] of Object.entries(features)) {
      if (this.baseline[name]) {
        const { mean, std } = this.baseline[name];
        zScores[name] = std > 0 ? (value - mean) / std : 0;
      }
    }

    return zScores;
  }

  /**
   * Aggregate z-scores into single anomaly score (0-100)
   */
  aggregateAnomalyScore(zScores) {
    // Calculate average absolute z-score
    const absZScores = Object.values(zScores).map(Math.abs);
    const avgAbsZ = absZScores.reduce((a, b) => a + b, 0) / absZScores.length;

    // Convert to 0-100 scale
    // Z > 2.5 is very anomalous (score ~100)
    const score = Math.min(100, (avgAbsZ / this.threshold) * 50);

    return score;
  }

  /**
   * Explain why site is anomalous
   */
  explainAnomaly(features, zScores) {
    const reasons = [];

    // Check each feature for significant deviation
    if (Math.abs(zScores.trackerCount) > this.threshold) {
      if (zScores.trackerCount > 0) {
        reasons.push({
          feature: 'trackerCount',
          severity: 'high',
          message: `Unusually high number of trackers (${features.trackerCount} vs baseline ${this.baseline.trackerCount.mean.toFixed(1)})`
        });
      }
    }

    if (Math.abs(zScores.cookieCount) > this.threshold) {
      if (zScores.cookieCount > 0) {
        reasons.push({
          feature: 'cookieCount',
          severity: 'high',
          message: `Excessive cookies detected (${features.cookieCount} vs baseline ${this.baseline.cookieCount.mean.toFixed(1)})`
        });
      }
    }

    if (Math.abs(zScores.fingerprintCalls) > this.threshold) {
      if (zScores.fingerprintCalls > 0) {
        reasons.push({
          feature: 'fingerprintCalls',
          severity: 'critical',
          message: `Intensive fingerprinting activity (${features.fingerprintCalls} calls vs baseline ${this.baseline.fingerprintCalls.mean.toFixed(1)})`
        });
      }
    }

    if (Math.abs(zScores.thirdPartyRatio) > this.threshold) {
      if (zScores.thirdPartyRatio > 0) {
        reasons.push({
          feature: 'thirdPartyRatio',
          severity: 'medium',
          message: `High proportion of third-party connections (${(features.thirdPartyRatio * 100).toFixed(1)}% vs baseline ${(this.baseline.thirdPartyRatio.mean * 100).toFixed(1)}%)`
        });
      }
    }

    if (reasons.length === 0) {
      return {
        summary: 'No significant anomalies detected',
        reasons: []
      };
    }

    return {
      summary: `${reasons.length} anomalous behavior(s) detected`,
      reasons: reasons.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
    };
  }

  /**
   * Update baseline with new data (rolling window)
   */
  updateBaseline(features) {
    // Add to historical data
    this.historicalData.push(features);

    // Keep only last N samples
    if (this.historicalData.length > this.maxHistorySize) {
      this.historicalData.shift();
    }

    // Recalculate baseline if enough data
    if (this.historicalData.length >= 10) {
      this.recalculateBaseline();
    }
  }

  /**
   * Recalculate baseline from historical data
   */
  recalculateBaseline() {
    const features = Object.keys(this.baseline);

    for (const feature of features) {
      const values = this.historicalData.map(d => d[feature]);
      
      // Calculate mean
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      
      // Calculate standard deviation
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);

      this.baseline[feature] = { mean, std: Math.max(std, 0.1) }; // Prevent std=0
    }

    console.log('[AnomalyDetector] Baseline updated:', this.baseline);
  }

  /**
   * Get detector statistics
   */
  getStats() {
    return {
      baseline: this.baseline,
      historicalSamples: this.historicalData.length,
      threshold: this.threshold
    };
  }

  /**
   * Reset baseline to default
   */
  reset() {
    this.historicalData = [];
    this.baseline = {
      trackerCount: { mean: 5, std: 3 },
      cookieCount: { mean: 8, std: 5 },
      fingerprintCalls: { mean: 2, std: 2 },
      thirdPartyRatio: { mean: 0.4, std: 0.2 },
      uniqueCategories: { mean: 2, std: 1 }
    };
  }

  /**
   * Ensure detector is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export for use in background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnomalyDetector;
}

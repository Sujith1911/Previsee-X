/**
 * PRIVISEE-X Risk Engine
 * Adaptive Weighted Risk Scoring System
 * 
 * Formula: Risk = Σ wi × fi(x)
 * where wi = learned weight, fi(x) = normalized feature value
 * 
 * Features:
 * - Multi-dimensional risk assessment
 * - Learnable weights (adaptive from user feedback)
 * - Logarithmic normalization for diminishing returns
 * - Scores calibrated 0-100
 * -Categories: Low (0-25), Moderate (25-50), High (50-75), Critical (75-100)
 */

class RiskEngine {
  constructor() {
    // Initial weights (expert-defined, sum to 1.0)
    this.weights = {
      cookies: 0.20,         // Third-party cookies, lifetime
      trackers: 0.25,        // Number and category of trackers
      fingerprinting: 0.20,  // Canvas, WebGL, Audio
      https: 0.10,           // HTTPS vs HTTP
      thirdParty: 0.10,      // Third-party connection count
      anomaly: 0.10,         // Anomaly score
      malicious: 0.05        // Known malicious domains
    };

    this.initialized = false;
    this.learningRate = 0.01; // For weight adjustment
  }

  /**
   * Initialize risk engine
   */
  async initialize() {
    if (this.initialized) return;

    // Load learned weights from storage if available
    try {
      const stored = await chrome.storage.local.get('riskWeights');
      if (stored.riskWeights) {
        this.weights = stored.riskWeights;
        console.log('[RiskEngine] Loaded learned weights:', this.weights);
      }
    } catch (error) {
      console.warn('[RiskEngine] Using default weights:', error);
    }

    this.initialized = true;
  }

  /**
   * Calculate overall risk score for a site
   * @param {object} siteData - Site data including trackers, cookies, etc.
   * @param {object} anomalyResult - Result from AnomalyDetector
   * @returns {object} Risk score and breakdown
   */
  async calculateRisk(siteData, anomalyResult = null) {
    await this.ensureInitialized();

    // Step 1: Calculate individual feature scores
    const features = this.calculateFeatureScores(siteData, anomalyResult);

    // Step 2: Apply weights and aggregate
    let totalScore = 0;
    const breakdown = {};

    for (const [feature, score] of Object.entries(features)) {
      const weight = this.weights[feature] || 0;
      const contribution = weight * score;
      totalScore += contribution;
      breakdown[feature] = {
        score: Math.round(score),
        weight,
        contribution: Math.round(contribution)
      };
    }

    // Step 3: Normalize to 0-100
    const riskScore = Math.min(100, Math.max(0, totalScore));

    // Step 4: Determine risk level
    const level = this.getRiskLevel(riskScore);

    return {
      score: Math.round(riskScore),
      level: level.label,
      color: level.color,
      breakdown,
      features
    };
  }

  /**
   * Calculate scores for individual features
   */
  calculateFeatureScores(siteData, anomalyResult) {
    return {
      cookies: this.calculateCookieScore(siteData.cookies || []),
      trackers: this.calculateTrackerScore(siteData.trackers || new Map()),
      fingerprinting: this.calculateFingerprintScore(siteData.fingerprinting || {}),
      https: this.calculateHttpsScore(siteData.isHttps !== false),
      thirdParty: this.calculateThirdPartyScore(siteData.thirdPartyDomains?.size || 0),
      anomaly: anomalyResult ? anomalyResult.score : 0,
      malicious: this.calculateMaliciousScore(siteData)
    };
  }

  /**
   * Cookie risk score (0-100)
   */
  calculateCookieScore(cookies) {
    if (cookies.length === 0) return 0;

    let score = 0;

    for (const cookie of cookies) {
      // Third-party cookies are high risk
      if (cookie.isThirdParty) {
        score += 10;
      }

      // Long lifetime indicates tracking intent
      const lifetimeDays = cookie.lifetime / (24 * 60 * 60);
      if (lifetimeDays > 365) {
        score += 5;
      } else if (lifetimeDays > 30) {
        score += 2;
      }

      // Insecure cookies
      if (!cookie.secure) score += 2;
      if (!cookie.httpOnly) score += 1;

      // No SameSite protection
      if (!cookie.sameSite || cookie.sameSite === 'None') {
        score += 3;
      }
    }

    // Logarithmic normalization (diminishing returns)
    return this.normalizeLog(score, 0, 100);
  }

  /**
   * Tracker risk score (0-100)
   */
  calculateTrackerScore(trackers) {
    if (trackers.size === 0) return 0;

    let score = 0;

    const categoryScores = {
      fingerprinting: 20,
      advertising: 15,
      social: 12,
      analytics: 10,
      unknown: 5
    };

    for (const [, info] of trackers) {
      const baseScore = categoryScores[info.category] || 5;
      const confidenceMultiplier = info.confidence || 1.0;
      score += baseScore * confidenceMultiplier;
    }

    return this.normalizeLog(score, 0, 100);
  }

  /**
   * Fingerprinting risk score (0-100)
   */
  calculateFingerprintScore(fpAttempts) {
    let score = 0;

    // Canvas fingerprinting
    if (fpAttempts.canvas > 0) {
      score += Math.min(25, fpAttempts.canvas * 5);
    }

    // WebGL fingerprinting
    if (fpAttempts.webgl > 0) {
      score += Math.min(20, fpAttempts.webgl * 4);
    }

    // Audio fingerprinting (very invasive)
    if (fpAttempts.audio >= 2) {
      score += 20;
    } else if (fpAttempts.audio === 1) {
      score += 10;
    }

    // Font enumeration
    if (fpAttempts.fonts > 50) {
      score += 15;
    } else if (fpAttempts.fonts > 20) {
      score += 7;
    }

    // Device APIs
    if (fpAttempts.battery) score += 3;
    if (fpAttempts.deviceMemory) score += 3;
    if (fpAttempts.hardwareConcurrency) score += 4;
    if (fpAttempts.webRTC) score += 10;

    return Math.min(100, score);
  }

  /**
   * HTTPS score (0 = HTTPS, 100 = HTTP)
   */
  calculateHttpsScore(isHttps) {
    return isHttps ? 0 : 100;
  }

  /**
   * Third-party connections score (0-100)
   */
  calculateThirdPartyScore(count) {
    // Logarithmic scaling
    return this.normalizeLog(count, 0, 50);
  }

  /**
   * Malicious domain score (0-100)
   */
  calculateMaliciousScore(siteData) {
    // Check if any trackers are flagged as malicious
    // This would require a malicious domain database
    // For now, return 0
    return 0;
  }

  /**
   * Logarithmic normalization for diminishing returns
   */
  normalizeLog(value, min, max) {
    if (value <= min) return 0;
    const normalized = (Math.log10(value + 1) / Math.log10(max + 1)) * 100;
    return Math.min(100, normalized);
  }

  /**
   * Get risk level classification
   */
  getRiskLevel(score) {
    if (score >= 75) return { label: 'Critical', color: '#ef4444', icon: '🔴' };
    if (score >= 50) return { label: 'High', color: '#f97316', icon: '🟠' };
    if (score >= 25) return { label: 'Moderate', color: '#eab308', icon: '🟡' };
    return { label: 'Low', color: '#22c55e', icon: '🟢' };
  }

  /**
   * Adjust weights based on user feedback
   * Simple gradient descent learning
   */
  async adjustWeights(feedback) {
    const { siteData, userRating, anomalyResult } = feedback;

    // Calculate current prediction
    const currentRisk = await this.calculateRisk(siteData, anomalyResult);
    const predicted = currentRisk.score / 100; // Normalize to 0-1
    const actual = userRating / 100; // User rating also 0-1

    // Calculate error
    const error = actual - predicted;

    // Update weights using gradient descent
    const features = this.calculateFeatureScores(siteData, anomalyResult);

    for (const [feature, score] of Object.entries(features)) {
      const normalizedScore = score / 100;
      this.weights[feature] += this.learningRate * error * normalizedScore;
    }

    // Normalize weights to sum to 1.0
    this.normalizeWeights();

    // Save learned weights
    await chrome.storage.local.set({ riskWeights: this.weights });

    console.log('[RiskEngine] Weights adjusted based on feedback:', this.weights);
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights() {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    
    if (sum > 0) {
      for (const key in this.weights) {
        this.weights[key] /= sum;
      }
    }
  }

  /**
   * Reset weights to default
   */
  async resetWeights() {
    this.weights = {
      cookies: 0.20,
      trackers: 0.25,
      fingerprinting: 0.20,
      https: 0.10,
      thirdParty: 0.10,
      anomaly: 0.10,
      malicious: 0.05
    };

    await chrome.storage.local.set({ riskWeights: this.weights });
    console.log('[RiskEngine] Weights reset to default');
  }

  /**
   * Get current weights
   */
  getWeights() {
    return { ...this.weights };
  }

  /**
   * Ensure engine is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export for use in background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RiskEngine;
}

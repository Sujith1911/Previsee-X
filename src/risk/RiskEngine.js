/**
 * PRIVISEE-X v2.0
 * Risk: RiskEngine
 * 
 * Adaptive Privacy Scoring System.
 * Calculates risk score (0-100) based on weighted factors.
 * Supports dynamic weight adjustment.
 */

import { EngineBase } from '../core/EngineBase.js';
import { storageManager } from '../storage/StorageManager.js';

export const RiskLevel = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

export class RiskEngine extends EngineBase {
  constructor() {
    super('RiskEngine');
    // Default weights
    this.weights = {
      tracker: 5,        // Per tracker
      fingerprint: 20,   // Per fingerprint attempt
      anomaly: 15,       // If anomalous
      insecure: 10,      // HTTP / Mixed content
      thirdParty: 1      // Per 3rd party request
    };
    this.history = [];
  }

  async init() {
    await super.init();
    const loaded = await storageManager.get('models', 'risk_weights');
    if (loaded) this.weights = loaded;
  }

  /**
   * Calculate Risk Score
   * @param {object} siteContext - { trackers, fingerprintAttempts, isAnomalous, thirdPartyCount, isSecure }
   */
  async execute(siteContext) {
    let score = 0;

    score += (siteContext.trackers || 0) * this.weights.tracker;
    score += (siteContext.fingerprintAttempts || 0) * this.weights.fingerprint;
    if (siteContext.isAnomalous) score += this.weights.anomaly;
    if (!siteContext.isSecure) score += this.weights.insecure;
    score += (siteContext.thirdPartyCount || 0) * this.weights.thirdParty;

    // Normalize (0-100)
    score = Math.min(100, Math.max(0, score));
    
    // Determine Level
    let level = RiskLevel.LOW;
    if (score > 25) level = RiskLevel.MODERATE;
    if (score > 50) level = RiskLevel.HIGH;
    if (score > 75) level = RiskLevel.CRITICAL;

    const result = { score, level, details: siteContext };
    
    this.emit('RISK_CALCULATED', result);
    return result;
  }

  /**
   * Update weights dynamically
   */
  async updateWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    await storageManager.put('models', { id: 'risk_weights', ...this.weights });
    this.logger.info('Updated risk weights');
  }
}

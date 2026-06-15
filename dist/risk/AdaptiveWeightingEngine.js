/**
 * PRIVISEE-X v5.0 — AdaptiveWeightingEngine
 * Dynamic Risk Engine with feedback-driven weights adjustment.
 * Replaces fixed weights with adaptive coefficients that react to:
 * 1. User Trust Flags (decreases tracking weight for high-reputation trusted domains)
 * 2. Threat Intel Confidence (boosts threat intel weight when confidence is high)
 * 3. Attack Surface severity (modifies security weight)
 */

import { EngineBase } from '../core/EngineBase.js';
import { storageManager } from '../storage/StorageManager.js';

const WEIGHTS_STORE_KEY = 'adaptive_weights_config';

export class AdaptiveWeightingEngine extends EngineBase {
  constructor() {
    super('AdaptiveWeightingEngine');
    
    // Default weights configuration (must sum to 1.0)
    this.defaultWeights = {
      behavioral: 0.20,      // Trackers, cookies, and local API usage
      staticHeaders: 0.20,   // Missing headers, security score
      reputation: 0.15,      // cosine similarity and PageRank
      securityLayer: 0.15,   // TLS and certificate issues (inverted)
      threatIntel: 0.15,     // WHOIS, bloom filter hits
      behavioralThreat: 0.15 // Downloads, clipboard, notifications, tab hijacks
    };
  }

  async init() {
    await super.init();
    this.logger.info('Adaptive Weighting Engine ready');
  }

  /**
   * Calculate final risk score using adaptive weights
   * @param {object} components - { behavioral, staticHeaders, reputation, securityLayer, threatIntel, behavioralThreat }
   * @param {object} context - { domain, trusted, threatIntelConfidence }
   * @returns {Promise<{ finalScore: number, weights: object }>}
   */
  async execute(components, context = {}) {
    const { domain = '', trusted = false, threatIntelConfidence = 50 } = context;

    // Load active weights config (or default)
    let weights = { ...this.defaultWeights };
    try {
      const saved = await storageManager.get('models', WEIGHTS_STORE_KEY);
      if (saved && saved.weights) {
        weights = { ...this.defaultWeights, ...saved.weights };
      }
    } catch {}

    // Adjust weights based on feedback loops
    
    // Feedback Loop 1: If domain is marked as trusted, suppress tracker & cookie weights (false positive mitigation)
    if (trusted) {
      const surplus = weights.behavioral + weights.reputation;
      weights.behavioral = 0.02; // Minimal background tracking check
      weights.reputation = 0.03; // Minimal PageRank factor
      
      // Redistribute surplus weight to concrete threat detection components
      const remainingKeys = ['staticHeaders', 'securityLayer', 'threatIntel', 'behavioralThreat'];
      const distributionShare = surplus / remainingKeys.length;
      remainingKeys.forEach(k => {
        weights[k] += distributionShare;
      });
    }

    // Feedback Loop 2: Boost Threat Intel weight if confidence is high (e.g. bloom filter hit)
    if (threatIntelConfidence > 80) {
      const delta = 0.10;
      if (weights.threatIntel + delta <= 0.50) {
        weights.threatIntel += delta;
        // Decay other weights proportionally to maintain sum of 1.0
        const decayKeys = trusted
          ? ['staticHeaders', 'securityLayer', 'behavioralThreat']
          : ['behavioral', 'staticHeaders', 'reputation', 'securityLayer', 'behavioralThreat'];
        const decayShare = delta / decayKeys.length;
        decayKeys.forEach(k => {
          weights[k] = Math.max(0.01, weights[k] - decayShare);
        });
      }
    }

    // Normalize weights to sum exactly to 1.0 (to correct floating point rounding errors)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(weights)) {
      weights[k] = parseFloat((weights[k] / sum).toFixed(4));
    }

    // Calculate final weighted score
    let weightedScore = 
      components.behavioral * weights.behavioral +
      components.staticHeaders * weights.staticHeaders +
      components.reputation * weights.reputation +
      components.securityLayer * weights.securityLayer +
      components.threatIntel * weights.threatIntel +
      components.behavioralThreat * weights.behavioralThreat;

    // Apply strict floors
    // Invalid cert forces minimum risk of 70
    if (components.securityLayer >= 70 && weightedScore < 70) {
      weightedScore = 70;
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(weightedScore)));

    return {
      finalScore,
      weights
    };
  }

  /**
   * Update and save weights globally based on user whitelist feedback
   */
  async recordUserFeedback(isFalsePositive) {
    if (!isFalsePositive) return;
    
    // Learn from false positive: permanently shift weights globally away from trackers (behavioral) 
    // towards threat intelligence and attack surface.
    try {
      const saved = await storageManager.get('models', WEIGHTS_STORE_KEY) || { key: WEIGHTS_STORE_KEY, weights: { ...this.defaultWeights } };
      const w = saved.weights;
      
      const shift = 0.02; // Small incremental shift
      if (w.behavioral > 0.05) {
        w.behavioral -= shift;
        w.threatIntel += shift / 2;
        w.staticHeaders += shift / 2;
      }
      
      // Save
      await storageManager.put('models', {
        key: WEIGHTS_STORE_KEY,
        weights: w,
        updatedAt: Date.now()
      });
      this.logger.info('Adaptive Weighting Engine learned from user feedback and updated global weights:', w);
    } catch (e) {
      this.logger.warn('Failed to save adaptive weights feedback:', e.message);
    }
  }
}

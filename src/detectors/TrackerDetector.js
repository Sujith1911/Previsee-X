/**
 * PRIVISEE-X v2.0
 * Detectors: TrackerDetector
 * 
 * Hybrid Engine: 
 * 1. O(1) Check against blocklist (EasyList/EasyPrivacy subset)
 * 2. ML Inference (Random Forest) for unknown domains
 * 
 * Fallback: If model fails to load, blocklist-only mode is used.
 * Feature vector must be exactly 13 features (validated before inference).
 */

import { EngineBase } from '../core/EngineBase.js';
import { modelLoader } from '../models/modelLoader.js';
import { FeatureUtils } from '../utils/FeatureUtils.js';

const REQUIRED_FEATURE_COUNT = 13;

export class TrackerDetector extends EngineBase {
  constructor() {
    super('TrackerDetector');
    this.blocklist = new Map(); // domain -> category (O(1) lookup)
    this.whitelist = new Set();
    this.modelLoaded = false;
  }

  async init() {
    await super.init();
    try {
      const response = await fetch(chrome.runtime.getURL('data/tracker_blocklist.json'));
      const data = await response.json();
      if (data && data.trackers && Array.isArray(data.trackers)) {
        data.trackers.forEach(t => this.blocklist.set(t.domain, t.category || 'unknown'));
      }
      this.logger.info(`Loaded ${this.blocklist.size} known trackers from blocklist`);
    } catch (e) {
      this.logger.warn('Blocklist load failed (continuing):', e.message);
    }

    try {
      const loaded = await modelLoader.loadModel('rf_tracker_classifier', 'models/tracker_classifier/model.json');
      this.modelLoaded = loaded;
      if (loaded) {
        this.logger.info('ML model loaded — hybrid mode active');
      } else {
        this.logger.warn('ML model unavailable — blocklist-only mode');
      }
    } catch (e) {
      this.logger.warn('ML model load failed (blocklist-only mode):', e.message);
      this.modelLoaded = false;
    }
  }

  /**
   * Main detection logic
   * @param {object} request - normalized request object
   */
  async execute(request) {
    const { domain, url, type, tabId, sourceDomain } = request;

    // 1. Whitelist Check
    if (this.whitelist.has(domain)) return { isTracker: false };

    // 2. Blocklist Check (O(1)) — emit correct category from blocklist data
    if (this.blocklist.has(domain)) {
      const category = this.blocklist.get(domain);
      this.emit('TRACKER_DETECTED', { domain, type: 'known', category, tabId, sourceDomain });
      return { isTracker: true, reason: 'blocklist', category };
    }

    // 3. ML Inference (only when model is loaded)
    if (this.modelLoaded) {
      try {
        const vector = FeatureUtils.extractRequestFeatures(domain, url, { type, isThirdParty: true });

        // Guard: feature vector must be exactly 13 features
        if (vector.length !== REQUIRED_FEATURE_COUNT) {
          this.logger.warn(`Feature vector length ${vector.length} != ${REQUIRED_FEATURE_COUNT} for ${domain}, skipping ML`);
        } else {
          const prediction = modelLoader.predict('rf_tracker_classifier', vector);

          if (prediction && prediction.category !== 'benign' && prediction.confidence > 0.7) {
            this.emit('TRACKER_DETECTED', {
              domain,
              type: 'ml_predicted',
              category: prediction.category,
              confidence: prediction.confidence,
              tabId,
              sourceDomain
            });
            return { isTracker: true, reason: 'ml', details: prediction };
          }
        }
      } catch (e) {
        this.logger.warn(`ML inference failed for ${domain}:`, e.message);
      }
    }

    return { isTracker: false };
  }
}

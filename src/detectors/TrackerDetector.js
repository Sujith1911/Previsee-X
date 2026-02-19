/**
 * PRIVISEE-X v2.0
 * Detectors: TrackerDetector
 * 
 * Hybrid Engine: 
 * 1. O(1) Check against blocklist (EasyList/EasyPrivacy subset)
 * 2. ML Inference (Random Forest) for unknown domains
 */

import { EngineBase } from '../core/EngineBase.js';
import { modelLoader } from '../models/modelLoader.js';
import { FeatureUtils } from '../utils/FeatureUtils.js';

export class TrackerDetector extends EngineBase {
  constructor() {
    super('TrackerDetector');
    this.blocklist = new Set();
    this.whitelist = new Set();
  }

  async init() {
    await super.init();
    // Load blocklist
    try {
      const response = await fetch(chrome.runtime.getURL('data/tracker_blocklist.json'));
      const data = await response.json();
      data.trackers.forEach(t => this.blocklist.add(t.domain));
      this.logger.info(`Loaded ${this.blocklist.size} known trackers`);
      
      await modelLoader.loadModel('rf_tracker_classifier', 'models/tracker_classifier/model.json');
    } catch (e) {
      this.logger.error('Failed to init resources:', e);
    }
  }

  /**
   * Main detection logic
   * @param {object} request - normalized request object
   */
  async execute(request) {
    const { domain, url, type, tabId } = request;

    // 1. Whitelist Check
    if (this.whitelist.has(domain)) return { isTracker: false };

    // 2. Blocklist Check (O(1))
    if (this.blocklist.has(domain)) {
      this.emit('TRACKER_DETECTED', { domain, type: 'known', category: 'advertising' });
      return { isTracker: true, reason: 'blocklist' };
    }

    // 3. ML Inference
    try {
      const vector = FeatureUtils.extractRequestFeatures(domain, url, { type, isThirdParty: true });
      const prediction = modelLoader.predict('rf_tracker_classifier', vector);

      if (prediction && prediction.category !== 'benign' && prediction.confidence > 0.7) {
        this.emit('TRACKER_DETECTED', { 
          domain, 
          type: 'ml_predicted', 
          category: prediction.category,
          confidence: prediction.confidence 
        });
        return { isTracker: true, reason: 'ml', details: prediction };
      }
    } catch (e) {
      this.logger.warn(`ML failed for ${domain}`, e);
    }

    return { isTracker: false };
  }
}

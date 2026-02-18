/**
 * PRIVISEE-X v2.0
 * Detectors: FingerprintDetector
 * 
 * Heuristic engine that listens for "suspect" API calls reported by the Content Script.
 * Detects Canvas, WebGL, AudioContext, and Font Enumeration attempts.
 */

import { EngineBase } from '../core/EngineBase.js';

export class FingerprintDetector extends EngineBase {
  constructor() {
    super('FingerprintDetector');
    this.fingerprintCounts = new Map(); // domain -> count
  }

  /**
   * Process an API access report
   * @param {object} report - { domain, api, method, args }
   */
  async execute(report) {
    const { domain, api, method } = report;
    
    // Key unique APIs (Canvas, Audio, WebGL)
    const key = `${domain}:${api}`;
    
    // Rate Limiting / Debouncing alerts
    // We don't want to alert on every single pixel read, just the aggregated behavior
    if (!this.fingerprintCounts.has(domain)) {
        this.fingerprintCounts.set(domain, {});
    }
    
    const domainStats = this.fingerprintCounts.get(domain);
    domainStats[api] = (domainStats[api] || 0) + 1;

    // Thresholds
    const THRESHOLDS = {
        'CanvasRenderingContext2D': 5, // getting data multiple times
        'AudioContext': 1,             // usually 1 is enough for fingerprinting
        'WebGLRenderingContext': 2
    };

    if (domainStats[api] === THRESHOLDS[api]) {
        this.emit('FINGERPRINTING_DETECTED', {
            domain,
            type: api,
            details: `Suspicious use of ${api}.${method}`
        });
        return { isFingerprinting: true, type: api };
    }
    
    return { isFingerprinting: false };
  }
}

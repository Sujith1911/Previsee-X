/**
 * PRIVISEE-X v2.0
 * Risk: RiskEngine
 *
 * Realistic Privacy Scoring:
 * - Logarithmic tracker scaling (heavy-use sites aren't instant max)
 * - High weight on fingerprinting (clear intent signal)
 * - Cookie weighting for third-party tracking cookies
 * - Thresholds: LOW < 20 | MODERATE 20–49 | HIGH 50–74 | CRITICAL 75+
 */

import { EngineBase } from '../core/EngineBase.js';

export const RiskLevel = {
  LOW:      'LOW',
  MODERATE: 'MODERATE',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL'
};

// Well-known CDN / asset domains that are always present and low-risk
const CDN_WHITELIST = new Set([
  'fonts.googleapis.com', 'fonts.gstatic.com', 'ajax.googleapis.com',
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com',
  'static.cloudflareinsights.com', 'i.ytimg.com', 's.ytimg.com',
  'yt3.ggpht.com', 'lh3.googleusercontent.com'
]);

export class RiskEngine extends EngineBase {
  constructor() {
    super('RiskEngine');
  }

  async init() {
    await super.init();
  }

  /**
   * Calculate a realistic risk score (0–100)
   * @param {object} ctx - { trackers, fingerprintAttempts, cookiesThirdParty, isHTTP, domain }
   */
  async execute(ctx) {
    let score = 0;

    const trackers       = ctx.trackers || 0;
    const fingerprints   = ctx.fingerprintAttempts || 0;
    const thirdPartyCookies = ctx.cookiesThirdParty || 0;
    const isHTTP         = ctx.isHTTP || false;

    // Skip CDN-only domains entirely
    if (ctx.domain && CDN_WHITELIST.has(ctx.domain)) {
      return { score: 0, level: RiskLevel.LOW, details: ctx };
    }

    // ── Trackers: logarithmic (prevents instant 100 on busy sites) ──
    // 1 tracker → 8pts, 5 → 18, 10 → 23, 20 → 28, 30 → 32
    if (trackers > 0) {
      score += Math.min(40, Math.log2(trackers + 1) * 13);
    }

    // ── Fingerprinting: 10pts per API used, max 30pts
    // (3+ distinct APIs = clear fingerprinting intent)
    score += Math.min(30, fingerprints * 10);

    // ── Third-party tracking cookies ──
    score += Math.min(20, thirdPartyCookies * 4);

    // ── HTTP (insecure connection) ──
    if (isHTTP) score += 15;

    // Normalize
    score = Math.round(Math.min(100, Math.max(0, score)));

    // Determine level
    let level = RiskLevel.LOW;
    if (score >= 20) level = RiskLevel.MODERATE;
    if (score >= 50) level = RiskLevel.HIGH;
    if (score >= 75) level = RiskLevel.CRITICAL;

    const result = { score, level, details: ctx };
    this.emit('RISK_CALCULATED', result);
    return result;
  }
}

/**
 * PRIVISEE-X v4.0 — RiskEngine (Standalone Module)
 *
 * v4.0 Scoring Architecture:
 *   Final = 0.35 × Behavioral + 0.30 × Static + 0.20 × Reputation + 0.15 × SecurityLayer
 *
 * This module provides the same formulas used in background.js calcRisk()
 * so that dashboard / research mode / explainability can import them without
 * duplicating logic.
 *
 * Thresholds: LOW ≤ 25 | MODERATE 26–60 | HIGH 61–74 | CRITICAL 75+
 */

import { EngineBase } from '../core/EngineBase.js';

export const RiskLevel = {
  LOW:      'LOW',
  MODERATE: 'MODERATE',
  HIGH:     'HIGH',
  CRITICAL: 'CRITICAL'
};

export const WebAdvisorStatus = {
  SAFE:      'SAFE',       // ≤ 25
  CAUTION:   'CAUTION',    // 26–60
  DANGEROUS: 'DANGEROUS'  // > 60
};

// Well-known CDN / asset domains — always low-risk
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
   * Calculate a v4.0 risk score (0–100)
   * @param {object} ctx - {
   *   trackers, fingerprintAttempts, cookiesThirdParty, isHTTP, domain,
   *   staticScore, reputationScore, securityLayerScore, certWarning
   * }
   * @returns {{ score, level, webAdvisorStatus, behavioral, staticScore, reputation, securityLayerRisk, details }}
   */
  async execute(ctx) {
    // Skip whitelisted CDN-only domains
    if (ctx.domain && CDN_WHITELIST.has(ctx.domain)) {
      return {
        score: 0, level: RiskLevel.LOW,
        webAdvisorStatus: WebAdvisorStatus.SAFE,
        behavioral: 0, staticScore: 0, reputation: 0, securityLayerRisk: 0,
        details: ctx
      };
    }

    // ── Behavioral score (0–100) ──────────────────────────────────────────
    const trackers       = ctx.trackers || 0;
    const fingerprints   = ctx.fingerprintAttempts || 0;
    const thirdPartyCookies = ctx.cookiesThirdParty || 0;
    const isHTTP         = ctx.isHTTP || false;

    let behavioral = 0;
    if (trackers > 0)          behavioral += Math.min(40, Math.log2(trackers + 1) * 13);
    behavioral += Math.min(30, fingerprints * 10);   // Fingerprinting: 10pts/API, max 30
    behavioral += Math.min(20, thirdPartyCookies * 4); // 3P cookies: 4pts each, max 20
    if (isHTTP) behavioral += 15;                     // Plain HTTP: +15
    behavioral = Math.round(Math.min(100, Math.max(0, behavioral)));

    // ── Static + Reputation + Security Layer (from ctx or defaults) ───────
    const staticScore       = Math.min(100, Math.max(0, ctx.staticScore       || 0));
    const reputationScore   = Math.min(100, Math.max(0, ctx.reputationScore   || 0));
    const securityLayerScore = Math.min(100, Math.max(0, ctx.securityLayerScore || 0));
    const securityLayerRisk = Math.round(100 - securityLayerScore); // invert → risk

    // ── v4.0 weighted final score ─────────────────────────────────────────
    let final = Math.round(Math.min(100, Math.max(0,
      0.35 * behavioral +
      0.30 * staticScore +
      0.20 * reputationScore +
      0.15 * securityLayerRisk
    )));

    // Certificate invalid → force minimum risk 70
    const certWarning = ctx.certWarning || null;
    if (certWarning?.isInvalid && final < 70) final = 70;

    // ── Level & WebAdvisor Status ─────────────────────────────────────────
    const level = final >= 75 ? RiskLevel.CRITICAL
                : final >= 61 ? RiskLevel.HIGH
                : final >= 26 ? RiskLevel.MODERATE
                : RiskLevel.LOW;

    const webAdvisorStatus = final <= 25 ? WebAdvisorStatus.SAFE
                           : final <= 60 ? WebAdvisorStatus.CAUTION
                           : WebAdvisorStatus.DANGEROUS;

    const result = {
      score: final,
      level,
      webAdvisorStatus,
      behavioral,
      staticScore,
      reputation: reputationScore,
      securityLayerRisk,
      securityLayerScore,
      certFloorApplied: certWarning?.isInvalid && final === 70,
      details: ctx
    };

    this.emit?.('RISK_CALCULATED', result);
    return result;
  }

  /**
   * Quick synchronous estimate for lightweight callers (no emit)
   * Uses behavioral-only sub-score.
   */
  static quickScore({ trackers = 0, fingerprints = 0, cookies = 0, isHTTP = false } = {}) {
    let s = 0;
    if (trackers > 0) s += Math.min(40, Math.log2(trackers + 1) * 13);
    s += Math.min(30, fingerprints * 10);
    s += Math.min(20, cookies * 4);
    if (isHTTP) s += 15;
    return Math.round(Math.min(100, s));
  }
}

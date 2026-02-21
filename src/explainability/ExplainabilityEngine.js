/**
 * PRIVISEE-X v2.0
 * Explainability: ExplainabilityEngine
 * 
 * Demystifies the risk score by:
 * 1. Breaking down contributions per factor (matching the risk formula exactly)
 * 2. Validating contributions sum ≈ riskScore
 * 3. Generating severity-aware natural language summaries
 * 4. Priority-ordered factor sorting (CRITICAL > HIGH > MODERATE > LOW)
 */

import { EngineBase } from '../core/EngineBase.js';

const IMPACT_PRIORITY = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };

export class ExplainabilityEngine extends EngineBase {
  constructor() {
    super('ExplainabilityEngine');
  }

  /**
   * Generate explanation for a Risk Score
   * @param {object} context - { trackers, fingerprintAttempts, cookiesThirdParty, isHTTP, isAnomalous, isSecure, riskScore }
   * @returns {{ summary, narrative, factors, contributionTotal }}
   */
  async execute(context) {
    const trackers          = context.trackers || 0;
    const fingerprints      = context.fingerprintAttempts || 0;
    const thirdPartyCookies = context.cookiesThirdParty || 0;
    const isHTTP            = context.isHTTP || false;
    const isAnomalous       = context.isAnomalous || false;
    const isSecure          = context.isSecure !== false; // default true
    const riskScore         = context.riskScore || 0;

    const factors = [];

    // ── Trackers: mirrors RiskEngine formula: Math.min(40, Math.log2(trackers+1) * 13)
    if (trackers > 0) {
      const contribution = parseFloat(Math.min(40, Math.log2(trackers + 1) * 13).toFixed(1));
      factors.push({
        key:          'trackers',
        type:         'negative',
        impact:       trackers >= 10 ? 'HIGH' : 'MODERATE',
        contribution,
        text:         `${trackers} tracker${trackers !== 1 ? 's' : ''} detected on this page.`
      });
    }

    // ── Fingerprinting: 10pts per API used, max 30
    if (fingerprints > 0) {
      const contribution = parseFloat(Math.min(30, fingerprints * 10).toFixed(1));
      factors.push({
        key:          'fingerprinting',
        type:         'negative',
        impact:       'CRITICAL',
        contribution,
        text:         `Device fingerprinting detected via ${fingerprints} browser API${fingerprints !== 1 ? 's' : ''} (Canvas/Audio/WebGL).`
      });
    }

    // ── Third-party tracking cookies: 4pts each, max 20
    if (thirdPartyCookies > 0) {
      const contribution = parseFloat(Math.min(20, thirdPartyCookies * 4).toFixed(1));
      factors.push({
        key:          'cookies',
        type:         'negative',
        impact:       thirdPartyCookies >= 4 ? 'HIGH' : 'MODERATE',
        contribution,
        text:         `${thirdPartyCookies} third-party tracking cookie${thirdPartyCookies !== 1 ? 's' : ''} set.`
      });
    }

    // ── HTTP (insecure): +15pts
    if (isHTTP) {
      factors.push({
        key:          'insecure',
        type:         'negative',
        impact:       'HIGH',
        contribution: 15,
        text:         'Connection uses insecure HTTP — data transmissions are unencrypted.'
      });
    }

    // ── Anomalous behavior
    if (isAnomalous) {
      factors.push({
        key:          'anomaly',
        type:         'negative',
        impact:       'MODERATE',
        contribution: 0, // Anomaly is informational, not part of numeric risk formula
        text:         'Site behavior is statistically unusual compared to your browsing history.'
      });
    }

    // ── Security headers
    if (!isSecure) {
      factors.push({
        key:          'security_headers',
        type:         'negative',
        impact:       'HIGH',
        contribution: 0, // Reported separately by SecurityAuditEngine
        text:         'Missing critical security headers (CSP, HSTS, or X-Frame-Options).'
      });
    }

    // ── Sort by priority: CRITICAL first
    factors.sort((a, b) => (IMPACT_PRIORITY[b.impact] || 0) - (IMPACT_PRIORITY[a.impact] || 0));

    // ── Validate contribution sum ≈ riskScore (±5 tolerance)
    const contributionTotal = parseFloat(
      factors.reduce((sum, f) => sum + (f.contribution || 0), 0).toFixed(1)
    );
    const scoreDeviation = Math.abs(contributionTotal - riskScore);
    if (riskScore > 0 && scoreDeviation > 5) {
      this.logger.warn(
        `Contribution sum (${contributionTotal}) deviates from riskScore (${riskScore}) by ${scoreDeviation.toFixed(1)} pts`
      );
    }

    // ── Natural language summary
    const summary   = this._buildSummary(factors);
    const narrative = this.generateNaturalLanguageSummary(riskScore, context.riskLevel, factors);

    return {
      summary,
      narrative,
      factors,
      contributionTotal
    };
  }

  /**
   * One-line summary (used in popup)
   */
  _buildSummary(factors) {
    if (factors.length === 0) {
      return 'No significant privacy risks detected on this site.';
    }
    const top = factors[0];
    return `Privacy risk: ${top.text}`;
  }

  /**
   * Severity-aware natural language paragraph (used in dashboard)
   * @param {number} score
   * @param {string} level - LOW | MODERATE | HIGH | CRITICAL
   * @param {Array}  factors
   * @returns {string}
   */
  generateNaturalLanguageSummary(score, level, factors) {
    if (!factors || factors.length === 0) {
      return 'This site appears clean. No trackers, fingerprinting attempts, or suspicious cookies were detected. Your privacy is well-protected here.';
    }

    const openings = {
      LOW:      'This site has minimal privacy concerns.',
      MODERATE: 'This site engages in moderate tracking activity.',
      HIGH:     'This site poses a significant privacy risk.',
      CRITICAL: 'WARNING: This site poses a critical threat to your privacy.'
    };

    const opening   = openings[level] || openings.MODERATE;
    const factTexts = factors
      .filter(f => f.contribution > 0 || f.key === 'anomaly')
      .map(f => f.text)
      .join(' ');

    const closings = {
      LOW:      'You can browse safely, but consider using a tracker blocker.',
      MODERATE: 'Consider blocking third-party cookies or using a VPN on this site.',
      HIGH:     'It is strongly recommended to limit your activity on this site.',
      CRITICAL: 'Avoid sharing any personal data on this site. Consider leaving immediately.'
    };

    const closing = closings[level] || closings.MODERATE;

    return `${opening} ${factTexts} ${closing}`.trim();
  }
}

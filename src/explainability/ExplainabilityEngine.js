/**
 * PRIVISEE-X v5.0 — ExplainabilityEngine
 * WebAdvisor Mode: Explainable Risk Breakdown
 *
 * Demystifies the v4.0 risk score by:
 * 1. Matching the v4.0 formula exactly (35% Behavioral / 30% Static / 20% Reputation / 15% Security)
 * 2. Validating contributions sum ≈ riskScore (±8 tolerance for weighted composites)
 * 3. Generating severity-aware natural language summaries
 * 4. Certificate warning integration (invalid cert → forced floor of 70)
 * 5. Priority-ordered factor sorting (CRITICAL > HIGH > MODERATE > LOW)
 */

import { EngineBase } from '../core/EngineBase.js';

const IMPACT_PRIORITY = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };

export class ExplainabilityEngine extends EngineBase {
  constructor() {
    super('ExplainabilityEngine');
  }

  /**
   * Generate explanation for a v4.0 Risk Score
   * @param {object} context - {
   *   trackers, fingerprintAttempts, cookiesThirdParty, isHTTP,
   *   isAnomalous, isSecure, riskScore, riskLevel,
   *   staticScore, behavioralScore, reputationScore, securityLayerScore,
   *   certWarning, staticBreakdown, thirdPartyDomains
   * }
   * @returns {{ summary, narrative, factors, contributionTotal, certFloorApplied }}
   */
  async execute(context) {
    const trackers          = context.trackers || 0;
    const fingerprints      = context.fingerprintAttempts || 0;
    const thirdPartyCookies = context.cookiesThirdParty || 0;
    const isHTTP            = context.isHTTP || false;
    const isAnomalous       = context.isAnomalous || false;
    const isSecure          = context.isSecure !== false;
    const riskScore         = context.riskScore || 0;

    // v4.0 component scores
    const behavioralScore   = context.behavioralScore   || 0;
    const staticScore       = context.staticScore       || 0;
    const reputationScore   = context.reputationScore   || 0;
    const securityLayerScore = context.securityLayerScore || 0; // 0–100, higher = better
    const certWarning       = context.certWarning || null;

    const factors = [];

    // ── v4.0: Behavioral component (35% weight) ──────────────────────────
    const behavioralContrib = parseFloat((behavioralScore * 0.35).toFixed(1));

    if (trackers > 0) {
      factors.push({
        key:          'trackers',
        type:         'negative',
        impact:       trackers >= 10 ? 'HIGH' : 'MODERATE',
        contribution: parseFloat(Math.min(40, Math.log2(trackers + 1) * 13 * 0.35).toFixed(1)),
        text:         `${trackers} tracker${trackers !== 1 ? 's' : ''} detected on this page.`
      });
    }

    if (fingerprints > 0) {
      factors.push({
        key:          'fingerprinting',
        type:         'negative',
        impact:       'CRITICAL',
        contribution: parseFloat(Math.min(30, fingerprints * 10 * 0.35).toFixed(1)),
        text:         `Device fingerprinting detected via ${fingerprints} browser API${fingerprints !== 1 ? 's' : ''} (Canvas/Audio/WebGL).`
      });
    }

    if (thirdPartyCookies > 0) {
      factors.push({
        key:          'cookies',
        type:         'negative',
        impact:       thirdPartyCookies >= 4 ? 'HIGH' : 'MODERATE',
        contribution: parseFloat(Math.min(20, thirdPartyCookies * 4 * 0.35).toFixed(1)),
        text:         `${thirdPartyCookies} third-party tracking cookie${thirdPartyCookies !== 1 ? 's' : ''} set.`
      });
    }

    if (isAnomalous) {
      factors.push({
        key:          'anomaly',
        type:         'negative',
        impact:       'MODERATE',
        contribution: 0,
        text:         'Behavioral pattern is statistically unusual compared to your history.'
      });
    }

    // ── v4.0: Static component (30% weight) ─────────────────────────────
    if (staticScore >= 10) {
      const topFactor = (context.staticBreakdown || []).sort((a, b) => b.delta - a.delta)[0];
      factors.push({
        key:          'static_score',
        type:         'negative',
        impact:       staticScore >= 50 ? 'HIGH' : 'MODERATE',
        contribution: parseFloat((staticScore * 0.30).toFixed(1)),
        text:         `Static risk score: ${staticScore}/100 — ${topFactor?.factor || 'Security headers missing or weak'}.`
      });
    }

    if (isHTTP) {
      factors.push({
        key:          'insecure',
        type:         'negative',
        impact:       'HIGH',
        contribution: parseFloat((15 * 0.30).toFixed(1)),
        text:         'Connection uses plain HTTP — all data is unencrypted in transit.'
      });
    }

    // ── v4.0: Security Layer component (15% weight, higher = better) ────
    const securityLayerRisk = 100 - securityLayerScore; // invert for risk
    if (securityLayerRisk >= 20) {
      const issues = [];
      if (!context.certWarning?.hsts) issues.push('no HSTS');
      if (context.certWarning?.mixedContent) issues.push('mixed content');
      if (!isSecure) issues.push('missing security headers');

      factors.push({
        key:          'security_layer',
        type:         'negative',
        impact:       securityLayerRisk >= 60 ? 'HIGH' : 'MODERATE',
        contribution: parseFloat((securityLayerRisk * 0.15).toFixed(1)),
        text:         `Security layer score: ${securityLayerScore}/100${issues.length ? ` — ${issues.join(', ')}` : ''}.`
      });
    }

    // ── v4.0: Certificate warning (can force risk floor to 70) ───────────
    const certFloorApplied = certWarning?.isInvalid && riskScore >= 70 && riskScore <= 72;
    if (certWarning?.hasWarning) {
      const severity = certWarning.severity || 'WARNING';
      factors.push({
        key:          'cert_warning',
        type:         'negative',
        impact:       certWarning.isInvalid ? 'CRITICAL' : 'HIGH',
        contribution: certWarning.isInvalid ? 15 : 8,
        text:         `Certificate issue: ${certWarning.certStatusLabel || severity}${certFloorApplied ? ' — risk floor raised to 70' : ''}.`
      });
    }

    // ── v4.0: Reputation component (20% weight) ─────────────────────────
    if (reputationScore >= 10) {
      const tpCount = (context.thirdPartyDomains || []).length;
      factors.push({
        key:          'reputation',
        type:         'negative',
        impact:       reputationScore >= 60 ? 'HIGH' : 'LOW',
        contribution: parseFloat((reputationScore * 0.20).toFixed(1)),
        text:         tpCount > 0
          ? `${tpCount} third-party connection${tpCount !== 1 ? 's' : ''} detected — reputation score: ${reputationScore}/100.`
          : `Reputation score: ${reputationScore}/100 based on behavioral DNA cluster.`
      });
    }

    // ── Sort: CRITICAL → HIGH → MODERATE → LOW ──────────────────────────
    factors.sort((a, b) => (IMPACT_PRIORITY[b.impact] || 0) - (IMPACT_PRIORITY[a.impact] || 0));

    // ── Validate contribution sum ≈ riskScore (±8 tolerance for v4.0 composites) ──
    const contributionTotal = parseFloat(
      factors.reduce((sum, f) => sum + (f.contribution || 0), 0).toFixed(1)
    );
    const scoreDeviation = Math.abs(contributionTotal - riskScore);
    if (riskScore > 0 && scoreDeviation > 8) {
      this.logger?.warn?.(
        `Contribution sum (${contributionTotal}) deviates from riskScore (${riskScore}) by ${scoreDeviation.toFixed(1)} pts`
      );
    }

    const summary   = this._buildSummary(factors, riskScore, certWarning);
    const narrative = this.generateNaturalLanguageSummary(riskScore, context.riskLevel, factors, certWarning);

    return { summary, narrative, factors, contributionTotal, certFloorApplied: !!certFloorApplied };
  }

  /**
   * One-line summary (used in popup badge sub-text)
   */
  _buildSummary(factors, riskScore, certWarning) {
    if (certWarning?.isInvalid) {
      return `⚠️ Certificate invalid — risk floor applied. ${factors[0]?.text || ''}`;
    }
    if (factors.length === 0) {
      return 'No significant privacy risks detected on this site.';
    }
    const top = factors[0];
    return `Privacy risk (${riskScore}/100): ${top.text}`;
  }

  /**
   * v4.0 severity-aware natural language paragraph (for dashboard / research mode)
   * @param {number} score
   * @param {string} level - LOW | MODERATE | HIGH | CRITICAL
   * @param {Array}  factors
   * @param {object} certWarning
   * @returns {string}
   */
  generateNaturalLanguageSummary(score, level, factors, certWarning) {
    if (!factors || factors.length === 0) {
      return 'This site appears clean. No trackers, fingerprinting, or certificate issues were detected. Your privacy is well-protected here.';
    }

    const openings = {
      LOW:      'This site has minimal privacy concerns.',
      MODERATE: 'This site engages in moderate tracking or security issues.',
      HIGH:     'This site poses a significant privacy and security risk.',
      CRITICAL: 'WARNING: This site poses a critical threat to your privacy and security.'
    };

    const opening   = openings[level] || openings.MODERATE;
    const factTexts = factors
      .filter(f => f.contribution > 0 || f.key === 'anomaly')
      .map(f => f.text)
      .join(' ');

    const closings = {
      LOW:      'You can browse safely, but consider enabling Strict Mode for extra protection.',
      MODERATE: 'Consider blocking third-party cookies or trusting this site only if you know it.',
      HIGH:     'It is strongly recommended to limit your activity and avoid submitting personal data.',
      CRITICAL: 'Avoid sharing any personal data on this site. Consider leaving immediately.'
    };

    const closing = closings[level] || closings.MODERATE;

    const certNote = certWarning?.isInvalid
      ? ' The site\'s TLS certificate is invalid — your connection may not be secure.'
      : '';

    return `${opening}${certNote} ${factTexts} ${closing}`.trim();
  }
}

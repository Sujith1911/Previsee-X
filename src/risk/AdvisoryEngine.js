/**
 * PRIVISEE-X v4.0 — AdvisoryEngine
 * Generates contextual, human-readable advice based on site analysis.
 * WebAdvisor-style advisory panel.
 */

export class AdvisoryEngine {
  /**
   * Generate advice bullets from site analysis data.
   * @param {object} params
   * @returns {{ observations: string[], recommendations: string[], riskSummary: string }}
   */
  static generateAdvice({
    trackerCount       = 0,
    adCount            = 0,
    fingerprintCount   = 0,
    cookieCount        = 0,
    riskScore          = 0,
    staticBreakdown    = [],
    certWarning        = null,
    thirdPartyDomains  = [],
    strictMode         = false,
    trusted            = false,
    clusterName        = '',
    blockedCount       = 0,
  } = {}) {

    if (trusted) {
      return {
        observations:   ['✅ You have marked this site as trusted'],
        recommendations: ['Risk signals are still monitored internally'],
        riskSummary:    'Trusted by you — display suppressed',
      };
    }

    const observations   = [];
    const recommendations = [];

    // ── Tracker / Ad observations ──────────────────────────────────────────────
    if (trackerCount > 0) {
      observations.push(`Uses ${trackerCount} tracking script${trackerCount > 1 ? 's' : ''}`);
    }
    if (adCount > 0) {
      observations.push(`Loaded ${adCount} ad resource${adCount > 1 ? 's' : ''}`);
    }
    if (fingerprintCount > 0) {
      observations.push(`Accessed ${fingerprintCount} browser fingerprinting API${fingerprintCount > 1 ? 's' : ''}`);
    }
    if (thirdPartyDomains.length > 3) {
      observations.push(`Sends data to ${thirdPartyDomains.length} third-party domains`);
    }
    if (cookieCount > 10) {
      observations.push(`Stores ${cookieCount} cookies in your browser`);
    }
    if (blockedCount > 0) {
      observations.push(`${blockedCount} resource${blockedCount > 1 ? 's' : ''} blocked by PRIVISEE-X`);
    }

    // ── Static / Header observations ───────────────────────────────────────────
    const missingHeaders = (staticBreakdown || [])
      .filter(f => f.factor && f.factor.startsWith('Missing'))
      .map(f => f.factor.replace('Missing ', ''));

    if (missingHeaders.length > 0) {
      observations.push(`Missing ${missingHeaders.length} security header${missingHeaders.length > 1 ? 's' : ''}: ${missingHeaders.slice(0, 3).join(', ')}`);
    }

    // ── Certificate observations ───────────────────────────────────────────────
    if (certWarning) {
      if (certWarning.severity === 'CRITICAL') {
        observations.push('⚠️ No HTTPS encryption — connection is not secure');
      } else if (certWarning.severity === 'WARNING') {
        observations.push('⚠️ Weak HTTPS configuration detected');
      }
      if (certWarning.mixedContent) {
        observations.push('Mixed content (HTTP resources on HTTPS page)');
      }
    }

    // ── Behavioral cluster observation ─────────────────────────────────────────
    if (clusterName === 'heavy_fingerprinter') {
      observations.push('Classified as heavy browser fingerprinter');
    } else if (clusterName === 'data_exfiltrator') {
      observations.push('Behavioral pattern matches data exfiltration profile');
    } else if (clusterName === 'tracker_analytics') {
      observations.push('Heavy analytics and tracking behavior detected');
    }

    // ── Recommendations based on risk ─────────────────────────────────────────
    if (riskScore >= 70) {
      recommendations.push('⛔ Avoid entering sensitive data on this site');
      recommendations.push('⛔ Do not log in or provide personal information');
      recommendations.push('Consider leaving this site immediately');
    } else if (riskScore >= 40) {
      recommendations.push('⚠️ Be cautious with personal data on this site');
      recommendations.push('Avoid submitting payment information');
    }

    if (fingerprintCount > 2) {
      recommendations.push('Enable Strict Mode to limit fingerprinting');
    }
    if (trackerCount > 5 && !strictMode) {
      recommendations.push('Enable Strict Mode to reduce tracker exposure');
    }
    if (certWarning && certWarning.severity === 'CRITICAL') {
      recommendations.push('Switch to HTTPS version of this site if available');
    }
    if (missingHeaders.length >= 3) {
      recommendations.push('Site lacks basic security hardening');
    }

    // Default if nothing to say
    if (observations.length === 0) {
      observations.push('No significant privacy or security signals detected');
    }
    if (recommendations.length === 0) {
      recommendations.push('Site appears safe to browse normally');
    }

    // ── Risk summary ──────────────────────────────────────────────────────────
    const riskSummary =
      riskScore >= 70 ? `⛔ High Risk — Score ${riskScore}/100` :
      riskScore >= 40 ? `⚠️ Caution — Score ${riskScore}/100` :
                        `✅ Low Risk — Score ${riskScore}/100`;

    return { observations, recommendations, riskSummary };
  }
}

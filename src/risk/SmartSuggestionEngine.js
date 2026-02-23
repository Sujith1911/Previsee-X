/**
 * PRIVISEE-X v5.0 — Smart Suggestion Engine
 * Context-aware, prioritized recommendations for users.
 */
'use strict';

const SmartSuggestionEngine = (() => {

  /**
   * Generate prioritized suggestions based on the current page context.
   * @param {{
   *   trackerCount: number, cookieCount: number, riskScore: number,
   *   certWarning: object|null, clusterName: string, strictMode: boolean,
   *   fingerprintCount: number, adCount: number, trusted: boolean,
   *   staticBreakdown: Array
   * }} ctx
   * @returns {{ priority: number, icon: string, title: string, description: string }[]}
   */
  function generate(ctx = {}) {
    const suggestions = [];
    const {
      trackerCount = 0, cookieCount = 0, riskScore = 0,
      certWarning = null, clusterName = '', strictMode = false,
      fingerprintCount = 0, adCount = 0, trusted = false,
      staticBreakdown = []
    } = ctx;

    // ── Certificate issues are the highest priority ──────────────────────────
    if (certWarning?.isInvalid) {
      suggestions.push({
        priority: 100,
        icon: '🛑',
        title: 'Do Not Login or Share Data',
        description: 'This site has an invalid certificate. Any credentials or sensitive info you enter could be intercepted.'
      });
    } else if (certWarning?.hasWarning) {
      suggestions.push({
        priority: 85,
        icon: '⚠️',
        title: 'Verify Site Certificate',
        description: `Security issue detected: ${(certWarning?.reasons || []).join('; ') || 'Certificate anomaly'}. Proceed with caution.`
      });
    }

    // ── High risk score ──────────────────────────────────────────────────────
    if (!trusted && riskScore >= 75) {
      suggestions.push({
        priority: 90,
        icon: '🔴',
        title: 'Avoid Sensitive Actions',
        description: 'Risk score is critically high. Avoid logging in, making purchases, or sharing personal data on this site.'
      });
    }

    // ── Heavy fingerprinting ─────────────────────────────────────────────────
    if (clusterName === 'heavy_fingerprinter' || fingerprintCount >= 3) {
      suggestions.push({
        priority: 80,
        icon: '🕵️',
        title: 'Heavy Fingerprinting Detected',
        description: 'This site is actively fingerprinting your browser. Consider using a privacy-focused browser profile or VPN.'
      });
    }

    // ── Enable Strict Mode ───────────────────────────────────────────────────
    if (!strictMode && (trackerCount >= 5 || adCount >= 3)) {
      suggestions.push({
        priority: 70,
        icon: '🛡️',
        title: 'Enable Strict Mode',
        description: `${trackerCount} trackers and ${adCount} ads detected. Strict Mode will block redirect chains and ad networks automatically.`
      });
    }

    // ── Delete Cookies ───────────────────────────────────────────────────────
    if (cookieCount >= 8 && riskScore >= 40) {
      suggestions.push({
        priority: 65,
        icon: '🍪',
        title: 'Delete Tracking Cookies',
        description: `${cookieCount} cookies found on a risky site. Deleting them reduces your tracking surface.`
      });
    }

    // ── Missing HSTS ─────────────────────────────────────────────────────────
    const hasNoHSTS = staticBreakdown.some(f => f.factor?.includes('HSTS'));
    if (hasNoHSTS && riskScore >= 30) {
      suggestions.push({
        priority: 50,
        icon: '🔓',
        title: 'Site Missing HSTS',
        description: 'This site does not enforce HTTPS. Your connection could be downgraded to unencrypted HTTP by an attacker.'
      });
    }

    // ── Missing CSP ─────────────────────────────────────────────────────────
    const hasNoCSP = staticBreakdown.some(f => f.factor?.includes('CSP'));
    if (hasNoCSP) {
      suggestions.push({
        priority: 40,
        icon: '📋',
        title: 'No Content Security Policy',
        description: 'Site lacks CSP headers, making it vulnerable to injection attacks that could steal your data.'
      });
    }

    // ── Excessive third-party trackers ───────────────────────────────────────
    if (trackerCount >= 10) {
      suggestions.push({
        priority: 60,
        icon: '📡',
        title: 'Excessive Tracker Activity',
        description: `${trackerCount} third-party trackers detected. This site extensively shares your data with external parties.`
      });
    }

    // ── General safety for low risk ──────────────────────────────────────────
    if (riskScore <= 15 && !certWarning?.isInvalid) {
      suggestions.push({
        priority: 5,
        icon: '✅',
        title: 'Site Appears Safe',
        description: 'Low risk detected. Continue browsing normally. PRIVISEE-X will alert you if anything changes.'
      });
    }

    // Sort by priority descending, return top 5
    return suggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);
  }

  return { generate };
})();

// Export for both module (background) and script (popup) contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SmartSuggestionEngine };
} else {
  window.SmartSuggestionEngine = SmartSuggestionEngine;
}

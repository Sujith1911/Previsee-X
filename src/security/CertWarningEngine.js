/**
 * PRIVISEE-X v4.0 — CertWarningEngine
 * Evaluates TLS/Certificate security from HTTP response headers (100% local).
 *
 * Since MV3 extensions cannot directly inspect TLS certificate details,
 * we infer certificate and encryption strength from response headers,
 * protocol, and known patterns — mimicking WebAdvisor behavior.
 */

export class CertWarningEngine {
  /**
   * Evaluate security posture from headers and URL.
   * @param {object} params
   * @param {string} params.url        - Full page URL
   * @param {object} params.headers    - Normalized (lowercase) response headers
   * @param {number} params.statusCode - HTTP status code
   * @returns {object} certWarning object
   */
  static evaluate({ url = '', headers = {}, statusCode = 200 }) {
    const h = {};
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;

    const isHTTPS   = url.startsWith('https://');
    const isHTTP    = url.startsWith('http://') && !isHTTPS;
    const hsts      = h['strict-transport-security'] || null;
    const csp       = h['content-security-policy'] || null;
    const hasHSTS   = !!hsts;

    const reasons   = [];
    const issues    = [];
    let severity    = 'NONE';   // NONE | INFO | WARNING | CRITICAL
    let certStatus  = 'VALID';  // VALID | WEAK | SELF_SIGNED | EXPIRED | NONE
    let encryption  = 'STRONG'; // STRONG | WEAK | NONE

    // ── 1. Plain HTTP ──────────────────────────────────────────────────────────
    if (isHTTP) {
      certStatus  = 'NONE';
      encryption  = 'NONE';
      severity    = 'CRITICAL';
      reasons.push('No encryption — plain HTTP connection');
      issues.push({ code: 'NO_HTTPS', label: 'No Encryption', severity: 'CRITICAL' });
    }

    // ── 2. HTTPS without HSTS (weak TLS pinning) ──────────────────────────────
    if (isHTTPS && !hasHSTS) {
      if (severity !== 'CRITICAL') severity = 'WARNING';
      if (certStatus === 'VALID') certStatus = 'WEAK';
      if (encryption === 'STRONG') encryption = 'WEAK';
      reasons.push('Missing HSTS — not protected against SSL stripping');
      issues.push({ code: 'NO_HSTS', label: 'No HSTS', severity: 'WARNING' });
    }

    // ── 3. Mixed content risk ──────────────────────────────────────────────────
    if (isHTTPS && csp) {
      const cspLower = csp.toLowerCase();
      const hasMixedContentGuard =
        cspLower.includes('upgrade-insecure-requests') ||
        cspLower.includes('block-all-mixed-content');
      if (!hasMixedContentGuard) {
        if (severity === 'NONE') severity = 'INFO';
        reasons.push('CSP does not block mixed content');
        issues.push({ code: 'MIXED_CONTENT_RISK', label: 'Mixed Content Risk', severity: 'INFO' });
      }
    } else if (isHTTPS && !csp) {
      if (severity === 'NONE') severity = 'INFO';
      reasons.push('No CSP — mixed content loading possible');
      issues.push({ code: 'NO_CSP', label: 'No CSP', severity: 'INFO' });
    }

    // ── 4. Short HSTS max-age (weak pinning) ──────────────────────────────────
    if (isHTTPS && hasHSTS) {
      const match = hsts.match(/max-age=(\d+)/i);
      if (match) {
        const maxAge = parseInt(match[1], 10);
        if (maxAge < 86400) { // < 1 day
          if (severity === 'NONE') severity = 'INFO';
          encryption = 'WEAK';
          reasons.push('HSTS max-age is very short (< 1 day)');
          issues.push({ code: 'WEAK_HSTS', label: 'Weak HSTS', severity: 'INFO' });
        }
      }
    }

    // ── 5. Redirect to HTTP (detected by location header) ──────────────────────
    const location = h['location'] || '';
    if (location.startsWith('http://')) {
      severity   = 'CRITICAL';
      certStatus = 'NONE';
      encryption = 'NONE';
      reasons.push('Redirect to unencrypted HTTP detected');
      issues.push({ code: 'REDIRECT_TO_HTTP', label: 'Redirect to HTTP', severity: 'CRITICAL' });
    }

    // ── Build display labels ───────────────────────────────────────────────────
    const encryptionLabel = encryption === 'STRONG' ? 'Strong (HTTPS)' :
                            encryption === 'WEAK'   ? 'Weak (HTTPS/No HSTS)' : 'None (HTTP)';

    const certStatusLabel = certStatus === 'VALID'       ? 'Valid' :
                            certStatus === 'WEAK'        ? 'Weak' :
                            certStatus === 'SELF_SIGNED' ? 'Self-Signed' :
                            certStatus === 'EXPIRED'     ? 'Expired' : 'Not Present';

    const securityHeadersScore = CertWarningEngine.scoreSecurityHeaders(h);
    const mixedContent = isHTTPS && !csp ? true :
                         (csp && !csp.toLowerCase().includes('upgrade-insecure-requests') &&
                          !csp.toLowerCase().includes('block-all-mixed-content'));
    const hstsParsed   = hasHSTS;

    return {
      isInvalid:           severity === 'CRITICAL',
      hasWarning:          severity === 'WARNING' || severity === 'CRITICAL',
      severity,            // NONE | INFO | WARNING | CRITICAL
      certStatus,          // VALID | WEAK | SELF_SIGNED | EXPIRED | NONE
      certStatusLabel,
      encryption,          // STRONG | WEAK | NONE
      encryptionLabel,
      hsts:                hstsParsed,
      mixedContent:        !!mixedContent,
      securityHeadersScore,
      reasons,
      issues,
      isHTTPS,
    };
  }

  /**
   * Compute a 0–100 security headers score.
   */
  static scoreSecurityHeaders(h) {
    let score = 0;
    if (h['content-security-policy'])   score += 25;
    if (h['strict-transport-security']) score += 25;
    if (h['x-frame-options'])           score += 15;
    if (h['referrer-policy'])           score += 15;
    if (h['x-content-type-options'] === 'nosniff') score += 10;
    if (h['permissions-policy'])        score += 10;
    return score;
  }

  /**
   * Format reasons into a human-readable warning message.
   */
  static formatWarningMessage(certWarning) {
    if (!certWarning || !certWarning.hasWarning) return null;
    const lines = ['⚠️ SECURITY ISSUES DETECTED:'];
    for (const r of certWarning.reasons) lines.push(`• ${r}`);
    return lines.join('\n');
  }
}

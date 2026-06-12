/**
 * PRIVISEE-X v4.0 — CertWarningEngine
 * Evaluates TLS/Certificate security from HTTP response headers AND
 * Chrome webNavigation error codes (100% local).
 *
 * Two evaluation paths:
 *  1. evaluate({ url, headers, statusCode })
 *     → header-based inference (HSTS, CSP, redirects, plain HTTP)
 *     → used when onHeadersReceived fires normally
 *
 *  2. evaluateFromErrorCode(errorCode, url)
 *     → Chrome net::ERR_CERT_* / ERR_SSL_* code mapping
 *     → used when onErrorOccurred fires (cert blocks the page entirely)
 */

// ── Chrome net-error → cert severity mapping ──────────────────────────────────
const CERT_ERROR_MAP = {
  // Date / Validity
  'ERR_CERT_DATE_INVALID':           { status: 'EXPIRED',     label: 'Certificate Expired',           severity: 'CRITICAL', isInvalid: true  },
  'ERR_CERT_NOT_YET_VALID':          { status: 'EXPIRED',     label: 'Certificate Not Yet Valid',      severity: 'CRITICAL', isInvalid: true  },
  // Authority / Trust
  'ERR_CERT_AUTHORITY_INVALID':      { status: 'SELF_SIGNED', label: 'Untrusted Certificate Authority',severity: 'CRITICAL', isInvalid: true  },
  'ERR_CERT_INVALID':                { status: 'SELF_SIGNED', label: 'Invalid Certificate',            severity: 'CRITICAL', isInvalid: true  },
  'ERR_CERT_REVOKED':                { status: 'EXPIRED',     label: 'Certificate Revoked',            severity: 'CRITICAL', isInvalid: true  },
  'ERR_CERT_SYMANTEC_LEGACY':        { status: 'WEAK',        label: 'Distrusted Legacy Certificate',  severity: 'CRITICAL', isInvalid: true  },
  // Hostname mismatch
  'ERR_CERT_COMMON_NAME_INVALID':    { status: 'MISMATCH',    label: 'Certificate Name Mismatch',      severity: 'CRITICAL', isInvalid: true  },
  'ERR_SSL_SERVER_CERT_BAD_FORMAT':  { status: 'WEAK',        label: 'Malformed Certificate',          severity: 'CRITICAL', isInvalid: true  },
  // Key / Protocol issues
  'ERR_SSL_VERSION_OR_CIPHER_MISMATCH': { status: 'WEAK',    label: 'Weak SSL Version / Cipher',      severity: 'CRITICAL', isInvalid: true  },
  'ERR_SSL_OBSOLETE_CIPHER':         { status: 'WEAK',        label: 'Obsolete SSL Cipher',            severity: 'WARNING',  isInvalid: false },
  'ERR_SSL_WEAK_SERVER_EPHEMERAL_DH_KEY':{ status: 'WEAK',   label: 'Weak DH Key',                    severity: 'WARNING',  isInvalid: false },
  'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN':{ status: 'WEAK',   label: 'Certificate Pinning Failure',    severity: 'CRITICAL', isInvalid: true  },
  // Protocol-level failures
  'ERR_SSL_PROTOCOL_ERROR':          { status: 'NONE',        label: 'SSL Protocol Error',             severity: 'CRITICAL', isInvalid: true  },
  'ERR_SSL_BAD_RECORD_MAC_ALERT':    { status: 'NONE',        label: 'SSL Record Integrity Failure',   severity: 'CRITICAL', isInvalid: true  },
  // Network-level (may indicate MITM/interception)
  'ERR_CERT_UNABLE_TO_CHECK_REVOCATION':{ status: 'WEAK',    label: 'Revocation Check Failed',        severity: 'WARNING',  isInvalid: false },
  'ERR_CERT_NO_REVOCATION_MECHANISM':{ status: 'WEAK',        label: 'No Revocation Mechanism',        severity: 'WARNING',  isInvalid: false },
};

export class CertWarningEngine {
  /**
   * Evaluate security posture from HTTP response headers and URL.
   * Used when the page loads successfully (onHeadersReceived path).
   *
   * @param {object} params
   * @param {string} params.url        - Full page URL
   * @param {object} params.headers    - Normalized (lowercase) response headers
   * @param {number} [params.statusCode] - HTTP status code
   * @returns {object} certWarning object
   */
  static evaluate({ url = '', headers = {}, statusCode = 200 }) {
    const h = {};
    for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;

    const isHTTPS   = url.startsWith('https://');
    const isHTTP    = url.startsWith('http://') && !isHTTPS;
    const hsts      = h['strict-transport-security'] || null;
    const csp       = h['content-security-policy'] || null;
    const xfo       = h['x-frame-options'] || null;
    const hasHSTS   = !!hsts;

    const reasons   = [];
    const issues    = [];
    let severity    = 'NONE';   // NONE | INFO | WARNING | CRITICAL
    let certStatus  = 'VALID';  // VALID | WEAK | SELF_SIGNED | EXPIRED | MISMATCH | NONE
    let encryption  = 'STRONG'; // STRONG | WEAK | NONE

    // ── 1. Plain HTTP ─────────────────────────────────────────────────────────
    if (isHTTP) {
      certStatus  = 'NONE';
      encryption  = 'NONE';
      severity    = 'CRITICAL';
      reasons.push('No encryption — plain HTTP connection');
      issues.push({ code: 'NO_HTTPS', label: 'No Encryption', severity: 'CRITICAL' });
    }

    // ── 2. HTTPS without HSTS ─────────────────────────────────────────────────
    if (isHTTPS && !hasHSTS) {
      if (severity !== 'CRITICAL') severity = 'WARNING';
      if (certStatus === 'VALID') certStatus = 'WEAK';
      if (encryption === 'STRONG') encryption = 'WEAK';
      reasons.push('Missing HSTS — not protected against SSL stripping');
      issues.push({ code: 'NO_HSTS', label: 'No HSTS', severity: 'WARNING' });
    }

    // ── 3. Mixed content / CSP check ─────────────────────────────────────────
    if (isHTTPS && csp) {
      const cspLower = csp.toLowerCase();
      const hasMixedGuard =
        cspLower.includes('upgrade-insecure-requests') ||
        cspLower.includes('block-all-mixed-content');
      if (!hasMixedGuard) {
        if (severity === 'NONE') severity = 'INFO';
        reasons.push('CSP does not block mixed content');
        issues.push({ code: 'MIXED_CONTENT_RISK', label: 'Mixed Content Risk', severity: 'INFO' });
      }
    } else if (isHTTPS && !csp) {
      if (severity === 'NONE') severity = 'INFO';
      reasons.push('No Content-Security-Policy — mixed content loading possible');
      issues.push({ code: 'NO_CSP', label: 'No CSP', severity: 'INFO' });
    }

    // ── 4. Short HSTS max-age ─────────────────────────────────────────────────
    if (isHTTPS && hasHSTS) {
      const match = hsts.match(/max-age=(\d+)/i);
      if (match) {
        const maxAge = parseInt(match[1], 10);
        if (maxAge < 86400) {
          if (severity === 'NONE') severity = 'INFO';
          encryption = 'WEAK';
          reasons.push('HSTS max-age is very short (< 1 day) — easily bypassed');
          issues.push({ code: 'WEAK_HSTS', label: 'Weak HSTS', severity: 'INFO' });
        }
      }
    }

    // ── 5. Redirect to plain HTTP ─────────────────────────────────────────────
    const location = h['location'] || '';
    if (location.startsWith('http://')) {
      severity   = 'CRITICAL';
      certStatus = 'NONE';
      encryption = 'NONE';
      reasons.push('Site redirects to unencrypted HTTP');
      issues.push({ code: 'REDIRECT_TO_HTTP', label: 'Redirect to HTTP', severity: 'CRITICAL' });
    }

    // ── 6. Missing security headers (score-reducing, not severe) ─────────────
    if (isHTTPS && !xfo) {
      if (severity === 'NONE') severity = 'INFO';
      reasons.push('Missing X-Frame-Options — clickjacking possible');
      issues.push({ code: 'NO_XFO', label: 'No X-Frame-Options', severity: 'INFO' });
    }

    const securityHeadersScore = CertWarningEngine.scoreSecurityHeaders(h);
    const mixedContent = isHTTPS && !csp ? true :
      (csp && !csp.toLowerCase().includes('upgrade-insecure-requests') &&
              !csp.toLowerCase().includes('block-all-mixed-content'));

    return CertWarningEngine._buildResult({
      isInvalid: severity === 'CRITICAL',
      hasWarning: severity === 'WARNING' || severity === 'CRITICAL',
      severity, certStatus, encryption,
      hsts: hasHSTS, mixedContent: !!mixedContent,
      securityHeadersScore, reasons, issues, isHTTPS,
      errorCode: null
    });
  }

  /**
   * Evaluate from a Chrome net-error code (webNavigation.onErrorOccurred path).
   * Used when the page load fails due to a certificate error.
   *
   * @param {string} errorCode - e.g. "net::ERR_CERT_DATE_INVALID"
   * @param {string} url       - The URL that failed to load
   * @returns {object} certWarning object with isInvalid = true
   */
  static evaluateFromErrorCode(errorCode = '', url = '') {
    // Normalise: strip "net::" prefix, uppercase
    const code = errorCode.replace(/^net::/, '').toUpperCase();
    const isHTTPS = url.startsWith('https://');

    // Check specific cert error codes
    for (const [key, def] of Object.entries(CERT_ERROR_MAP)) {
      if (code === key || code.includes(key)) {
        const securityHeadersScore = 0; // page never loaded
        return CertWarningEngine._buildResult({
          isInvalid: def.isInvalid,
          hasWarning: true,
          severity: def.severity,
          certStatus: def.status,
          encryption: def.isInvalid ? 'NONE' : 'WEAK',
          hsts: false,
          mixedContent: false,
          securityHeadersScore,
          reasons: [`${def.label} — ${errorCode}`],
          issues: [{ code: key, label: def.label, severity: def.severity }],
          isHTTPS,
          errorCode: code
        });
      }
    }

    // Generic SSL/cert error fallback
    const isCertRelated = code.includes('CERT') || code.includes('SSL') || code.includes('TLS');
    if (isCertRelated) {
      return CertWarningEngine._buildResult({
        isInvalid: true,
        hasWarning: true,
        severity: 'CRITICAL',
        certStatus: 'WEAK',
        encryption: 'NONE',
        hsts: false,
        mixedContent: false,
        securityHeadersScore: 0,
        reasons: [`Certificate or SSL error: ${errorCode}`],
        issues: [{ code: 'CERT_ERROR', label: 'Certificate Error', severity: 'CRITICAL' }],
        isHTTPS,
        errorCode: code
      });
    }

    return null; // Not a cert-related error
  }

  /**
   * Internal result builder — normalises labels.
   * @private
   */
  static _buildResult({ isInvalid, hasWarning, severity, certStatus, encryption,
                         hsts, mixedContent, securityHeadersScore, reasons, issues,
                         isHTTPS, errorCode }) {
    const encryptionLabel =
      encryption === 'STRONG' ? 'Strong (HTTPS)' :
      encryption === 'WEAK'   ? 'Weak (HTTPS / No HSTS)' : 'None (HTTP / Blocked)';

    const certStatusLabel =
      certStatus === 'VALID'       ? 'Valid' :
      certStatus === 'WEAK'        ? 'Weak Configuration' :
      certStatus === 'SELF_SIGNED' ? 'Untrusted / Self-Signed' :
      certStatus === 'EXPIRED'     ? 'Expired / Revoked' :
      certStatus === 'MISMATCH'    ? 'Hostname Mismatch' : 'Not Present';

    return {
      isInvalid, hasWarning, severity,
      certStatus, certStatusLabel,
      encryption, encryptionLabel,
      hsts, mixedContent, securityHeadersScore,
      reasons, issues, isHTTPS,
      fromErrorCode: !!errorCode,
      errorCode: errorCode || null
    };
  }

  /**
   * Compute a 0–100 security headers score.
   */
  static scoreSecurityHeaders(h) {
    let score = 0;
    if (h['content-security-policy'])                    score += 25;
    if (h['strict-transport-security'])                  score += 25;
    if (h['x-frame-options'])                            score += 15;
    if (h['referrer-policy'])                            score += 15;
    if (h['x-content-type-options'] === 'nosniff')       score += 10;
    if (h['permissions-policy'])                         score += 10;
    return score;
  }

  /**
   * Format reasons into a human-readable warning summary.
   */
  static formatWarningMessage(certWarning) {
    if (!certWarning?.hasWarning) return null;
    const lines = ['⚠️ SECURITY ISSUES DETECTED:'];
    for (const r of certWarning.reasons) lines.push(`• ${r}`);
    return lines.join('\n');
  }
}

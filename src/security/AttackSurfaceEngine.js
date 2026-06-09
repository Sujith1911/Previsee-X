/**
 * PRIVISEE-X v5.0 — AttackSurfaceEngine
 * Audits HTTP response headers, cookie flags, and TLS settings.
 * Computes Security Grade (A+ to F) and Posture Score (0-100).
 */

import { EngineBase } from '../core/EngineBase.js';

export class AttackSurfaceEngine extends EngineBase {
  constructor() {
    super('AttackSurfaceEngine');
  }

  async init() {
    await super.init();
    this.logger.info('Attack Surface Engine ready');
  }

  /**
   * Run security audits on headers, cookies, and certificate info
   * @param {object} params - { url, headers, cookies, certWarning }
   * @returns {Promise<{ score: number, grade: string, issues: Array, recommendations: Array }>}
   */
  async execute({ url = '', headers = {}, cookies = [], certWarning = null } = {}) {
    let score = 100;
    const issues = [];
    const recommendations = [];
    const isHTTPS = url.startsWith('https://');

    // Normalize header keys
    const h = {};
    for (const [k, v] of Object.entries(headers)) {
      h[k.toLowerCase()] = String(v).toLowerCase();
    }

    // 1. Plain HTTP / Insecure Protocol
    if (!isHTTPS) {
      score -= 35;
      issues.push({ id: 'insecure_http', severity: 'CRITICAL', label: 'Plain HTTP Connection', details: 'All network transmission is unencrypted.' });
      recommendations.push('Enforce HTTPS redirection and purchase a valid TLS certificate.');
    }

    // 2. Content Security Policy (CSP)
    if (!h['content-security-policy']) {
      score -= 20;
      issues.push({ id: 'missing_csp', severity: 'HIGH', label: 'Missing Content Security Policy (CSP)', details: 'Allows execution of unauthorized scripts (XSS vulnerability).' });
      recommendations.push('Implement a strict Content Security Policy defining trusted script sources.');
    }

    // 3. HTTP Strict Transport Security (HSTS)
    if (isHTTPS && !h['strict-transport-security']) {
      score -= 15;
      issues.push({ id: 'missing_hsts', severity: 'HIGH', label: 'Missing HSTS Header', details: 'Browser may establish insecure HTTP connections before switching to HTTPS.' });
      recommendations.push('Add the Strict-Transport-Security header (e.g., max-age=31536000; includeSubDomains).');
    }

    // 4. Clickjacking Prevention (X-Frame-Options)
    if (!h['x-frame-options'] && (!h['content-security-policy'] || !h['content-security-policy'].includes('frame-ancestors'))) {
      score -= 10;
      issues.push({ id: 'missing_xfo', severity: 'MEDIUM', label: 'Missing Frame Protections', details: 'Allows iframe embedding (Clickjacking vulnerability).' });
      recommendations.push('Add X-Frame-Options: DENY or SAMEORIGIN, or configure CSP frame-ancestors.');
    }

    // 5. Referrer Policy
    if (!h['referrer-policy']) {
      score -= 5;
      issues.push({ id: 'missing_referrer', severity: 'LOW', label: 'Missing Referrer Policy', details: 'May leak user browsing paths or session tokens to third parties.' });
      recommendations.push('Set Referrer-Policy: strict-origin-when-cross-origin.');
    }

    // 6. X-Content-Type-Options
    if (!h['x-content-type-options'] || h['x-content-type-options'] !== 'nosniff') {
      score -= 5;
      issues.push({ id: 'missing_nosniff', severity: 'LOW', label: 'Missing X-Content-Type-Options', details: 'Browser may guess MIME types, enabling drive-by downloads.' });
      recommendations.push('Set X-Content-Type-Options: nosniff.');
    }

    // 7. Permissions Policy
    if (!h['permissions-policy'] && !h['feature-policy']) {
      score -= 5;
      issues.push({ id: 'missing_permissions_policy', severity: 'LOW', label: 'Missing Permissions Policy', details: 'Fails to lock down access to APIs like camera, geolocation, microphone.' });
      recommendations.push('Configure Permissions-Policy header to restrict hardware access.');
    }

    // 8. Cookie security audit
    if (cookies && cookies.length > 0) {
      let insecureCookies = 0;
      let missingHttpOnly = 0;
      let samesiteNoneInsecure = 0;

      for (const c of cookies) {
        if (!c.secure && isHTTPS) insecureCookies++;
        if (!c.httpOnly) missingHttpOnly++;
        const ss = (c.sameSite || '').toLowerCase();
        if ((ss === 'no_restriction' || ss === 'none') && !c.secure) samesiteNoneInsecure++;
      }

      if (insecureCookies > 0) {
        const penalty = Math.min(15, insecureCookies * 3);
        score -= penalty;
        issues.push({ id: 'cookie_insecure', severity: 'MEDIUM', label: 'Insecure Cookies', details: `${insecureCookies} session/state cookies lack the Secure flag.` });
        recommendations.push('Ensure all cookie creation scripts append the "; Secure" attribute.');
      }

      if (missingHttpOnly > 0) {
        const penalty = Math.min(10, missingHttpOnly * 2);
        score -= penalty;
        issues.push({ id: 'cookie_missing_httponly', severity: 'MEDIUM', label: 'Cookies lack HttpOnly flag', details: `${missingHttpOnly} cookies are accessible to client-side scripts.` });
        recommendations.push('Apply the "; HttpOnly" flag to all sensitive cookies to prevent theft via XSS.');
      }

      if (samesiteNoneInsecure > 0) {
        score -= 10;
        issues.push({ id: 'cookie_samesite_none_insecure', severity: 'HIGH', label: 'SameSite=None without Secure', details: `${samesiteNoneInsecure} cookies will be blocked in modern browsers.` });
        recommendations.push('Force SameSite=None cookies to also be Secure.');
      }
    }

    // 9. Certificate warning status
    if (certWarning) {
      if (certWarning.isInvalid) {
        score -= 30;
        issues.push({ id: 'cert_invalid', severity: 'CRITICAL', label: 'Invalid TLS Certificate', details: certWarning.reasons?.join(', ') || 'SSL handshake error.' });
        recommendations.push('Replace the expired, self-signed, or hostname-mismatched TLS certificate.');
      } else if (certWarning.hasWarning) {
        score -= 10;
        issues.push({ id: 'cert_weakness', severity: 'MEDIUM', label: 'Weak TLS Configuration', details: certWarning.reasons?.join(', ') || 'Weak cipher suites detected.' });
        recommendations.push('Configure secure TLS ciphers and disable obsolete TLS versions (TLS 1.0, 1.1).');
      }
      if (certWarning.mixedContent) {
        score -= 10;
        issues.push({ id: 'mixed_content', severity: 'HIGH', label: 'Mixed Content Detected', details: 'Loading insecure HTTP assets on a secure HTTPS webpage.' });
        recommendations.push('Remove or upgrade all mixed content HTTP URLs to HTTPS references.');
      }
    }

    // Calibrate final score between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // Map score to Grade
    let grade = 'F';
    if (finalScore >= 95) grade = 'A+';
    else if (finalScore >= 90) grade = 'A';
    else if (finalScore >= 80) grade = 'B';
    else if (finalScore >= 70) grade = 'C';
    else if (finalScore >= 60) grade = 'D';

    return {
      score: finalScore,
      grade,
      issues,
      recommendations: [...new Set(recommendations)] // Unique list
    };
  }
}

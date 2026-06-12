/**
 * PRIVISEE-X v4.0
 * Security: SecurityAuditEngine
 * 
 * Audits HTTP security headers and practices.
 * Checks: CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
 *         Referrer-Policy, Permissions-Policy, mixed content, cookie flags.
 */

import { EngineBase } from '../core/EngineBase.js';

export class SecurityAuditEngine extends EngineBase {
  constructor() {
    super('SecurityAuditEngine');
  }

  /**
   * Audit security headers and cookies
   * @param {object} input - { headers: object, cookies?: Array, pageUrl?: string }
   */
  async execute(input) {
    const headers  = input.headers  || input; // Back-compat: allow passing headers directly
    const cookies  = input.cookies  || [];
    const pageUrl  = input.pageUrl  || '';

    const report = {
      score:  100,
      issues: []
    };

    // Normalize headers to lowercase
    const h = {};
    for (const key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        h[key.toLowerCase()] = headers[key];
      }
    }

    // ── 1. Content-Security-Policy ─────────────────────────────────────────
    if (!h['content-security-policy']) {
      report.score -= 20;
      report.issues.push({ header: 'Content-Security-Policy', severity: 'HIGH', message: 'Missing Content-Security-Policy' });
    }

    // ── 2. Strict-Transport-Security ───────────────────────────────────────
    if (!h['strict-transport-security']) {
      report.score -= 20;
      report.issues.push({ header: 'Strict-Transport-Security', severity: 'HIGH', message: 'Missing HSTS header' });
    }

    // ── 3. X-Frame-Options ─────────────────────────────────────────────────
    if (!h['x-frame-options']) {
      report.score -= 10;
      report.issues.push({ header: 'X-Frame-Options', severity: 'MODERATE', message: 'Missing X-Frame-Options (clickjacking risk)' });
    }

    // ── 4. X-Content-Type-Options ──────────────────────────────────────────
    if (h['x-content-type-options'] !== 'nosniff') {
      report.score -= 10;
      report.issues.push({ header: 'X-Content-Type-Options', severity: 'MODERATE', message: 'Missing or incorrect X-Content-Type-Options: nosniff' });
    }

    // ── 5. Referrer-Policy ─────────────────────────────────────────────────
    if (!h['referrer-policy']) {
      report.score -= 10;
      report.issues.push({ header: 'Referrer-Policy', severity: 'MODERATE', message: 'Missing Referrer-Policy (URL leakage risk)' });
    }

    // ── 6. Permissions-Policy ──────────────────────────────────────────────
    if (!h['permissions-policy']) {
      report.score -= 5;
      report.issues.push({ header: 'Permissions-Policy', severity: 'LOW', message: 'Missing Permissions-Policy (sensor API exposure)' });
    }

    // ── 7. Mixed Content Detection ─────────────────────────────────────────
    const mixedContentIssue = this.checkMixedContent(h, pageUrl);
    if (mixedContentIssue) {
      report.score -= 10;
      report.issues.push({ header: 'Mixed-Content', severity: 'HIGH', message: mixedContentIssue });
    }

    // ── 8. Cookie Flag Validation ──────────────────────────────────────────
    const cookieIssues = this.checkCookieFlags(cookies);
    for (const issue of cookieIssues) {
      report.score -= 5;
      report.issues.push({ header: 'Cookie-Flags', severity: 'MODERATE', message: issue });
    }

    // ── 9. Dark Pattern Detection ──────────────────────────────────────────
    if (this.detectDarkPatterns(headers['x-page-content-text'])) {
      report.score -= 15;
      report.issues.push({ header: 'Dark-Patterns', severity: 'MODERATE', message: 'Potential dark patterns detected (false urgency/confirmshaming)' });
    }

    // Clamp score to [0, 100]
    report.score = Math.min(100, Math.max(0, report.score));

    this.emit('SECURITY_AUDIT_COMPLETE', report);
    return report;
  }

  /**
   * Detect mixed content risk — HTTPS page with no CSP upgrade directives
   * @param {object} h  - normalized headers
   * @param {string} pageUrl - full page URL
   * @returns {string|null} issue description or null
   */
  checkMixedContent(h, pageUrl) {
    const isHttps = pageUrl ? pageUrl.startsWith('https://') : true;
    if (!isHttps) return null; // HTTP pages can't have mixed content issues

    const csp = h['content-security-policy'] || '';
    const hasUpgradeDirective =
      csp.includes('upgrade-insecure-requests') ||
      csp.includes('block-all-mixed-content');

    if (!hasUpgradeDirective) {
      return 'HTTPS page lacks CSP upgrade-insecure-requests or block-all-mixed-content directive — vulnerable to mixed content attacks';
    }
    return null;
  }

  /**
   * Cookie flag validation: SameSite=None must have Secure flag
   * @param {Array} cookies - array of cookie objects
   * @returns {string[]} array of issue descriptions
   */
  checkCookieFlags(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) return [];
    const issues = [];

    for (const cookie of cookies) {
      // SameSite=None without Secure allows cross-site cookie relay attacks
      const sameSite = (cookie.sameSite || '').toLowerCase();
      if (sameSite === 'no_restriction' || sameSite === 'none') {
        if (!cookie.secure) {
          issues.push(
            `Cookie "${cookie.name}" has SameSite=None without Secure flag — cross-site relay risk`
          );
        }
      }
    }

    return issues;
  }

  /**
   * Heuristic analysis of page text for dark patterns
   */
  detectDarkPatterns(text) {
    if (!text) return false;
    const patterns = [
      /only \d+ left/i,
      /offer expires in/i,
      /don't run out/i,
      /high demand/i,
      /reserved for/i,
      /no, i hate saving money/i,
      /no, i prefer paying full price/i
    ];
    const matchCount = patterns.reduce((count, regex) => count + (regex.test(text) ? 1 : 0), 0);
    return matchCount >= 2;
  }
}

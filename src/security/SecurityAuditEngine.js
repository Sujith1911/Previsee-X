/**
 * PRIVISEE-X v2.0
 * Security: SecurityAuditEngine
 * 
 * New component for auditing HTTP security headers and practices.
 * Checks CSP, HSTS, XFO, etc.
 */

import { EngineBase } from '../core/EngineBase.js';

export class SecurityAuditEngine extends EngineBase {
  constructor() {
    super('SecurityAuditEngine');
  }

  /**
   * Audit security headers
   * @param {object} headers - Response headers map
   */
  async execute(headers) {
    const report = {
      score: 100,
      issues: []
    };

    // Normalize headers to lowercase
    const h = {};
    for (const key in headers) {
        h[key.toLowerCase()] = headers[key];
    }

    // 1. Content-Security-Policy
    if (!h['content-security-policy']) {
        report.score -= 20;
        report.issues.push('Missing Content-Security-Policy');
    }

    // 2. Strict-Transport-Security
    if (!h['strict-transport-security']) {
        report.score -= 20;
        report.issues.push('Missing HSTS');
    }

    // 3. X-Frame-Options
    if (!h['x-frame-options']) {
        report.score -= 10;
        report.issues.push('Missing X-Frame-Options');
    }

    // 4. X-Content-Type-Options
    if (h['x-content-type-options'] !== 'nosniff') {
        report.score -= 10;
        report.issues.push('Missing nosniff');
    }

    // 5. Referrer-Policy
    if (!h['referrer-policy']) {
        report.score -= 10;
        report.issues.push('Missing Referrer-Policy');
    }

    // 6. Dark Pattern Detection (Heuristic)
    if (this.detectDarkPatterns(headers['x-page-content-text'])) {
         report.score -= 15;
         report.issues.push('Potential Dark Patterns Detected (False Urgency/Shaming)');
    }

    this.emit('SECURITY_AUDIT_COMPLETE', report);
    return report;
  }

  /**
   * Heuristic analysis of page text for dark patterns
   * note: Requires 'x-page-content-text' to be passed from content script
   */
  detectDarkPatterns(text) {
      if (!text) return false;
      const patterns = [
          /only \d+ left/i,
          /offer expires in/i,
          /don't run out/i,
          /high demand/i,
          /reserved for/i,
          /no, i hate saving money/i, // Confirmshaming
          /no, i prefer paying full price/i
      ];
      
      const matchCount = patterns.reduce((count, regex) => count + (regex.test(text) ? 1 : 0), 0);
      return matchCount >= 2;
  }
}

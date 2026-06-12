/**
 * PRIVISEE-X v2.0
 * Detectors: CookieDetector
 * 
 * Monitors cookie activity via chrome.cookies API.
 * Detects:
 * - New cookies being set
 * - Third-party cookies (by comparing cookie domain vs current tab)
 * - Short-lived cookies (potential tracking beacons)
 */

import { EngineBase } from '../core/EngineBase.js';

export class CookieDetector extends EngineBase {
  constructor() {
    super('CookieDetector');
    this.cookieCounts = new Map(); // domain -> count
  }

  async init() {
    await super.init();
    
    // Listen for cookie changes
    if (chrome.cookies && chrome.cookies.onChanged) {
        chrome.cookies.onChanged.addListener(this.handleCookieChange.bind(this));
        this.logger.info('Listening for cookie changes');
    } else {
        this.logger.warn('chrome.cookies API not available');
    }
  }

  /**
   * Handle cookie change events
   * @param {object} changeInfo - { cookie, cause, removed }
   */
  handleCookieChange(changeInfo) {
    const { cookie, cause, removed } = changeInfo;
    
    // We only care about setting cookies for the count/risk
    if (removed) return;

    const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
    
    // Update local stats
    const currentCount = this.cookieCounts.get(domain) || 0;
    this.cookieCounts.set(domain, currentCount + 1);

    // Emit event
    this.emit('COOKIE_DETECTED', {
        domain: domain,
        name: cookie.name,
        isThirdParty: false, // Hard to determine purely from onChanged without tab context, done in background aggregator
        expirationDate: cookie.expirationDate,
        secure: cookie.secure,
        cause: cause
    });
    
    this.logger.debug(`Cookie detected for ${domain}: ${cookie.name}`);
  }
}

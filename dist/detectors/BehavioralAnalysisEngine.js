/**
 * PRIVISEE-X v5.0 — BehavioralAnalysisEngine
 * Analyzes active page runtime APIs and event patterns for malicious behaviors.
 * Detects notification abuse, clipboard scraping, camera/mic checks, fullscreen hijacks, 
 * rapid redirect chains, and drive-by downloads.
 */

import { EngineBase } from '../core/EngineBase.js';

export class BehavioralAnalysisEngine extends EngineBase {
  constructor() {
    super('BehavioralAnalysisEngine');
  }

  async init() {
    await super.init();
    this.logger.info('Behavioral Analysis Engine ready');
  }

  /**
   * Evaluate a tab's runtime behaviors
   * @param {object} behaviorStats - { domain, apiCounts, redirects, downloads, hijacks }
   * @returns {Promise<{ behaviorScore: number, severity: string, confidence: number, anomalies: Array }>}
   */
  async execute(behaviorStats) {
    const {
      domain = '',
      apiCounts = {},
      redirects = 0,
      downloads = 0,
      hijacks = 0
    } = behaviorStats;

    let score = 0;
    const anomalies = [];

    if (!domain) {
      return { behaviorScore: 0, severity: 'LOW', confidence: 0, anomalies: [] };
    }

    // 1. Fullscreen abuse check
    const fullscreen = apiCounts.fullscreen || 0;
    if (fullscreen > 0) {
      score += 20;
      anomalies.push({
        id: 'fullscreen_request',
        severity: 'HIGH',
        label: 'Unsolicited Fullscreen Mode',
        details: 'Page requested fullscreen without explicit user interaction (possible UI redressing / fake browser window scam).'
      });
    }

    // 2. Clipboard Scraping Check
    const clipboard = apiCounts.clipboard || 0;
    if (clipboard > 0) {
      score += 25;
      anomalies.push({
        id: 'clipboard_access',
        severity: 'CRITICAL',
        label: 'Clipboard Access Attempt',
        details: 'Attempted to read/write system clipboard data (possible cryptocurrency address swapping or credential stealing).'
      });
    }

    // 3. Drive-by Download Attempts
    if (downloads > 0) {
      score += 30;
      anomalies.push({
        id: 'unsolicited_download',
        severity: 'CRITICAL',
        label: 'Automatic Download Triggered',
        details: 'Triggered a file download automatically without user consent (suspicious drive-by malware delivery).'
      });
    }

    // 4. Tab Hijacking / Frame Busting Heuristics
    if (hijacks > 0) {
      score += 25;
      anomalies.push({
        id: 'tab_hijack',
        severity: 'HIGH',
        label: 'Tab Hijacking Detected',
        details: 'Page forced a top-level window redirection of an inactive tab (often used in advertising pop-unders).'
      });
    }

    // 5. Long Redirect Chains
    if (redirects >= 3) {
      score += 15;
      anomalies.push({
        id: 'redirect_chain',
        severity: 'MEDIUM',
        label: 'Rapid Redirect Loop',
        details: `Domain is part of a long redirect path (${redirects} hops) to bypass domain reputation checks.`
      });
    }

    // 6. Camera/Mic queries
    const mediaDevices = apiCounts.mediaDevices || 0;
    if (mediaDevices > 0) {
      score += 15;
      anomalies.push({
        id: 'media_query',
        severity: 'MEDIUM',
        label: 'Hardware Media Query',
        details: 'Queried camera or microphone permissions or hardware lists (device enumeration / tracking).'
      });
    }

    // 7. Notification Request Abuse
    const notifications = apiCounts.notifications || 0;
    if (notifications > 0) {
      score += 10;
      anomalies.push({
        id: 'notification_spam',
        severity: 'LOW',
        label: 'Notification Trigger',
        details: 'Requested push notification permissions immediately on load.'
      });
    }

    // Calibrate final score
    const finalScore = Math.max(0, Math.min(100, score));

    // Determine severity category
    let severity = 'LOW';
    if (finalScore >= 70) severity = 'CRITICAL';
    else if (finalScore >= 45) severity = 'HIGH';
    else if (finalScore >= 20) severity = 'MODERATE';

    // Confidence: increases as we record more signals
    const confidence = Math.min(95, 50 + anomalies.length * 15);

    return {
      behaviorScore: finalScore,
      severity,
      confidence: Math.round(confidence),
      anomalies
    };
  }
}

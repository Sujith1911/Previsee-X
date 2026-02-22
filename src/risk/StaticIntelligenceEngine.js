/**
 * PRIVISEE-X v3.0
 * Risk: StaticIntelligenceEngine
 *
 * Guarantees EVERY website receives a privacy risk score, even static sites
 * with no trackers or fingerprinting. Analyzes:
 *   A. HTTP Security Headers
 *   B. TLS / HTTPS status
 *   C. Cookie flag quality
 *   D. Domain intelligence (TLD, known tracker)
 *
 * Score: 0–100 (higher = riskier)
 * Called by background.js via onHeadersReceived to access real response headers.
 */

'use strict';

// Suspicious TLDs historically abused for phishing / spam / malware
const SUSPICIOUS_TLDS = new Set([
  'xyz', 'tk', 'ml', 'ga', 'cf', 'gq', 'zip', 'mov', 'fit',
  'bid', 'win', 'loan', 'click', 'download', 'review', 'stream',
  'top', 'gdn', 'accountant', 'faith', 'date', 'racing', 'trade'
]);

// Known tracker / analytics root domains (augments blocklist)
const KNOWN_TRACKER_ROOTS = new Set([
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'hotjar.com', 'fullstory.com', 'mouseflow.com', 'clarity.ms',
  'mixpanel.com', 'amplitude.com', 'segment.com', 'segment.io',
  'criteo.com', 'criteo.net', 'adroll.com', 'outbrain.com', 'taboola.com',
  'scorecardresearch.com', 'quantserve.com', 'newrelic.com', 'sentry.io',
  'heapanalytics.com', 'intercom.io'
]);

/**
 * Analyze headers + URL and compute a static risk score
 * @param {object} params
 * @param {string}   params.url        - full page URL
 * @param {string}   params.domain     - root domain
 * @param {object}   params.headers    - response headers { name → value }
 * @param {Array}    params.cookies    - chrome cookie objects for domain
 * @returns {{ staticScore, breakdown }}
 */
function computeStaticScore({ url = '', domain = '', headers = {}, cookies = [] }) {
  let score = 0;
  const breakdown = [];

  // Normalize header names to lowercase
  const h = {};
  for (const [k, v] of Object.entries(headers)) {
    h[k.toLowerCase()] = v;
  }

  const isHTTPS = url.startsWith('https://');

  // ── A. Security Headers ────────────────────────────────────────────────────

  if (!h['content-security-policy']) {
    score += 10;
    breakdown.push({ factor: 'Missing Content-Security-Policy', delta: +10 });
  }

  if (!h['strict-transport-security']) {
    score += 15;
    breakdown.push({ factor: 'Missing HSTS', delta: +15 });
  }

  if (!h['x-frame-options']) {
    score += 8;
    breakdown.push({ factor: 'Missing X-Frame-Options', delta: +8 });
  }

  if (!h['referrer-policy']) {
    score += 5;
    breakdown.push({ factor: 'Missing Referrer-Policy', delta: +5 });
  }

  if (!h['permissions-policy']) {
    score += 5;
    breakdown.push({ factor: 'Missing Permissions-Policy', delta: +5 });
  }

  if (!h['x-content-type-options'] || h['x-content-type-options'].toLowerCase() !== 'nosniff') {
    score += 5;
    breakdown.push({ factor: 'Missing X-Content-Type-Options: nosniff', delta: +5 });
  }

  // ── B. TLS / HTTPS ────────────────────────────────────────────────────────

  if (!isHTTPS) {
    score += 30;
    breakdown.push({ factor: 'Unencrypted HTTP connection', delta: +30 });
  } else if (isHTTPS && !h['strict-transport-security']) {
    // HTTPS but no HSTS means cert can be stripped
    score += 5;
    breakdown.push({ factor: 'HTTPS without HSTS (downgrade risk)', delta: +5 });
  }

  // ── C. Cookie Flags ───────────────────────────────────────────────────────

  if (Array.isArray(cookies)) {
    let insecureCookies = 0;
    let sameSiteNoneUnsafe = 0;

    for (const cookie of cookies) {
      if (!cookie.secure && isHTTPS) {
        insecureCookies++;
      }
      const ss = (cookie.sameSite || '').toLowerCase();
      if ((ss === 'no_restriction' || ss === 'none') && !cookie.secure) {
        sameSiteNoneUnsafe++;
      }
    }

    if (insecureCookies > 0) {
      const delta = Math.min(20, insecureCookies * 5);
      score += delta;
      breakdown.push({ factor: `${insecureCookies} cookie(s) missing Secure flag`, delta });
    }

    if (sameSiteNoneUnsafe > 0) {
      const delta = Math.min(16, sameSiteNoneUnsafe * 8);
      score += delta;
      breakdown.push({ factor: `${sameSiteNoneUnsafe} cookie(s) SameSite=None without Secure`, delta });
    }
  }

  // ── D. Domain Intelligence ────────────────────────────────────────────────

  const tld = domain.split('.').pop().toLowerCase();
  if (SUSPICIOUS_TLDS.has(tld)) {
    score += 20;
    breakdown.push({ factor: `Suspicious TLD (.${tld})`, delta: +20 });
  }

  const rootDomain = domain.split('.').slice(-2).join('.').toLowerCase();
  if (KNOWN_TRACKER_ROOTS.has(rootDomain) || KNOWN_TRACKER_ROOTS.has(domain)) {
    score += 10;
    breakdown.push({ factor: 'Known tracking/analytics domain', delta: +10 });
  }

  // Clamp to [0, 100]
  const staticScore = Math.min(100, Math.max(0, Math.round(score)));

  return { staticScore, breakdown };
}

// Export for use in background.js (not an ES module — background.js imports this)
if (typeof module !== 'undefined') module.exports = { computeStaticScore };

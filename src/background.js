/**
 * PRIVISEE-X v2.0 — Background Service Worker
 *
 * Pure JS implementation — no external engine imports that can crash.
 * All blocking/tracking/fingerprint detection is self-contained here.
 *
 * Features:
 *  ✅ Real ad blocking via declarativeNetRequest (navigation + resource)
 *  ✅ Navigation redirect ad tracking caught via webNavigation  
 *  ✅ Cookie delete also clears localStorage via chrome.scripting
 *  ✅ Per-site tracker persistence for dashboard
 *  ✅ Working delete/whitelist/CRUD for all data types
 */

import { storageManager } from './storage/StorageManager.js';

// ── Domain Lists ──────────────────────────────────────────────────────────────

// AD domains — these get blocked via declarativeNetRequest (ALL resource types)
const AD_DOMAINS = [
  // Google Ads network
  'doubleclick.net','googlesyndication.com','adservice.google.com',
  'googletagservices.com','pagead2.googlesyndication.com',
  'tpc.googlesyndication.com','adwords.google.com',
  // Amazon Ads
  'amazon-adsystem.com','aax-us-east.amazon-adsystem.com','aax.amazon-adsystem.com',
  // Facebook / Meta Ads
  'connect.facebook.net','an.facebook.com','graph.facebook.com',
  // Twitter / X Ads
  'static.ads-twitter.com','ads.twitter.com','t.co',
  // Programmatic / DSPs
  'secure.adnxs.com','ib.adnxs.com','cdn.adnxs.com',
  'rubiconproject.com','fastlane.rubiconproject.com',
  'pubmatic.com','image6.pubmatic.com',
  'openx.net','us-u.openx.net',
  'criteo.com','criteo.net','static.criteo.net','sslwidget.criteo.com',
  'casalemedia.com','contextweb.com','lijit.com','sovrn.com',
  'indexexchange.com','bidswitch.com','appnexus.com',
  'smartadserver.com','advertising.com','adtech.de',
  'adsrvr.org','thetradedesk.com','rfihub.com','rlcdn.com',
  'bluekai.com','turn.com','adroll.com','perfectaudience.com',
  // Native / Recommendation Ads
  'outbrain.com','widgets.outbrain.com','log.outbrain.com',
  'taboola.com','cdn.taboola.com','trc.taboola.com',
  'sharethrough.com','yieldmo.com','undertone.com',
  // Measurement / Viewability
  'moatads.com','doubleverify.com','adsafeprotected.com',
  'flashtalking.com','mopub.com',
  // Other ad networks
  'media.net','ads.linkedin.com','snap.licdn.com',
  'addthis.com','spotxchange.com','gravity.com',
  'revcontent.com','mgid.com','zergnet.com',
  'adcolony.com','inmobi.com','vungle.com','applovin.com',
  'ad.doubleclick.net','cm.g.doubleclick.net','googleads.g.doubleclick.net'
];

// Tracker domains (analytics, tracking pixels) — counted but NOT blocked
const TRACKER_DOMAINS = [
  'google-analytics.com','analytics.google.com','googletagmanager.com',
  'analytics.twitter.com','bat.bing.com','mc.yandex.ru',
  'tr.snapchat.com','analytics.tiktok.com','pixel.quantserve.com',
  'scorecardresearch.com','quantserve.com',
  'hotjar.com','fullstory.com','mouseflow.com','clarity.ms',
  'newrelic.com','mixpanel.com','amplitude.com','heapanalytics.com',
  'segment.io','segment.com','intercom.io','intercomcdn.com',
  'hubspot.com','marketo.com','pardot.com',
  'logrocket.io','sentry.io','datadog-browser-agent.com',
  'convertkit.com','mailchimp.com','klaviyo.com',
  'branch.io','onesignal.com','pusher.com'
];

// Navigation redirect domains — click tracking links that route through ad servers
const NAVIGATION_AD_DOMAINS = [
  'outbrain.com','taboola.com','revcontent.com','mgid.com',
  'zergnet.com','doubleclick.net','googleads.g.doubleclick.net',
  'ad.atdmt.com','clkuk.tradedoubler.com','clkde.tradedoubler.com',
  'tradedoubler.com','awin1.com','track.adform.net',
  'servedby.flashtalking.com','ad.zanox.com','zanox.com',
  'clickbooth.com','c2.com','ad.linksynergy.com',
  'go.linksynergy.com','pjatr.com','pjtra.com',
  'anrdoezrs.net','tkqlhce.com','dpbolvw.net','jdoqocy.com',
  'target.com/r','click.linksynergy.com','bit.ly/ad','q.gs',
  'adfarm1.adition.com','ad.adition.com','srv.clickfuse.com'
];

const CDN_WHITELIST = new Set([
  'fonts.googleapis.com','fonts.gstatic.com','ajax.googleapis.com',
  'cdnjs.cloudflare.com','cdn.jsdelivr.net','unpkg.com',
  'static.cloudflareinsights.com','i.ytimg.com','s.ytimg.com',
  'yt3.ggpht.com','lh3.googleusercontent.com',
  'ssl.gstatic.com','www.gstatic.com','maps.gstatic.com',
  'ytimg.com','googlevideo.com','gvt1.com'
]);

const AD_DOMAIN_SET     = new Set(AD_DOMAINS);
const TRACKER_DOMAIN_SET = new Set(TRACKER_DOMAINS);

// ── State ─────────────────────────────────────────────────────────────────────
const tabStats     = {};
const userWhitelist = new Set();

function log(msg, ...args) { console.log('[PRIVISEE-X BG]', msg, ...args); }
function warn(msg, ...args) { console.warn('[PRIVISEE-X BG]', msg, ...args); }

function getTabStats(tabId) {
  if (!tabStats[tabId]) {
    tabStats[tabId] = {
      domain:'', trackerCount:0, adCount:0, blockedAds:0,
      cookieCount:0, fingerprintCount:0, riskScore:0, riskLevel:'LOW'
    };
  }
  return tabStats[tabId];
}

// ── Risk Score (standalone — no RiskEngine import) ──────────────────────────
// NOTE: This duplicates src/risk/RiskEngine.js intentionally.
// Service workers cannot reliably import ES modules during hot-restart without
// delaying listener registration. Keeping calcRisk() inline avoids that latency.
function calcRisk(trackers, fingerprints) {
  let score = 0;
  if (trackers > 0) score += Math.min(40, Math.log2(trackers + 1) * 13);
  score += Math.min(30, fingerprints * 10);
  score = Math.round(Math.min(100, score));
  const level = score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 20 ? 'MODERATE' : 'LOW';
  return { score, level };
}

// ── Domain helpers ────────────────────────────────────────────────────────────
function isAd(domain) {
  if (AD_DOMAIN_SET.has(domain)) return true;
  const parts = domain.split('.');
  return parts.length >= 2 && AD_DOMAIN_SET.has(parts.slice(-2).join('.'));
}
function isTracker(domain) {
  if (TRACKER_DOMAIN_SET.has(domain)) return true;
  const parts = domain.split('.');
  return parts.length >= 2 && TRACKER_DOMAIN_SET.has(parts.slice(-2).join('.'));
}
function clean(domain) { return (domain||'').replace(/^www\./, '').toLowerCase(); }

// ── declarativeNetRequest — block all known ad domains ────────────────────────
async function setupAdBlocking() {
  try {
    // Remove existing rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map(r => r.id)
      });
    }

    // All resource types for thorough blocking
    const allTypes = [
      'script','xmlhttprequest','image','media','sub_frame',
      'stylesheet','font','ping','websocket','other',
      'main_frame'   // ← catches navigation-level ad redirects
    ];

    const rules = [];
    let id = 1;

    // Block ad domains completely
    for (const domain of AD_DOMAINS) {
      rules.push({
        id: id++,
        priority: 2,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: allTypes
        }
      });
    }

    // Block navigation redirect ad click trackers
    for (const domain of NAVIGATION_AD_DOMAINS) {
      if (!AD_DOMAIN_SET.has(domain)) {
        rules.push({
          id: id++,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: ['main_frame', 'sub_frame', 'ping', 'xmlhttprequest']
          }
        });
      }
    }

    // Limit to 5000 max (Chrome limit)
    const finalRules = rules.slice(0, 5000);
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: finalRules });
    log(`Ad blocking active: ${finalRules.length} rules`);
  } catch (e) {
    warn('Ad blocking setup failed (non-fatal):', e.message);
  }
}

// ── Site stats persistence ────────────────────────────────────────────────────
async function updateSiteStats(domain, delta) {
  if (!domain || domain.startsWith('chrome') || domain === '__whitelist__') return;
  try {
    const curr = await storageManager.get('sites', domain) || {
      domain, trackerCount:0, adCount:0, blockedAds:0, cookieCount:0,
      fingerprintCount:0, riskScore:0, riskLevel:'LOW',
      firstSeen:Date.now(), lastVisit:0
    };
    if (delta.trackerCount)     curr.trackerCount     = (curr.trackerCount||0) + delta.trackerCount;
    if (delta.adCount)          curr.adCount          = (curr.adCount||0)      + delta.adCount;
    if (delta.blockedAds)       curr.blockedAds       = (curr.blockedAds||0)   + delta.blockedAds;
    if (delta.cookieCount)      curr.cookieCount      = (curr.cookieCount||0)  + delta.cookieCount;
    if (delta.fingerprintCount) curr.fingerprintCount = (curr.fingerprintCount||0) + delta.fingerprintCount;
    if (delta.riskScore !== undefined) curr.riskScore = delta.riskScore;
    if (delta.riskLevel !== undefined) curr.riskLevel = delta.riskLevel;
    curr.lastVisit = Date.now();
    await storageManager.put('sites', curr);
  } catch (e) { warn('updateSiteStats:', e.message); }
}

async function addTrackerEntry(siteDomain, trackerDomain) {
  if (!siteDomain || !trackerDomain) return;
  try {
    const key  = `${siteDomain}::${trackerDomain}`;
    const curr = await storageManager.get('trackers', key) || {
      id: key, siteDomain, trackerDomain, count: 0, firstSeen: Date.now()
    };
    curr.count++;
    curr.lastSeen = Date.now();
    await storageManager.put('trackers', curr);
  } catch {}
}

async function updateRisk(tabId) {
  const s = getTabStats(tabId);
  if (!s.domain) return;
  const r = calcRisk(s.trackerCount, s.fingerprintCount);
  s.riskScore = r.score;
  s.riskLevel = r.level;
  try {
    await updateSiteStats(s.domain, { riskScore: r.score, riskLevel: r.level });
    await storageManager.addRiskHistory({
      domain: s.domain, score: r.score, level: r.level,
      trackers: s.trackerCount, cookies: s.cookieCount, timestamp: Date.now()
    });
  } catch {}
}

// ── webRequest listener — count what DNR blocks and what we detect ─────────────
function setupListeners() {
  // Count tracker/ad hits (DNR handles the actual blocking)
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (!details.url?.startsWith('http')) return;
      if (details.type === 'main_frame') return; // handled by webNavigation for navigation

      let reqDomain, srcDomain;
      try {
        reqDomain = clean(new URL(details.url).hostname);
        srcDomain = details.initiator ? clean(new URL(details.initiator).hostname) : '';
      } catch { return; }

      if (!reqDomain || reqDomain === srcDomain) return;
      if (CDN_WHITELIST.has(reqDomain) || userWhitelist.has(reqDomain)) return;

      const tab  = getTabStats(details.tabId);
      const site = srcDomain || reqDomain;
      if (site) tab.domain = site;

      if (isAd(reqDomain)) {
        // DNR already blocks it — we just count it
        tab.adCount++;
        tab.blockedAds++;
        tab.trackerCount++;
        await updateSiteStats(site, { trackerCount: 1, adCount: 1, blockedAds: 1 });
        await addTrackerEntry(site, reqDomain);
      } else if (isTracker(reqDomain)) {
        tab.trackerCount++;
        await updateSiteStats(site, { trackerCount: 1 });
        await addTrackerEntry(site, reqDomain);
      } else {
        return; // not tracked
      }
      await updateRisk(details.tabId);
    },
    { urls: ['<all_urls>'] }
  );

  // ── Navigation-level ad redirect catching ─────────────────────────────────
  // Fires when a tab NAVIGATES to a URL — catches click-tracking redirects
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return; // main frame only
    let domain;
    try { domain = clean(new URL(details.url).hostname); } catch { return; }
    if (!domain || CDN_WHITELIST.has(domain) || userWhitelist.has(domain)) return;

    if (isAd(domain) || NAVIGATION_AD_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      const tab = getTabStats(details.tabId);
      tab.adCount++;
      tab.blockedAds++;
      // DNR rules with main_frame type should have already blocked it
      // but we log it anyway for accurate counting
      const src = tab.domain || domain;
      await updateSiteStats(src, { adCount: 1, blockedAds: 1, trackerCount: 1 });
    }
  });

  // ── Tab lifecycle ──────────────────────────────────────────────────────────
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
      tabStats[tabId] = {
        domain:'', trackerCount:0, adCount:0, blockedAds:0,
        cookieCount:0, fingerprintCount:0, riskScore:0, riskLevel:'LOW'
      };
      try { tabStats[tabId].domain = clean(new URL(tab.url).hostname); } catch {}
    }
  });

  chrome.tabs.onRemoved.addListener(tabId => { delete tabStats[tabId]; });
}

// ── Cookie + localStorage helper ───────────────────────────────────────────────
async function deleteCookieAndStorage(name, url, domain) {
  // 1. Delete the actual cookie
  try { await chrome.cookies.remove({ name, url }); } catch {}

  // 2. Find tabs with this domain and clear localStorage key
  try {
    const allTabs = await chrome.tabs.query({});
    const targets = allTabs.filter(t => {
      try { return clean(new URL(t.url).hostname).includes(clean(domain)); } catch { return false; }
    });
    for (const tab of targets) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (cookieName) => {
            try {
              // Remove matching localStorage keys
              const keys = Object.keys(localStorage);
              keys.forEach(k => {
                if (k === cookieName || k.toLowerCase().includes(cookieName.toLowerCase())) {
                  localStorage.removeItem(k);
                }
              });
            } catch {}
          },
          args: [name]
        });
      } catch {} // Tab might be protected (chrome://)
    }
  } catch {}
}

// ── Message Router ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const action = message.action || message.type || '';
      log('←', action);

      // ── GET_TAB_STATS ──────────────────────────────────────────────────────
      if (action === 'GET_TAB_STATS') {
        const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
        if (!tab || tab.url?.startsWith('chrome://')) {
          sendResponse({ riskScore:0, riskLevel:'N/A', trackerCount:0, cookieCount:0, adCount:0, blockedAds:0 });
          return;
        }
        const stats  = getTabStats(tab.id);
        let domain   = stats.domain;
        if (!domain && tab.url) { try { domain = clean(new URL(tab.url).hostname); } catch {} }
        let cookieCount = stats.cookieCount;
        if (domain) {
          try { cookieCount = (await chrome.cookies.getAll({ domain }))?.length || 0; } catch {}
          stats.cookieCount = cookieCount;
        }
        sendResponse({
          domain, riskScore: stats.riskScore, riskLevel: stats.riskLevel,
          trackerCount: stats.trackerCount, cookieCount,
          adCount: stats.adCount, blockedAds: stats.blockedAds,
          fingerprintCount: stats.fingerprintCount
        });
      }

      // ── GET_DASHBOARD_DATA ─────────────────────────────────────────────────
      else if (action === 'GET_DASHBOARD_DATA') {
        let sites = [];
        try { sites = await storageManager.getAll('sites', 500); } catch {}
        sites = (sites||[]).filter(s => s.domain && s.domain !== '__whitelist__');
        sendResponse({ sites, success: true });
      }

      // ── GET_TRACKERS_FOR_SITE ──────────────────────────────────────────────
      else if (action === 'GET_TRACKERS_FOR_SITE') {
        let entries = [];
        try {
          entries = await storageManager.getAll('trackers', 2000);
          if (message.siteDomain) {
            entries = entries.filter(e => e.siteDomain === message.siteDomain);
          }
        } catch {}
        sendResponse({ trackers: entries || [], success: true });
      }

      // ── DELETE_TRACKER ─────────────────────────────────────────────────────
      else if (action === 'DELETE_TRACKER') {
        try {
          await storageManager.delete('trackers', message.id);
          sendResponse({ success: true });
        } catch (e) { sendResponse({ success: false, error: e.message }); }
      }

      // ── GET_ALL_COOKIES ────────────────────────────────────────────────────
      else if (action === 'GET_ALL_COOKIES') {
        let raw = [];
        try {
          raw = message.domain
            ? await chrome.cookies.getAll({ domain: message.domain })
            : await chrome.cookies.getAll({});
        } catch {}
        const now = Date.now() / 1000;
        const cookies = (raw||[]).map(c => ({
          ...c,
          daysRemaining:   c.expirationDate ? Math.max(0, Math.round((c.expirationDate - now) / 86400)) : null,
          isSession:       !c.expirationDate,
          expiryFormatted: c.expirationDate ? new Date(c.expirationDate * 1000).toLocaleDateString() : 'Session'
        }));
        sendResponse({ cookies, success: true });
      }

      // ── DELETE_COOKIE — also clears localStorage ────────────────────────────
      else if (action === 'DELETE_COOKIE') {
        const domain = (message.domain || '').replace(/^\./, '') ||
          (() => { try { return clean(new URL(message.url).hostname); } catch { return ''; } })();
        await deleteCookieAndStorage(message.name, message.url, domain);
        sendResponse({ success: true });
      }

      // ── DELETE_ALL_COOKIES_FOR_SITE ────────────────────────────────────────
      else if (action === 'DELETE_ALL_COOKIES_FOR_SITE') {
        let removed = 0;
        try {
          const all = await chrome.cookies.getAll({ domain: message.domain });
          for (const c of all) {
            const url = `${c.secure?'https':'http'}://${(c.domain||'').replace(/^\./,'')}${c.path||'/'}`;
            await deleteCookieAndStorage(c.name, url, message.domain);
            removed++;
          }

          // Also clear entire localStorage for this domain on any open tabs
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            try {
              if (!clean(new URL(tab.url).hostname).includes(clean(message.domain))) continue;
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => { try { localStorage.clear(); sessionStorage.clear(); } catch {} }
              });
            } catch {}
          }
        } catch {}
        sendResponse({ success: true, removed });
      }

      // ── GET_RISK_HISTORY ───────────────────────────────────────────────────
      else if (action === 'GET_RISK_HISTORY') {
        let history = [];
        try { history = await storageManager.getRiskHistorySince(Date.now() - (message.hours||24) * 3600000); } catch {}
        sendResponse({ history: history||[], success: true });
      }

      // ── WHITELIST_DOMAIN ───────────────────────────────────────────────────
      else if (action === 'WHITELIST_DOMAIN') {
        userWhitelist.add(message.domain);
        try {
          await storageManager.put('sites', {
            domain: '__whitelist__',
            domains: [...userWhitelist]
          });
        } catch {}
        log('Whitelisted:', message.domain);
        sendResponse({ success: true });
      }

      // ── DELETE_SITE ────────────────────────────────────────────────────────
      else if (action === 'DELETE_SITE') {
        try {
          await storageManager.delete('sites', message.domain);
          // Remove all tracker entries for this site
          const all = await storageManager.getAll('trackers', 5000);
          await Promise.all(
            (all||[]).filter(t => t.siteDomain === message.domain)
                     .map(t => storageManager.delete('trackers', t.id))
          );
          // Remove from runtime stats
          for (const [tid, stats] of Object.entries(tabStats)) {
            if (stats.domain === message.domain) delete tabStats[tid];
          }
          sendResponse({ success: true });
        } catch (e) { sendResponse({ success: false, error: e.message }); }
      }

      // ── FINGERPRINT_DETECTED (from content script) ─────────────────────────
      else if (action === 'FINGERPRINT_DETECTED') {
        const data = message.data;
        if (!data) { sendResponse({ received: true }); return; }
        let domain;
        try { domain = clean(new URL(data.url).hostname); } catch { sendResponse({ received:true }); return; }
        const total = (data.canvas||0) + (data.webgl||0) + (data.audio||0);
        if (total > 0) {
          await updateSiteStats(domain, { fingerprintCount: total });
          try {
            const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
            if (tab) {
              const s = getTabStats(tab.id);
              s.fingerprintCount += total;
              if (!s.domain) s.domain = domain;
              await updateRisk(tab.id);
            }
          } catch {}
        }
        sendResponse({ received: true });
      }

      // ── GET_GRAPH_DATA — builds tracker-site graph from stored data ────────
      else if (action === 'GET_GRAPH_DATA') {
        try {
          const trackerEntries = await storageManager.getAll('trackers', 5000);
          const nodeMap = new Map();
          const linkSet = new Set();
          const links   = [];

          for (const entry of (trackerEntries || [])) {
            const { siteDomain, trackerDomain, count } = entry;
            if (!siteDomain || !trackerDomain) continue;

            if (!nodeMap.has(siteDomain)) {
              nodeMap.set(siteDomain, { id: siteDomain, type: 'site',    weight: 1 });
            }
            if (!nodeMap.has(trackerDomain)) {
              nodeMap.set(trackerDomain, { id: trackerDomain, type: 'tracker', weight: 0 });
            }
            nodeMap.get(trackerDomain).weight += (count || 1);

            const key = `${siteDomain}::${trackerDomain}`;
            if (!linkSet.has(key)) {
              linkSet.add(key);
              links.push({ source: siteDomain, target: trackerDomain, value: count || 1 });
            }
          }

          sendResponse({
            success: true,
            nodes:   Array.from(nodeMap.values()),
            links
          });
        } catch (e) { sendResponse({ success: false, nodes: [], links: [], error: e.message }); }
      }

      // ── CLEAR_ALL ──────────────────────────────────────────────────────────
      else if (action === 'CLEAR_ALL') {
        try { await storageManager.clearAll(); } catch {}
        Object.keys(tabStats).forEach(k => delete tabStats[k]);
        sendResponse({ success: true });
      }

      else {
        warn('Unknown action:', action);
        sendResponse({ ok: false, action });
      }

    } catch (e) {
      console.error('[PRIVISEE-X BG] Handler error:', e);
      try { sendResponse({ error: e.message }); } catch {}
    }
  })();
  return true; // keep message port open
});

// ── Daily Cleanup via chrome.alarms ──────────────────────────────────────────
if (chrome.alarms) {
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 1440 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'daily_cleanup') {
      try {
        const removed = await storageManager.cleanupOldData();
        log(`Daily cleanup: ${removed} stale records removed`);
      } catch (e) {
        warn('Daily cleanup failed:', e.message);
      }
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  log('Initializing...');
  // Init DB first — if this fails, log but don't crash
  try {
    await storageManager.init();
    log('StorageManager ready');
  } catch (e) {
    warn('StorageManager init failed:', e.message);
  }

  // Load whitelist from DB
  try {
    const wl = await storageManager.get('sites', '__whitelist__');
    if (wl?.domains) wl.domains.forEach(d => userWhitelist.add(d));
    log('Whitelist loaded:', userWhitelist.size, 'domains');
  } catch {}

  // Set up ad blocking rules (non-fatal if fails)
  await setupAdBlocking();

  // Set up webRequest + webNavigation + tab listeners
  setupListeners();

  log('PRIVISEE-X ready ✓');
}

init().catch(e => console.error('[PRIVISEE-X BG] Fatal init error:', e));

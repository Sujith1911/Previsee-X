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
const tabStats      = {};
const userWhitelist = new Set();
// trustedDomains: { [domain]: { ts, reason } } — persisted in chrome.storage.local
let trustedDomains  = {};
// per-tab static analysis cache { [tabId]: { staticScore, breakdown, headers } }
const tabStaticCache = {};
// per-tab behavioral signals { [tabId]: { apiCounts, networkInfo } }
const tabBehavior    = {};

function log(msg, ...args) { console.log('[PRIVISEE-X BG]', msg, ...args); }
function warn(msg, ...args) { console.warn('[PRIVISEE-X BG]', msg, ...args); }

function getTabStats(tabId) {
  if (!tabStats[tabId]) {
    tabStats[tabId] = {
      domain:'', trackerCount:0, adCount:0, blockedAds:0,
      cookieCount:0, fingerprintCount:0, riskScore:0, riskLevel:'LOW',
      staticScore:0, behavioralScore:0, reputationScore:0,
      projection: null, dnaHash: null
    };
  }
  return tabStats[tabId];
}

function getTabBehavior(tabId) {
  if (!tabBehavior[tabId]) {
    tabBehavior[tabId] = {
      apiCounts:   { canvas:0, webgl:0, audio:0, fonts:0, webrtc:0, battery:0, localStorage:0, clipboard:0 },
      networkInfo: { fetchCount:0, xhrCount:0, wsCount:0, thirdPartyDomains:[] }
    };
  }
  return tabBehavior[tabId];
}

// ── Static Intelligence Engine (inlined for SW compatibility) ─────────────────
const SUSPICIOUS_TLDS = new Set(['xyz','tk','ml','ga','cf','gq','zip','mov','fit','bid','win',
  'loan','click','download','review','stream','top','gdn','accountant','faith','date','racing','trade']);
const KNOWN_TRACKER_ROOTS_STATIC = new Set(['doubleclick.net','google-analytics.com','googletagmanager.com',
  'hotjar.com','fullstory.com','mouseflow.com','clarity.ms','mixpanel.com','amplitude.com',
  'segment.com','segment.io','criteo.com','criteo.net','adroll.com','outbrain.com','taboola.com',
  'scorecardresearch.com','quantserve.com','newrelic.com','sentry.io','heapanalytics.com','intercom.io']);

function computeStaticScore({ url='', domain='', headers={}, cookies=[] }) {
  let score = 0;
  const breakdown = [];
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  const isHTTPS = url.startsWith('https://');
  if (!h['content-security-policy'])     { score += 10; breakdown.push({ factor:'Missing CSP',                  delta:10 }); }
  if (!h['strict-transport-security'])   { score += 15; breakdown.push({ factor:'Missing HSTS',                 delta:15 }); }
  if (!h['x-frame-options'])             { score +=  8; breakdown.push({ factor:'Missing X-Frame-Options',      delta:8  }); }
  if (!h['referrer-policy'])             { score +=  5; breakdown.push({ factor:'Missing Referrer-Policy',      delta:5  }); }
  if (!h['permissions-policy'])          { score +=  5; breakdown.push({ factor:'Missing Permissions-Policy',   delta:5  }); }
  if (!h['x-content-type-options'] || h['x-content-type-options'].toLowerCase() !== 'nosniff')
                                         { score +=  5; breakdown.push({ factor:'Missing X-Content-Type-Options', delta:5 }); }
  if (!isHTTPS)                          { score += 30; breakdown.push({ factor:'Unencrypted HTTP',              delta:30 }); }
  if (Array.isArray(cookies)) {
    let ins=0, ssn=0;
    for (const c of cookies) {
      if (!c.secure && isHTTPS) ins++;
      const ss = (c.sameSite||'').toLowerCase();
      if ((ss==='no_restriction'||ss==='none') && !c.secure) ssn++;
    }
    if (ins>0) { const d=Math.min(20,ins*5); score+=d; breakdown.push({ factor:`${ins} cookie(s) missing Secure flag`, delta:d }); }
    if (ssn>0) { const d=Math.min(16,ssn*8); score+=d; breakdown.push({ factor:`${ssn} SameSite=None without Secure`, delta:d }); }
  }
  const tld = domain.split('.').pop().toLowerCase();
  if (SUSPICIOUS_TLDS.has(tld)) { score += 20; breakdown.push({ factor:`Suspicious TLD (.${tld})`, delta:20 }); }
  const root = domain.split('.').slice(-2).join('.').toLowerCase();
  if (KNOWN_TRACKER_ROOTS_STATIC.has(root)||KNOWN_TRACKER_ROOTS_STATIC.has(domain)) { score+=10; breakdown.push({ factor:'Known tracker domain', delta:10 }); }
  return { staticScore: Math.min(100, Math.max(0, Math.round(score))), breakdown };
}

// ── Behavioral DNA (inlined) ──────────────────────────────────────────────────
const DNA_CLUSTERS = [
  { name:'heavy_fingerprinter', centroid:{canvas:0.9,webgl:0.8,audio:0.7,fonts:0.8,webrtc:0.6,battery:0.5,localStorage:0.3,clipboard:0.1}, riskBoost:25 },
  { name:'tracker_analytics',   centroid:{canvas:0.3,webgl:0.1,audio:0.0,fonts:0.2,webrtc:0.0,battery:0.0,localStorage:0.7,clipboard:0.0}, riskBoost:15 },
  { name:'data_exfiltrator',    centroid:{canvas:0.4,webgl:0.2,audio:0.1,fonts:0.3,webrtc:0.3,battery:0.2,localStorage:0.8,clipboard:0.7}, riskBoost:30 },
  { name:'clean_site',          centroid:{canvas:0.05,webgl:0,audio:0,fonts:0.05,webrtc:0,battery:0,localStorage:0.1,clipboard:0},           riskBoost:0  }
];
const DNA_VEC_KEYS = ['canvas','webgl','audio','fonts','webrtc','battery','localStorage','clipboard'];
const DNA_MAX      = {canvas:20,webgl:10,audio:10,fonts:50,webrtc:5,battery:3,localStorage:30,clipboard:5};

function dnaHash(api, domains=[]) {
  const str = JSON.stringify({ api, cluster: dnaCluster(api), domains:[...domains].sort() });
  let h = 0x811c9dc5;
  for (let i=0; i<str.length; i++) { h ^= str.charCodeAt(i); h = (h*0x01000193)>>>0; }
  return h.toString(16).padStart(8,'0');
}

function dnaCluster(api={}) {
  const norm={}; for (const k of DNA_VEC_KEYS) norm[k]=Math.min(1,(api[k]||0)/(DNA_MAX[k]||1));
  let best=null, bestSim=-1;
  for (const cl of DNA_CLUSTERS) {
    let dot=0,mA=0,mB=0;
    for (const k of DNA_VEC_KEYS) { dot+=(norm[k]||0)*(cl.centroid[k]||0); mA+=(norm[k]||0)**2; mB+=(cl.centroid[k]||0)**2; }
    const sim = (mA&&mB) ? dot/(Math.sqrt(mA)*Math.sqrt(mB)) : 0;
    if (sim>bestSim) { bestSim=sim; best=cl; }
  }
  return { name:best?.name||'unknown', similarity:parseFloat(bestSim.toFixed(3)), riskBoost: bestSim>0.75&&best ? best.riskBoost : 0 };
}

// ── Threat Projection (inlined) ───────────────────────────────────────────────
function projectRisk(history=[], clusterBoost=0, currentScore=0) {
  const scores = history.map(h=>h.score||0);
  let proj = scores.length>=2 ? scores.reduce((e,s,i)=>i===0?s:0.3*s+0.7*e,0) : currentScore;
  const mid=Math.floor(scores.length/2);
  if (scores.length>=4) {
    const a1=scores.slice(0,mid).reduce((a,b)=>a+b,0)/mid;
    const a2=scores.slice(mid).reduce((a,b)=>a+b,0)/(scores.length-mid);
    const delta=a2-a1; if (delta>5) proj+=delta*0.7; else if (delta<-5) proj*=0.9;
  }
  proj += clusterBoost*0.5;
  return Math.round(Math.min(100,Math.max(0,proj)));
}

// ── Multi-Layer Risk Score ────────────────────────────────────────────────────
// Weights: 40% Behavioral | 30% Static | 20% Reputation | 10% UserHistory
// NOTE: Intentionally inlined — see comment above calcRisk original.
async function calcRisk(tabId, domain) {
  const s  = getTabStats(tabId);
  const bh = getTabBehavior(tabId);

  // Behavioral score (trackers + fingerprinting + 3rd-party cookies)
  let behavioral = 0;
  if (s.trackerCount>0)    behavioral += Math.min(40, Math.log2(s.trackerCount+1)*13);
  behavioral += Math.min(30, s.fingerprintCount*10);
  behavioral += Math.min(20, (s.cookieCount>5 ? (s.cookieCount-5)*2 : 0));
  behavioral = Math.min(100, Math.round(behavioral));

  // DNA cluster match for reputation boost
  const cluster     = dnaCluster(bh.apiCounts);
  const reputBoost  = cluster.riskBoost;

  // Static score from cached headers
  const staticScore = tabStaticCache[tabId]?.staticScore ?? 0;

  // Reputation score (tracker blocklist density + DNA cluster)
  const reputation = Math.min(100, Math.round(
    (s.trackerCount>0 ? Math.min(50, s.trackerCount*5) : 0) + reputBoost
  ));

  // User history score — how consistently risky this domain has been
  let userHistory = 0;
  try {
    const hist = await storageManager.getRiskHistorySince(Date.now() - 30*86400000);
    const domainHist = (hist||[]).filter(h=>h.domain===domain).slice(-10);
    if (domainHist.length) {
      userHistory = Math.round(domainHist.reduce((a,h)=>a+h.score,0)/domainHist.length);
    }
  } catch {}

  // Weighted final score
  const final = Math.round(Math.min(100, Math.max(0,
    0.40*behavioral + 0.30*staticScore + 0.20*reputation + 0.10*userHistory
  )));

  const level = final>=75?'CRITICAL':final>=50?'HIGH':final>=20?'MODERATE':'LOW';

  // Store breakdown in tab stats
  s.behavioralScore = behavioral;
  s.staticScore     = staticScore;
  s.reputationScore = reputation;
  s.riskScore       = final;
  s.riskLevel       = level;

  return { score:final, level, behavioral, staticScore, reputation, userHistory };
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
  // Trust override — skip all calculations
  if (trustedDomains[s.domain]) {
    s.riskScore = 0; s.riskLevel = 'LOW';
    return;
  }
  const r = await calcRisk(tabId, s.domain);
  try {
    await updateSiteStats(s.domain, { riskScore: r.score, riskLevel: r.level });
    await storageManager.addRiskHistory({
      domain: s.domain, score: r.score, level: r.level,
      trackers: s.trackerCount, cookies: s.cookieCount,
      staticScore: r.staticScore, behavioralScore: r.behavioral,
      timestamp: Date.now()
    });
  } catch {}
}

// ── webRequest listener — count what DNR blocks and what we detect ─────────────
function setupListeners() {
  // Count tracker/ad hits (DNR handles the actual blocking)
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (!details.url?.startsWith('http')) return;
      if (details.type === 'main_frame') return;

      let reqDomain, srcDomain;
      try {
        reqDomain = clean(new URL(details.url).hostname);
        srcDomain = details.initiator ? clean(new URL(details.initiator).hostname) : '';
      } catch { return; }

      if (!reqDomain || reqDomain === srcDomain) return;
      if (CDN_WHITELIST.has(reqDomain) || userWhitelist.has(reqDomain)) return;

      const tab  = getTabStats(details.tabId);
      const bh   = getTabBehavior(details.tabId);
      const site = srcDomain || reqDomain;
      if (site) tab.domain = site;

      // Track third-party domains for DNA
      if (!bh.networkInfo.thirdPartyDomains.includes(reqDomain)) {
        bh.networkInfo.thirdPartyDomains.push(reqDomain);
      }
      if (details.type === 'xmlhttprequest') bh.networkInfo.xhrCount++;

      if (isAd(reqDomain)) {
        tab.adCount++; tab.blockedAds++; tab.trackerCount++;
        await updateSiteStats(site, { trackerCount:1, adCount:1, blockedAds:1 });
        await addTrackerEntry(site, reqDomain);
      } else if (isTracker(reqDomain)) {
        tab.trackerCount++;
        await updateSiteStats(site, { trackerCount:1 });
        await addTrackerEntry(site, reqDomain);
      } else { return; }
      await updateRisk(details.tabId);
    },
    { urls: ['<all_urls>'] }
  );

  // ── Static score via response headers ─────────────────────────────────────
  chrome.webRequest.onHeadersReceived.addListener(
    async (details) => {
      if (details.type !== 'main_frame') return;
      let domain, url = details.url;
      try { domain = clean(new URL(url).hostname); } catch { return; }
      if (!domain || CDN_WHITELIST.has(domain)) return;

      // Convert header array to object
      const headers = {};
      for (const h of (details.responseHeaders || [])) headers[h.name.toLowerCase()] = h.value;

      // Get cookies for this domain
      let cookies = [];
      try { cookies = await chrome.cookies.getAll({ domain }); } catch {}

      const result = computeStaticScore({ url, domain, headers, cookies });
      tabStaticCache[details.tabId] = { ...result, url, domain, rawHeaders: headers };
      log(`Static score for ${domain}: ${result.staticScore}`);
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );

  // ── Navigation-level ad redirect catching ─────────────────────────────────
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId !== 0) return;
    let domain;
    try { domain = clean(new URL(details.url).hostname); } catch { return; }
    if (!domain || CDN_WHITELIST.has(domain) || userWhitelist.has(domain)) return;

    if (isAd(domain) || NAVIGATION_AD_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      const tab = getTabStats(details.tabId);
      tab.adCount++; tab.blockedAds++;
      const src = tab.domain || domain;
      await updateSiteStats(src, { adCount:1, blockedAds:1, trackerCount:1 });
    }
  });

  // ── Tab lifecycle ──────────────────────────────────────────────────────────
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
      tabStats[tabId]      = { domain:'', trackerCount:0, adCount:0, blockedAds:0, cookieCount:0,
                               fingerprintCount:0, riskScore:0, riskLevel:'LOW', staticScore:0,
                               behavioralScore:0, reputationScore:0, projection:null, dnaHash:null };
      tabBehavior[tabId]   = { apiCounts:{canvas:0,webgl:0,audio:0,fonts:0,webrtc:0,battery:0,localStorage:0,clipboard:0},
                               networkInfo:{fetchCount:0,xhrCount:0,wsCount:0,thirdPartyDomains:[]} };
      tabStaticCache[tabId] = null;
      try { tabStats[tabId].domain = clean(new URL(tab.url).hostname); } catch {}
    }
  });

  // ── Generate DNA hash + projection when tab finishes loading ─────────────
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    let domain;
    try { domain = clean(new URL(tab.url).hostname); } catch { return; }
    if (!domain) return;

    const bh = getTabBehavior(tabId);
    const s  = getTabStats(tabId);
    const cluster    = dnaCluster(bh.apiCounts);
    const hash       = dnaHash(bh.apiCounts, bh.networkInfo.thirdPartyDomains);
    s.dnaHash        = hash;

    // Store DNA fingerprint
    try {
      const fp = { key:`dna::${domain}`, domain, hash, signature:{ apiUsage:bh.apiCounts, network:bh.networkInfo, cluster }, ts:Date.now() };
      await storageManager.put('models', fp);
    } catch {}

    // Compute projection
    try {
      const hist = await storageManager.getRiskHistorySince(Date.now()-30*86400000);
      const domHist = (hist||[]).filter(h=>h.domain===domain);
      const projected = projectRisk(domHist, cluster.riskBoost, s.riskScore);
      const trend = domHist.length>=4 ? (() => {
        const mid=Math.floor(domHist.length/2);
        const a1=domHist.slice(0,mid).reduce((a,h)=>a+h.score,0)/mid;
        const a2=domHist.slice(mid).reduce((a,h)=>a+h.score,0)/(domHist.length-mid);
        return a2-a1>5?'INCREASING':a2-a1<-5?'DECREASING':'STABLE';
      })() : 'STABLE';
      s.projection = {
        projectedRiskIn30Days: projected,
        confidence: domHist.length>=5?'HIGH':domHist.length>=2?'MEDIUM':'LOW',
        trend,
        clusterName: cluster.name,
        clusterSimilarity: cluster.similarity,
        message: `Risk projected to ~${projected}/100 in 30 days (${domHist.length>=2?'MEDIUM':'LOW'} confidence)`
      };
      // Persist projection
      await storageManager.put('models', { key:`proj::${domain}`, domain, ...s.projection, ts:Date.now() });
    } catch {}
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    delete tabStats[tabId];
    delete tabBehavior[tabId];
    delete tabStaticCache[tabId];
  });
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
        const trusted   = !!(domain && trustedDomains[domain]);
        const sc        = tabStaticCache[tab.id] || {};
        const staticBreakdown = sc.breakdown || [];
        sendResponse({
          domain,
          riskScore:        trusted ? 0 : stats.riskScore,
          riskLevel:        trusted ? 'LOW' : stats.riskLevel,
          trusted,
          trackerCount:     stats.trackerCount,
          cookieCount,
          adCount:          stats.adCount,
          blockedAds:       stats.blockedAds,
          fingerprintCount: stats.fingerprintCount,
          staticScore:      stats.staticScore,
          behavioralScore:  stats.behavioralScore,
          reputationScore:  stats.reputationScore,
          staticBreakdown,
          dnaHash:          stats.dnaHash,
          projection:       stats.projection
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
          await storageManager.put('sites', { domain:'__whitelist__', domains:[...userWhitelist] });
        } catch {}
        sendResponse({ success: true });
      }

      // ── TRUST_DOMAIN ───────────────────────────────────────────────────────
      else if (action === 'TRUST_DOMAIN') {
        const d = message.domain;
        if (!d) { sendResponse({ success:false, error:'No domain' }); return; }
        trustedDomains[d] = { ts: Date.now(), reason: message.reason || 'user' };
        try { await chrome.storage.local.set({ trustedDomains }); } catch {}
        // Reset risk for active tabs of this domain
        for (const [tid, s] of Object.entries(tabStats)) {
          if (clean(s.domain) === clean(d)) { s.riskScore=0; s.riskLevel='LOW'; }
        }
        log('Trusted:', d);
        sendResponse({ success:true });
      }

      // ── UNTRUST_DOMAIN ─────────────────────────────────────────────────────
      else if (action === 'UNTRUST_DOMAIN') {
        const d = message.domain;
        delete trustedDomains[d];
        try { await chrome.storage.local.set({ trustedDomains }); } catch {}
        sendResponse({ success:true });
      }

      // ── GET_TRUST_STATUS ───────────────────────────────────────────────────
      else if (action === 'GET_TRUST_STATUS') {
        sendResponse({ trusted: !!trustedDomains[message.domain], trustedAt: trustedDomains[message.domain]?.ts || null });
      }

      // ── GET_PROJECTION ─────────────────────────────────────────────────────
      else if (action === 'GET_PROJECTION') {
        const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
        const s = tab ? getTabStats(tab.id) : null;
        sendResponse({ projection: s?.projection || null, success:true });
      }

      // ── GET_DNA_HASH ───────────────────────────────────────────────────────
      else if (action === 'GET_DNA_HASH') {
        const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
        const s = tab ? getTabStats(tab.id) : null;
        const bh = tab ? getTabBehavior(tab.id) : null;
        sendResponse({ hash: s?.dnaHash||null, signature: bh||null, success:true });
      }

      // ── GET_RESEARCH_DATA ──────────────────────────────────────────────────
      else if (action === 'GET_RESEARCH_DATA') {
        const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
        const s  = tab ? getTabStats(tab.id) : {};
        const bh = tab ? getTabBehavior(tab.id) : {};
        const sc = tab ? tabStaticCache[tab.id] : null;
        sendResponse({
          success: true,
          domain:         s.domain || '',
          riskScore:      s.riskScore,
          staticScore:    s.staticScore,
          behavioralScore: s.behavioralScore,
          reputationScore: s.reputationScore,
          staticBreakdown: sc?.breakdown || [],
          rawHeaders:     sc?.rawHeaders || {},
          dnaHash:        s.dnaHash,
          behavioralSignature: bh,
          clusterMatch:   bh ? dnaCluster(bh.apiCounts||{}) : null,
          projection:     s.projection,
          ts:             Date.now()
        });
      }

      // ── RELOAD_TRUSTED_DOMAINS (called by settings.js after manual trust edits) ─
      else if (action === 'RELOAD_TRUSTED_DOMAINS') {
        try {
          const stored = await chrome.storage.local.get('trustedDomains');
          trustedDomains = stored.trustedDomains || {};
          sendResponse({ success: true, count: Object.keys(trustedDomains).length });
        } catch (e) { sendResponse({ success: false, error: e.message }); }
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

  // Load trusted domains from chrome.storage.local (persistent across SW restarts)
  try {
    const local = await chrome.storage.local.get('trustedDomains');
    if (local.trustedDomains) {
      trustedDomains = local.trustedDomains;
      log('Trusted domains loaded:', Object.keys(trustedDomains).length);
    }
  } catch {}

  // Load research mode preference
  try {
    const local = await chrome.storage.local.get('researchModeEnabled');
    log('Research mode:', local.researchModeEnabled ? 'ON' : 'OFF');
  } catch {}

  // Set up ad blocking rules (non-fatal if fails)
  await setupAdBlocking();

  // Set up webRequest + webNavigation + tab listeners
  setupListeners();

  log('PRIVISEE-X ready ✓');
}

init().catch(e => console.error('[PRIVISEE-X BG] Fatal init error:', e));

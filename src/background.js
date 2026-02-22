/**
 * PRIVISEE-X v4.0 — Background Service Worker
 * WebAdvisor Mode + Privacy Firewall + Behavioral Risk Engine
 * Certificate Warning Engine + Security Layer Analysis
 */

import { storageManager } from './storage/StorageManager.js';
import { CertWarningEngine } from './security/CertWarningEngine.js';
import { AdvisoryEngine } from './risk/AdvisoryEngine.js';

// ── Domain Lists ──────────────────────────────────────────────────────────────
const AD_DOMAINS = [
  'doubleclick.net','googlesyndication.com','adservice.google.com',
  'googletagservices.com','pagead2.googlesyndication.com','tpc.googlesyndication.com',
  'amazon-adsystem.com','aax-us-east.amazon-adsystem.com',
  'connect.facebook.net','an.facebook.com',
  'static.ads-twitter.com','ads.twitter.com',
  'secure.adnxs.com','ib.adnxs.com','cdn.adnxs.com',
  'rubiconproject.com','pubmatic.com','openx.net','us-u.openx.net',
  'criteo.com','criteo.net','static.criteo.net',
  'casalemedia.com','contextweb.com','sovrn.com','indexexchange.com',
  'smartadserver.com','advertising.com','adsrvr.org','thetradedesk.com',
  'bluekai.com','adroll.com','outbrain.com','taboola.com',
  'moatads.com','doubleverify.com','flashtalking.com',
  'media.net','ads.linkedin.com','revcontent.com','mgid.com','zergnet.com',
  'ad.doubleclick.net','cm.g.doubleclick.net','googleads.g.doubleclick.net',
  'adtech.de','rfihub.com','rlcdn.com','appnexus.com','sharethrough.com'
];

const TRACKER_DOMAINS = [
  'google-analytics.com','analytics.google.com','googletagmanager.com',
  'analytics.twitter.com','bat.bing.com','mc.yandex.ru',
  'tr.snapchat.com','analytics.tiktok.com','pixel.quantserve.com',
  'scorecardresearch.com','quantserve.com','hotjar.com','fullstory.com',
  'mouseflow.com','clarity.ms','newrelic.com','mixpanel.com',
  'amplitude.com','heapanalytics.com','segment.io','segment.com',
  'intercom.io','intercomcdn.com','hubspot.com','marketo.com','pardot.com',
  'logrocket.io','sentry.io','convertkit.com','mailchimp.com','klaviyo.com',
  'branch.io','onesignal.com'
];

const NAVIGATION_AD_DOMAINS = [
  'outbrain.com','taboola.com','revcontent.com','mgid.com','zergnet.com',
  'doubleclick.net','googleads.g.doubleclick.net','tradedoubler.com',
  'awin1.com','track.adform.net','servedby.flashtalking.com',
  'clickbooth.com','anrdoezrs.net','tkqlhce.com','dpbolvw.net','jdoqocy.com'
];

// Known redirect/malware domains for strict mode
const REDIRECT_DOMAINS = new Set([
  'redirect.viglink.com','api2.viglink.com','go.redirectingat.com',
  'track.flexlinkspro.com','redirect2.adform.net','ad.doubleclick.net',
  'bounce.trafficjunky.net','redir.speedbit.com','www.googleadservices.com',
  'landing.adtrafficquality.google','pagead.l.doubleclick.net'
]);

const STRICT_TLDS = new Set(['xyz','tk','ml','ga','cf','gq','zip','mov','fit','bid','win',
  'loan','click','download','review','stream','top','gdn','accountant','faith','date','racing','trade']);

const CDN_WHITELIST = new Set([
  'fonts.googleapis.com','fonts.gstatic.com','ajax.googleapis.com',
  'cdnjs.cloudflare.com','cdn.jsdelivr.net','unpkg.com',
  'static.cloudflareinsights.com','i.ytimg.com','s.ytimg.com',
  'ssl.gstatic.com','www.gstatic.com','ytimg.com','googlevideo.com','gvt1.com'
]);

const AD_DOMAIN_SET      = new Set(AD_DOMAINS);
const TRACKER_DOMAIN_SET = new Set(TRACKER_DOMAINS);

// ── Global State ──────────────────────────────────────────────────────────────
const tabStats       = {};
const tabBehavior    = {};
const tabStaticCache = {};
const userWhitelist  = new Set();
let   trustedDomains = {};   // { domain: { ts, reason } }
let   strictMode     = false;
let   adsBlockedCount     = 0;
let   trackersBlockedCount = 0;
let   listenersReady = false;

// Per-tab overlay/warning dismissed flags
const overlayDismissed = {}; // tabId → boolean
const certWarningDismissed = {}; // tabId → boolean

// In-memory blocked log (last 500, persisted to IDB lazily)
const blockedLog = [];

// Per-tab debounce timestamps
const riskDebounce = {};

function log(msg,  ...a) { console.log('[PRIVISEE-X BG]', msg, ...a); }
function warn(msg, ...a) { console.warn('[PRIVISEE-X BG]', msg, ...a); }

// ── Tab State Factories ───────────────────────────────────────────────────────
function getTabStats(tabId) {
  if (!tabStats[tabId]) {
    tabStats[tabId] = {
      domain:'', trackerCount:0, adCount:0, blockedAds:0,
      cookieCount:0, fingerprintCount:0,
      currentSessionRisk:0, historicalRisk:0, trustOverride:false,
      riskScore:0, riskLevel:'LOW',
      staticScore:0, behavioralScore:0, reputationScore:0,
      securityLayerScore:0, certWarning:null,
      webAdvisorStatus:'SAFE', // SAFE | CAUTION | DANGEROUS
      projection:null, dnaHash:null
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

function resetTab(tabId, url) {
  tabStats[tabId]      = getTabStats(tabId); // ensure exists
  const s = tabStats[tabId];
  s.domain = ''; s.trackerCount=0; s.adCount=0; s.blockedAds=0;
  s.cookieCount=0; s.fingerprintCount=0;
  s.currentSessionRisk=0; s.historicalRisk=0; s.trustOverride=false;
  s.riskScore=0; s.riskLevel='LOW';
  s.staticScore=0; s.behavioralScore=0; s.reputationScore=0;
  s.securityLayerScore=0; s.certWarning=null; s.webAdvisorStatus='SAFE';
  s.projection=null; s.dnaHash=null;
  tabBehavior[tabId]   = null;
  tabStaticCache[tabId] = null;
  riskDebounce[tabId]  = 0;
  overlayDismissed[tabId] = false;
  certWarningDismissed[tabId] = false;
  if (url) { try { s.domain = clean(new URL(url).hostname); } catch {} }
}

// ── Domain Helpers ────────────────────────────────────────────────────────────
function clean(d) { return (d||'').replace(/^www\./,'').toLowerCase(); }

function isAd(domain) {
  if (CDN_WHITELIST.has(domain)) return false;
  if (AD_DOMAIN_SET.has(domain)) return true;
  const root = domain.split('.').slice(-2).join('.');
  return AD_DOMAIN_SET.has(root);
}

function isTracker(domain) {
  if (CDN_WHITELIST.has(domain)) return false;
  if (TRACKER_DOMAIN_SET.has(domain)) return true;
  const root = domain.split('.').slice(-2).join('.');
  return TRACKER_DOMAIN_SET.has(root);
}

function isStrictBlocked(domain) {
  if (!strictMode) return false;
  if (REDIRECT_DOMAINS.has(domain)) return true;
  const tld = (domain.split('.').pop()||'').toLowerCase();
  if (STRICT_TLDS.has(tld)) return true;
  const parts = domain.split('.');
  const name = parts.slice(-2,-1)[0] || '';
  // Block very short domain names (< 4 chars, likely suspicious)
  if (name.length < 4 && parts.length <= 3) return true;
  return false;
}

// ── Static Score Engine ───────────────────────────────────────────────────────
const SUSPICIOUS_TLDS = STRICT_TLDS;
const KNOWN_TRACKER_ROOTS = new Set([
  'doubleclick.net','google-analytics.com','googletagmanager.com',
  'hotjar.com','fullstory.com','mouseflow.com','clarity.ms',
  'mixpanel.com','amplitude.com','segment.com','segment.io',
  'criteo.com','criteo.net','adroll.com','outbrain.com','taboola.com',
  'scorecardresearch.com','quantserve.com','newrelic.com','sentry.io',
  'heapanalytics.com','intercom.io'
]);

function computeStaticScore({ url='', domain='', headers={}, cookies=[], redirectCount=0, thirdPartyDomains=[] }) {
  let score = 0;
  const breakdown = [];
  const h = {};
  for (const [k,v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  const isHTTPS = url.startsWith('https://');

  if (!h['content-security-policy'])   { score+=10; breakdown.push({ factor:'Missing CSP', delta:10 }); }
  if (!h['strict-transport-security']) { score+=15; breakdown.push({ factor:'Missing HSTS', delta:15 }); }
  if (!h['x-frame-options'])           { score+=8;  breakdown.push({ factor:'Missing X-Frame-Options', delta:8 }); }
  if (!h['referrer-policy'])           { score+=5;  breakdown.push({ factor:'Missing Referrer-Policy', delta:5 }); }
  if (!h['permissions-policy'])        { score+=5;  breakdown.push({ factor:'Missing Permissions-Policy', delta:5 }); }
  if (!h['x-content-type-options'] || h['x-content-type-options'].toLowerCase()!=='nosniff')
                                       { score+=5;  breakdown.push({ factor:'Missing X-Content-Type-Options', delta:5 }); }
  if (!isHTTPS)                        { score+=30; breakdown.push({ factor:'Unencrypted HTTP', delta:30 }); }

  // Mixed HTTP content on HTTPS
  if (isHTTPS) {
    const csp = (h['content-security-policy']||'').toLowerCase();
    if (!csp.includes('upgrade-insecure-requests') && !csp.includes('block-all-mixed-content')) {
      score+=8; breakdown.push({ factor:'Mixed content risk (no CSP upgrade directive)', delta:8 });
    }
  }

  // Long redirect chains
  if (redirectCount >= 3) { const d=Math.min(15,redirectCount*3); score+=d; breakdown.push({ factor:`Long redirect chain (${redirectCount} hops)`, delta:d }); }

  // Excessive third-party domains
  if (thirdPartyDomains.length > 6) { const d=Math.min(15,Math.floor(thirdPartyDomains.length/2)); score+=d; breakdown.push({ factor:`Excessive 3rd-party domains (${thirdPartyDomains.length})`, delta:d }); }

  if (Array.isArray(cookies)) {
    let ins=0, ssn=0;
    for (const c of cookies) {
      if (!c.secure && isHTTPS) ins++;
      const ss=(c.sameSite||'').toLowerCase();
      if ((ss==='no_restriction'||ss==='none') && !c.secure) ssn++;
    }
    if (ins>0) { const d=Math.min(20,ins*5); score+=d; breakdown.push({ factor:`${ins} cookie(s) missing Secure flag`, delta:d }); }
    if (ssn>0) { const d=Math.min(16,ssn*8); score+=d; breakdown.push({ factor:`${ssn} SameSite=None without Secure`, delta:d }); }
  }
  const tld = (domain.split('.').pop()||'').toLowerCase();
  if (SUSPICIOUS_TLDS.has(tld)) { score+=20; breakdown.push({ factor:`Suspicious TLD (.${tld})`, delta:20 }); }
  const root = domain.split('.').slice(-2).join('.').toLowerCase();
  if (KNOWN_TRACKER_ROOTS.has(root)||KNOWN_TRACKER_ROOTS.has(domain)) { score+=10; breakdown.push({ factor:'Known tracker domain', delta:10 }); }
  return { staticScore: Math.min(100, Math.max(0, Math.round(score))), breakdown };
}

// ── Behavioral DNA ────────────────────────────────────────────────────────────
const DNA_CLUSTERS = [
  { name:'heavy_fingerprinter', centroid:{canvas:0.9,webgl:0.8,audio:0.7,fonts:0.8,webrtc:0.6,battery:0.5,localStorage:0.3,clipboard:0.1}, riskBoost:25 },
  { name:'tracker_analytics',   centroid:{canvas:0.3,webgl:0.1,audio:0.0,fonts:0.2,webrtc:0.0,battery:0.0,localStorage:0.7,clipboard:0.0}, riskBoost:15 },
  { name:'data_exfiltrator',    centroid:{canvas:0.4,webgl:0.2,audio:0.1,fonts:0.3,webrtc:0.3,battery:0.2,localStorage:0.8,clipboard:0.7}, riskBoost:30 },
  { name:'clean_site',          centroid:{canvas:0.05,webgl:0,audio:0,fonts:0.05,webrtc:0,battery:0,localStorage:0.1,clipboard:0}, riskBoost:0 }
];
const DNA_KEYS = ['canvas','webgl','audio','fonts','webrtc','battery','localStorage','clipboard'];
const DNA_MAX  = {canvas:20,webgl:10,audio:10,fonts:50,webrtc:5,battery:3,localStorage:30,clipboard:5};

function dnaCluster(api={}) {
  const norm={};
  for (const k of DNA_KEYS) norm[k]=Math.min(1,(api[k]||0)/(DNA_MAX[k]||1));
  let best=null, bestSim=-1;
  for (const cl of DNA_CLUSTERS) {
    let dot=0,mA=0,mB=0;
    for (const k of DNA_KEYS) { dot+=(norm[k]||0)*(cl.centroid[k]||0); mA+=(norm[k]||0)**2; mB+=(cl.centroid[k]||0)**2; }
    const sim=(mA&&mB)?dot/(Math.sqrt(mA)*Math.sqrt(mB)):0;
    if (sim>bestSim) { bestSim=sim; best=cl; }
  }
  return { name:best?.name||'unknown', similarity:parseFloat(bestSim.toFixed(3)), riskBoost:bestSim>0.75&&best?best.riskBoost:0 };
}

function dnaHash(api, domains=[]) {
  const str=JSON.stringify({ api, cluster:dnaCluster(api), domains:[...domains].sort() });
  let h=0x811c9dc5;
  for (let i=0;i<str.length;i++) { h^=str.charCodeAt(i); h=(h*0x01000193)>>>0; }
  return h.toString(16).padStart(8,'0');
}

function projectRisk(history=[], clusterBoost=0, current=0) {
  const scores=history.map(h=>h.score||0);
  let proj=scores.length>=2?scores.reduce((e,s,i)=>i===0?s:0.3*s+0.7*e,0):current;
  const mid=Math.floor(scores.length/2);
  if (scores.length>=4) {
    const a1=scores.slice(0,mid).reduce((a,b)=>a+b,0)/mid;
    const a2=scores.slice(mid).reduce((a,b)=>a+b,0)/(scores.length-mid);
    const delta=a2-a1; if (delta>5) proj+=delta*0.7; else if (delta<-5) proj*=0.9;
  }
  proj+=clusterBoost*0.5;
  return Math.round(Math.min(100,Math.max(0,proj)));
}

// ── Security Layer Score ───────────────────────────────────────────────────────
function computeSecurityLayerScore(certWarning) {
  if (!certWarning) return 50; // unknown = neutral
  return certWarning.securityHeadersScore || 0;
}

// ── WebAdvisor Status ─────────────────────────────────────────────────────────
function getWebAdvisorStatus(score) {
  if (score <= 25) return 'SAFE';
  if (score <= 60) return 'CAUTION';
  return 'DANGEROUS';
}

// ── Multi-Layer Risk Calculation (v4.0: 35/30/20/15 weights) ──────────────────
async function calcRisk(tabId, domain) {
  const s  = getTabStats(tabId);
  const bh = getTabBehavior(tabId);

  // Behavioral score — always computed
  let behavioral = 0;
  if ((s.trackerCount||0)>0) behavioral+=Math.min(40,Math.log2(s.trackerCount+1)*13);
  behavioral+=Math.min(30,(s.fingerprintCount||0)*10);
  behavioral+=Math.min(20,((s.cookieCount||0)>5?((s.cookieCount||0)-5)*2:0));
  behavioral=Math.min(100,Math.round(behavioral));

  const cluster    = dnaCluster(bh.apiCounts);
  const reputBoost = cluster.riskBoost;

  // Static score — always computed (use cached or 0 if not yet received)
  const staticScore = tabStaticCache[tabId]?.staticScore ?? 0;

  // Security layer score (from cert/header analysis — 0–100, inverted to risk)
  const certWarning = tabStaticCache[tabId]?.certWarning || null;
  const secHeaderScore = computeSecurityLayerScore(certWarning); // 0–100 (higher = safer)
  // Invert: lower headers score = higher security layer risk
  const securityLayerRisk = Math.round(100 - secHeaderScore);

  const reputation = Math.min(100,Math.round(
    ((s.trackerCount||0)>0?Math.min(50,(s.trackerCount||0)*5):0)+reputBoost
  ));

  // Historical risk for this domain
  let userHistory=0;
  try {
    const hist=await storageManager.getRiskHistorySince(Date.now()-30*86400000);
    const dh=(hist||[]).filter(h=>h.domain===domain).slice(-10);
    if (dh.length) userHistory=Math.round(dh.reduce((a,h)=>a+h.score,0)/dh.length);
  } catch {}

  // v4.0 weights: 0.35 Behavioral + 0.30 Static + 0.20 Reputation + 0.15 SecurityLayer
  let final=Math.round(Math.min(100,Math.max(0,
    0.35*behavioral+0.30*staticScore+0.20*reputation+0.15*securityLayerRisk
  )));

  // Certificate invalid → force minimum risk 70
  if (certWarning?.isInvalid && final < 70) final = 70;

  const level=final>=75?'CRITICAL':final>=50?'HIGH':final>=20?'MODERATE':'LOW';
  const webAdvisorStatus = getWebAdvisorStatus(final);

  // Store scores (always — trust only affects display)
  s.behavioralScore    = behavioral;
  s.staticScore        = staticScore;
  s.reputationScore    = reputation;
  s.securityLayerScore = secHeaderScore;
  s.certWarning        = certWarning;
  s.currentSessionRisk = final;
  s.historicalRisk     = userHistory;
  s.riskScore          = final;
  s.riskLevel          = level;
  s.webAdvisorStatus   = webAdvisorStatus;

  return { score:final, level, behavioral, staticScore, reputation, userHistory, securityLayerRisk, secHeaderScore, webAdvisorStatus };
}

// ── Debounced Risk Update ─────────────────────────────────────────────────────
async function updateRisk(tabId) {
  const now=Date.now();
  if (now-(riskDebounce[tabId]||0)<800) return;
  riskDebounce[tabId]=now;

  const s=getTabStats(tabId);
  if (!s.domain) return;

  const r=await calcRisk(tabId,s.domain);
  try {
    await updateSiteStats(s.domain,{ riskScore:r.score, riskLevel:r.level });
    await storageManager.addRiskHistory({
      domain:s.domain, score:r.score, level:r.level,
      staticScore:r.staticScore, behavioralScore:r.behavioral,
      trackers:s.trackerCount, cookies:s.cookieCount,
      timestamp:Date.now()
    });
  } catch {}

  // ── Persist domain history timeline ─────────────────────────────────────────
  try {
    const histKey = `history::${s.domain}`;
    const existing = await chrome.storage.local.get(histKey);
    const hist = existing[histKey] || { riskTimeline:[], trackerCountTimeline:[], securityTimeline:[] };
    const ts = Date.now();
    hist.riskTimeline.push({ score:r.score, ts });
    hist.trackerCountTimeline.push({ count:s.trackerCount, ts });
    hist.securityTimeline.push({ score:r.secHeaderScore||0, ts });
    // Keep last 100 entries per timeline
    if (hist.riskTimeline.length > 100) hist.riskTimeline = hist.riskTimeline.slice(-100);
    if (hist.trackerCountTimeline.length > 100) hist.trackerCountTimeline = hist.trackerCountTimeline.slice(-100);
    if (hist.securityTimeline.length > 100) hist.securityTimeline = hist.securityTimeline.slice(-100);
    await chrome.storage.local.set({ [histKey]: hist });
  } catch {}

  // ── Trigger overlay/cert warning if needed ───────────────────────────────────
  try {
    const s2 = getTabStats(tabId);
    const cert = tabStaticCache[tabId]?.certWarning;

    // Cert warning popup (inject into page)
    if (cert?.hasWarning && !certWarningDismissed[tabId]) {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_CERT_WARNING',
        certWarning: cert,
        domain: s2.domain
      }).catch(()=>{});
    }

    // Full-page overlay if risk > 70 or cert invalid
    if ((s2.riskScore > 70 || cert?.isInvalid) && !overlayDismissed[tabId]) {
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_OVERLAY_WARNING',
        riskScore: s2.riskScore,
        riskLevel: s2.riskLevel,
        certWarning: cert,
        domain: s2.domain
      }).catch(()=>{});
    }
  } catch {}
}

// ── Site Stats Persistence ────────────────────────────────────────────────────
async function updateSiteStats(domain, delta) {
  if (!domain||domain.startsWith('chrome')||domain==='__whitelist__') return;
  try {
    const curr=await storageManager.get('sites',domain)||{
      domain, trackerCount:0, adCount:0, blockedAds:0, cookieCount:0,
      fingerprintCount:0, riskScore:0, riskLevel:'LOW',
      firstSeen:Date.now(), lastVisit:0
    };
    if (delta.trackerCount!=null)     curr.trackerCount    =(curr.trackerCount||0)+delta.trackerCount;
    if (delta.adCount!=null)          curr.adCount         =(curr.adCount||0)+delta.adCount;
    if (delta.blockedAds!=null)       curr.blockedAds      =(curr.blockedAds||0)+delta.blockedAds;
    if (delta.cookieCount!=null)      curr.cookieCount     =(curr.cookieCount||0)+delta.cookieCount;
    if (delta.fingerprintCount!=null) curr.fingerprintCount=(curr.fingerprintCount||0)+delta.fingerprintCount;
    if (delta.riskScore!==undefined)  curr.riskScore       =delta.riskScore;
    if (delta.riskLevel!==undefined)  curr.riskLevel       =delta.riskLevel;
    curr.lastVisit=Date.now();
    await storageManager.put('sites',curr);
  } catch(e) { warn('updateSiteStats:',e.message); }
}

async function addTrackerEntry(siteDomain, trackerDomain) {
  if (!siteDomain||!trackerDomain) return;
  try {
    const key=`${siteDomain}::${trackerDomain}`;
    const curr=await storageManager.get('trackers',key)||{ id:key, siteDomain, trackerDomain, count:0, firstSeen:Date.now() };
    curr.count++;
    curr.lastSeen=Date.now();
    await storageManager.put('trackers',curr);
  } catch {}
}

// ── Blocked Request Logging ───────────────────────────────────────────────────
async function logBlockedRequest(domain, fullURL, type) {
  const entry={ domain, fullURL, type, timestamp:Date.now() };
  blockedLog.unshift(entry);
  if (blockedLog.length>500) blockedLog.length=500;
  // Persist async
  try { await storageManager.addBlockedRequest(entry); } catch {}

  // Update counters
  if (type==='ad')      { adsBlockedCount++;      await persistCounters(); }
  if (type==='tracker') { trackersBlockedCount++;  await persistCounters(); }
}

async function persistCounters() {
  try { await chrome.storage.local.set({ adsBlockedCount, trackersBlockedCount }); } catch {}
}

// ── declarativeNetRequest Ad Blocking Setup ───────────────────────────────────
async function setupAdBlocking() {
  try {
    const existing=await chrome.declarativeNetRequest.getDynamicRules();
    if (existing.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds:existing.map(r=>r.id) });
    }
    const allTypes=['script','xmlhttprequest','image','media','sub_frame',
                    'stylesheet','font','ping','websocket','other','main_frame'];
    const rules=[];
    let id=1;
    for (const d of AD_DOMAINS) {
      rules.push({ id:id++, priority:2, action:{type:'block'},
        condition:{ urlFilter:`||${d}^`, resourceTypes:allTypes } });
    }
    for (const d of NAVIGATION_AD_DOMAINS) {
      if (!AD_DOMAIN_SET.has(d)) {
        rules.push({ id:id++, priority:1, action:{type:'block'},
          condition:{ urlFilter:`||${d}^`, resourceTypes:['main_frame','sub_frame','ping','xmlhttprequest'] } });
      }
    }
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules:rules.slice(0,5000) });
    log(`Ad blocking active: ${rules.length} rules`);
  } catch(e) { warn('Ad blocking setup failed:',e.message); }
}

// ── Cookie + LocalStorage Deletion ───────────────────────────────────────────
async function deleteCookieAndStorage(name, url, domain) {
  try { await chrome.cookies.remove({ name, url }); } catch {}
  try {
    const tabs=await chrome.tabs.query({});
    for (const tab of tabs.filter(t=>{ try{return clean(new URL(t.url).hostname).includes(clean(domain));}catch{return false;} })) {
      try {
        await chrome.scripting.executeScript({ target:{tabId:tab.id},
          func:(n)=>{ try{ Object.keys(localStorage).filter(k=>k===n||k.toLowerCase().includes(n.toLowerCase())).forEach(k=>localStorage.removeItem(k));}catch{} },
          args:[name] });
      } catch {}
    }
  } catch {}
}

// ── Listeners ─────────────────────────────────────────────────────────────────
function setupListeners() {
  if (listenersReady) return;
  listenersReady=true;

  // Count/log tracker & ad hits (DNR handles actual blocking)
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      if (!details.url?.startsWith('http')) return;
      if (details.type==='main_frame') return;
      let reqDomain, srcDomain;
      try {
        reqDomain=clean(new URL(details.url).hostname);
        srcDomain=details.initiator?clean(new URL(details.initiator).hostname):'';
      } catch { return; }
      if (!reqDomain||reqDomain===srcDomain) return;
      if (CDN_WHITELIST.has(reqDomain)||userWhitelist.has(reqDomain)) return;

      const tab=getTabStats(details.tabId);
      const bh=getTabBehavior(details.tabId);
      const site=srcDomain||reqDomain;
      if (site) tab.domain=site;

      if (!bh.networkInfo.thirdPartyDomains.includes(reqDomain))
        bh.networkInfo.thirdPartyDomains.push(reqDomain);
      if (details.type==='xmlhttprequest') bh.networkInfo.xhrCount++;

      if (isAd(reqDomain)||isStrictBlocked(reqDomain)) {
        tab.adCount++; tab.blockedAds++;
        await updateSiteStats(site,{trackerCount:1,adCount:1,blockedAds:1});
        await addTrackerEntry(site,reqDomain);
        await logBlockedRequest(reqDomain,details.url,'ad');
        tab.trackerCount++;
      } else if (isTracker(reqDomain)) {
        tab.trackerCount++;
        await updateSiteStats(site,{trackerCount:1});
        await addTrackerEntry(site,reqDomain);
        await logBlockedRequest(reqDomain,details.url,'tracker');
      } else { return; }
      await updateRisk(details.tabId);
    },
    { urls:['<all_urls>'] }
  );

  // Static score via response headers (always run)
  chrome.webRequest.onHeadersReceived.addListener(
    async (details) => {
      if (details.type!=='main_frame') return;
      let domain;
      try { domain=clean(new URL(details.url).hostname); } catch { return; }
      if (!domain||CDN_WHITELIST.has(domain)) return;
      const headers={};
      for (const h of (details.responseHeaders||[])) headers[h.name.toLowerCase()]=h.value;
      let cookies=[];
      try { cookies=await chrome.cookies.getAll({domain}); } catch {}
      const bh=getTabBehavior(details.tabId);
      const result=computeStaticScore({
        url:details.url, domain, headers, cookies,
        thirdPartyDomains: bh.networkInfo.thirdPartyDomains
      });
      // Cert warning evaluation
      const certWarning=CertWarningEngine.evaluate({
        url:details.url, headers,
        statusCode:details.statusCode||200
      });
      tabStaticCache[details.tabId]={
        ...result, url:details.url, domain,
        rawHeaders:headers, certWarning
      };
      log(`Static score for ${domain}: ${result.staticScore} | Cert: ${certWarning.severity}`);
      // Trigger risk update after static analysis
      const s=getTabStats(details.tabId);
      if (!s.domain) s.domain=domain;
      s.certWarning=certWarning;
      await updateRisk(details.tabId);
    },
    { urls:['<all_urls>'] },
    ['responseHeaders']
  );

  // Navigation redirect detection
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId!==0) return;
    let domain;
    try { domain=clean(new URL(details.url).hostname); } catch { return; }
    if (!domain||CDN_WHITELIST.has(domain)||userWhitelist.has(domain)) return;
    if (isAd(domain)||isStrictBlocked(domain)||
        NAVIGATION_AD_DOMAINS.some(d=>domain===d||domain.endsWith('.'+d))) {
      const tab=getTabStats(details.tabId);
      tab.adCount++; tab.blockedAds++;
      const src=tab.domain||domain;
      await updateSiteStats(src,{adCount:1,blockedAds:1,trackerCount:1});
      await logBlockedRequest(domain,details.url,'redirect');
    }
  });

  // Tab loading — reset per-tab state
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status==='loading'&&tab.url&&!tab.url.startsWith('chrome://')) {
      resetTab(tabId,tab.url);
    }
  });

  // Tab complete — compute DNA, projection, and force static+risk update
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status!=='complete') return;
    if (!tab.url||tab.url.startsWith('chrome://')) return;
    let domain;
    try { domain=clean(new URL(tab.url).hostname); } catch { return; }
    if (!domain) return;

    const s=getTabStats(tabId);
    const bh=getTabBehavior(tabId);
    s.domain=domain;

    // If static cache is still null (no headers received), compute minimum static score
    if (!tabStaticCache[tabId]) {
      const minScore=computeStaticScore({ url:tab.url, domain, headers:{}, cookies:[] });
      const minCertWarning=CertWarningEngine.evaluate({ url:tab.url, headers:{} });
      tabStaticCache[tabId]={ ...minScore, url:tab.url, domain, rawHeaders:{}, certWarning:minCertWarning };
    }

    // Always update risk on page complete
    await updateRisk(tabId);

    // DNA fingerprint
    const cluster=dnaCluster(bh.apiCounts);
    const hash=dnaHash(bh.apiCounts,bh.networkInfo.thirdPartyDomains);
    s.dnaHash=hash;
    try {
      await storageManager.put('models',{
        key:`dna::${domain}`, domain, hash,
        signature:{ apiUsage:bh.apiCounts, network:bh.networkInfo, cluster }, ts:Date.now()
      });
    } catch {}

    // Threat projection
    try {
      const hist=await storageManager.getRiskHistorySince(Date.now()-30*86400000);
      const domHist=(hist||[]).filter(h=>h.domain===domain);
      const projected=projectRisk(domHist,cluster.riskBoost,s.riskScore);
      const mid=Math.floor(domHist.length/2);
      const trend=domHist.length>=4?(()=>{
        const a1=domHist.slice(0,mid).reduce((a,h)=>a+h.score,0)/mid;
        const a2=domHist.slice(mid).reduce((a,h)=>a+h.score,0)/(domHist.length-mid);
        return a2-a1>5?'INCREASING':a2-a1<-5?'DECREASING':'STABLE';
      })():'STABLE';
      s.projection={
        projectedRiskIn30Days:projected,
        confidence:domHist.length>=5?'HIGH':domHist.length>=2?'MEDIUM':'LOW',
        trend, clusterName:cluster.name, clusterSimilarity:cluster.similarity,
        message:`Risk projected to ~${projected}/100 in 30 days`
      };
      await storageManager.put('models',{ key:`proj::${domain}`, domain, ...s.projection, ts:Date.now() });
    } catch {}
  });

  chrome.tabs.onRemoved.addListener(tabId => {
    delete tabStats[tabId];
    delete tabBehavior[tabId];
    delete tabStaticCache[tabId];
    delete riskDebounce[tabId];
    delete overlayDismissed[tabId];
    delete certWarningDismissed[tabId];
  });
}

// ── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const action=message.action||message.type||'';
      log('←',action);

      if (action==='GET_TAB_STATS'||action==='GET_STATS') {
        const [tab]=await chrome.tabs.query({ active:true, currentWindow:true });
        if (!tab||tab.url?.startsWith('chrome://')) {
          sendResponse({ riskScore:0, riskLevel:'N/A', trackerCount:0, cookieCount:0, adCount:0, blockedAds:0,
            adsBlockedCount, trackersBlockedCount }); return;
        }
        const stats=getTabStats(tab.id);
        let domain=stats.domain;
        if (!domain&&tab.url) { try{ domain=clean(new URL(tab.url).hostname); }catch{} }
        let cookieCount=stats.cookieCount;
        if (domain) { try{ cookieCount=(await chrome.cookies.getAll({domain}))?.length||0; }catch{} stats.cookieCount=cookieCount; }
        const trusted=!!(domain&&trustedDomains[domain]);
        stats.trustOverride=trusted;
        const sc=tabStaticCache[tab.id]||{};
        const effectiveScore = trusted ? 0 : stats.riskScore;
        sendResponse({
          domain,
          riskScore:         effectiveScore,
          riskLevel:         trusted?'LOW':stats.riskLevel,
          webAdvisorStatus:  trusted?'SAFE': getWebAdvisorStatus(effectiveScore),
          currentSessionRisk:stats.currentSessionRisk,
          historicalRisk:    stats.historicalRisk,
          trusted, trustOverride:trusted,
          trackerCount:    stats.trackerCount,
          cookieCount,
          adCount:         stats.adCount,
          blockedAds:      stats.blockedAds,
          fingerprintCount:stats.fingerprintCount,
          staticScore:     stats.staticScore,
          behavioralScore: stats.behavioralScore,
          reputationScore: stats.reputationScore,
          securityLayerScore: stats.securityLayerScore||0,
          certWarning:     trusted?null:(sc.certWarning||null),
          staticBreakdown: sc.breakdown||[],
          rawHeaders:      sc.rawHeaders||{},
          dnaHash:         stats.dnaHash,
          projection:      stats.projection,
          adsBlockedCount, trackersBlockedCount,
          strictMode
        });
      }

      else if (action==='GET_DASHBOARD_DATA') {
        let sites=[];
        try { sites=await storageManager.getAll('sites',500); } catch {}
        sites=(sites||[]).filter(s=>s.domain&&s.domain!=='__whitelist__');
        sendResponse({ sites, success:true, adsBlockedCount, trackersBlockedCount });
      }

      else if (action==='GET_TRACKERS_FOR_SITE') {
        let entries=[];
        try {
          entries=await storageManager.getAll('trackers',2000);
          if (message.siteDomain) entries=entries.filter(e=>e.siteDomain===message.siteDomain);
        } catch {}
        sendResponse({ trackers:entries||[], success:true });
      }

      else if (action==='DELETE_TRACKER') {
        try { await storageManager.delete('trackers',message.id); sendResponse({success:true}); }
        catch(e) { sendResponse({success:false,error:e.message}); }
      }

      else if (action==='GET_ALL_COOKIES') {
        let raw=[];
        try { raw=message.domain?await chrome.cookies.getAll({domain:message.domain}):await chrome.cookies.getAll({}); } catch {}
        const now=Date.now()/1000;
        const cookies=(raw||[]).map(c=>({
          ...c,
          daysRemaining:c.expirationDate?Math.max(0,Math.round((c.expirationDate-now)/86400)):null,
          isSession:!c.expirationDate,
          expiryFormatted:c.expirationDate?new Date(c.expirationDate*1000).toLocaleDateString():'Session'
        }));
        sendResponse({cookies,success:true});
      }

      else if (action==='DELETE_COOKIE') {
        const domain=(message.domain||'').replace(/^\./,'')||
          (()=>{ try{return clean(new URL(message.url).hostname);}catch{return '';} })();
        await deleteCookieAndStorage(message.name,message.url,domain);
        // Refresh risk after cookie deletion
        try {
          const tabs=await chrome.tabs.query({ active:true, currentWindow:true });
          if (tabs[0]) { riskDebounce[tabs[0].id]=0; await updateRisk(tabs[0].id); }
        } catch {}
        sendResponse({success:true});
      }

      else if (action==='DELETE_ALL_COOKIES_FOR_SITE') {
        let removed=0;
        try {
          const all=await chrome.cookies.getAll({domain:message.domain});
          for (const c of all) {
            const url=`${c.secure?'https':'http'}://${(c.domain||'').replace(/^\./,'')}${c.path||'/'}`;
            await deleteCookieAndStorage(c.name,url,message.domain);
            removed++;
          }
          const tabs=await chrome.tabs.query({});
          for (const tab of tabs) {
            try {
              if (!clean(new URL(tab.url).hostname).includes(clean(message.domain))) continue;
              await chrome.scripting.executeScript({ target:{tabId:tab.id},
                func:()=>{ try{localStorage.clear();sessionStorage.clear();}catch{} } });
              riskDebounce[tab.id]=0; await updateRisk(tab.id);
            } catch {}
          }
        } catch {}
        sendResponse({success:true,removed});
      }

      else if (action==='GET_RISK_HISTORY') {
        let history=[];
        try {
          if (message.domain) {
            history=await storageManager.getRiskHistoryForDomain(message.domain,100);
          } else {
            history=await storageManager.getRiskHistorySince(Date.now()-(message.hours||24)*3600000);
          }
        } catch {}
        sendResponse({history:history||[],success:true});
      }

      else if (action==='GET_BLOCKED_REQUESTS') {
        let blocked=[];
        try { blocked=await storageManager.getBlockedRequests(message.limit||200); } catch {}
        sendResponse({blocked:blocked||[],success:true,adsBlockedCount,trackersBlockedCount});
      }

      else if (action==='CLEAR_BLOCKED_REQUESTS') {
        try { await storageManager.clearBlockedRequests(); blockedLog.length=0; sendResponse({success:true}); }
        catch(e) { sendResponse({success:false,error:e.message}); }
      }

      else if (action==='WHITELIST_DOMAIN') {
        userWhitelist.add(message.domain);
        try { await storageManager.put('sites',{domain:'__whitelist__',domains:[...userWhitelist]}); } catch {}
        sendResponse({success:true});
      }

      else if (action==='TRUST_DOMAIN') {
        const d=message.domain;
        if (!d) { sendResponse({success:false,error:'No domain'}); return; }
        trustedDomains[d]={ts:Date.now(),reason:message.reason||'user'};
        try { await chrome.storage.local.set({trustedDomains}); } catch {}
        for (const [tid,s] of Object.entries(tabStats)) {
          if (clean(s.domain)===clean(d)) s.trustOverride=true;
        }
        log('Trusted:',d);
        sendResponse({success:true});
      }

      else if (action==='UNTRUST_DOMAIN') {
        const d=message.domain;
        delete trustedDomains[d];
        try { await chrome.storage.local.set({trustedDomains}); } catch {}
        for (const [tid,s] of Object.entries(tabStats)) {
          if (clean(s.domain)===clean(d)) { s.trustOverride=false; riskDebounce[tid]=0; await updateRisk(parseInt(tid)); }
        }
        sendResponse({success:true});
      }

      else if (action==='GET_TRUST_STATUS') {
        sendResponse({trusted:!!trustedDomains[message.domain],trustedAt:trustedDomains[message.domain]?.ts||null});
      }

      else if (action==='SET_STRICT_MODE') {
        strictMode=!!message.enabled;
        try { await chrome.storage.local.set({strictMode}); } catch {}
        if (strictMode) await setupAdBlocking();
        sendResponse({success:true,strictMode});
      }

      else if (action==='GET_PROJECTION') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const s=tab?getTabStats(tab.id):null;
        sendResponse({projection:s?.projection||null,success:true});
      }

      else if (action==='GET_DNA_HASH') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const s=tab?getTabStats(tab.id):null;
        const bh=tab?getTabBehavior(tab.id):null;
        sendResponse({hash:s?.dnaHash||null,signature:bh||null,success:true});
      }

      else if (action==='GET_RESEARCH_DATA') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const s=tab?getTabStats(tab.id):{};
        const bh=tab?getTabBehavior(tab.id):{};
        const sc=tab?tabStaticCache[tab.id]:null;
        let blockedRecent=[];
        try { blockedRecent=await storageManager.getBlockedRequests(50); } catch {}
        sendResponse({
          success:true,
          domain:s.domain||'',
          riskScore:s.riskScore, staticScore:s.staticScore,
          behavioralScore:s.behavioralScore, reputationScore:s.reputationScore,
          currentSessionRisk:s.currentSessionRisk, historicalRisk:s.historicalRisk,
          staticBreakdown:sc?.breakdown||[], rawHeaders:sc?.rawHeaders||{},
          dnaHash:s.dnaHash, behavioralSignature:bh,
          clusterMatch:bh?dnaCluster(bh.apiCounts||{}):null,
          projection:s.projection, blockedRecent,
          adsBlockedCount, trackersBlockedCount, strictMode,
          ts:Date.now()
        });
      }

      else if (action==='RELOAD_TRUSTED_DOMAINS') {
        try {
          const stored=await chrome.storage.local.get('trustedDomains');
          trustedDomains=stored.trustedDomains||{};
          sendResponse({success:true,count:Object.keys(trustedDomains).length});
        } catch(e) { sendResponse({success:false,error:e.message}); }
      }

      else if (action==='DELETE_SITE') {
        try {
          await storageManager.delete('sites',message.domain);
          const all=await storageManager.getAll('trackers',5000);
          await Promise.all((all||[]).filter(t=>t.siteDomain===message.domain).map(t=>storageManager.delete('trackers',t.id)));
          for (const [tid,stats] of Object.entries(tabStats)) {
            if (stats.domain===message.domain) delete tabStats[tid];
          }
          sendResponse({success:true});
        } catch(e) { sendResponse({success:false,error:e.message}); }
      }

      else if (action==='FINGERPRINT_DETECTED') {
        const data=message.data;
        if (!data) { sendResponse({received:true}); return; }
        let domain;
        try { domain=clean(new URL(data.url).hostname); } catch { sendResponse({received:true}); return; }
        const total=(data.canvas||0)+(data.webgl||0)+(data.audio||0);
        if (total>0) {
          await updateSiteStats(domain,{fingerprintCount:total});
          try {
            const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
            if (tab) {
              const s=getTabStats(tab.id);
              s.fingerprintCount+=(total);
              if (!s.domain) s.domain=domain;
              // Merge behavioral API data from content script report
              const bh=getTabBehavior(tab.id);
              for (const k of DNA_KEYS) { if (data[k]) bh.apiCounts[k]=(bh.apiCounts[k]||0)+data[k]; }
              await updateRisk(tab.id);
            }
          } catch {}
        }
        sendResponse({received:true});
      }

      else if (action==='GET_GRAPH_DATA') {
        try {
          const trackerEntries=await storageManager.getAll('trackers',5000);
          const nodeMap=new Map(); const linkSet=new Set(); const links=[];
          for (const {siteDomain,trackerDomain,count} of (trackerEntries||[])) {
            if (!siteDomain||!trackerDomain) continue;
            if (!nodeMap.has(siteDomain)) nodeMap.set(siteDomain,{id:siteDomain,type:'site',weight:1});
            if (!nodeMap.has(trackerDomain)) nodeMap.set(trackerDomain,{id:trackerDomain,type:'tracker',weight:0});
            nodeMap.get(trackerDomain).weight+=(count||1);
            const key=`${siteDomain}::${trackerDomain}`;
            if (!linkSet.has(key)) { linkSet.add(key); links.push({source:siteDomain,target:trackerDomain,value:count||1}); }
          }
          sendResponse({success:true,nodes:Array.from(nodeMap.values()),links});
        } catch(e) { sendResponse({success:false,nodes:[],links:[],error:e.message}); }
      }

      else if (action==='GET_SECURITY_LAYER') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const sc=tab?tabStaticCache[tab.id]:null;
        const s=tab?getTabStats(tab.id):null;
        const cw=sc?.certWarning||null;
        sendResponse({
          success:true,
          certStatus:      cw?.certStatusLabel||'Unknown',
          certSeverity:    cw?.severity||'NONE',
          isInvalid:       cw?.isInvalid||false,
          hasWarning:      cw?.hasWarning||false,
          encryption:      cw?.encryptionLabel||'Unknown',
          encryptionRaw:   cw?.encryption||'UNKNOWN',
          hsts:            cw?.hsts||false,
          mixedContent:    cw?.mixedContent||false,
          securityHeadersScore: cw?.securityHeadersScore||0,
          securityLayerScore:   s?.securityLayerScore||0,
          certIssues:      cw?.issues||[],
          certReasons:     cw?.reasons||[],
          isHTTPS:         cw?.isHTTPS||false,
        });
      }

      else if (action==='GET_ADVISORY') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const s=tab?getTabStats(tab.id):null;
        const bh=tab?getTabBehavior(tab.id):null;
        const sc=tab?tabStaticCache[tab.id]:null;
        const trusted=!!(s?.domain&&trustedDomains[s.domain]);
        const advice=AdvisoryEngine.generateAdvice({
          trackerCount:     s?.trackerCount||0,
          adCount:          s?.adCount||0,
          fingerprintCount: s?.fingerprintCount||0,
          cookieCount:      s?.cookieCount||0,
          riskScore:        s?.riskScore||0,
          staticBreakdown:  sc?.breakdown||[],
          certWarning:      sc?.certWarning||null,
          thirdPartyDomains:bh?.networkInfo?.thirdPartyDomains||[],
          strictMode,
          trusted,
          clusterName:      s?dnaCluster(bh?.apiCounts||{}).name:'',
          blockedCount:     adsBlockedCount+trackersBlockedCount,
        });
        sendResponse({success:true,...advice});
      }

      else if (action==='GET_DOMAIN_HISTORY') {
        const domain=message.domain;
        if (!domain) { sendResponse({success:false,error:'No domain'}); return; }
        try {
          const histKey=`history::${domain}`;
          const stored=await chrome.storage.local.get(histKey);
          const hist=stored[histKey]||{riskTimeline:[],trackerCountTimeline:[],securityTimeline:[]};
          sendResponse({success:true,...hist});
        } catch(e) { sendResponse({success:false,error:e.message}); }
      }

      else if (action==='DISMISS_OVERLAY') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        if (tab) {
          overlayDismissed[tab.id]=true;
          // Trust if requested
          if (message.trust && tab) {
            const s=getTabStats(tab.id);
            if (s.domain) {
              trustedDomains[s.domain]={ts:Date.now(),reason:'overlay_trust'};
              try { await chrome.storage.local.set({trustedDomains}); } catch {}
            }
          }
        }
        sendResponse({success:true});
      }

      else if (action==='DISMISS_CERT_WARNING') {
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        if (tab) {
          certWarningDismissed[tab.id]=true;
          if (message.trust) {
            const s=getTabStats(tab.id);
            if (s.domain) {
              trustedDomains[s.domain]={ts:Date.now(),reason:'cert_trust'};
              try { await chrome.storage.local.set({trustedDomains}); } catch {}
            }
          }
        }
        sendResponse({success:true});
      }

      else if (action==='GET_BLOCKED_LOG') {
        // Serve in-memory blocked log (latest 100 entries)
        const items = blockedLog.slice(0, 100).map(e => ({
          domain: e.domain, type: e.type, ts: e.timestamp,
          url: e.fullURL || e.domain
        }));
        sendResponse({ success: true, items });
      }

      else if (action==='CLEAR_BLOCKED_LOG') {
        blockedLog.length = 0;
        try { await storageManager.clearBlockedRequests?.(); } catch {}
        sendResponse({ success: true });
      }

      else if (action==='CLEAR_ALL') {
        try { await storageManager.clearAll(); } catch {}
        Object.keys(tabStats).forEach(k=>delete tabStats[k]);
        adsBlockedCount=0; trackersBlockedCount=0;
        try { await chrome.storage.local.set({adsBlockedCount:0,trackersBlockedCount:0}); } catch {}
        sendResponse({success:true});
      }

      else {
        warn('Unknown action:',action);
        sendResponse({ok:false,action});
      }

    } catch(e) {
      console.error('[PRIVISEE-X BG] Handler error:',e);
      try { sendResponse({error:e.message}); } catch {}
    }
  })();
  return true;
});

// ── Daily Cleanup ─────────────────────────────────────────────────────────────
if (chrome.alarms) {
  chrome.alarms.create('daily_cleanup',{ periodInMinutes:1440 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name==='daily_cleanup') {
      try { const r=await storageManager.cleanupOldData(); log(`Cleanup: ${r} records removed`); }
      catch(e) { warn('Cleanup failed:',e.message); }
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  log('Initializing v4.0 — WebAdvisor Mode...');
  try { await storageManager.init(); log('StorageManager ready'); }
  catch(e) { warn('StorageManager init failed:',e.message); }

  try {
    const wl=await storageManager.get('sites','__whitelist__');
    if (wl?.domains) wl.domains.forEach(d=>userWhitelist.add(d));
  } catch {}

  try {
    const local=await chrome.storage.local.get(['trustedDomains','strictMode','adsBlockedCount','trackersBlockedCount']);
    if (local.trustedDomains) trustedDomains=local.trustedDomains;
    if (local.strictMode)     strictMode=local.strictMode;
    adsBlockedCount     =local.adsBlockedCount     ||0;
    trackersBlockedCount=local.trackersBlockedCount||0;
    log('Trusted domains:',Object.keys(trustedDomains).length,'Strict:',strictMode);
  } catch {}

  await setupAdBlocking();
  setupListeners();
  log('PRIVISEE-X v4.0 ready ✓ — WebAdvisor + CertWarning + Advisory Engine active');
}

init().catch(e=>console.error('[PRIVISEE-X BG] Fatal init error:',e));

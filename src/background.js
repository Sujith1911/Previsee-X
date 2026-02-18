/**
 * PRIVISEE-X Background Service Worker
 * Orchestrates all privacy intelligence modules
 * 
 * Responsibilities:
 * - Network request interception
 * - Cookie monitoring
 * - Module coordination
 * - Data aggregation
 * - UI communication
 */

// Import modules
importScripts(
  'modules/storageEngine.js',
  'modules/trackerDetector.js',
  'modules/anomalyDetector.js',
  'modules/riskEngine.js',
  'modules/explainabilityEngine.js',
  'modules/graphEngine.js',
  'modules/consentAnalyzer.js',
  'modules/behavioralAnalyzer.js'
);

// Initialize modules
const storage = new StorageEngine();
const trackerDetector = new TrackerDetector();
const anomalyDetector = new AnomalyDetector();
const riskEngine = new RiskEngine();
const explainabilityEngine = new ExplainabilityEngine(riskEngine);
const graphEngine = new GraphEngine();
const consentAnalyzer = new ConsentAnalyzer();
const behavioralAnalyzer = new BehavioralAnalyzer();

// In-memory site data cache
const siteDataMap = new Map();

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[PRIVISEE-X] Extension installed/updated');
  
  // Initialize all modules
  await initializeModules();
  
  // Set default settings
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      enabled: true,
      federatedLearning: false
    });
  }
});

/**
 * Initialize all modules
 */
async function initializeModules() {
  try {
    await storage.initialize();
    await trackerDetector.initialize();
    await anomalyDetector.initialize();
    await riskEngine.initialize();
    
    console.log('[PRIVISEE-X] All modules initialized successfully');
  } catch (error) {
    console.error('[PRIVISEE-X] Module initialization failed:', error);
  }
}

/**
 * Monitor network requests
 */
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId < 0) return; // Ignore internal requests
    
    try {
      const url = new URL(details.url);
      const domain = url.hostname;
      
      // Get main domain from tab
      const tab = await chrome.tabs.get(details.tabId);
      const mainUrl = new URL(tab.url);
      const mainDomain = mainUrl.hostname;
      
      // Skip if same domain (first-party)
      if (domain === mainDomain) return;
      
      // Classify as tracker
      const classification = await trackerDetector.classify(domain, details.url, {
        mainDomain,
        isThirdParty: true,
        type: details.type
      });
      
      // Store tracker data if detected
      if (classification.isTracker) {
        await recordTracker(mainDomain, classification, details);
      }
      
    } catch (error) {
      // Silent fail for parsing errors
    }
  },
  { urls: ["<all_urls>"] },
  []
);

/**
 * Monitor completed requests (for cookie collection)
 */
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.tabId < 0 || details.type !== 'main_frame') return;
    
    try {
      const url = new URL(details.url);
      const domain = url.hostname;
      
      // Collect cookies for this domain
      await collectCookiesForDomain(domain, details.url);
      
      // Calculate risk score
      await updateRiskScore(domain);
      
    } catch (error) {
      console.error('[Background] Error in onCompleted:', error);
    }
  },
  { urls: ["<all_urls>"] }
);

/**
 * Handle messages from content script and UI
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'FINGERPRINT_DETECTED':
      return await handleFingerprintDetection(message.data, sender);
      
    case 'GET_SITE_DATA':
      return await getSiteData(message.domain);
      
    case 'GET_ALL_SITES':
      return await getAllSitesData(message.limit);
      
    case 'GET_GRAPH':
      return await getGraphData();
      
    case 'CLEAR_SITE':
      return await clearSiteData(message.domain);
      
    case 'CLEAR_ALL':
      return await clearAllData();
      
    default:
      return { error: 'Unknown message type' };
  }
}

/**
 * Record tracker detection
 */
async function recordTracker(siteDomain, classification, details) {
  // Get or create site data
  if (!siteDataMap.has(siteDomain)) {
    siteDataMap.set(siteDomain, {
      domain: siteDomain,
      trackers: new Map(),
      cookies: [],
      fingerprinting: { canvas: 0, webgl: 0, audio: 0, fonts: 0 },
      thirdPartyDomains: new Set(),
      riskScore: 0,
      lastVisit: Date.now()
    });
  }
  
  const siteData = siteDataMap.get(siteDomain);
  
  // Add tracker
  siteData.trackers.set(classification.domain, {
    category: classification.category,
    confidence: classification.confidence,
    source: classification.source,
    firstSeen: Date.now()
  });
  
  // Add to third-party domains
  siteData.thirdPartyDomains.add(classification.domain);
  
  // Save tracker to storage
  await storage.saveTracker(siteDomain, {
    domain: classification.domain,
    category: classification.category,
    confidence: classification.confidence
  });
}

/**
 * Collect cookies for domain
 */
async function collectCookiesForDomain(domain, url) {
  try {
    const cookies = await chrome.cookies.getAll({ domain });
    
    if (!siteDataMap.has(domain)) {
      siteDataMap.set(domain, {
        domain,
        trackers: new Map(),
        cookies: [],
        fingerprinting: { canvas: 0, webgl: 0, audio: 0, fonts: 0 },
        thirdPartyDomains: new Set(),
        riskScore: 0,
        lastVisit: Date.now(),
        isHttps: url.startsWith('https:')
      });
    }
    
    const siteData = siteDataMap.get(domain);
    
    // Analyze cookies
    siteData.cookies = cookies.map(cookie => ({
      ...cookie,
      isThirdParty: cookie.domain !== domain && !cookie.domain.endsWith(`.${domain}`),
      lifetime: cookie.expirationDate ? (cookie.expirationDate - Date.now() / 1000) : 0
    }));
    
  } catch (error) {
    console.error('[Background] Error collecting cookies:', error);
  }
}

/**
 * Update risk score for site
 */
async function updateRiskScore(domain) {
  const siteData = siteDataMap.get(domain);
  if (!siteData) return;
  
  try {
    // Detect anomalies
    const anomalyResult = await anomalyDetector.detectAnomaly(siteData);
    
    // Calculate risk
    const riskResult = await riskEngine.calculateRisk(siteData, anomalyResult);
    
    // Generate explanation
    const explanation = await explainabilityEngine.explainRisk(siteData, riskResult, anomalyResult);
    
    // Update site data
    siteData.riskScore = riskResult.score;
    siteData.riskLevel = riskResult.level;
    siteData.explanation = explanation;
    siteData.anomaly = anomalyResult;
    
    // Save to storage
    await storage.saveSite({
      domain: siteData.domain,
      riskScore: riskResult.score,
      riskLevel: riskResult.level,
      trackerCount: siteData.trackers.size,
      cookieCount: siteData.cookies.length,
      isHttps: siteData.isHttps,
      lastVisit: Date.now(),
      explanation: explanation.summary
    });
    
    // Update badge
    updateBadge(domain, riskResult);
    
    console.log(`[PRIVISEE-X] ${domain} - Risk: ${riskResult.score} (${riskResult.level})`);
    
  } catch (error) {
    console.error('[Background] Error updating risk score:', error);
  }
}

/**
 * Handle fingerprinting detection from content script
 */
async function handleFingerprintDetection(data, sender) {
  const tab = sender.tab;
  if (!tab || !tab.url) return;
  
  const url = new URL(tab.url);
  const domain = url.hostname;
  
  if (!siteDataMap.has(domain)) return;
  
  const siteData = siteDataMap.get(domain);
  siteData.fingerprinting = {
    canvas: data.canvas || 0,
    webgl: data.webgl || 0,
    audio: data.audio || 0,
    fonts: data.fonts || 0,
    battery: data.battery || false,
    deviceMemory: data.deviceMemory || false,
    hardwareConcurrency: data.hardwareConcurrency || false,
    webRTC: data.webRTC || false
  };
  
  // Recalculate risk
  await updateRiskScore(domain);
  
  return { success: true };
}

/**
 * Get site data for UI
 */
async function getSiteData(domain) {
  // Check memory cache first
  if (siteDataMap.has(domain)) {
    return {
      success: true,
      data: serializeSiteData(siteDataMap.get(domain))
    };
  }
  
  // Load from storage
  const stored = await storage.getSite(domain);
  if (stored) {
    return { success: true, data: stored };
  }
  
  return { success: false, error: 'Site not found' };
}

/**
 * Get all sites data
 */
async function getAllSitesData(limit = 100) {
  const sites = await storage.getAllSites(0, limit);
  return {
    success: true,
    sites: sites,
    count: sites.length
  };
}

/**
 * Get graph data
 */
async function getGraphData() {
  try {
    const allSites = await storage.getAllSites(0, 1000);
    const graphData = graphEngine.buildGraph(allSites);
    const hubs = graphEngine.identifyHubs(10);
    const stats = graphEngine.getStats();
    
    // Save to storage
    await storage.saveGraph(graphData);
    
    return {
      success: true,
      graph: graphData,
      hubs,
      stats
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Clear site data
 */
async function clearSiteData(domain) {
  siteDataMap.delete(domain);
  // Storage cleanup would require IndexedDB delete
  return { success: true };
}

/**
 * Clear all data
 */
async function clearAllData() {
  siteDataMap.clear();
  await storage.clearAll();
  return { success: true };
}

/**
 * Update extension badge
 */
function updateBadge(domain, riskResult) {
  const color = riskResult.color;
  const text = riskResult.score.toString();
  
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

/**
 * Serialize site data for transmission
 */
function serializeSiteData(siteData) {
  return {
    ...siteData,
    trackers: Array.from(siteData.trackers.entries()).map(([domain, info]) => ({
      domain,
      ...info
    })),
    thirdPartyDomains: Array.from(siteData.thirdPartyDomains)
  };
}

// Clean old data daily
chrome.alarms.create('cleanup', { periodInMinutes: 1440 }); // 24 hours
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup') {
    await storage.cleanOldData(7); // 7 days retention
    console.log('[PRIVISEE-X] Old data cleaned');
  }
});

console.log('[PRIVISEE-X] Background worker initialized');

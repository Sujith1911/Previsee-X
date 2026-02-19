/**
 * PRIVISEE-X v2.0
 * Service Worker: Background Orchestrator
 * 
 * Central hub that initializes all engines and routes events.
 * Replaces old monolithic background.js.
 */

import { globalEventBus } from './core/EventBus.js';
import { createLogger } from './core/Logger.js';
import { storageManager } from './storage/StorageManager.js';

// Engines
import { TrackerDetector } from './detectors/TrackerDetector.js';
import { AnomalyDetector } from './detectors/AnomalyDetector.js';
import { FingerprintDetector } from './detectors/FingerprintDetector.js';
import { RiskEngine } from './risk/RiskEngine.js';
import { GraphEngine } from './graph/GraphEngine.js';
import { SecurityAuditEngine } from './security/SecurityAuditEngine.js';
import { ExplainabilityEngine } from './explainability/ExplainabilityEngine.js';

const logger = createLogger('Background');
const engines = {};

// Initialization
async function init() {
  logger.info('Starting PRIVISEE-X v2.0...');
  
  // 1. Storage
  await storageManager.init();

  // 2. Instantiate Engines
  engines.tracker = new TrackerDetector();
  engines.anomaly = new AnomalyDetector();
  engines.fingerprint = new FingerprintDetector();
  engines.risk = new RiskEngine();
  engines.graph = new GraphEngine();
  engines.security = new SecurityAuditEngine();
  engines.explain = new ExplainabilityEngine();

  // 3. Init All
  await Promise.all(Object.values(engines).map(e => e.init()));

  // 4. Setup Event Wiring
  setupEventPipeline();

  logger.info('All engines initialized.');
}

function setupEventPipeline() {
  // Tracker -> Risk & Graph
  globalEventBus.subscribe('TRACKER_DETECTED', async (data) => {
    logger.info('Tracker detected:', data.domain);
    // Update Graph
    engines.graph.execute({ source: data.sourceUrl, target: data.domain });
    // Update Risk
    // (In a real scenario, we'd aggregate per-page risk, here simplified)
    // engines.risk.execute({ trackers: 1, ... }); 
  });

  // Anomaly -> Risk
  globalEventBus.subscribe('ANOMALY_DETECTED', (data) => {
    // engines.risk.update...
  });

  // Fingerprint -> Risk
  globalEventBus.subscribe('FINGERPRINTING_DETECTED', (data) => {
    // engines.risk.update...
  });
}

// Browser Event Listeners (Web Request API)
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.type === 'main_frame') return; // Skip main frame for tracker check usually
    
    const result = await engines.tracker.execute({
      domain: new URL(details.url).hostname,
      url: details.url,
      type: details.type,
      tabId: details.tabId
    });

    if (result.isTracker) {
        // In MV3, we cannot block request synchronously here without 'declarativeNetRequest'.
        // For now, we just log/record it. To actually block, we need to use DNR API.
        console.log('Would block tracker:', details.url);
    }
  },
  { urls: ["<all_urls>"] }
);

// Tab Updates (For Anomaly & Security Checks)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        // Run Security Audit
        // Note: Headers are usually checked in onHeadersReceived, but here for structural example
        // engines.security.execute(...)
        
        // Run Anomaly Check (gathering stats)
        // engines.anomaly.execute(...)
    }
});

// Runtime Messages (UI Communication)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'GET_DASHBOARD_DATA') {
        const risk = await storageManager.get('models', 'current_risk') || { score: 0 };
        const graph = engines.graph ? engines.graph.exportGraph() : { nodes: [], links: [] };
        sendResponse({ riskScore: risk.score, graphNodes: graph.nodes });
      }
      
      else if (message.action === 'GET_TAB_STATS') {
        // In real app, fetch per-tab data
        sendResponse({ trackersBlocked: 0, riskScore: 'Low' });
      }

      else if (message.type === 'CONFIG_UPDATED') {
        if (engines.risk) await engines.risk.updateWeights(message.config.weights);
        sendResponse({ success: true });
      }

      else if (message.type === 'GET_ALL_SITES') {
        const sites = await storageManager.getAll('sites', message.limit || 100);
        sendResponse({ success: true, sites });
      }

      else if (message.type === 'CLEAR_ALL') {
         // Clear DB
         // storageManager.clearAll()... (implementation omitted for brevity)
         sendResponse({ success: true });
      }
      
      else if (message.type === 'FINGERPRINT_DETECTED') {
        if (engines.fingerprint) {
            await engines.fingerprint.execute(message.data);
        }
        sendResponse({ received: true });
      }

      else {
        sendResponse(null);
      }
    } catch (e) {
      logger.error('Message handler error:', e);
      sendResponse({ error: e.message });
    }
  })();
  return true; // Keep channel open for async response
});

// Start
init().catch(e => logger.error('Fatal init error:', e));

// Expose for UI
self.getPriviseeState = () => ({
    enginesInitialized: true,
    version: '2.0.0'
});

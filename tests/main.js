/**
 * PRIVISEE-X Test Runner
 * Runs the unit tests for the extension modules (v5.0 upgrade).
 */

import { storageManager } from '../src/storage/StorageManager.js';
import { ThreatIntelEngine } from '../src/security/ThreatIntelEngine.js';
import { AttackSurfaceEngine } from '../src/security/AttackSurfaceEngine.js';
import { BehavioralAnalysisEngine } from '../src/detectors/BehavioralAnalysisEngine.js';
import { AdaptiveWeightingEngine } from '../src/risk/AdaptiveWeightingEngine.js';
import { ThreatProjectionEngine } from '../src/risk/ThreatProjectionEngine.js';
import { GraphEngine } from '../src/graph/GraphEngine.js';

// Setup Mock/Global Objects
global.chrome = {
  runtime: {
    getURL: (path) => path,
    lastError: null,
    sendMessage: () => {}
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => ({})
    }
  }
};

// Stub StorageManager instance directly
storageManager.init = async () => {};
storageManager.get = async (store, key) => {
  if (store === 'models' && key === 'adaptive_weights_config') {
    return { weights: {
      behavioral: 0.20,
      staticHeaders: 0.20,
      reputation: 0.15,
      securityLayer: 0.15,
      threatIntel: 0.15,
      behavioralThreat: 0.15
    }};
  }
  return null;
};
storageManager.put = async (store, data) => data;
storageManager.getRiskHistorySince = async (since) => [];
storageManager.getRiskHistoryForDomain = async (domain, limit) => [];

const assertions = [];

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  assertions.push(message);
}

async function runTests() {
  console.log('🧪 Running PRIVISEE-X v5.0 Unit Tests...');
  console.log('');

  // 1. ThreatIntelEngine Tests
  const threatIntel = new ThreatIntelEngine();
  await threatIntel.init();
  
  // Whitelist check
  const tiResult1 = await threatIntel.execute('google.com');
  assert(tiResult1.category === 'Trusted', 'google.com category should be Trusted');
  assert(tiResult1.threatScore === 0, 'google.com threatScore should be 0');
  
  // Local Indicator Blocklist Check
  const tiResult2 = await threatIntel.execute('login-paypal-security.xyz');
  assert(tiResult2.threatScore > 80, 'Abuse/phishing indicator domain should score high threat');
  assert(tiResult2.category === 'Phishing Risk' || tiResult2.category === 'Malware Risk', 'Abuse/phishing indicator domain category check');

  // Lexical & TLD Heuristics Check
  const tiResult3 = await threatIntel.execute('random-dga-domain-string.xyz');
  assert(tiResult3.indicators.some(i => i.includes('TLD')), 'xyz TLD should trigger TLD indicators');
  assert(tiResult3.threatScore > 0, 'Suspicious TLD/lexical should have non-zero threat score');
  console.log('✅ ThreatIntelEngine tests passed');

  // 2. AttackSurfaceEngine Tests
  const attackSurface = new AttackSurfaceEngine();
  await attackSurface.init();

  // Secure baseline test
  const asResult1 = await attackSurface.execute({
    url: 'https://example.com',
    headers: {
      'content-security-policy': 'default-src https:',
      'strict-transport-security': 'max-age=31536000',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'geolocation=()'
    },
    cookies: []
  });
  assert(asResult1.score >= 95, `Strong secure baseline headers should score high (A+). Got: ${asResult1.score}`);

  // Insecure / missing headers test
  const asResult2 = await attackSurface.execute({
    url: 'http://example.com',
    headers: {},
    cookies: []
  });
  assert(asResult2.score < 50, `Plain HTTP with missing headers should score low. Got: ${asResult2.score}`);
  assert(asResult2.issues.some(i => i.id === 'insecure_http'), 'Should flag plain HTTP connection');
  assert(asResult2.issues.some(i => i.id === 'missing_csp'), 'Should flag missing CSP');

  // Invalid Cert Warning test
  const asResult3 = await attackSurface.execute({
    url: 'https://example.com',
    headers: {},
    cookies: [],
    certWarning: { isInvalid: true, hasWarning: true, reasons: ['Certificate Expired'], severity: 'CRITICAL' }
  });
  assert(asResult3.issues.some(i => i.id === 'cert_invalid'), 'Should identify invalid TLS certificate');
  console.log('✅ AttackSurfaceEngine tests passed');

  // 3. BehavioralAnalysisEngine Tests
  const behavioral = new BehavioralAnalysisEngine();
  await behavioral.init();

  // Clean site test
  const bhResult1 = await behavioral.execute({
    domain: 'example.com',
    apiCounts: {},
    redirects: 0,
    downloads: 0,
    hijacks: 0
  });
  assert(bhResult1.behaviorScore === 0, 'Clean page behavior score should be 0');

  // Anomaly / hijacking test
  const bhResult2 = await behavioral.execute({
    domain: 'example.com',
    apiCounts: { fullscreen: 1, clipboard: 1, mediaDevices: 1 },
    redirects: 3,
    downloads: 1,
    hijacks: 1
  });
  assert(bhResult2.behaviorScore >= 80, `Multiple hostile behaviors should trigger high behaviorScore. Got: ${bhResult2.behaviorScore}`);
  assert(bhResult2.anomalies.some(a => a.id === 'fullscreen_request'), 'Should log fullscreen request anomaly');
  assert(bhResult2.anomalies.some(a => a.id === 'clipboard_access'), 'Should log clipboard access anomaly');
  assert(bhResult2.anomalies.some(a => a.id === 'unsolicited_download'), 'Should log download anomaly');
  assert(bhResult2.anomalies.some(a => a.id === 'tab_hijack'), 'Should log tab hijack anomaly');
  console.log('✅ BehavioralAnalysisEngine tests passed');

  // 4. AdaptiveWeightingEngine Tests
  const adaptive = new AdaptiveWeightingEngine();
  await adaptive.init();

  // Test standard weights final score
  const adResult1 = await adaptive.execute(
    {
      behavioral: 30,
      staticHeaders: 40,
      reputation: 20,
      securityLayer: 10,
      threatIntel: 0,
      behavioralThreat: 0
    },
    { domain: 'example.com', trusted: false, threatIntelConfidence: 50 }
  );
  assert(adResult1.finalScore > 15, `Untrusted domain with trackers & missing headers should score > 15. Got: ${adResult1.finalScore}`);

  // Test trusted domain decay (reputation and tracker weights suppressed)
  const adResult2 = await adaptive.execute(
    {
      behavioral: 54, // lots of trackers/cookies
      staticHeaders: 40, // some missing headers
      reputation: 0,
      securityLayer: 0,
      threatIntel: 0,
      behavioralThreat: 0
    },
    { domain: 'google.com', trusted: true, threatIntelConfidence: 95 }
  );
  
  // Normalized math check:
  // weights.behavioral = 0.02, reputation = 0.03
  // remaining staticHeaders, securityLayer, threatIntel, behavioralThreat receive surplus (0.35/4 = 0.0875)
  // staticHeaders weight = 0.20 + 0.0875 = 0.2875. Normalized = 0.2875/1.05 = ~27.38%
  // finalScore calculation using these decayed weights should keep google.com risk score low.
  assert(adResult2.finalScore < 15, `Trusted domain with standard trackers/headers must remain safe (< 15). Got: ${adResult2.finalScore}`);
  assert(adResult2.weights.behavioral === 0.019 || adResult2.weights.behavioral === 0.02, `Behavioral weight should decay to ~2%. Got: ${adResult2.weights.behavioral}`);
  console.log('✅ AdaptiveWeightingEngine tests passed');

  // 5. ThreatProjectionEngine Tests
  const projection = new ThreatProjectionEngine();
  await projection.init();

  // Increasing trend check
  const projResult1 = await projection.execute({
    history: [
      { score: 10 }, { score: 15 }, { score: 20 }, { score: 30 }, { score: 40 }
    ],
    currentScore: 50
  });
  assert(projResult1.trend30d === 'INCREASING', `Increasing risk score history should forecast INCREASING trend. Got: ${projResult1.trend30d}`);
  assert(projResult1.forecast30d > 50, `30-day forecast should project elevated risk. Got: ${projResult1.forecast30d}`);

  // Stable trend check
  const projResult2 = await projection.execute({
    history: [
      { score: 10 }, { score: 10 }, { score: 11 }, { score: 9 }, { score: 10 }
    ],
    currentScore: 10
  });
  assert(projResult2.trend30d === 'STABLE', 'Stable risk score history should forecast STABLE');
  console.log('✅ ThreatProjectionEngine tests passed');

  // 6. GraphEngine Tests
  const graph = new GraphEngine();
  await graph.init();

  // Add website to tracker links
  await graph.execute({ source: 'example.com', target: 'tracker.com', sourceType: 'Website', targetType: 'Tracker' });
  await graph.execute({ source: 'example.com', target: 'google-analytics.com', sourceType: 'Website', targetType: 'Tracker' });
  await graph.execute({ source: 'another.com', target: 'tracker.com', sourceType: 'Website', targetType: 'Tracker' });

  const graphData = graph.exportGraph();
  assert(graphData.nodes.length >= 4, 'Graph should contain website and tracker nodes');
  assert(graphData.links.length === 3, 'Graph should contain three edges');
  
  // PageRank calculations
  await graph.computePageRank(10);
  const trackerNode = graph.nodes.get('tracker.com');
  assert(trackerNode.pagerank > 0, 'PageRank must be calculated and non-zero');

  // Betweenness Centrality calculations
  await graph.computeBetweennessCentrality();
  assert(trackerNode.betweenness >= 0, 'Betweenness Centrality must be calculated');

  // Label Propagation calculations
  await graph.detectEcosystemCommunities(5);
  assert(trackerNode.community !== undefined, 'Community grouping must be defined');
  console.log('✅ GraphEngine tests passed');

  console.log('');
  console.log('============================================================');
  console.log(`Results: All ${assertions.length} assertions passed successfully!`);
  console.log('✅ All tests passed!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test execution crashed:', err);
  process.exit(1);
});

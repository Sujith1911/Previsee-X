/**
 * PRIVISEE-X Test Suite
 * Unit tests for core modules
 * 
 * Run in browser console or with test runner
 */

// Simple test framework
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running PRIVISEE-X Test Suite\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        this.results.passed++;
        console.log(`✅ ${test.name}`);
      } catch (error) {
        this.results.failed++;
        console.error(`❌ ${test.name}`);
        console.error(`   Error: ${error.message}`);
      }
      this.results.total++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${this.results.passed}/${this.results.total} passed`);
    if (this.results.failed > 0) {
      console.log(`❌ ${this.results.failed} tests failed`);
    } else {
      console.log('✅ All tests passed!');
    }
    
    return this.results;
  }
}

// Helper for assertions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual, threshold, message) {
  if (actual <= threshold) {
    throw new Error(message || `Expected > ${threshold}, got ${actual}`);
  }
}

// Create test runner
const runner = new TestRunner();

// ===================================================================
// Storage Engine Tests
// ===================================================================

runner.test('StorageEngine: Initialize database', async () => {
  const storage = new StorageEngine();
  await storage.init();
  assert(storage.db !== null, 'Database should be initialized');
});

runner.test('StorageEngine: Save and retrieve site', async () => {
  const storage = new StorageEngine();
  await storage.init();
  
  const testSite = {
    domain: 'test-example.com',
    riskScore: 65,
    riskLevel: 'High',
    trackerCount: 15,
    cookieCount: 23,
    lastVisit: Date.now()
  };
  
  await storage.saveSite(testSite);
  const retrieved = await storage.getSite('test-example.com');
  
  assertEquals(retrieved.domain, 'test-example.com');
  assertEquals(retrieved.riskScore, 65);
  assertEquals(retrieved.trackerCount, 15);
  
  // Cleanup
  await storage.deleteSite('test-example.com');
});

runner.test('StorageEngine: Query sites by risk level', async () => {
  const storage = new StorageEngine();
  await storage.init();
  
  // Insert test data
  await storage.saveSite({ domain: 'high-risk.com', riskLevel: 'High', riskScore: 80, lastVisit: Date.now() });
  await storage.saveSite({ domain: 'low-risk.com', riskLevel: 'Low', riskScore: 20, lastVisit: Date.now() });
  
  const highRiskSites = await storage.getSitesByRiskLevel('High');
  assert(highRiskSites.length > 0, 'Should find high-risk sites');
  assert(highRiskSites.some(s => s.domain === 'high-risk.com'), 'Should include high-risk.com');
  
  // Cleanup
  await storage.deleteSite('high-risk.com');
  await storage.deleteSite('low-risk.com');
});

// ===================================================================
// Tracker Detector Tests
// ===================================================================

runner.test('TrackerDetector: Detect known tracker (blocklist)', () => {
  const detector = new TrackerDetector();
  const result = detector.classify('doubleclick.net', 'https://doubleclick.net/ads', {});
  
  assert(result.isTracker, 'Should identify doubleclick.net as tracker');
  assertEquals(result.source, 'blocklist');
  assertEquals(result.category, 'advertising');
  assertEquals(result.confidence, 1.0);
});

runner.test('TrackerDetector: Benign domain', () => {
  const detector = new TrackerDetector();
  const result = detector.classify('wikipedia.org', 'https://wikipedia.org', {});
  
  assert(!result.isTracker, 'Should not flag wikipedia.org as tracker');
});

runner.test('TrackerDetector: Extract domain features', () => {
  const detector = new TrackerDetector();
  const features = detector.extractFeatures('ad-server-123.tracking.net', 'https://ad-server-123.tracking.net/pixel?id=abc', { resourceType: 'image' });
  
  assertGreaterThan(features.domainLength, 10);
  assertGreaterThan(features.subdomainCount, 1);
  assert(features.hasNumbers > 0, 'Should detect numbers in domain');
  assert(features.isThirdParty > 0, 'Should be third-party');
});

// ===================================================================
// Risk Engine Tests
// ===================================================================

runner.test('RiskEngine: Calculate risk score', () => {
  const riskEngine = new RiskEngine();
  
  const siteData = {
    domain: 'test-example.com',
    trackerCount: 15,
    cookieCount: 30,
    thirdPartyCount: 12,
    fingerprinting: {
      canvas: 3,
      webgl: 2,
      audio: 1,
      fonts: 5
    },
    anomaly: {
      isAnomalous: false,
      score: 0
    },
    isHTTPS: true
  };
  
  const result = riskEngine.calculateRisk(siteData);
  
  assertGreaterThan(result.score, 0);
  assertGreaterThan(result.score, 50, 'High tracker count should result in high risk');
  assert(['Low', 'Moderate', 'High', 'Critical'].includes(result.level));
  assert(typeof result.explanation === 'string');
});

runner.test('RiskEngine: Low risk site', () => {
  const riskEngine = new RiskEngine();
  
  const siteData = {
    domain: 'safe-site.com',
    trackerCount: 2,
    cookieCount: 5,
    thirdPartyCount: 1,
    fingerprinting: {
      canvas: 0,
      webgl: 0,
      audio: 0,
      fonts: 0
    },
    anomaly: {
      isAnomalous: false,
      score: 0
    },
    isHTTPS: true
  };
  
  const result = riskEngine.calculateRisk(siteData);
  
  assert(result.score < 50, 'Low activity should result in low risk');
  assert(['Low', 'Moderate'].includes(result.level));
});

// ===================================================================
// Anomaly Detector Tests
// ===================================================================

runner.test('AnomalyDetector: Detect anomalous site', () => {
  const anomalyDetector = new AnomalyDetector();
  
  // Build baseline with normal sites
  const normalSites = Array(50).fill(null).map((_, i) => ({
    trackerCount: 5 + Math.floor(Math.random() * 5),
    cookieCount: 10 + Math.floor(Math.random() * 10),
    thirdPartyCount: 8 + Math.floor(Math.random() * 5)
  }));
  
  anomalyDetector.updateBaseline(normalSites);
  
  // Test with anomalous site
  const anomalous = {
    trackerCount: 50,
    cookieCount: 100,
    thirdPartyCount: 40
  };
  
  const result = anomalyDetector.detect(anomalous);
  
  assert(result.isAnomalous, 'Should detect anomaly');
  assertGreaterThan(result.score, 50);
  assert(result.reasons.length > 0, 'Should provide reasons');
});

runner.test('AnomalyDetector: Normal site', () => {
  const anomalyDetector = new AnomalyDetector();
  
  const normalSites = Array(50).fill(null).map(() => ({
    trackerCount: 5,
    cookieCount: 10,
    thirdPartyCount: 8
  }));
  
  anomalyDetector.updateBaseline(normalSites);
  
  const normal = {
    trackerCount: 6,
    cookieCount: 12,
    thirdPartyCount: 9
  };
  
  const result = anomalyDetector.detect(normal);
  
  assert(!result.isAnomalous, 'Should not flag normal site');
  assert(result.score < 50);
});

// ===================================================================
// Graph Engine Tests
// ===================================================================

runner.test('GraphEngine: Build graph from sites', () => {
  const graphEngine = new GraphEngine();
  
  const sites = [
    {
      domain: 'site1.com',
      trackers: [
        { domain: 'tracker1.com', category: 'advertising' },
        { domain: 'tracker2.com', category: 'analytics' }
      ]
    },
    {
      domain: 'site2.com',
      trackers: [
        { domain: 'tracker1.com', category: 'advertising' },
        { domain: 'tracker3.com', category: 'social' }
      ]
    }
  ];
  
  const graph = graphEngine.buildGraph(sites);
  
  assert(graph.nodes.length > 0, 'Graph should have nodes');
  assert(graph.edges.length > 0, 'Graph should have edges');
  
  // Find tracker1.com node
  const tracker1 = graph.nodes.find(n => n.id === 'tracker1.com');
  assert(tracker1 !== undefined, 'Should have tracker1.com node');
  assertEquals(tracker1.type, 'tracker');
  assertGreaterThan(tracker1.degree, 1, 'tracker1.com should connect to multiple sites');
});

runner.test('GraphEngine: Calculate PageRank', () => {
  const graphEngine = new GraphEngine();
  
  const sites = [
    {
      domain: 'site1.com',
      trackers: [{ domain: 'hub-tracker.com', category: 'advertising' }]
    },
    {
      domain: 'site2.com',
      trackers: [{ domain: 'hub-tracker.com', category: 'advertising' }]
    },
    {
      domain: 'site3.com',
      trackers: [{ domain: 'hub-tracker.com', category: 'advertising' }]
    }
  ];
  
  const graph = graphEngine.buildGraph(sites);
  
  // hub-tracker.com should have high PageRank
  const hubNode = graph.nodes.find(n => n.id === 'hub-tracker.com');
  assert(hubNode !== undefined);
  assertGreaterThan(hubNode.pageRank, 0, 'Hub should have positive PageRank');
});

// ===================================================================
// Consent Analyzer Tests
// ===================================================================

runner.test('ConsentAnalyzer: Detect pre-checked boxes', () => {
  const analyzer = new ConsentAnalyzer();
  
  // Create mock DOM
  const mockElement = {
    querySelectorAll: (selector) => {
      if (selector.includes('checkbox')) {
        return [{
          checked: true,
          required: false,
          id: 'marketing',
          nextElementSibling: {
            textContent: 'Marketing cookies'
          }
        }];
      }
      return [];
    },
    getBoundingClientRect: () => ({ width: 400, height: 300 })
  };
  
  const result = analyzer.detectPreCheckedBoxes(mockElement);
  
  assertGreaterThan(result.count, 0, 'Should detect pre-checked box');
  assert(result.checkboxes.length > 0);
});

// ===================================================================
// Behavioral Analyzer Tests
// ===================================================================

runner.test('BehavioralAnalyzer: Calculate time-series trend', () => {
  const analyzer = new BehavioralAnalyzer();
  
  const values = [5, 7, 9, 11, 13]; // Increasing trend
  const trend = analyzer.calculateTrend(values);
  
  assertGreaterThan(trend, 0, 'Should detect increasing trend');
});

runner.test('BehavioralAnalyzer: Detect cross-site correlation', () => {
  const analyzer = new BehavioralAnalyzer();
  
  const currentSite = {
    domain: 'current.com',
    trackers: [
      { domain: 'ubiquitous-tracker.com', category: 'advertising' }
    ]
  };
  
  const historicalSites = [
    {
      domain: 'site1.com',
      trackers: [{ domain: 'ubiquitous-tracker.com', category: 'advertising' }]
    },
    {
      domain: 'site2.com',
      trackers: [{ domain: 'ubiquitous-tracker.com', category: 'advertising' }]
    },
    {
      domain: 'site3.com',
      trackers: [{ domain: 'ubiquitous-tracker.com', category: 'advertising' }]
    }
  ];
  
  const result = analyzer.analyzeCrossSiteCorrelation(currentSite, historicalSites);
  
  assert(result.hasCorrelation, 'Should detect cross-site correlation');
  assertGreaterThan(result.commonTrackers.length, 0);
});

// ===================================================================
// Run Tests
// ===================================================================

console.log('🚀 Starting PRIVISEE-X Test Suite...\n');

runner.run().then(results => {
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Extension is ready for deployment.');
  } else {
    console.log('\n⚠️ Some tests failed. Review errors above.');
  }
});

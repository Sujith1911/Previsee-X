/**
 * PRIVISEE-X Browser Unit Tests
 * Outputs test results to the browser developer console.
 * Uses dynamic imports to access functional engines in v5.0.
 */

(async function() {
  console.log('%c🧪 Running PRIVISEE-X Browser Test Suite...', 'font-weight: bold; font-size: 14px; color: #3b82f6;');
  console.log(' ');

  const assertions = [];

  function assert(condition, message) {
    if (!condition) {
      console.error(`%c❌ Assertion Failed: ${message}`, 'color: #ef4444; font-weight: bold;');
      throw new Error(`Assertion Failed: ${message}`);
    }
    assertions.push(message);
    console.log(`%c✓ Passed: ${message}`, 'color: #10b981;');
  }

  try {
    // Dynamic imports
    const { ThreatIntelEngine } = await import('../src/security/ThreatIntelEngine.js');
    const { AttackSurfaceEngine } = await import('../src/security/AttackSurfaceEngine.js');
    const { BehavioralAnalysisEngine } = await import('../src/detectors/BehavioralAnalysisEngine.js');
    const { AdaptiveWeightingEngine } = await import('../src/risk/AdaptiveWeightingEngine.js');
    const { ThreatProjectionEngine } = await import('../src/risk/ThreatProjectionEngine.js');
    const { GraphEngine } = await import('../src/graph/GraphEngine.js');

    // 1. ThreatIntelEngine Tests
    const threatIntel = new ThreatIntelEngine();
    await threatIntel.init();
    
    // Whitelist check
    const tiResult1 = await threatIntel.execute('google.com');
    assert(tiResult1.category === 'Trusted', 'google.com category is Trusted');
    assert(tiResult1.threatScore === 0, 'google.com threatScore is 0');
    
    // Local Indicator Check
    const tiResult2 = await threatIntel.execute('login-paypal-security.xyz');
    assert(tiResult2.threatScore > 80, 'Phishing indicator domain threat score > 80');

    // Lexical Check
    const tiResult3 = await threatIntel.execute('random-dga-domain-string.xyz');
    assert(tiResult3.indicators.some(i => i.includes('TLD')), 'xyz TLD matches indicators');
    console.log('%c✅ ThreatIntelEngine tests completed', 'color: #10b981; font-weight: bold;');

    // 2. AttackSurfaceEngine Tests
    const attackSurface = new AttackSurfaceEngine();
    await attackSurface.init();

    // Secure headers test
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
    assert(asResult1.score >= 95, 'Secure headers score >= 95');

    // Missing headers / HTTP test
    const asResult2 = await attackSurface.execute({
      url: 'http://example.com',
      headers: {},
      cookies: []
    });
    assert(asResult2.score < 50, 'Plain HTTP with missing headers score < 50');
    assert(asResult2.issues.some(i => i.id === 'insecure_http'), 'Insecure HTTP flag');
    console.log('%c✅ AttackSurfaceEngine tests completed', 'color: #10b981; font-weight: bold;');

    // 3. BehavioralAnalysisEngine Tests
    const behavioral = new BehavioralAnalysisEngine();
    await behavioral.init();

    const bhResult1 = await behavioral.execute({
      domain: 'example.com',
      apiCounts: {},
      redirects: 0,
      downloads: 0,
      hijacks: 0
    });
    assert(bhResult1.behaviorScore === 0, 'Clean page behavior score is 0');

    const bhResult2 = await behavioral.execute({
      domain: 'example.com',
      apiCounts: { fullscreen: 1, clipboard: 1, mediaDevices: 1 },
      redirects: 3,
      downloads: 1,
      hijacks: 1
    });
    assert(bhResult2.behaviorScore >= 80, 'Hostile behaviors behavior score >= 80');
    console.log('%c✅ BehavioralAnalysisEngine tests completed', 'color: #10b981; font-weight: bold;');

    // 4. AdaptiveWeightingEngine Tests
    const adaptive = new AdaptiveWeightingEngine();
    await adaptive.init();

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
    assert(adResult1.finalScore > 15, 'Untrusted domain risk score > 15');

    const adResult2 = await adaptive.execute(
      {
        behavioral: 54,
        staticHeaders: 40,
        reputation: 0,
        securityLayer: 0,
        threatIntel: 0,
        behavioralThreat: 0
      },
      { domain: 'google.com', trusted: true, threatIntelConfidence: 95 }
    );
    assert(adResult2.finalScore < 15, 'Google (trusted) risk score < 15');
    console.log('%c✅ AdaptiveWeightingEngine tests completed', 'color: #10b981; font-weight: bold;');

    // 5. ThreatProjectionEngine Tests
    const projection = new ThreatProjectionEngine();
    await projection.init();

    const projResult1 = await projection.execute({
      history: [
        { score: 10 }, { score: 15 }, { score: 20 }, { score: 30 }, { score: 40 }
      ],
      currentScore: 50
    });
    assert(projResult1.trend30d === 'INCREASING', 'Trend is INCREASING');
    console.log('%c✅ ThreatProjectionEngine tests completed', 'color: #10b981; font-weight: bold;');

    // 6. GraphEngine Tests
    const graph = new GraphEngine();
    await graph.init();

    await graph.execute({ source: 'example.com', target: 'tracker.com', sourceType: 'Website', targetType: 'Tracker' });
    await graph.execute({ source: 'example.com', target: 'google-analytics.com', sourceType: 'Website', targetType: 'Tracker' });
    await graph.execute({ source: 'another.com', target: 'tracker.com', sourceType: 'Website', targetType: 'Tracker' });

    const graphData = graph.exportGraph();
    assert(graphData.nodes.length >= 4, 'Graph contains website and tracker nodes');
    
    await graph.computePageRank(10);
    const trackerNode = graph.nodes.get('tracker.com');
    assert(trackerNode.pagerank > 0, 'PageRank calculated successfully');
    console.log('%c✅ GraphEngine tests completed', 'color: #10b981; font-weight: bold;');

    console.log(' ');
    console.log('============================================================');
    console.log(`%cResults: All ${assertions.length} browser assertions passed successfully!`, 'color: #10b981; font-weight: bold;');
    console.log('%c✅ All browser tests passed!', 'font-weight: bold; color: #10b981; font-size: 14px;');

  } catch (err) {
    console.error('%c❌ Browser unit tests failed during execution:', 'color: #ef4444; font-weight: bold;', err);
  }
})();

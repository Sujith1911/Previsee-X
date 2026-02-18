/**
 * PRIVISEE-X Behavioral Analyzer
 * Time-series analysis and cross-site correlation
 * 
 * Detects:
 * - Tracking pattern changes over time
 * - Cross-site tracker correlation
 * - User profiling attempts
 */

class BehavioralAnalyzer {
  constructor() {
    this.baselineWindow = 100; // Sites for baseline calculation
    this.trackerHistory = new Map(); // domain -> Array of tracker data over time
  }

  /**
   * Analyze behavioral patterns for a site
   * @param {Object} currentSite - Current site data
   * @param {Array} historicalSites - Historical sites data
   * @returns {Object} Behavioral analysis results
   */
  analyze(currentSite, historicalSites) {
    const results = {
      timeSeriesAnalysis: null,
      crossSiteCorrelation: null,
      profilingDetection: null,
      behavioralScore: 0
    };

    // Time-series analysis
    results.timeSeriesAnalysis = this.analyzeTimeSeries(
      currentSite.domain,
      historicalSites
    );

    // Cross-site correlation
    results.crossSiteCorrelation = this.analyzeCrossSiteCorrelation(
      currentSite,
      historicalSites
    );

    // User profiling detection
    results.profilingDetection = this.detectProfiling(
      currentSite,
      historicalSites
    );

    // Calculate overall behavioral score
    results.behavioralScore = this.calculateBehavioralScore(results);

    return results;
  }

  /**
   * Analyze time-series tracking patterns
   */
  analyzeTimeSeries(domain, historicalSites) {
    // Get all historical visits for this domain
    const domainHistory = historicalSites
      .filter(site => site.domain === domain)
      .sort((a, b) => (a.lastVisit || 0) - (b.lastVisit || 0));

    if (domainHistory.length < 2) {
      return {
        hasTrend: false,
        message: 'Insufficient historical data'
      };
    }

    // Analyze trends
    const trackerCounts = domainHistory.map(site => site.trackerCount || 0);
    const cookieCounts = domainHistory.map(site => site.cookieCount || 0);

    // Calculate trends using simple linear regression
    const trackerTrend = this.calculateTrend(trackerCounts);
    const cookieTrend = this.calculateTrend(cookieCounts);

    // Detect significant changes
    const trackerChange = trackerCounts[trackerCounts.length - 1] - trackerCounts[0];
    const cookieChange = cookieCounts[cookieCounts.length - 1] - cookieCounts[0];

    const trackerChangePercent = trackerCounts[0] > 0 
      ? (trackerChange / trackerCounts[0]) * 100 
      : 0;

    const cookieChangePercent = cookieCounts[0] > 0
      ? (cookieChange / cookieCounts[0]) * 100
      : 0;

    return {
      hasTrend: true,
      visits: domainHistory.length,
      trackerTrend: {
        direction: trackerTrend > 0.1 ? 'increasing' : trackerTrend < -0.1 ? 'decreasing' : 'stable',
        slope: trackerTrend,
        changePercent: trackerChangePercent
      },
      cookieTrend: {
        direction: cookieTrend > 0.1 ? 'increasing' : cookieTrend < -0.1 ? 'decreasing' : 'stable',
        slope: cookieTrend,
        changePercent: cookieChangePercent
      },
      isAnomalous: Math.abs(trackerChangePercent) > 50 || Math.abs(cookieChangePercent) > 50
    };
  }

  /**
   * Calculate trend using simple linear regression
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    return slope;
  }

  /**
   * Analyze cross-site tracker correlation
   */
  analyzeCrossSiteCorrelation(currentSite, historicalSites) {
    if (!currentSite.trackers || currentSite.trackers.length === 0) {
      return {
        hasCorrelation: false,
        commonTrackers: []
      };
    }

    // Find trackers that appear across multiple sites
    const trackerAppearances = new Map();

    // Count appearances of each tracker
    historicalSites.forEach(site => {
      if (site.trackers) {
        site.trackers.forEach(tracker => {
          if (!trackerAppearances.has(tracker.domain)) {
            trackerAppearances.set(tracker.domain, {
              domain: tracker.domain,
              category: tracker.category,
              sites: new Set(),
              count: 0
            });
          }
          
          const data = trackerAppearances.get(tracker.domain);
          data.sites.add(site.domain);
          data.count++;
        });
      }
    });

    // Find trackers present on current site
    const currentTrackerDomains = new Set(
      currentSite.trackers.map(t => t.domain)
    );

    // Identify cross-site trackers
    const crossSiteTrackers = Array.from(trackerAppearances.values())
      .filter(tracker => 
        currentTrackerDomains.has(tracker.domain) && tracker.sites.size > 1
      )
      .sort((a, b) => b.sites.size - a.sites.size);

    // Calculate correlation score
    const totalUniqueSites = new Set(historicalSites.map(s => s.domain)).size;
    const maxPresence = crossSiteTrackers.length > 0
      ? crossSiteTrackers[0].sites.size / totalUniqueSites
      : 0;

    return {
      hasCorrelation: crossSiteTrackers.length > 0,
      commonTrackers: crossSiteTrackers.slice(0, 10).map(t => ({
        domain: t.domain,
        category: t.category,
        presentOnSites: t.sites.size,
        totalOccurrences: t.count,
        prevalence: ((t.sites.size / totalUniqueSites) * 100).toFixed(1) + '%'
      })),
      maxPresence: (maxPresence * 100).toFixed(1) + '%',
      correlationScore: maxPresence * 100
    };
  }

  /**
   * Detect user profiling behavior
   */
  detectProfiling(currentSite, historicalSites) {
    const indicators = {
      persistentTracking: false,
      fingerprintingEvolution: false,
      cookieSyncing: false,
      profilingScore: 0
    };

    // 1. Check for persistent tracking across sites
    const crossSite = this.analyzeCrossSiteCorrelation(currentSite, historicalSites);
    if (crossSite.hasCorrelation && parseFloat(crossSite.maxPresence) > 50) {
      indicators.persistentTracking = true;
      indicators.profilingScore += 30;
    }

    // 2. Check for fingerprinting evolution
    const domainHistory = historicalSites.filter(s => s.domain === currentSite.domain);
    if (domainHistory.length >= 2) {
      const fpCounts = domainHistory.map(site => {
        const fp = site.fingerprinting || {};
        return (fp.canvas || 0) + (fp.webgl || 0) + (fp.audio || 0) + (fp.fonts || 0);
      });

      const fpChange = fpCounts[fpCounts.length - 1] - fpCounts[0];
      if (fpChange > 5) {
        indicators.fingerprintingEvolution = true;
        indicators.profilingScore += 25;
      }
    }

    // 3. Check for potential cookie syncing
    // (Multiple third-party domains with cookie access)
    if (currentSite.cookies) {
      const thirdPartyCookies = currentSite.cookies.filter(c => c.isThirdParty);
      const uniqueThirdPartyDomains = new Set(thirdPartyCookies.map(c => c.domain));
      
      if (uniqueThirdPartyDomains.size > 5) {
        indicators.cookieSyncing = true;
        indicators.profilingScore += 20;
      }
    }

    // 4. Check for tracking across different categories
    if (currentSite.trackers) {
      const categories = new Set(currentSite.trackers.map(t => t.category));
      if (categories.size >= 3) {
        indicators.profilingScore += 15;
      }
    }

    return {
      ...indicators,
      isProfiled: indicators.profilingScore > 40,
      confidence: Math.min(100, indicators.profilingScore)
    };
  }

  /**
   * Calculate overall behavioral score
   */
  calculateBehavioralScore(results) {
    let score = 0;

    // Time-series contribution
    if (results.timeSeriesAnalysis && results.timeSeriesAnalysis.isAnomalous) {
      score += 25;
    }

    // Cross-site correlation contribution
    if (results.crossSiteCorrelation) {
      score += results.crossSiteCorrelation.correlationScore * 0.3;
    }

    // Profiling detection contribution
    if (results.profilingDetection) {
      score += results.profilingDetection.profilingScore * 0.45;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Get weekly trend analysis
   */
  getWeeklyTrends(historicalSites, days = 7) {
    const now = new Date();
    const trends = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // Get sites for this day
      const daySites = historicalSites.filter(site => {
        const siteDate = new Date(site.lastVisit);
        return siteDate >= date && siteDate < nextDate;
      });

      // Calculate daily metrics
    const avgRisk = daySites.length > 0
        ? daySites.reduce((sum, site) => sum + (site.riskScore || 0), 0) / daySites.length
        : 0;

      const totalTrackers = daySites.reduce((sum, site) => sum + (site.trackerCount || 0), 0);

      trends.push({
        date: date.toISOString().split('T')[0],
        sitesVisited: daySites.length,
        averageRisk: Math.round(avgRisk),
        totalTrackers: totalTrackers
      });
    }

    return trends;
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BehavioralAnalyzer;
}

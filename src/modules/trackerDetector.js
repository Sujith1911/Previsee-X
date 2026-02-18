/**
 * PRIVISEE-X Tracker Detector
 * Hybrid ML + Blocklist Classification System
 * 
 * Features:
 * - O(1) blocklist lookup via Set
 * - TensorFlow.js Random Forest classifier
 * - Feature engineering from domain/URL patterns
 * - Confidence scoring (0.0-1.0)
 * - Category classification: advertising, analytics, social, fingerprinting
 */

class TrackerDetector {
  constructor() {
    this.blocklist = new Set();
    this.categoryMap = new Map();
    this.model = null;
    this.initialized = false;
    this.featureStats = null; // For normalization
  }

  /**
   * Initialize detector with blocklist and ML model
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load tracker blocklist
      await this.loadBlocklist();
      
      // Load ML model (TensorFlow.js)
      // await this.loadMLModel(); // Commented until model is trained
      
      // Initialize feature statistics for normalization
      this.initializeFeatureStats();
      
      this.initialized = true;
      console.log('[TrackerDetector] Initialized with', this.blocklist.size, 'known trackers');
    } catch (error) {
      console.error('[TrackerDetector] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load tracker blocklist from JSON
   */
  async loadBlocklist() {
    try {
      // Try to load from local file first
      const response = await fetch(chrome.runtime.getURL('data/tracker_blocklist.json'));
      const data = await response.json();

      for (const entry of data.trackers) {
        this.blocklist.add(entry.domain);
        this.categoryMap.set(entry.domain, entry.category);
      }
    } catch (error) {
      console.warn('[TrackerDetector] Could not load blocklist, using fallback:', error);
      this.loadFallbackBlocklist();
    }
  }

  /**
   * Fallback blocklist (common trackers)
   */
  loadFallbackBlocklist() {
    const fallbackTrackers = [
      // Advertising
      { domain: 'doubleclick.net', category: 'advertising' },
      { domain: 'googleadservices.com', category: 'advertising' },
      { domain: 'googlesyndication.com', category: 'advertising' },
      { domain: 'adnxs.com', category: 'advertising' },
      { domain: 'outbrain.com', category: 'advertising' },
      { domain: 'taboola.com', category: 'advertising' },
      
      // Analytics
      { domain: 'google-analytics.com', category: 'analytics' },
      { domain: 'googletagmanager.com', category: 'analytics' },
      { domain: 'hotjar.com', category: 'analytics' },
      { domain: 'segment.com', category: 'analytics' },
      { domain: 'mixpanel.com', category: 'analytics' },
      
      // Social
      { domain: 'facebook.com', category: 'social' },
      { domain: 'facebook.net', category: 'social' },
      { domain: 'connect.facebook.net', category: 'social' },
      { domain: 'twitter.com', category: 'social' },
      { domain: 'linkedin.com', category: 'social' },
      
      // Fingerprinting
      { domain: 'fingerprintjs.com', category: 'fingerprinting' },
      { domain: 'adsrvr.org', category: 'fingerprinting' }
    ];

    for (const tracker of fallbackTrackers) {
      this.blocklist.add(tracker.domain);
      this.categoryMap.set(tracker.domain, tracker.category);
    }
  }

  /**
   * Load ML model (TensorFlow.js)
   */
  async loadMLModel() {
    try {
      // Load TensorFlow.js model
      this.model = await tf.loadLayersModel(
        chrome.runtime.getURL('models/tracker_classifier/model.json')
      );
      console.log('[TrackerDetector] ML model loaded successfully');
    } catch (error) {
      console.warn('[TrackerDetector] ML model not available:', error);
      this.model = null;
    }
  }

  /**
   * Initialize feature statistics for normalization
   */
  initializeFeatureStats() {
    // Mean and std dev for feature normalization
    this.featureStats = {
      domainLength: { mean: 15, std: 8 },
      subdomainCount: { mean: 1, std: 1 },
      pathDepth: { mean: 2, std: 2 },
      queryParams: { mean: 1, std: 2 },
      domainEntropy: { mean: 3.5, std: 0.8 }
    };
  }

  /**
   * Classify domain as tracker or not
   * @param {string} domain - Domain to classify
   * @param {string} url - Full URL
   * @param {object} context - Request context (main domain, type, etc.)
   * @returns {object} Classification result
   */
  async classify(domain, url, context = {}) {
    await this.ensureInitialized();

    // Step 1: Check blocklist (O(1) lookup)
    if (this.blocklist.has(domain)) {
      return {
        isTracker: true,
        category: this.categoryMap.get(domain) || 'unknown',
        confidence: 1.0,
        source: 'blocklist',
        domain: domain
      };
    }

    // Step 2: Filter out obvious non-trackers
    if (!context.isThirdParty) {
      return {
        isTracker: false,
        category: null,
        confidence: 0.0,
        source: 'first-party',
        domain: domain
      };
    }

    // Step 3: ML classification (if model available)
    if (this.model) {
      const mlResult = await this.classifyWithML(domain, url, context);
      if (mlResult.confidence > 0.7) {
        return {
          ...mlResult,
          isTracker: true,
          source: 'ml',
          domain: domain
        };
      }
    }

    // Step 4: Heuristic-based classification
    const heuristicResult = this.classifyWithHeuristics(domain, url, context);
    return {
      ...heuristicResult,
      domain: domain
    };
  }

  /**
   * ML-based classification using TensorFlow.js
   */
  async classifyWithML(domain, url, context) {
    try {
      // Extract features
      const features = this.extractFeatures(domain, url, context);
      
      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features);
      
      // Convert to tensor
      const inputTensor = tf.tensor2d([normalizedFeatures]);
      
      // Predict
      const prediction = this.model.predict(inputTensor);
      const probabilities = await prediction.data();
      
      // Get class with highest probability
      const classIndex = probabilities.indexOf(Math.max(...probabilities));
      const categories = ['advertising', 'analytics', 'social', 'fingerprinting'];
      
      inputTensor.dispose();
      prediction.dispose();
      
      return {
        category: categories[classIndex],
        confidence: probabilities[classIndex]
      };
    } catch (error) {
      console.error('[TrackerDetector] ML classification error:', error);
      return { category: 'unknown', confidence: 0.0 };
    }
  }

  /**
   * Heuristic-based classification (fallback)
   */
  classifyWithHeuristics(domain, url, context) {
    let score = 0;
    let category = 'unknown';

    // Check for advertising keywords
    const adKeywords = ['ad', 'ads', 'doubleclick', 'adserver', 'banner', 'advertis'];
    if (adKeywords.some(kw => domain.includes(kw))) {
      score += 0.6;
      category = 'advertising';
    }

    // Check for analytics keywords
    const analyticsKeywords = ['analytics', 'tracking', 'stats', 'metrics', 'tag'];
    if (analyticsKeywords.some(kw => domain.includes(kw))) {
      score += 0.5;
      category = 'analytics';
    }

    // Check for social keywords
    const socialKeywords = ['facebook', 'twitter', 'linkedin', 'social', 'share'];
    if (socialKeywords.some(kw => domain.includes(kw))) {
      score += 0.4;
      category = 'social';
    }

    // Check URL parameters for tracking
    if (url) {
      const trackingParams = ['utm_', 'fbclid', 'gclid', 'mc_', '_ga'];
      const hasTrackingParams = trackingParams.some(param => 
        url.includes(param)
      );
      if (hasTrackingParams) {
        score += 0.3;
      }
    }

    // Check for suspicious TLDs
    const suspiciousTLDs = ['.xyz', '.click', '.top', '.pw'];
    if (suspiciousTLDs.some(tld => domain.endsWith(tld))) {
      score += 0.2;
    }

    return {
      isTracker: score > 0.5,
      category: category,
      confidence: Math.min(score, 1.0),
      source: 'heuristic'
    };
  }

  /**
   * Extract features from domain and URL
   */
  extractFeatures(domain, url, context) {
    const urlObj = url ? new URL(url) : null;

    return {
      // Domain features
      domainLength: domain.length,
      subdomainCount: domain.split('.').length - 2,
      hasNumbers: /\d/.test(domain) ? 1 : 0,
      tldType: this.getTLDType(domain),
      
      // URL features
      pathDepth: urlObj ? urlObj.pathname.split('/').filter(Boolean).length : 0,
      queryParams: urlObj ? urlObj.searchParams.size : 0,
      hasTrackingParams: urlObj ? this.hasTrackingParams(urlObj) : 0,
      
      // Context features
      isThirdParty: context.isThirdParty ? 1 : 0,
      resourceType: this.encodeResourceType(context.type || 'other'),
      
      // Entropy-based
      domainEntropy: this.calculateEntropy(domain)
    };
  }

  /**
   * Normalize features using z-score
   */
  normalizeFeatures(features) {
    const normalized = [];

    // Numerical features (z-score normalization)
    normalized.push((features.domainLength - this.featureStats.domainLength.mean) / 
                    this.featureStats.domainLength.std);
    normalized.push((features.subdomainCount - this.featureStats.subdomainCount.mean) / 
                    this.featureStats.subdomainCount.std);
    normalized.push((features.pathDepth - this.featureStats.pathDepth.mean) / 
                    this.featureStats.pathDepth.std);
    normalized.push((features.queryParams - this.featureStats.queryParams.mean) / 
                    this.featureStats.queryParams.std);
    normalized.push((features.domainEntropy - this.featureStats.domainEntropy.mean) / 
                    this.featureStats.domainEntropy.std);

    // Binary features (already normalized)
    normalized.push(features.hasNumbers);
    normalized.push(features.hasTrackingParams);
    normalized.push(features.isThirdParty);

    // Categorical features (one-hot encoded)
    normalized.push(features.tldType);
    normalized.push(features.resourceType);

    return normalized;
  }

  /**
   * Get TLD type (encoded)
   */
  getTLDType(domain) {
    const tld = domain.split('.').pop();
    const commonTLDs = { 'com': 0, 'net': 1, 'org': 2, 'io': 3 };
    return commonTLDs[tld] || 4; // 4 = other
  }

  /**
   * Encode resource type
   */
  encodeResourceType(type) {
    const types = { 'script': 0, 'image': 1, 'xhr': 2, 'other': 3 };
    return types[type] || 3;
  }

  /**
   * Check if URL has tracking parameters
   */
  hasTrackingParams(urlObj) {
    const trackingParams = ['utm_', 'fbclid', 'gclid', 'mc_', '_ga', 'aff_'];
    return trackingParams.some(param => 
      Array.from(urlObj.searchParams.keys()).some(key => key.includes(param))
    ) ? 1 : 0;
  }

  /**
   * Calculate Shannon entropy of string
   */
  calculateEntropy(str) {
    const len = str.length;
    const frequencies = {};

    for (const char of str) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    let entropy = 0;
    for (const count of Object.values(frequencies)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Ensure detector is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get statistics about known trackers
   */
  getStats() {
    const categoryCount = {};
    
    for (const category of this.categoryMap.values()) {
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    }

    return {
      totalTrackers: this.blocklist.size,
      byCategory: categoryCount,
      mlModelAvailable: this.model !== null
    };
  }
}

// Export for use in background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrackerDetector;
}

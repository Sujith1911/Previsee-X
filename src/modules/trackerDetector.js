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
   * Load ML model (Custom Random Forest JSON)
   */
  async loadMLModel() {
    try {
      const response = await fetch(chrome.runtime.getURL('models/tracker_classifier/model.json'));
      this.model = await response.json();
      console.log(`[TrackerDetector] Loaded Random Forest with ${this.model.n_estimators} trees`);
    } catch (error) {
      console.warn('[TrackerDetector] ML model not available:', error);
      this.model = null;
    }
  }

  /**
   * ML-based classification using Random Forest
   */
  async classifyWithML(domain, url, context) {
    if (!this.model) return { category: 'unknown', confidence: 0.0 };

    try {
      const features = this.extractFeatures(domain, url, context);
      const vector = this.vectorizeFeatures(features);
      
      // Vote across all trees
      const votes = new Array(this.model.classes.length).fill(0);
      
      for (const tree of this.model.trees) {
        const classIdx = this.traverseTree(tree, vector);
        votes[classIdx]++;
      }

      // Calculate probabilities
      const totalVotes = this.model.n_estimators;
      const probabilities = votes.map(v => v / totalVotes);
      
      // Get best class
      const maxProb = Math.max(...probabilities);
      const classIndex = probabilities.indexOf(maxProb);
      const category = this.model.classes[classIndex];

      return {
        category: category,
        confidence: maxProb
      };
    } catch (error) {
      console.error('[TrackerDetector] ML classification error:', error);
      return { category: 'unknown', confidence: 0.0 };
    }
  }

  /**
   * Traverse a single decision tree
   */
  traverseTree(tree, features) {
    let nodeId = 0; // Root node
    const maxDepth = 20; // Safety break
    let depth = 0;

    while (depth < maxDepth) {
      const leftChild = tree.children_left[nodeId];
      const rightChild = tree.children_right[nodeId];

      // If leaf node (children are -1)
      if (leftChild === -1 && rightChild === -1) {
        // Return class with highest value in leaf
        const values = tree.values[nodeId];
        // values is an array of counts/probabilities per class
        // We want the index of the max value
        if (Array.isArray(values)) {
            let maxVal = -1;
            let maxIdx = 0;
            for (let i = 0; i < values.length; i++) {
                if (values[i] > maxVal) {
                    maxVal = values[i];
                    maxIdx = i;
                }
            }
            return maxIdx;
        }
        return 0; // Fallback
      }

      // Decision node
      const featureIdx = tree.features[nodeId];
      const threshold = tree.thresholds[nodeId];

      if (features[featureIdx] <= threshold) {
        nodeId = leftChild;
      } else {
        nodeId = rightChild;
      }
      depth++;
    }
    return 0; // Fallback
  }

  /**
   * Convert feature object to array (vector)
   * Order MUST match training:
   * domainLength, subdomainCount, hasNumbers, tldType,
   * pathDepth, queryParams, hasTrackingParams, isThirdParty,
   * resourceType, domainEntropy, tokenCount, digitRatio, specialCharRatio
   */
  vectorizeFeatures(features) {
    return [
      features.domainLength,
      features.subdomainCount,
      features.hasNumbers,
      features.tldType,
      features.pathDepth,
      features.queryParams,
      features.hasTrackingParams,
      features.isThirdParty,
      features.resourceType,
      features.domainEntropy,
      features.tokenCount,
      features.digitRatio,
      features.specialCharRatio
    ];
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
   * Matches Python implementation in build_dataset.py
   */
  extractFeatures(domain, url, context) {
    const urlObj = url ? new URL(url) : null;
    const path = urlObj ? urlObj.pathname : '';
    const query = urlObj ? urlObj.search : '';

    // Calculate ratios
    const digits = (domain.match(/\d/g) || []).length;
    const special = (domain.match(/[^a-zA-Z0-9.]/g) || []).length;
    const len = Math.max(domain.length, 1);

    return {
      // 13 Features matching training data
      domainLength: domain.length,
      subdomainCount: Math.max(0, domain.split('.').length - 2),
      hasNumbers: /\d/.test(domain) ? 1 : 0,
      tldType: this.getTLDType(domain),
      pathDepth: path.split('/').filter(Boolean).length,
      queryParams: urlObj ? new URLSearchParams(query).size : 0,
      hasTrackingParams: urlObj ? this.hasTrackingParams(urlObj) : 0,
      isThirdParty: context.isThirdParty ? 1 : 0,
      resourceType: this.encodeResourceType(context.type || 'other'),
      domainEntropy: this.calculateEntropy(domain),
      tokenCount: domain.split(/[-_.]/).length,
      digitRatio: parseFloat((digits / len).toFixed(4)),
      specialCharRatio: parseFloat((special / len).toFixed(4))
    };
  }

  /**
   * Calculate Shannon entropy of string
   */
  calculateEntropy(str) {
    if (!str) return 0;
    const len = str.length;
    const frequencies = {};
    for (const char of str) frequencies[char] = (frequencies[char] || 0) + 1;
    
    let entropy = 0;
    for (const count of Object.values(frequencies)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return parseFloat(entropy.toFixed(4));
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

/**
 * PRIVISEE-X v2.0
 * Utilities: FeatureUtils
 * 
 * Helper functions for extracting features from domains/URLs for ML models.
 * Ensures consistent feature extraction across training (Python) and inference (JS).
 */

export const FeatureUtils = {
  /**
   * Calculate Shannon entropy of a string
   * @param {string} str 
   * @returns {number} Entropy value
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
  },

  /**
   * Encode TLD type
   * Matches Python training: com=0, net=1, org=2, io=3, other=4
   */
  getTLDType(domain) {
    const tld = domain.split('.').pop();
    const commonTLDs = { 'com': 0, 'net': 1, 'org': 2, 'io': 3 };
    return commonTLDs[tld] !== undefined ? commonTLDs[tld] : 4;
  },

  /**
   * Encode resource type
   * Matches Python training: script=0, image=1, xhr=2, other=3
   */
  encodeResourceType(type) {
    const types = { 'script': 0, 'image': 1, 'xhr': 2, 'other': 3 };
    return types[type] !== undefined ? types[type] : 3;
  },

  /**
   * Check for known tracking parameters in URL
   */
  hasTrackingParams(urlObj) {
    if (!urlObj) return 0;
    const trackingParams = ['utm_', 'fbclid', 'gclid', 'mc_', '_ga', 'aff_'];
    return trackingParams.some(param => 
      Array.from(urlObj.searchParams.keys()).some(key => key.includes(param))
    ) ? 1 : 0;
  },

  /**
   * Calculate ratios (digits, special chars)
   */
  calculateRatios(domain) {
    const len = Math.max(domain.length, 1);
    const digits = (domain.match(/\d/g) || []).length;
    const special = (domain.match(/[^a-zA-Z0-9.]/g) || []).length;
    
    return {
      digitRatio: parseFloat((digits / len).toFixed(4)),
      specialCharRatio: parseFloat((special / len).toFixed(4))
    };
  },

  /**
   * Extract complete 13-feature vector for TrackerDetector
   * Order MUST match ML training schema
   */
  extractRequestFeatures(domain, url, context) {
    const urlObj = url ? new URL(url) : null;
    const path = urlObj ? urlObj.pathname : '';
    const query = urlObj ? urlObj.search : '';
    const ratios = this.calculateRatios(domain);

    // 13 Features matching training data
    return [
      domain.length,                                      // domainLength
      Math.max(0, domain.split('.').length - 2),          // subdomainCount
      /\d/.test(domain) ? 1 : 0,                          // hasNumbers
      this.getTLDType(domain),                            // tldType
      path.split('/').filter(Boolean).length,             // pathDepth
      urlObj ? new URLSearchParams(query).size : 0,       // queryParams
      this.hasTrackingParams(urlObj),                     // hasTrackingParams
      context.isThirdParty ? 1 : 0,                       // isThirdParty
      this.encodeResourceType(context.type || 'other'),   // resourceType
      this.calculateEntropy(domain),                      // domainEntropy
      domain.split(/[-_.]/).length,                       // tokenCount
      ratios.digitRatio,                                  // digitRatio
      ratios.specialCharRatio                             // specialCharRatio
    ];
  }
};

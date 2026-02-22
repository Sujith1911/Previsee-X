/**
 * PRIVISEE-X v3.0
 * Risk: BehavioralDNA
 *
 * Generates a per-site Behavioral Signature and hashes it for:
 *   1. Cross-session site identity tracking
 *   2. Similarity comparison against known malicious clusters
 *   3. Research export
 *
 * Behavioral signature captures:
 *   - Third-party script domains
 *   - Browser API usage (canvas, webgl, audio, fonts, webrtc, battery, storage)
 *   - Network calls (fetch, XHR, WebSocket)
 *   - Fingerprinting intensity cluster (none | light | heavy)
 *
 * Similarity uses cosine distance on the API usage vector against
 * pre-seeded cluster centroids for known tracker / phishing patterns.
 */

'use strict';

// Known malicious cluster centroids (normalized API usage vectors)
// Each centroid is { canvas, webgl, audio, fonts, webrtc, battery, localStorage, clipboard }
// Values on 0–1 scale (1 = high usage)
const KNOWN_CLUSTERS = [
  {
    name: 'heavy_fingerprinter',
    centroid: { canvas: 0.9, webgl: 0.8, audio: 0.7, fonts: 0.8, webrtc: 0.6, battery: 0.5, localStorage: 0.3, clipboard: 0.1 },
    riskBoost: 25
  },
  {
    name: 'tracker_analytics',
    centroid: { canvas: 0.3, webgl: 0.1, audio: 0.0, fonts: 0.2, webrtc: 0.0, battery: 0.0, localStorage: 0.7, clipboard: 0.0 },
    riskBoost: 15
  },
  {
    name: 'data_exfiltrator',
    centroid: { canvas: 0.4, webgl: 0.2, audio: 0.1, fonts: 0.3, webrtc: 0.3, battery: 0.2, localStorage: 0.8, clipboard: 0.7 },
    riskBoost: 30
  },
  {
    name: 'clean_site',
    centroid: { canvas: 0.05, webgl: 0.0, audio: 0.0, fonts: 0.05, webrtc: 0.0, battery: 0.0, localStorage: 0.1, clipboard: 0.0 },
    riskBoost: 0
  }
];

const VECTOR_KEYS = ['canvas', 'webgl', 'audio', 'fonts', 'webrtc', 'battery', 'localStorage', 'clipboard'];
const MAX_VALS     = { canvas: 20, webgl: 10, audio: 10, fonts: 50, webrtc: 5, battery: 3, localStorage: 30, clipboard: 5 };

/**
 * Build a behavioral signature for a site session
 * @param {object} apiCounts   - { canvas, webgl, audio, fonts, webrtc, battery, localStorage, clipboard }
 * @param {object} networkInfo - { fetchCount, xhrCount, wsCount, thirdPartyDomains: string[] }
 */
function buildSignature(apiCounts = {}, networkInfo = {}) {
  const sig = {
    apiUsage: {
      canvas:      apiCounts.canvas      || 0,
      webgl:       apiCounts.webgl       || 0,
      audio:       apiCounts.audio       || 0,
      fonts:       apiCounts.fonts       || 0,
      webrtc:      apiCounts.webrtc      || 0,
      battery:     apiCounts.battery     || 0,
      localStorage: apiCounts.localStorage || 0,
      clipboard:   apiCounts.clipboard   || 0
    },
    network: {
      fetchCount:       networkInfo.fetchCount       || 0,
      xhrCount:         networkInfo.xhrCount         || 0,
      wsCount:          networkInfo.wsCount          || 0,
      thirdPartyDomains: networkInfo.thirdPartyDomains || []
    },
    fingerprintCluster: classifyFingerprintIntensity(apiCounts)
  };

  return sig;
}

/**
 * Classify fingerprint intensity from API usage
 */
function classifyFingerprintIntensity(counts = {}) {
  const total = (counts.canvas || 0) + (counts.webgl || 0) + (counts.audio || 0) + (counts.fonts || 0) + (counts.webrtc || 0);
  if (total === 0)   return 'none';
  if (total <= 3)    return 'light';
  if (total <= 10)   return 'moderate';
  return 'heavy';
}

/**
 * Compute a simple hash string from a signature (FNV-1a style, 32-bit)
 * Not cryptographic — used for identity/change detection only.
 */
function hashSignature(signature) {
  const str = JSON.stringify({
    api:     signature.apiUsage,
    cluster: signature.fingerprintCluster,
    domains: signature.network.thirdPartyDomains.sort()
  });

  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0; // 32-bit unsigned
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Normalize API counts to a [0,1] vector
 */
function normalize(apiUsage) {
  const vec = {};
  for (const key of VECTOR_KEYS) {
    vec[key] = Math.min(1, (apiUsage[key] || 0) / (MAX_VALS[key] || 1));
  }
  return vec;
}

/**
 * Cosine similarity between two normalized vectors
 */
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const key of VECTOR_KEYS) {
    dot  += (a[key] || 0) * (b[key] || 0);
    magA += (a[key] || 0) ** 2;
    magB += (b[key] || 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Find the closest malicious cluster and return its risk boost
 * @param {object} apiUsage - raw API counts
 * @returns {{ clusterName, similarity, riskBoost }}
 */
function matchCluster(apiUsage) {
  const normalized = normalize(apiUsage);
  let bestMatch = null;
  let bestSim   = -1;

  for (const cluster of KNOWN_CLUSTERS) {
    const sim = cosineSimilarity(normalized, cluster.centroid);
    if (sim > bestSim) {
      bestSim   = sim;
      bestMatch = cluster;
    }
  }

  return {
    clusterName: bestMatch ? bestMatch.name : 'unknown',
    similarity:  parseFloat(bestSim.toFixed(3)),
    riskBoost:   (bestSim > 0.75 && bestMatch) ? bestMatch.riskBoost : 0
  };
}

/**
 * Full analysis for one domain session
 * @param {string} domain
 * @param {object} apiCounts
 * @param {object} networkInfo
 * @returns {{ signature, hash, clusterMatch }}
 */
function analyzeDNA(domain, apiCounts, networkInfo) {
  const signature    = buildSignature(apiCounts, networkInfo);
  const hash         = hashSignature(signature);
  const clusterMatch = matchCluster(signature.apiUsage);

  return { domain, signature, hash, clusterMatch, ts: Date.now() };
}

if (typeof module !== 'undefined') module.exports = { analyzeDNA, buildSignature, hashSignature, matchCluster };

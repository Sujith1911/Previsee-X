/**
 * PRIVISEE-X v5.0 — BehavioralDNA Fingerprinting
 * Computes website security & privacy DNA profiles.
 * Runs cosine similarity matching against known centroids:
 * - Trusted News & Services
 * - Adware & Tracking Networks
 * - Phishing Proxies
 * - Malware Vectors
 */

// Vector dimensions:
// 0: Trackers Count (normalized by 30)
// 1: Cookies Count (normalized by 50)
// 2: Fingerprinting Heuristics Count (normalized by 10)
// 3: Security Headers Score (0-1, normalized from 0-100)
// 4: TLS strength (1.0 = TLS 1.3, 0.8 = TLS 1.2, 0.0 = HTTP)
// 5: Ad Count (normalized by 20)
// 6: Behavioral Anomalies (normalized by 5)
// 7: Third-Party Connections (normalized by 20)
const VECTOR_KEYS = [
  'trackers', 'cookies', 'fingerprints', 'headers', 'tls', 'ads', 'anomalies', 'connections'
];

const CLUSTER_CENTROIDS = [
  {
    name: 'Trusted Services',
    description: 'High security headers, modern TLS, very low behavioral anomalies, low tracking density.',
    vector: { trackers: 0.05, cookies: 0.10, fingerprints: 0.00, headers: 0.90, tls: 1.00, ads: 0.00, anomalies: 0.00, connections: 0.05 }
  },
  {
    name: 'Adware Network',
    description: 'High tracker count, heavy cookie density, light fingerprinting, moderate headers, high ads.',
    vector: { trackers: 0.85, cookies: 0.90, fingerprints: 0.30, headers: 0.50, tls: 0.80, ads: 0.90, anomalies: 0.20, connections: 0.80 }
  },
  {
    name: 'Phishing Cluster',
    description: 'Very low trackers, low cookies, suspicious keywords/behavior, missing HSTS/CSP, poor or missing TLS.',
    vector: { trackers: 0.02, cookies: 0.05, fingerprints: 0.10, headers: 0.10, tls: 0.10, ads: 0.00, anomalies: 0.80, connections: 0.20 }
  },
  {
    name: 'Malware Vector',
    description: 'Drive-by downloads, invalid SSL/TLS, canvas read heuristics, low ads, critical runtime anomalies.',
    vector: { trackers: 0.10, cookies: 0.05, fingerprints: 0.70, headers: 0.05, tls: 0.00, ads: 0.00, anomalies: 0.95, connections: 0.30 }
  }
];

/**
 * Generate a normalized DNA vector from active website stats
 */
export function buildDNAVector(stats = {}) {
  return {
    trackers:     Math.min(1.0, (stats.trackerCount || 0) / 30),
    cookies:      Math.min(1.0, (stats.cookieCount || 0) / 50),
    fingerprints: Math.min(1.0, (stats.fingerprintCount || 0) / 10),
    headers:      Math.min(1.0, (stats.securityHeadersScore || 0) / 100),
    tls:          stats.isHTTPS ? (stats.tlsVersion === 'TLS 1.3' ? 1.0 : 0.8) : 0.0,
    ads:          Math.min(1.0, (stats.adCount || 0) / 20),
    anomalies:    Math.min(1.0, (stats.behavioralAnomaliesCount || 0) / 5),
    connections:  Math.min(1.0, (stats.connectionsCount || 0) / 20)
  };
}

/**
 * Cosine Similarity between two vectors
 */
export function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const k of VECTOR_KEYS) {
    const valA = vecA[k] || 0;
    const valB = vecB[k] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Match a DNA vector against all target centroids
 * @param {object} vec - The normalized DNA vector
 * @returns {Array<{ name: string, similarity: number, description: string }>} Sorted matches list
 */
export function calculateSimilarityMatches(vec) {
  return CLUSTER_CENTROIDS.map(c => {
    const similarity = cosineSimilarity(vec, c.vector);
    return {
      name: c.name,
      similarity: Math.round(similarity * 100), // percentage
      description: c.description
    };
  }).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Create a simple non-cryptographic FNV-1a hash representation of a DNA vector
 */
export function generateDNAHash(vec) {
  const str = JSON.stringify(vec);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Full DNA analysis execution helper
 */
export function analyzeDNA(stats) {
  const vector = buildDNAVector(stats);
  const hash = generateDNAHash(vector);
  const matches = calculateSimilarityMatches(vector);
  
  return {
    hash,
    vector,
    matches,
    primaryMatch: matches[0] ? matches[0].name : 'Unknown'
  };
}

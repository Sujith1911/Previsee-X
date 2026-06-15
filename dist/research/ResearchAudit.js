export const RESEARCH_SCHEMA_VERSION = '5.1.0-research-audit';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fnv1aHash(value) {
  const input = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function numericStats(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) {
    return { count: 0, min: null, max: null, mean: null, median: null, stdev: null };
  }

  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const median = nums.length % 2
    ? nums[(nums.length - 1) / 2]
    : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2;
  const variance = nums.reduce((acc, value) => acc + (value - mean) ** 2, 0) / nums.length;

  return {
    count: nums.length,
    min: nums[0],
    max: nums[nums.length - 1],
    mean: round(mean),
    median: round(median),
    stdev: round(Math.sqrt(variance))
  };
}

function trendSlope(records) {
  const points = records
    .filter(item => Number.isFinite(Number(item.timestamp)) && Number.isFinite(Number(item.score)))
    .map(item => ({ x: Number(item.timestamp), y: Number(item.score) }));

  if (points.length < 2) return 0;

  const minX = Math.min(...points.map(p => p.x));
  const xs = points.map(p => (p.x - minX) / 86400000);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = points.reduce((a, p) => a + p.y, 0) / points.length;
  const numerator = points.reduce((acc, p, i) => acc + (xs[i] - meanX) * (p.y - meanY), 0);
  const denominator = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  return denominator ? round(numerator / denominator, 4) : 0;
}

function timeBounds(records) {
  const timestamps = records.map(item => Number(item.timestamp)).filter(Number.isFinite);
  if (!timestamps.length) return { firstSeen: null, lastSeen: null, spanHours: 0 };

  const firstSeen = Math.min(...timestamps);
  const lastSeen = Math.max(...timestamps);
  return {
    firstSeen,
    lastSeen,
    spanHours: round((lastSeen - firstSeen) / 3600000)
  };
}

function graphStats(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const links = Array.isArray(graph.links) ? graph.links : [];
  const trackerNodes = nodes.filter(node => node.type === 'tracker');
  const siteNodes = nodes.filter(node => node.type === 'site');
  const communities = new Set(nodes.map(node => node.community).filter(Boolean));

  return {
    nodes: nodes.length,
    links: links.length,
    siteNodes: siteNodes.length,
    trackerNodes: trackerNodes.length,
    communities: communities.size,
    density: nodes.length > 1 ? round((2 * links.length) / (nodes.length * (nodes.length - 1)), 4) : 0
  };
}

function coverageDimensions(input) {
  const history = Array.isArray(input.riskHistory) ? input.riskHistory : [];
  const blocked = Array.isArray(input.blockedRequests) ? input.blockedRequests : [];
  const staticBreakdown = Array.isArray(input.staticBreakdown) ? input.staticBreakdown : [];
  const graph = input.graph || {};
  const behavioralSignature = input.behavioralSignature || {};
  const rawHeaders = input.rawHeaders || {};

  return [
    { id: 'risk_history', label: 'Risk history samples', weight: 20, present: history.length >= 3, observed: history.length },
    { id: 'blocked_requests', label: 'Firewall event samples', weight: 15, present: blocked.length > 0, observed: blocked.length },
    { id: 'security_headers', label: 'HTTP security headers', weight: 20, present: Object.keys(rawHeaders).length > 0 || staticBreakdown.length > 0, observed: Object.keys(rawHeaders).length },
    { id: 'behavioral_signature', label: 'Behavioral API signature', weight: 20, present: Object.keys(behavioralSignature.apiCounts || behavioralSignature || {}).length > 0, observed: Object.keys(behavioralSignature.apiCounts || behavioralSignature || {}).length },
    { id: 'tracker_graph', label: 'Tracker graph topology', weight: 15, present: (graph.nodes || []).length > 0 && (graph.links || []).length > 0, observed: `${(graph.nodes || []).length}/${(graph.links || []).length}` },
    { id: 'explainability', label: 'Explainability evidence', weight: 10, present: !!input.explainability, observed: input.explainability?.evidenceCount || 0 }
  ];
}

export function buildResearchAudit(input = {}) {
  const riskHistory = Array.isArray(input.riskHistory) ? input.riskHistory : [];
  const blockedRequests = Array.isArray(input.blockedRequests) ? input.blockedRequests : [];
  const dimensions = coverageDimensions(input);
  const possibleWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const observedWeight = dimensions.reduce((sum, item) => sum + (item.present ? item.weight : 0), 0);
  const riskScores = riskHistory.map(item => item.score);
  const time = timeBounds(riskHistory);
  const canonicalPayload = {
    domain: input.domain || 'unknown',
    riskHistory,
    blockedRequests,
    graph: input.graph || {},
    staticBreakdown: input.staticBreakdown || [],
    behavioralSignature: input.behavioralSignature || {},
    riskLifecycle: input.riskLifecycle || null,
    explainability: input.explainability || null
  };

  return {
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    domain: input.domain || 'unknown',
    integrity: {
      algorithm: 'fnv1a-32-stable-json',
      hash: fnv1aHash(stableStringify(canonicalPayload)),
      canonicalBytes: stableStringify(canonicalPayload).length
    },
    dataQuality: {
      coverageScore: Math.round((observedWeight / possibleWeight) * 100),
      dimensions,
      limitations: dimensions.filter(item => !item.present).map(item => item.label)
    },
    sampling: {
      riskHistory: {
        ...time,
        ...numericStats(riskScores),
        slopePerDay: trendSlope(riskHistory)
      },
      blockedRequests: {
        count: blockedRequests.length,
        uniqueDomains: new Set(blockedRequests.map(item => item.domain).filter(Boolean)).size,
        typeCounts: blockedRequests.reduce((acc, item) => {
          const key = item.type || 'unknown';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {})
      },
      graph: graphStats(input.graph)
    },
    lifecycle: input.riskLifecycle ? {
      currentScore: input.riskLifecycle.currentScore,
      confidence: input.riskLifecycle.confidence,
      trend: input.riskLifecycle.trend,
      dominantWindow: input.riskLifecycle.dominantWindow,
      recommendedAction: input.riskLifecycle.recommendedAction,
      nextReviewAt: input.riskLifecycle.nextReviewAt
    } : null,
    reproducibility: {
      localOnly: true,
      networkTransmission: false,
      notes: [
        'Scores are computed locally from browser-observed events.',
        'Coverage score indicates measurement completeness, not safety.',
        'Integrity hash changes whenever included evidence changes.'
      ]
    }
  };
}

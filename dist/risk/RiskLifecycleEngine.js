export const RISK_WINDOWS = Object.freeze([
  { id: '24h', label: 'Immediate', days: 1 },
  { id: '7d', label: 'Short Term', days: 7 },
  { id: '30d', label: 'Trend', days: 30 },
  { id: '90d', label: 'Baseline', days: 90 }
]);

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function statsFor(records) {
  const scores = records.map(item => Number(item.score)).filter(Number.isFinite);
  if (!scores.length) {
    return { count: 0, avg: null, min: null, max: null, volatility: 0 };
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, score) => acc + (score - avg) ** 2, 0) / scores.length;

  return {
    count: scores.length,
    avg: clampScore(avg),
    min: Math.min(...scores),
    max: Math.max(...scores),
    volatility: round(Math.sqrt(variance))
  };
}

function slopePerDay(records) {
  const points = records
    .filter(item => Number.isFinite(Number(item.timestamp)) && Number.isFinite(Number(item.score)))
    .map(item => ({ x: Number(item.timestamp), y: Number(item.score) }));

  if (points.length < 2) return 0;

  const minX = Math.min(...points.map(point => point.x));
  const xs = points.map(point => (point.x - minX) / 86400000);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = points.reduce((a, point) => a + point.y, 0) / points.length;
  const numerator = points.reduce((acc, point, index) => acc + (xs[index] - meanX) * (point.y - meanY), 0);
  const denominator = xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  return denominator ? round(numerator / denominator, 4) : 0;
}

function trendLabel(slope) {
  if (slope >= 3) return 'RISING_FAST';
  if (slope >= 1) return 'RISING';
  if (slope <= -3) return 'FALLING_FAST';
  if (slope <= -1) return 'FALLING';
  return 'STABLE';
}

function confidenceFor(records, latestTimestamp, coverageDays) {
  if (!records.length) return 20;

  const sampleScore = Math.min(45, records.length * 6);
  const spanMs = Math.max(0, latestTimestamp - Math.min(...records.map(item => Number(item.timestamp) || latestTimestamp)));
  const spanDays = spanMs / 86400000;
  const spanScore = Math.min(35, (spanDays / coverageDays) * 35);
  const newestAgeHours = Math.max(0, (Date.now() - latestTimestamp) / 3600000);
  const recencyScore = newestAgeHours <= 24 ? 20 : newestAgeHours <= 168 ? 12 : 5;

  return Math.round(Math.max(20, Math.min(100, sampleScore + spanScore + recencyScore)));
}

function actionFor(currentScore, trend, volatility) {
  if (currentScore >= 75 || trend === 'RISING_FAST') return 'BLOCK_OR_REVIEW_BEFORE_CONTINUING';
  if (currentScore >= 50 || trend === 'RISING') return 'USE_STRICT_MODE_AND_CLEAR_SITE_DATA';
  if (volatility >= 20) return 'MONITOR_FOR_BEHAVIOR_CHANGE';
  if (currentScore >= 20) return 'ALLOW_WITH_CAUTION';
  return 'ALLOW_AND_MONITOR_PASSIVELY';
}

function nextReviewHours(currentScore, trend) {
  if (currentScore >= 75 || trend === 'RISING_FAST') return 6;
  if (currentScore >= 50 || trend === 'RISING') return 24;
  if (currentScore >= 20) return 72;
  return 168;
}

export function buildRiskLifecycle({ domain = 'unknown', currentScore = 0, history = [], components = {}, now = Date.now() } = {}) {
  const normalizedHistory = (history || [])
    .filter(item => Number.isFinite(Number(item.score)) && Number.isFinite(Number(item.timestamp)))
    .map(item => ({ ...item, score: clampScore(item.score), timestamp: Number(item.timestamp) }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const current = clampScore(currentScore);
  const latestTimestamp = normalizedHistory.at(-1)?.timestamp || now;
  const windows = {};

  for (const windowDef of RISK_WINDOWS) {
    const since = now - windowDef.days * 86400000;
    const records = normalizedHistory.filter(item => item.timestamp >= since);
    const windowStats = statsFor(records);
    const slope = slopePerDay(records);
    windows[windowDef.id] = {
      ...windowDef,
      ...windowStats,
      slopePerDay: slope,
      trend: trendLabel(slope)
    };
  }

  const baseline = windows['90d'];
  const shortTerm = windows['7d'];
  const immediate = windows['24h'];
  const deltaFromLast = normalizedHistory.length ? current - normalizedHistory.at(-1).score : 0;
  const deltaFromBaseline = baseline.avg === null ? 0 : current - baseline.avg;
  const confidence = confidenceFor(normalizedHistory, latestTimestamp, 90);
  const dominantWindow = current >= 70 || Math.abs(deltaFromLast) >= 15 ? '24h' : shortTerm.count >= 3 ? '7d' : baseline.count >= 5 ? '90d' : 'current';
  const trend = windows['30d'].trend !== 'STABLE' ? windows['30d'].trend : shortTerm.trend;
  const volatility = Math.max(immediate.volatility || 0, shortTerm.volatility || 0, baseline.volatility || 0);
  const reviewHours = nextReviewHours(current, trend);

  return {
    domain,
    generatedAt: new Date(now).toISOString(),
    currentScore: current,
    windows,
    deltas: {
      fromLastVisit: Math.round(deltaFromLast),
      from90dBaseline: Math.round(deltaFromBaseline)
    },
    confidence,
    volatility,
    trend,
    dominantWindow,
    recommendedAction: actionFor(current, trend, volatility),
    nextReviewAt: new Date(now + reviewHours * 3600000).toISOString(),
    retentionPolicy: {
      activeWindows: RISK_WINDOWS.map(item => item.id),
      recommendedHistoryDays: 90,
      rationale: '24h catches immediate behavior, 7d catches short-term patterns, 30d drives trend, 90d provides baseline without retaining excessive history.'
    },
    components: {
      behavioral: components.behavioral ?? null,
      static: components.static ?? null,
      reputation: components.reputation ?? null,
      security: components.security ?? null,
      threatIntel: components.threatIntel ?? null,
      behavioralThreat: components.behavioralThreat ?? null
    }
  };
}

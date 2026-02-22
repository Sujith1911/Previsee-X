/**
 * PRIVISEE-X v3.0
 * Risk: ThreatProjectionEngine
 *
 * Computes a 30-day forward risk trajectory using:
 *   1. Exponential Moving Average (EMA) on historical risk scores
 *   2. Behavioral DNA cluster match bonus
 *   3. Time-decay weighting (recent visits count more)
 *
 * Output:
 *   projectedRiskIn30Days: number (0–100)
 *   confidence:            'LOW' | 'MEDIUM' | 'HIGH'
 *   trend:                 'STABLE' | 'INCREASING' | 'DECREASING'
 *   driverFactors:         string[]
 *   message:               string
 */

'use strict';

const EMA_ALPHA      = 0.3;  // Smoothing factor — higher = more weight on recent
const MIN_HISTORY    = 2;    // Minimum history entries for HIGH confidence
const MEDIUM_HISTORY = 5;    // Threshold for MEDIUM confidence

/**
 * Compute EMA of a time-ordered score array (oldest to newest)
 */
function computeEMA(scores) {
  if (!scores.length) return 0;
  let ema = scores[0];
  for (let i = 1; i < scores.length; i++) {
    ema = EMA_ALPHA * scores[i] + (1 - EMA_ALPHA) * ema;
  }
  return ema;
}

/**
 * Detect trend direction compared to an older window
 */
function detectTrend(scores) {
  if (scores.length < 2) return 'STABLE';
  const midpoint  = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, midpoint);
  const secondHalf = scores.slice(midpoint);
  const avgFirst  = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const delta     = avgSecond - avgFirst;
  if (delta > 5)  return 'INCREASING';
  if (delta < -5) return 'DECREASING';
  return 'STABLE';
}

/**
 * Project future risk for a domain
 * @param {object} params
 * @param {Array}  params.history       - [{ ts, score, staticScore, behavioralScore }] oldest first
 * @param {object} params.clusterMatch  - { clusterName, similarity, riskBoost } from BehavioralDNA
 * @param {number} params.currentScore  - latest computed risk score
 * @returns {ProjectionResult}
 */
function project({ history = [], clusterMatch = {}, currentScore = 0 }) {
  const scores = history.map(h => h.score || 0);
  const driverFactors = [];

  // Base projection: EMA of history or current score if no history
  let projected = scores.length >= MIN_HISTORY
    ? computeEMA(scores)
    : currentScore;

  const trend = detectTrend(scores);

  // Trend modifiers
  if (trend === 'INCREASING') {
    // Extrapolate growth: use last delta as forward indicator
    const recentDelta = scores.length >= 2
      ? scores[scores.length - 1] - scores[scores.length - 2]
      : 0;
    projected += recentDelta * 0.7; // 70% of last delta projected forward
    driverFactors.push('Rising risk trend over recent visits');
  } else if (trend === 'DECREASING') {
    projected *= 0.9; // 10% reduction
  }

  // Cluster match bonus
  const boost = clusterMatch.riskBoost || 0;
  if (boost > 0) {
    projected += boost * 0.5; // Half the cluster boost applied to projection
    driverFactors.push(`Behavioral pattern matches ${clusterMatch.clusterName} cluster (${(clusterMatch.similarity * 100).toFixed(0)}% similarity)`);
  }

  // Clamp
  projected = Math.round(Math.min(100, Math.max(0, projected)));

  // Confidence based on history depth
  const confidence = scores.length >= MEDIUM_HISTORY ? 'HIGH'
    : scores.length >= MIN_HISTORY ? 'MEDIUM'
    : 'LOW';

  // Add score-based drivers if not already covered
  if (currentScore >= 50 && !driverFactors.length) {
    driverFactors.push('Current risk is elevated');
  }
  if (currentScore <= 15 && scores.length < MIN_HISTORY) {
    driverFactors.push('Insufficient history for accurate projection');
  }

  // Human-readable message
  const direction = trend === 'INCREASING' ? 'increase' : trend === 'DECREASING' ? 'decrease' : 'remain stable';
  const message   = `Risk projected to ${direction} to ~${projected}/100 in 30 days (${confidence} confidence)`;

  return {
    projectedRiskIn30Days: projected,
    confidence,
    trend,
    driverFactors: driverFactors.length ? driverFactors : ['No significant risk signals detected'],
    message
  };
}

if (typeof module !== 'undefined') module.exports = { project };

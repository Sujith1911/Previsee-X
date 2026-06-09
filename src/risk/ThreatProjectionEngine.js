/**
 * PRIVISEE-X v5.0 — ThreatProjectionEngine
 * Temporal Risk Evolution & Forward Forecasting.
 * Uses Holt's Linear Trend double-exponential smoothing to forecast risk scores.
 * Computes 7, 30, and 90-day EMAs and trend directions.
 */

import { EngineBase } from '../core/EngineBase.js';

export class ThreatProjectionEngine extends EngineBase {
  constructor() {
    super('ThreatProjectionEngine');
  }

  async init() {
    await super.init();
    this.logger.info('Threat Projection Engine ready');
  }

  /**
   * Calculate risk trends and predictions based on domain history
   * @param {object} params - { history, currentScore }
   * @returns {Promise<{ trend7d: string, trend30d: string, trend90d: string, forecast7d: number, forecast30d: number, forecast90d: number, confidence: string }>}
   */
  async execute({ history = [], currentScore = 0 }) {
    const scores = (history || []).map(h => h.score || 0);
    
    // Add current score to ensure latest state is reflected
    scores.push(currentScore);

    const N = scores.length;

    // 1. Calculate EMAs for different windows
    const ema7d = this.calculateEMA(scores, 0.25); // ~7 data points window
    const ema30d = this.calculateEMA(scores, 0.06); // ~30 data points window
    const ema90d = this.calculateEMA(scores, 0.02); // ~90 data points window

    // 2. Trend Classification
    const trend7d = this.classifyTrend(scores, 7);
    const trend30d = this.classifyTrend(scores, 15);
    const trend90d = this.classifyTrend(scores, 45);

    // 3. Holt's Double Exponential Smoothing Forecast
    // Forecast 7, 30, 90 visits/days ahead
    const forecasts = this.computeHoltForecast(scores, [7, 30, 90]);

    // 4. Confidence level
    let confidence = 'LOW';
    if (N >= 15) confidence = 'HIGH';
    else if (N >= 5) confidence = 'MEDIUM';

    return {
      ema7d: Math.round(ema7d),
      ema30d: Math.round(ema30d),
      ema90d: Math.round(ema90d),
      trend7d,
      trend30d,
      trend90d,
      forecast7d: forecasts[0],
      forecast30d: forecasts[1],
      forecast90d: forecasts[2],
      confidence
    };
  }

  /**
   * Calculate Single Exponential Moving Average (EMA)
   */
  calculateEMA(scores, alpha) {
    if (!scores.length) return 0;
    let ema = scores[0];
    for (let i = 1; i < scores.length; i++) {
      ema = alpha * scores[i] + (1 - alpha) * ema;
    }
    return ema;
  }

  /**
   * Classify trend direction based on historical windows
   */
  classifyTrend(scores, windowSize) {
    const N = scores.length;
    if (N < 2) return 'STABLE';

    // Get window subset
    const recentSubset = scores.slice(-windowSize);
    if (recentSubset.length < 2) return 'STABLE';

    const midpoint = Math.floor(recentSubset.length / 2);
    const firstHalf = recentSubset.slice(0, midpoint);
    const secondHalf = recentSubset.slice(midpoint);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const delta = avgSecond - avgFirst;

    if (delta > 4.5) return 'INCREASING';
    if (delta < -4.5) return 'DECREASING';
    return 'STABLE';
  }

  /**
   * Holt's Linear Trend Double Exponential Smoothing
   * Lt = alpha * Yt + (1 - alpha) * (Lt-1 + Tt-1)
   * Tt = beta * (Lt - Lt-1) + (1 - beta) * Tt-1
   * Ft+h = Lt + h * Tt
   */
  computeHoltForecast(scores, steps = []) {
    const N = scores.length;
    const fallback = scores[N - 1] || 0;
    if (N < 3) {
      return steps.map(() => Math.round(fallback));
    }

    const alpha = 0.2; // Level smoothing
    const beta = 0.1;  // Trend smoothing

    // Initialization
    let L = scores[0];
    let T = scores[1] - scores[0];

    for (let i = 1; i < N; i++) {
      const prevL = L;
      L = alpha * scores[i] + (1 - alpha) * (L + T);
      T = beta * (L - prevL) + (1 - beta) * T;
    }

    return steps.map(h => {
      const projected = L + h * T;
      return Math.max(0, Math.min(100, Math.round(projected)));
    });
  }
}

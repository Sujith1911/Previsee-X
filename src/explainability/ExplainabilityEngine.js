/**
 * PRIVISEE-X v2.0
 * Explainability: ExplainabilityEngine
 * 
 * Demystifies the "Black Box" of AI scores.
 * Generates human-readable explanations using SHAP-like logic.
 */

import { EngineBase } from '../core/EngineBase.js';

export class ExplainabilityEngine extends EngineBase {
  constructor() {
    super('ExplainabilityEngine');
  }

  /**
   * Generate explanation for a Risk Score or Tracker decision
   * @param {object} context 
   */
  async execute(context) {
    const explanation = {
      summary: '',
      factors: []
    };

    // Tracker Explanation
    if (context.trackers && context.trackers > 0) {
      explanation.factors.push({
        type: 'negative',
        impact: 'HIGH',
        text: `${context.trackers} tracker(s) detected on this page.`
      });
    }

    // Fingerprinting
    if (context.fingerprintAttempts > 0) {
      explanation.factors.push({
        type: 'negative',
        impact: 'CRITICAL',
        text: 'Site attempted to identify your device via Canvas/Audio APIs.'
      });
    }

    // Anomaly
    if (context.isAnomalous) {
      explanation.factors.push({
        type: 'negative',
        impact: 'MODERATE',
        text: 'Site behavior is statistically unusual compared to your history.'
      });
    }

    // Security
    if (!context.isSecure) {
      explanation.factors.push({
        type: 'negative',
        impact: 'HIGH',
        text: 'Connection is not fully secure (missing headers or HTTPS).'
      });
    }

    // Summary Generation
    if (explanation.factors.length === 0) {
      explanation.summary = "This site appears safe. No significant privacy risks detected.";
    } else {
      const topFactor = explanation.factors.sort((a,b) => (a.impact === 'CRITICAL' ? -1 : 1))[0];
      explanation.summary = `Privacy risk detected primarily due to: ${topFactor.text}`;
    }

    return explanation;
  }
}

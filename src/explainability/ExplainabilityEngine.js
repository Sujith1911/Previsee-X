/**
 * PRIVISEE-X v5.0 — ExplainabilityEngine
 * Explains the adaptive, dynamic threat score.
 * Maps exact contributors (+N) matching the adaptive weighting scheme.
 */

import { EngineBase } from '../core/EngineBase.js';

export class ExplainabilityEngine extends EngineBase {
  constructor() {
    super('ExplainabilityEngine');
  }

  async init() {
    await super.init();
    this.logger.info('Explainability Engine ready');
  }

  /**
   * Explains the risk score
   * @param {object} context - {
   *   riskScore,
   *   components: { behavioral, staticHeaders, reputation, securityLayer, threatIntel, behavioralThreat },
   *   weights: { behavioral, staticHeaders, reputation, securityLayer, threatIntel, behavioralThreat },
   *   threatIntelDetails,
   *   attackSurfaceDetails,
   *   behavioralDetails,
   *   evidenceCount
   * }
   * @returns {Promise<{ summary: string, contributors: Array, confidence: number, evidenceCount: number }>}
   */
  async execute(context) {
    const {
      riskScore = 0,
      components = {},
      weights = {},
      threatIntelDetails = {},
      attackSurfaceDetails = {},
      behavioralDetails = {},
      evidenceCount = 0
    } = context;

    const contributors = [];

    // Calculate contributor values matching the weighting formula: ComponentScore * Weight
    const keysMap = {
      behavioral: { label: 'Tracking Ecosystem', desc: 'Standard JavaScript trackers and third-party cookies' },
      staticHeaders: { label: 'Attack Surface Weakness', desc: 'Missing browser security headers (CSP, HSTS, XFO)' },
      reputation: { label: 'Domain Reputation', desc: 'DNA cluster mapping and PageRank centrality score' },
      securityLayer: { label: 'Security Layer Risk', desc: 'Weak SSL/TLS cipher suites or invalid certificates' },
      threatIntel: { label: 'Threat Intelligence Heuristics', desc: 'Suspicious registrar, young domain, or blocklist match' },
      behavioralThreat: { label: 'Behavioral Anomalies', desc: 'Unsolicited downloads, clipboard writes, or tab redirects' }
    };

    for (const [key, meta] of Object.entries(keysMap)) {
      const compScore = components[key] || 0;
      const weight = weights[key] || 0;
      const contribution = Math.round(compScore * weight);

      if (contribution > 0) {
        let impact = 'LOW';
        if (contribution >= 20) impact = 'CRITICAL';
        else if (contribution >= 12) impact = 'HIGH';
        else if (contribution >= 6) impact = 'MODERATE';

        contributors.push({
          key,
          label: meta.label,
          description: meta.desc,
          contribution,
          impact
        });
      }
    }

    // Sort contributors by highest score first
    contributors.sort((a, b) => b.contribution - a.contribution);

    // Calculate aggregate confidence
    // Average of ThreatIntel confidence and Behavioral confidence
    const confTI = threatIntelDetails.confidence || 50;
    const confBH = behavioralDetails.confidence || 50;
    const confAS = attackSurfaceDetails.score ? 85 : 50; // High confidence if headers audited
    const confidence = Math.round((confTI + confBH + confAS) / 3);

    // Generate narrative summary
    const summary = this.generateSummary(riskScore, contributors, threatIntelDetails, attackSurfaceDetails);

    return {
      summary,
      contributors,
      confidence: Math.max(10, Math.min(100, confidence)),
      evidenceCount
    };
  }

  /**
   * Helper: Generate descriptive text narrative
   */
  generateSummary(riskScore, contributors, threatIntelDetails, attackSurfaceDetails) {
    if (riskScore <= 15) {
      return 'No active threat markers detected. The website maintains a clean security profile and respects privacy policies.';
    }

    const primary = contributors[0];
    let text = `Site evaluated with a threat level of ${riskScore}/100. `;

    if (primary) {
      text += `The primary risk contributor is ${primary.label} (+${primary.contribution} pts), primarily due to `;
      if (primary.key === 'threatIntel' && threatIntelDetails.indicators?.length) {
        text += `${threatIntelDetails.indicators[0].toLowerCase()}.`;
      } else if (primary.key === 'staticHeaders' && attackSurfaceDetails.issues?.length) {
        text += `${attackSurfaceDetails.issues[0].label.toLowerCase()}.`;
      } else {
        text += `${primary.description.toLowerCase()}.`;
      }
    }

    // Add recommendation
    if (riskScore >= 70) {
      text += ' Recommendation: Avoid logging in or entering credentials. Leave this site immediately.';
    } else if (riskScore >= 40) {
      text += ' Recommendation: Exercise caution with sensitive data submissions on this domain.';
    } else {
      text += ' Recommendation: Standard browsing is safe, but tracking blocking is recommended.';
    }

    return text;
  }
}

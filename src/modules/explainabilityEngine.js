/**
 * PRIVISEE-X Explainability Engine
 * SHAP-like Feature Importance for Risk Scores
 * 
 * Provides human-readable explanations for why a site has a specific risk score
 * 
 * Features:
 * - Feature importance calculation (marginal contribution)
 * - Ranked explanations
 * - Plain-language templates
 * - Actionable recommendations
 */

class ExplainabilityEngine {
  constructor(riskEngine) {
    this.riskEngine = riskEngine;
    this.templates = this.initializeTemplates();
  }

  /**
   * Explain why a site has a specific risk score
   * @param {object} siteData - Site data
   * @param {object} riskResult - Result from RiskEngine
   * @param {object} anomalyResult - Result from AnomalyDetector
   * @returns {object} Explanation with reasons and recommendations
   */
  async explainRisk(siteData, riskResult, anomalyResult = null) {
    // Calculate feature contributions (marginal importance)
    const contributions = this.calculateContributions(riskResult.breakdown);

    // Rank contributions by absolute value
    const ranked = Object.entries(contributions)
      .filter(([, value]) => value > 5) // Only significant contributions
      .sort((a, b) => b[1] - a[1]);

    // Generate explanations
    const reasons = this.generateReasons(ranked, siteData, anomalyResult);

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskResult, siteData);

    // Create summary
    const summary = this.createSummary(riskResult.level, reasons.length);

    return {
      summary,
      level: riskResult.level,
      score: riskResult.score,
      reasons,
      recommendations,
      contributions: Object.fromEntries(ranked)
    };
  }

  /**
   * Calculate feature contributions from breakdown
   */
  calculateContributions(breakdown) {
    const contributions = {};

    for (const [feature, data] of Object.entries(breakdown)) {
      contributions[feature] = data.contribution;
    }

    return contributions;
  }

  /**
   * Generate human-readable reasons
   */
  generateReasons(ranked, siteData, anomalyResult) {
    const reasons = [];

    for (const [feature, contribution] of ranked.slice(0, 5)) { // Top 5
      const template = this.templates[feature];
      if (template) {
        const reason = template.generate(contribution, siteData, anomalyResult);
        reasons.push({
          feature,
          contribution: Math.round(contribution),
          icon: template.icon,
          severity: template.severity,
          message: reason
        });
      }
    }

    return reasons;
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(riskResult, siteData) {
    const recommendations = [];

    // Based on risk level
    if (riskResult.score >= 75) {
      recommendations.push({
        priority: 'critical',
        action: 'Consider avoiding this site or using it in incognito mode',
        icon: '🛡️'
      });
    } else if (riskResult.score >= 50) {
      recommendations.push({
        priority: 'high',
        action: 'Use tracker blocking and clear cookies after visiting',
        icon: '🔒'
      });
    }

    // Cookie-specific recommendations
    if (riskResult.breakdown.cookies?.score > 50) {
      recommendations.push({
        priority: 'medium',
        action: 'Enable "Block third-party cookies" in browser settings',
        icon: '🍪'
      });
    }

    // Fingerprinting recommendations
    if (riskResult.breakdown.fingerprinting?.score > 50) {
      recommendations.push({
        priority: 'medium',
        action: 'Consider using anti-fingerprinting extensions',
        icon: '🔍'
      });
    }

    // HTTPS recommendation
    if (riskResult.breakdown.https?.score > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'NEVER enter sensitive information on this site (no HTTPS)',
        icon: '⚠️'
      });
    }

    return recommendations;
  }

  /**
   * Create summary message
   */
  createSummary(level, reasonCount) {
    const templates = {
      'Critical': `⚠️ CRITICAL privacy risk detected`,
      'High': `🔴 HIGH privacy risk detected`,
      'Moderate': `🟡 MODERATE privacy risk detected`,
      'Low': `🟢 LOW privacy risk - relatively safe`
    };

    const base = templates[level] || 'Privacy risk assessment';
    
    if (reasonCount > 0) {
      return `${base} (${reasonCount} factor${reasonCount > 1 ? 's' : ''})`;
    }

    return base;
  }

  /**
   * Initialize explanation templates
   */
  initializeTemplates() {
    return {
      cookies: {
        icon: '🍪',
        severity: 'high',
        generate: (contribution, siteData) => {
          const count = siteData.cookies?.length || 0;
          const thirdParty = siteData.cookies?.filter(c => c.isThirdParty).length || 0;
          return `${thirdParty} third-party cookies detected (${count} total) with long lifetimes → +${Math.round(contribution)} risk`;
        }
      },

      trackers: {
        icon: '🎯',
        severity: 'high',
        generate: (contribution, siteData) => {
          const count = siteData.trackers?.size || 0;
          const categories = this.getUniqueCategories(siteData.trackers);
          return `${count} tracker(s) detected across ${categories.join(', ')} → +${Math.round(contribution)} risk`;
        }
      },

      fingerprinting: {
        icon: '🔍',
        severity: 'critical',
        generate: (contribution, siteData) => {
          const fp = siteData.fingerprinting || {};
          const techniques = [];
          if (fp.canvas > 0) techniques.push('Canvas');
          if (fp.webgl > 0) techniques.push('WebGL');
          if (fp.audio > 0) techniques.push('Audio');
          return `Active fingerprinting: ${techniques.join(', ')} → +${Math.round(contribution)} risk`;
        }
      },

      https: {
        icon: '⚠️',
        severity: 'critical',
        generate: (contribution) => {
          return `Site uses HTTP (not HTTPS) - data transmitted in plain text → +${Math.round(contribution)} risk`;
        }
      },

      thirdParty: {
        icon: '🌐',
        severity: 'medium',
        generate: (contribution, siteData) => {
          const count = siteData.thirdPartyDomains?.size || 0;
          return `${count} third-party connections detected → +${Math.round(contribution)} risk`;
        }
      },

      anomaly: {
        icon: '⚡',
        severity: 'high',
        generate: (contribution, siteData, anomalyResult) => {
          if (anomalyResult && anomalyResult.explanation) {
            const topReason = anomalyResult.explanation.reasons[0];
            if (topReason) {
              return `Anomalous behavior: ${topReason.message} → +${Math.round(contribution)} risk`;
            }
          }
          return `Unusual tracking pattern detected → +${Math.round(contribution)} risk`;
        }
      },

      malicious: {
        icon: '☠️',
        severity: 'critical',
        generate: (contribution) => {
          return `Known malicious domain detected → +${Math.round(contribution)} risk`;
        }
      }
    };
  }

  /**
   * Get unique tracker categories
   */
  getUniqueCategories(trackers) {
    if (!trackers || trackers.size === 0) return [];
    
    const categories = new Set();
    for (const [, info] of trackers) {
      if (info.category) {
        categories.add(info.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Generate detailed report (for dashboard)
   */
  generateDetailedReport(siteData, riskResult, anomalyResult) {
    const explanation = this.explainRisk(siteData, riskResult, anomalyResult);

    return {
      ...explanation,
      technicalDetails: {
        cookieBreakdown: this.analyzeCookies(siteData.cookies),
        trackerBreakdown: this.analyzeTrackers(siteData.trackers),
        fingerprintingDetails: siteData.fingerprinting,
        anomalyDetails: anomalyResult
      }
    };
  }

  /**
   * Analyze cookies in detail
   */
  analyzeCookies(cookies) {
    if (!cookies || cookies.length === 0) {
      return { total: 0, firstParty: 0, thirdParty: 0, longLived: 0 };
    }

    return {
      total: cookies.length,
      firstParty: cookies.filter(c => !c.isThirdParty).length,
      thirdParty: cookies.filter(c => c.isThirdParty).length,
      longLived: cookies.filter(c => c.lifetime > 365 * 24 * 60 * 60).length,
      insecure: cookies.filter(c => !c.secure).length
    };
  }

  /**
   * Analyze trackers in detail
   */
  analyzeTrackers(trackers) {
    if (!trackers || trackers.size === 0) {
      return { total: 0, byCategory: {} };
    }

    const byCategory = {};
    for (const [, info] of trackers) {
      const cat = info.category || 'unknown';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
      total: trackers.size,
      byCategory
    };
  }
}

// Export for use in background worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExplainabilityEngine;
}

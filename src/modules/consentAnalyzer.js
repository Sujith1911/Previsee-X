/**
 * PRIVISEE-X Consent Analyzer
 * Detects dark patterns in cookie consent dialogs
 * 
 * Dark patterns detected:
 * - Pre-checked boxes
 * - Visual prominence manipulation
 * - Deceptive language
 * - Hard-to-find reject buttons
 */

class ConsentAnalyzer {
  constructor() {
    this.darkPatterns = {
      preChecked: 0,
      visualDeception: 0,
      languageDeception: 0,
      hiddenReject: 0
    };

    // Deceptive language patterns
    this.deceptivePatterns = [
      /accept all/i,
      /agree to all/i,
      /allow all/i,
      /consent to all/i,
      /i agree/i,
      // Versus less prominent alternatives
      /manage (preferences|settings)/i,
      /customize/i,
      /reject all/i
    ];

    // Visual prominence keywords
    this.prominentKeywords = [
      'accept', 'agree', 'allow', 'enable', 'ok', 'continue', 'proceed'
    ];
  }

  /**
   * Analyze consent dialog for dark patterns
   * @param {Document} document - DOM document
   * @returns {Object} Analysis results
   */
  analyze(document) {
    const results = {
      hasConsentDialog: false,
      darkPatternsDetected: [],
      darkPatternScore: 0,
      details: {}
    };

    // Find consent dialogs
    const consentElements = this.findConsentDialogs(document);
    
    if (consentElements.length === 0) {
      return results;
    }

    results.hasConsentDialog = true;

    // Analyze each consent dialog
    consentElements.forEach(element => {
      // Check for pre-checked boxes
      const preChecked = this.detectPreCheckedBoxes(element);
      if (preChecked.count > 0) {
        results.darkPatternsDetected.push('Pre-checked consent boxes');
        results.darkPatternScore += preChecked.count * 15;
        results.details.preChecked = preChecked;
      }

      // Check visual prominence
      const visualDeception = this.detectVisualProminence(element);
      if (visualDeception.score > 0) {
        results.darkPatternsDetected.push('Visually deceptive design');
        results.darkPatternScore += visualDeception.score;
        results.details.visualDeception = visualDeception;
      }

      // Check language deception
      const languageDeception = this.detectDeceptiveLanguage(element);
      if (languageDeception.score > 0) {
        results.darkPatternsDetected.push('Deceptive language');
        results.darkPatternScore += languageDeception.score;
        results.details.languageDeception = languageDeception;
      }

      // Check for hidden reject options
      const hiddenReject = this.detectHiddenReject(element);
      if (hiddenReject.isHidden) {
        results.darkPatternsDetected.push('Hidden reject option');
        results.darkPatternScore += 20;
        results.details.hiddenReject = hiddenReject;
      }
    });

    // Normalize score to 0-100
    results.darkPatternScore = Math.min(100, results.darkPatternScore);

    return results;
  }

  /**
   * Find consent dialog elements
   */
  findConsentDialogs(document) {
    const selectors = [
      '[class*="cookie"]',
      '[class*="consent"]',
      '[class*="privacy"]',
      '[class*="gdpr"]',
      '[class*="banner"]',
      '[id*="cookie"]',
      '[id*="consent"]',
      '[id*="privacy"]'
    ];

    const elements = [];
    selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          // Check if element is visible and large enough
          const rect = el.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 100) {
            elements.push(el);
          }
        });
      } catch (e) {
        // Ignore selector errors
      }
    });

    return elements;
  }

  /**
   * Detect pre-checked consent boxes
   */
  detectPreCheckedBoxes(element) {
    const checkboxes = element.querySelectorAll('input[type="checkbox"]');
    let preCheckedCount = 0;
    const details = [];

    checkboxes.forEach(checkbox => {
      if (checkbox.checked && !checkbox.required) {
        // Check if this is for optional tracking/marketing
        const label = this.getCheckboxLabel(checkbox);
        if (label && this.isTrackingConsent(label)) {
          preCheckedCount++;
          details.push({
            label: label,
            checked: true
          });
        }
      }
    });

    return {
      count: preCheckedCount,
      checkboxes: details
    };
  }

  /**
   * Get label for checkbox
   */
  getCheckboxLabel(checkbox) {
    // Try to find associated label
    if (checkbox.id) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`);
      if (label) return label.textContent;
    }

    // Try parent label
    const parentLabel = checkbox.closest('label');
    if (parentLabel) return parentLabel.textContent;

    // Try sibling elements
    const sibling = checkbox.nextElementSibling;
    if (sibling) return sibling.textContent;

    return null;
  }

  /**
   * Check if label is for tracking/marketing consent
   */
  isTrackingConsent(label) {
    const text = label.toLowerCase();
    const trackingKeywords = [
      'marketing', 'advertising', 'analytics', 'tracking',
      'personalization', 'targeting', 'measurement'
    ];

    return trackingKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Detect visual prominence manipulation
   */
  detectVisualProminence(element) {
    const buttons = element.querySelectorAll('button, a[role="button"], input[type="button"]');
    let score = 0;
    const analysis = {
      acceptButton: null,
      rejectButton: null,
      score: 0
    };

    let acceptButton = null;
    let rejectButton = null;

    buttons.forEach(button => {
      const text = button.textContent.toLowerCase();
      
      if (this.isAcceptButton(text)) {
        acceptButton = button;
      } else if (this.isRejectButton(text)) {
        rejectButton = button;
      }
    });

    if (acceptButton && rejectButton) {
      // Compare visual prominence
      const acceptStyle = window.getComputedStyle(acceptButton);
      const rejectStyle = window.getComputedStyle(rejectButton);

      // Size comparison
      const acceptSize = parseFloat(acceptStyle.fontSize);
      const rejectSize = parseFloat(rejectStyle.fontSize);
      if (acceptSize > rejectSize * 1.2) {
        score += 15;
      }

      // Color contrast (simple check)
      const acceptBg = acceptStyle.backgroundColor;
      const rejectBg = rejectStyle.backgroundColor;
      if (this.isMoreProminent(acceptBg, rejectBg)) {
        score += 15;
      }

      // Position (accept should not be first/more prominent)
      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();
      
      if (acceptButton.compareDocumentPosition(rejectButton) & Node.DOCUMENT_POSITION_FOLLOWING) {
        // Accept comes before reject
        if (Math.abs(acceptRect.top - rejectRect.top) < 10) {
          score += 10; // Same row, accept is first
        }
      }

      analysis.acceptButton = {
        text: acceptButton.textContent,
        fontSize: acceptSize,
        background: acceptBg
      };

      analysis.rejectButton = {
        text: rejectButton.textContent,
        fontSize: rejectSize,
        background: rejectBg
      };
    }

    analysis.score = score;
    return analysis;
  }

  /**
   * Check if button text indicates accept action
   */
  isAcceptButton(text) {
    return this.prominentKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if button text indicates reject action
   */
  isRejectButton(text) {
    const rejectKeywords = ['reject', 'decline', 'deny', 'refuse', 'dismiss'];
    return rejectKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check if color is more prominent (simple heuristic)
   */
  isMoreProminent(color1, color2) {
    // Very simplified - would need proper contrast calculation
    // This is a placeholder for more sophisticated color analysis
    return color1.includes('rgb') && !color2.includes('rgb');
  }

  /**
   * Detect deceptive language
   */
  detectDeceptiveLanguage(element) {
    const text = element.textContent.toLowerCase();
    let score = 0;
    const matches = [];

    // Check for aggressive accept language
    const aggressivePatterns = [
      'accept all',
      'agree to all',
      'i accept',
      'i agree'
    ];

    aggressivePatterns.forEach(pattern => {
      if (text.includes(pattern)) {
        score += 10;
        matches.push(pattern);
      }
    });

    // Check for downplayed reject language
    const downplayPatterns = [
      'manage preferences',
      'more options',
      'settings'
    ];

    const hasDownplay = downplayPatterns.some(pattern => text.includes(pattern));
    const hasAgressive = matches.length > 0;

    if (hasAgressive && hasDownplay) {
      score += 10; // Both present suggests manipulation
    }

    return {
      score,
      matchedPatterns: matches
    };
  }

  /**
   * Detect hidden reject option
   */
  detectHiddenReject(element) {
    const buttons = element.querySelectorAll('button, a[role="button"]');
    let rejectButton = null;

    buttons.forEach(button => {
      const text = button.textContent.toLowerCase();
      if (this.isRejectButton(text)) {
        rejectButton = button;
      }
    });

    if (!rejectButton) {
      return {
        isHidden: true,
        reason: 'No reject button found'
      };
    }

    // Check if reject button is hidden
    const style = window.getComputedStyle(rejectButton);
    const rect = rejectButton.getBoundingClientRect();

    const isHidden = 
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      rect.width === 0 ||
      rect.height === 0;

    return {
      isHidden,
      reason: isHidden ? 'Reject button is not visible' : null
    };
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConsentAnalyzer;
}

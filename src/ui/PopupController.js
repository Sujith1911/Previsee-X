/**
 * PRIVISEE-X v2.0
 * UI: PopupController
 * 
 * Manages the lightweight popup UI (per-tab stats).
 */

export class PopupController {
  constructor() {
    this.init();
  }

  async init() {
    const tab = await this.getCurrentTab();
    if (tab) {
        this.renderTabStats(tab);
    }
  }

  async getCurrentTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async renderTabStats(tab) {
    const domain = new URL(tab.url).hostname;
    document.getElementById('current-site').textContent = domain;
    
    // Request stats from background
    chrome.runtime.sendMessage({ action: 'GET_TAB_STATS', tabId: tab.id }, stats => {
        if (stats) {
            document.getElementById('tracker-count').textContent = stats.trackersBlocked || 0;
            document.getElementById('risk-score').textContent = stats.riskScore || 'Low';
        }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});

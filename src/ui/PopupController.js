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
    // Show content, hide loading
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    const domain = new URL(tab.url).hostname;
    const siteEl = document.getElementById('currentSite');
    if (siteEl) siteEl.textContent = domain;
    
    // Request stats from background
    chrome.runtime.sendMessage({ action: 'GET_TAB_STATS', tabId: tab.id }, stats => {
        if (stats) {
            document.getElementById('trackerCount').textContent = (stats.trackersBlocked || 0).toString();
            document.getElementById('riskScore').textContent = (stats.riskScore || 'Low').toString();
        }
    });

    // Dashboard Navigation
    document.getElementById('dashboardBtn')?.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('dashboard.html');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});

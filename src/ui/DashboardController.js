/**
 * PRIVISEE-X v2.0
 * UI: DashboardController
 * 
 * Manages the main dashboard UI.
 * Connects to background via runtime messaging or direct extension generic access.
 */

import { FeatureUtils } from '../utils/FeatureUtils.js';

export class DashboardController {
  constructor() {
    this.bg = null;
    this.init();
  }

  async init() {
    // Connect to background
    const page = chrome.extension.getBackgroundPage();
    if (page) {
        // Direct access if allowed in manifest/environment
        // In MV3 service workers, this might be restricted, so we use messaging
    }
    
    this.render();
    this.setupListeners();
  }

  setupListeners() {
    // Navigation
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('settings.html');
      }
    });

    // Actions
    document.getElementById('exportBtn')?.addEventListener('click', () => this.handleExport());
    document.getElementById('clearBtn')?.addEventListener('click', () => this.handleClear());
    document.getElementById('refreshGraph')?.addEventListener('click', () => this.render());
  }

  async handleExport() {
    // Placeholder for export functionality
    console.log('Export requested');
  }

  async handleClear() {
     if (confirm('Are you sure you want to clear all data?')) {
       // Placeholder for clear functionality
       console.log('Clear requested');
       this.render();
     }
  }

  async render() {
    // Mock rendering for v2.0 structure
    // Fetch data from StorageManager via message to background
    const data = await this.fetchData();
    this.updateRiskGauge(data.riskScore);
    this.updateGraph(data.graphNodes);
  }

  async fetchData() {
    // Send message to service worker
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'GET_DASHBOARD_DATA' }, response => {
            resolve(response || { riskScore: 85, graphNodes: [] });
        });
    });
  }

  updateRiskGauge(score) {
    const gauge = document.getElementById('risk-gauge');
    if (gauge) gauge.textContent = `${score}/100`;
  }
  
  updateGraph(nodes) {
    // D3.js logic would go here
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
});

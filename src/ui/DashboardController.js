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
    try {
        // Fetch data from StorageManager via message to background
        const data = await this.fetchData();
        this.updateRiskGauge(data.riskScore);
        this.updateGraph(data.graphNodes);
    } catch (error) {
        console.error("Render error:", error);
        document.getElementById('currentRiskLevel').textContent = "ERROR";
        document.getElementById('currentSite').textContent = "Connection failed";
    }
  }

  async fetchData() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ riskScore: 0, graphNodes: [], error: 'Timeout' });
        }, 5000); // 5s timeout

        chrome.runtime.sendMessage({ action: 'GET_DASHBOARD_DATA' }, response => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
                console.warn("Runtime error:", chrome.runtime.lastError);
                resolve({ riskScore: 0, graphNodes: [] });
            } else {
                resolve(response || { riskScore: 0, graphNodes: [] });
            }
        });
    });
  }

  updateRiskGauge(score) {
    // Update Score Text
    const scoreEl = document.getElementById('currentRiskScore');
    if (scoreEl) scoreEl.textContent = score;

    // Update Level Text
    const levelEl = document.getElementById('currentRiskLevel');
    if (levelEl) {
        let level = 'LOW';
        let color = '#10B981'; // Green
        
        if (score > 30) { level = 'MODERATE'; color = '#F59E0B'; }
        if (score > 70) { level = 'HIGH'; color = '#EF4444'; }
        
        levelEl.textContent = level;
        levelEl.style.color = color;
    }

    // Initialize Chart.js Gauge if not exists (Basic implementation)
    // Note: requires valid Chart.js setup, bypassing for now to focus on text updates
    // but clearing loading state
  }
  
  updateGraph(nodes) {
    const container = document.getElementById('graphContainer');
    if (container) {
        container.innerHTML = ''; // Clear "Building graph..."
        if (!nodes || nodes.length === 0) {
            container.innerHTML = '<div class="placeholder">No network data available</div>';
        } else {
             // Placeholder for D3 visual
             container.textContent = `${nodes.length} nodes in graph`;
        }
    }
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
});

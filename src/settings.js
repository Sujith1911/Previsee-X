/**
 * PRIVISEE-X Settings
 * Configuration interface for risk weights and features
 */

// Default configuration
const DEFAULT_CONFIG = {
  weights: {
    tracker: 0.25,
    cookie: 0.20,
    fingerprint: 0.20,
    anomaly: 0.10,
    thirdParty: 0.10
  },
  features: {
    trackerDetection: true,
    fingerprintDetection: true,
    anomalyDetection: true,
    graphIntelligence: true,
    federatedLearning: false
  },
  retentionDays: 7
};

// Current configuration
let currentConfig = { ...DEFAULT_CONFIG };

// Initialize settings page
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  updateDisplay();
});

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(['config']);
    if (stored.config) {
      currentConfig = { ...DEFAULT_CONFIG, ...stored.config };
    }
  } catch (error) {
    console.error('[Settings] Error loading settings:', error);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  try {
    await chrome.storage.local.set({ config: currentConfig });
    
    // Notify background script of changes
    await chrome.runtime.sendMessage({
      type: 'CONFIG_UPDATED',
      config: currentConfig
    });
    
    showNotification('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('[Settings] Error saving settings:', error);
    showNotification('Error saving settings', 'error');
  }
}

/**
 * Update display with current settings
 */
function updateDisplay() {
  // Weight sliders
  document.getElementById('trackerWeight').value = currentConfig.weights.tracker;
  document.getElementById('trackerWeightValue').textContent = currentConfig.weights.tracker.toFixed(2);
  
  document.getElementById('cookieWeight').value = currentConfig.weights.cookie;
  document.getElementById('cookieWeightValue').textContent = currentConfig.weights.cookie.toFixed(2);
  
  document.getElementById('fingerprintWeight').value = currentConfig.weights.fingerprint;
  document.getElementById('fingerprintWeightValue').textContent = currentConfig.weights.fingerprint.toFixed(2);
  
  document.getElementById('anomalyWeight').value = currentConfig.weights.anomaly;
  document.getElementById('anomalyWeightValue').textContent = currentConfig.weights.anomaly.toFixed(2);
  
  document.getElementById('thirdPartyWeight').value = currentConfig.weights.thirdParty;
  document.getElementById('thirdPartyWeightValue').textContent = currentConfig.weights.thirdParty.toFixed(2);

  // Feature toggles
  document.getElementById('toggleTrackerDetection').checked = currentConfig.features.trackerDetection;
  document.getElementById('toggleFingerprint').checked = currentConfig.features.fingerprintDetection;
  document.getElementById('toggleAnomaly').checked = currentConfig.features.anomalyDetection;
  document.getElementById('toggleGraph').checked = currentConfig.features.graphIntelligence;
  document.getElementById('toggleFederatedLearning').checked = currentConfig.features.federatedLearning;

  // Retention
  document.getElementById('retentionDays').value = currentConfig.retentionDays;
  document.getElementById('retentionValue').textContent = `${currentConfig.retentionDays} days`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  // Weight sliders
  const sliders = [
    { id: 'trackerWeight', key: 'tracker', display: 'trackerWeightValue' },
    { id: 'cookieWeight', key: 'cookie', display: 'cookieWeightValue' },
    { id: 'fingerprintWeight', key: 'fingerprint', display: 'fingerprintWeightValue' },
    { id: 'anomalyWeight', key: 'anomaly', display: 'anomalyWeightValue' },
    { id: 'thirdPartyWeight', key: 'thirdParty', display: 'thirdPartyWeightValue' }
  ];

  sliders.forEach(slider => {
    const element = document.getElementById(slider.id);
    element.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      currentConfig.weights[slider.key] = value;
      document.getElementById(slider.display).textContent = value.toFixed(2);
    });
  });

  // Reset weights
  document.getElementById('resetWeights').addEventListener('click', () => {
    currentConfig.weights = { ...DEFAULT_CONFIG.weights };
    updateDisplay();
    showNotification('Weights reset to defaults', 'info');
  });

  // Save weights
  document.getElementById('saveWeights').addEventListener('click', async () => {
    await saveSettings();
  });

  // Feature toggles
  const toggles = [
    { id: 'toggleTrackerDetection', key: 'trackerDetection' },
    { id: 'toggleFingerprint', key: 'fingerprintDetection' },
    { id: 'toggleAnomaly', key: 'anomalyDetection' },
    { id: 'toggleGraph', key: 'graphIntelligence' },
    { id: 'toggleFederatedLearning', key: 'federatedLearning' }
  ];

  toggles.forEach(toggle => {
    document.getElementById(toggle.id).addEventListener('change', async (e) => {
      currentConfig.features[toggle.key] = e.target.checked;
      await saveSettings();
    });
  });

  // Retention days
  document.getElementById('retentionDays').addEventListener('input', (e) => {
    const days = parseInt(e.target.value);
    currentConfig.retentionDays = days;
    document.getElementById('retentionValue').textContent = `${days} days`;
  });

  document.getElementById('retentionDays').addEventListener('change', async () => {
    await saveSettings();
  });

  // Data management
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('importData').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('clearAllData').addEventListener('click', clearAllData);
}

/**
 * Export all data
 */
async function exportData() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ALL_SITES',
      limit: 10000
    });

    if (!response || !response.success) {
      showNotification('Error exporting data', 'error');
      return;
    }

    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      config: currentConfig,
      sites: response.sites,
      metadata: {
        totalSites: response.sites.length,
        totalTrackers: response.sites.reduce((sum, s) => sum + (s.trackerCount || 0), 0)
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `privisee-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Data exported successfully!', 'success');
  } catch (error) {
    console.error('[Settings] Export error:', error);
    showNotification('Error exporting data', 'error');
  }
}

/**
 * Handle data import
 */
async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate import data
    if (!data.version || !data.sites) {
      showNotification('Invalid import file format', 'error');
      return;
    }

    // Confirm import
    if (!confirm(`Import ${data.sites.length} sites? This will merge with existing data.`)) {
      return;
    }

    // Import configuration
    if (data.config) {
      currentConfig = { ...DEFAULT_CONFIG, ...data.config };
      await saveSettings();
      updateDisplay();
    }

    // Import sites (would need to send to background)
    await chrome.runtime.sendMessage({
      type: 'IMPORT_SITES',
      sites: data.sites
    });

    showNotification(`Imported ${data.sites.length} sites successfully!`, 'success');
  } catch (error) {
    console.error('[Settings] Import error:', error);
    showNotification('Error importing data', 'error');
  }

  // Reset file input
  event.target.value = '';
}

/**
 * Clear all data
 */
async function clearAllData() {
  if (!confirm('⚠️ Are you sure you want to delete ALL privacy data?\n\nThis will permanently delete:\n• All site tracking history\n• Risk scores and analytics\n• Graph data\n\nThis action CANNOT be undone.')) {
    return;
  }

  // Double confirmation
  if (!confirm('Final confirmation: Delete all data permanently?')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_ALL'
    });

    if (response && response.success) {
      // Also clear local settings
      await chrome.storage.local.clear();
      
      showNotification('All data cleared successfully', 'success');
      
      // Reload page after 1 second
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showNotification('Error clearing data', 'error');
    }
  } catch (error) {
    console.error('[Settings] Clear data error:', error);
    showNotification('Error clearing data', 'error');
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background: ${type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 
                 type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 
                 'rgba(59, 130, 246, 0.2)'};
    border: 1px solid ${type === 'success' ? '#22c55e' : 
                        type === 'error' ? '#ef4444' : 
                        '#3b82f6'};
    border-radius: 8px;
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    z-index: 10000;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);

  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => {
      document.body.removeChild(notification);
      document.head.removeChild(style);
    }, 300);
  }, 3000);
}

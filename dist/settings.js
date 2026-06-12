/**
 * PRIVISEE-X Settings
 * Configuration interface for risk weights and features
 */

// Default configuration
const DEFAULT_CONFIG = {
  weights: {
    behavioral: 0.35,   // 35% — trackers, fingerprint, cookies (v4.0)
    static:     0.30,   // 30% — security headers, HTTP, redirects
    reputation: 0.20,   // 20% — DNA cluster, 3rd-party count
    security:   0.15    // 15% — cert warning, HSTS, mixed content
  },
  features: {
    trackerDetection:   true,
    fingerprintDetection: true,
    anomalyDetection:   true,
    graphIntelligence:  true,
    staticIntelligence: true,
    threatProjection:   true,
    certWarning:        true,    // v4.0 — CertWarningEngine
    overlayWarning:     true,    // v4.0 — WebAdvisor overlay at risk > 70
    researchMode:       false,
    strictMode:         false,
    federatedLearning:  false
  },
  retentionDays: 30
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
  // Weight sliders (v4.0 names)
  document.getElementById('trackerWeight').value = currentConfig.weights.behavioral ?? 0.35;
  document.getElementById('trackerWeightValue').textContent = (currentConfig.weights.behavioral ?? 0.35).toFixed(2);

  document.getElementById('cookieWeight').value = currentConfig.weights.static ?? 0.30;
  document.getElementById('cookieWeightValue').textContent = (currentConfig.weights.static ?? 0.30).toFixed(2);

  document.getElementById('fingerprintWeight').value = currentConfig.weights.reputation ?? 0.20;
  document.getElementById('fingerprintWeightValue').textContent = (currentConfig.weights.reputation ?? 0.20).toFixed(2);

  document.getElementById('anomalyWeight').value = currentConfig.weights.security ?? 0.15;
  document.getElementById('anomalyWeightValue').textContent = (currentConfig.weights.security ?? 0.15).toFixed(2);

  // Feature toggles
  document.getElementById('toggleTrackerDetection').checked   = currentConfig.features.trackerDetection ?? true;
  document.getElementById('toggleFingerprint').checked        = currentConfig.features.fingerprintDetection ?? true;
  document.getElementById('toggleAnomaly').checked            = currentConfig.features.anomalyDetection ?? true;
  document.getElementById('toggleGraph').checked              = currentConfig.features.graphIntelligence ?? true;
  document.getElementById('toggleStaticIntelligence').checked = currentConfig.features.staticIntelligence ?? true;
  document.getElementById('toggleThreatProjection').checked   = currentConfig.features.threatProjection ?? true;
  document.getElementById('toggleResearchMode').checked       = currentConfig.features.researchMode ?? false;
  const strictEl = document.getElementById('toggleStrictMode');
  if (strictEl) strictEl.checked = currentConfig.features.strictMode ?? false;
  document.getElementById('toggleFederatedLearning').checked  = currentConfig.features.federatedLearning ?? false;
  const certEl = document.getElementById('toggleCertWarning');
  if (certEl) certEl.checked = currentConfig.features.certWarning ?? true;
  const overlayEl = document.getElementById('toggleOverlayWarning');
  if (overlayEl) overlayEl.checked = currentConfig.features.overlayWarning ?? true;

  // Retention
  document.getElementById('retentionDays').value = currentConfig.retentionDays;
  document.getElementById('retentionValue').textContent = `${currentConfig.retentionDays} days`;

  // Load trusted domains list
  loadTrustedDomains();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Back button
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  // Weight sliders (v4.0)
  const sliders = [
    { id: 'trackerWeight',     key: 'behavioral', display: 'trackerWeightValue' },
    { id: 'cookieWeight',      key: 'static',     display: 'cookieWeightValue' },
    { id: 'fingerprintWeight', key: 'reputation', display: 'fingerprintWeightValue' },
    { id: 'anomalyWeight',     key: 'security',   display: 'anomalyWeightValue' }
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
    { id: 'toggleTrackerDetection',  key: 'trackerDetection' },
    { id: 'toggleFingerprint',        key: 'fingerprintDetection' },
    { id: 'toggleAnomaly',            key: 'anomalyDetection' },
    { id: 'toggleGraph',              key: 'graphIntelligence' },
    { id: 'toggleStaticIntelligence', key: 'staticIntelligence' },
    { id: 'toggleThreatProjection',   key: 'threatProjection' },
    { id: 'toggleCertWarning',        key: 'certWarning' },     // v4.0
    { id: 'toggleOverlayWarning',     key: 'overlayWarning' },  // v4.0
    { id: 'toggleResearchMode',       key: 'researchMode' },
    { id: 'toggleStrictMode',         key: 'strictMode' },
    { id: 'toggleFederatedLearning',  key: 'federatedLearning' }
  ];

  toggles.forEach(toggle => {
    const el = document.getElementById(toggle.id);
    if (!el) return;
    el.addEventListener('change', async (e) => {
      currentConfig.features[toggle.key] = e.target.checked;
      if (toggle.key === 'researchMode') {
        await chrome.storage.local.set({ researchModeEnabled: e.target.checked });
      }
      // Sync strictMode to background
      if (toggle.key === 'strictMode') {
        await chrome.runtime.sendMessage({ action: 'SET_STRICT_MODE', enabled: e.target.checked });
        await chrome.storage.local.set({ strictMode: e.target.checked });
      }
      await saveSettings();
    });
  });

  // Trusted Domains — clear all trust
  document.getElementById('clearAllTrust')?.addEventListener('click', async () => {
    if (!confirm('Remove trust from all trusted domains?')) return;
    await chrome.storage.local.set({ trustedDomains: {} });
    await chrome.runtime.sendMessage({ action: 'RELOAD_TRUSTED_DOMAINS' });
    showNotification('All trusted domains cleared', 'info');
    loadTrustedDomains();
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
    // Use GET_DASHBOARD_DATA which returns all sites
    const response = await chrome.runtime.sendMessage({
      action: 'GET_DASHBOARD_DATA'
    });

    if (!response || !response.success) {
      showNotification('Error exporting data', 'error');
      return;
    }

    const exportPayload = {
      version: '4.0.0',
      exportDate: new Date().toISOString(),
      config: currentConfig,
      sites: response.sites || [],
      metadata: {
        totalSites: (response.sites||[]).length,
        totalTrackers: (response.sites||[]).reduce((s, x) => s + (x.trackerCount || 0), 0),
        adsBlockedTotal: response.adsBlockedCount || 0,
        trackersBlockedTotal: response.trackersBlockedCount || 0,
        scoringWeights: { behavioral:'35%', static:'30%', reputation:'20%', securityLayer:'15%' }
      }
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
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
 * Load & display trusted domains
 */
async function loadTrustedDomains() {
  const listEl = document.getElementById('trustedDomainsList');
  if (!listEl) return;
  try {
    const store = await chrome.storage.local.get('trustedDomains');
    const trusted = store.trustedDomains || {};
    const domains = Object.keys(trusted);
    if (!domains.length) {
      listEl.innerHTML = '<span style="color:#64748b;font-size:12px">No trusted domains</span>';
      return;
    }
    listEl.innerHTML = domains.map(d => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span style="font-size:13px;flex:1">✅ ${d}</span>
        <button onclick="untrustDomain('${d}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:2px 8px;border-radius:5px;cursor:pointer;font-size:11px">Remove</button>
      </div>
    `).join('');
  } catch(e) {
    console.warn('[Settings] loadTrustedDomains error:', e);
  }
}

window.untrustDomain = async function(domain) {
  const store = await chrome.storage.local.get('trustedDomains');
  const trusted = store.trustedDomains || {};
  delete trusted[domain];
  await chrome.storage.local.set({ trustedDomains: trusted });
  await chrome.runtime.sendMessage({ action: 'UNTRUST_DOMAIN', domain });
  showNotification(`Removed trust: ${domain}`, 'info');
  loadTrustedDomains();
};

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
      action: 'CLEAR_ALL'
    });

    if (response && response.success) {
      // Preserve strictMode and trustedDomains settings, only clear data
      const kept = await chrome.storage.local.get(['strictMode','trustedDomains']);
      await chrome.storage.local.clear();
      if (Object.keys(kept).length) await chrome.storage.local.set(kept);
      showNotification('All data cleared successfully', 'success');
      setTimeout(() => window.location.reload(), 1000);
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

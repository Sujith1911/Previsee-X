/**
 * PRIVISEE-X v2.0
 * UI: PopupController - Live Data Display
 */

(async function() {
  'use strict';

  const $ = id => document.getElementById(id);

  // Helpers — thresholds match RiskEngine: LOW<20 MOD<50 HIGH<75 CRIT≥75
  function getRiskColor(score) {
    if (score >= 75) return '#ef4444';
    if (score >= 50) return '#f97316';
    if (score >= 20) return '#f59e0b';
    return '#10b981';
  }

  function getRiskLabel(score) {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH RISK';
    if (score >= 20) return 'MODERATE';
    return 'Low Risk';
  }

  // ── Render Stats ─────────────────────────────────────────────────────────────
  function render(data) {
    const { domain, riskScore = 0, trackerCount = 0, cookieCount = 0, adCount = 0, blockedAds = 0, fingerprintCount = 0 } = data;

    // Hide loading, show content
    $('loading').style.display = 'none';
    $('content').style.display = 'block';

    // Site URL
    if ($('currentSite') && domain) $('currentSite').textContent = domain;

    // Risk score
    if ($('riskScore')) {
      $('riskScore').textContent = riskScore;
      $('riskScore').style.color = getRiskColor(riskScore);
    }
    if ($('riskLevel')) {
      $('riskLevel').textContent = getRiskLabel(riskScore);
    }

    // Stats
    if ($('trackerCount')) $('trackerCount').textContent = trackerCount;
    if ($('adCount'))      $('adCount').textContent      = adCount;
    if ($('blockedAds'))   $('blockedAds').textContent   = blockedAds;
    if ($('cookieCount'))  $('cookieCount').textContent  = cookieCount;

    // Explanation
    const explEl = $('explanation');
    if (explEl) {
      const parts = [];
      if (trackerCount > 0)     parts.push(`${trackerCount} tracker${trackerCount > 1 ? 's' : ''} detected`);
      if (adCount > 0)          parts.push(`${adCount} ad${adCount > 1 ? 's' : ''} detected`);
      if (cookieCount > 0)      parts.push(`${cookieCount} cookie${cookieCount > 1 ? 's' : ''}`);
      if (blockedAds > 0)          parts.push(`${blockedAds} ad${blockedAds>1?'s':''} blocked 🚫`);
      if (fingerprintCount > 0) parts.push(`${fingerprintCount} fingerprint attempt${fingerprintCount>1?'s':''}`);

      explEl.textContent = parts.length > 0
        ? parts.join(' · ')
        : 'No privacy threats detected on this page.';
    }
  }

  // ── Fetch & Refresh ───────────────────────────────────────────────────────────
  async function fetchStats() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({}), 3000);
      try {
        chrome.runtime.sendMessage({ action: 'GET_TAB_STATS' }, (resp) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(resp || {});
        });
      } catch {
        clearTimeout(timer);
        resolve({});
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────────
  async function init() {
    // Get current tab first for domain display before data arrives
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab  = tabs[0];
      if (tab?.url && !tab.url.startsWith('chrome://')) {
        const domain = new URL(tab.url).hostname;
        if ($('currentSite')) $('currentSite').textContent = domain;
      } else {
        // Internal page
        $('loading').style.display  = 'none';
        $('content').style.display  = 'block';
        if ($('currentSite')) $('currentSite').textContent = 'Chrome internal page';
        if ($('explanation')) $('explanation').textContent = 'Extension does not run on internal pages.';
        return;
      }
    } catch {}

    // Initial fetch
    const data = await fetchStats();
    render(data);

    // Live polling every 2 seconds
    setInterval(async () => {
      const fresh = await fetchStats();
      render(fresh);
    }, 2000);

    // Dashboard button
    $('dashboardBtn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

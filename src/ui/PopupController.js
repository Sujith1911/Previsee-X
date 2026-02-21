/**
 * PRIVISEE-X v2.0
 * UI: PopupController
 *
 * Features:
 *  - Multi-layer risk display (behavioral + static + reputation scores)
 *  - Trust/Untrust domain with persistent storage via background
 *  - Risk Breakdown panel with factor contributions
 *  - Threat Projection chip (30-day forward risk)
 *  - Behavioral DNA hash display
 *  - Research Mode toggle
 */

(async function() {
  'use strict';

  const $ = id => document.getElementById(id);
  let currentDomain = '';

  // ── Risk Helpers ────────────────────────────────────────────────────────────
  function getRiskColor(score) {
    if (score >= 75) return '#ef4444';
    if (score >= 50) return '#f97316';
    if (score >= 20) return '#f59e0b';
    return '#10b981';
  }

  function getChipClass(score) {
    if (score >= 75) return 'chip-crit';
    if (score >= 50) return 'chip-high';
    if (score >= 20) return 'chip-mod';
    return 'chip-low';
  }

  function getRiskLabel(score) {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH RISK';
    if (score >= 20) return 'MODERATE';
    return 'LOW RISK';
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render(data) {
    const {
      domain = '',
      riskScore = 0,
      trusted = false,
      trackerCount = 0,
      cookieCount = 0,
      adCount = 0,
      blockedAds = 0,
      fingerprintCount = 0,
      staticScore = 0,
      behavioralScore = 0,
      reputationScore = 0,
      staticBreakdown = [],
      dnaHash = null,
      projection = null
    } = data;

    currentDomain = domain;
    $('loading').style.display = 'none';
    $('content').style.display = 'block';
    if ($('currentSite')) $('currentSite').textContent = domain || 'Unknown';

    // Trust banner
    const trustBanner = $('trustBanner');
    if (trusted) {
      trustBanner.style.display = 'flex';
    } else {
      trustBanner.style.display = 'none';
    }

    // Risk Score circle
    const score = trusted ? 0 : riskScore;
    const color = getRiskColor(score);
    const circle = $('scoreCircle');
    if (circle) {
      circle.style.borderColor = color;
      circle.style.boxShadow   = `0 0 12px ${color}30`;
    }
    if ($('riskScore')) {
      $('riskScore').textContent = score;
      $('riskScore').style.color = color;
    }
    const chip = $('riskLevelChip');
    if (chip) {
      chip.textContent = trusted ? '✓ TRUSTED' : getRiskLabel(score);
      chip.className   = `risk-level-chip ${trusted ? 'chip-low' : getChipClass(score)}`;
    }

    // Score bars
    const bBeh = trusted ? 0 : behavioralScore;
    const bSta = trusted ? 0 : staticScore;
    const bRep = trusted ? 0 : reputationScore;
    $('barBehavioral').style.width = bBeh + '%';
    $('barStatic').style.width     = bSta + '%';
    $('barReputation').style.width = bRep + '%';
    $('valBehavioral').textContent = bBeh;
    $('valStatic').textContent     = bSta;
    $('valReputation').textContent = bRep;

    // Stats grid
    if ($('trackerCount')) $('trackerCount').textContent = trackerCount;
    if ($('blockedAds'))   $('blockedAds').textContent   = blockedAds;
    if ($('cookieCount'))  $('cookieCount').textContent  = cookieCount;

    // DNA hash
    if ($('dnaHash')) {
      $('dnaHash').textContent = dnaHash ? `DNA:${dnaHash}` : '—';
      $('dnaHash').title = dnaHash ? `Behavioral DNA: ${dnaHash}` : 'DNA hash not computed yet';
    }

    // Risk breakdown factors
    renderBreakdown({ trackerCount, fingerprintCount, staticBreakdown, staticScore, behavioralScore, reputationScore, trusted });

    // Projection
    renderProjection(projection, trusted);

    // Trust button label
    const trustBtn = $('trustBtn');
    if (trustBtn) {
      trustBtn.textContent = trusted ? '🔓 Trusted' : '🤝 Trust Site';
      trustBtn.disabled    = trusted;
      trustBtn.style.opacity = trusted ? '0.5' : '1';
    }
  }

  function renderBreakdown({ trackerCount, fingerprintCount, staticBreakdown, staticScore, behavioralScore, reputationScore, trusted }) {
    const list = $('factorList');
    if (!list) return;
    if (trusted) {
      list.innerHTML = '<div class="empty-state">✅ Trust override active — all risk suppressed</div>';
      return;
    }

    const factors = [];

    // Behavioral factors
    if (trackerCount > 0) {
      const delta = Math.round(Math.min(40, Math.log2(trackerCount + 1) * 13));
      factors.push({ icon:'🕵️', text:`${trackerCount} tracker${trackerCount > 1 ? 's' : ''} detected`, delta: `+${delta}`, weight: delta });
    }
    if (fingerprintCount > 0) {
      const delta = Math.min(30, fingerprintCount * 10);
      factors.push({ icon:'🖨️', text:`${fingerprintCount} fingerprint API${fingerprintCount > 1 ? 's' : ''} used`, delta: `+${delta}`, weight: delta });
    }

    // Static factors
    for (const f of (staticBreakdown || []).slice(0, 6)) {
      factors.push({ icon:'🔒', text: f.factor, delta: `+${f.delta}`, weight: f.delta });
    }

    // Sort by weight descending
    factors.sort((a, b) => b.weight - a.weight);

    if (!factors.length) {
      list.innerHTML = '<div class="empty-state">No significant risk signals detected</div>';
      return;
    }

    list.innerHTML = factors.map(f => `
      <div class="factor">
        <span class="icon">${f.icon}</span>
        <span class="text">${f.text}</span>
        <span class="delta">${f.delta}</span>
      </div>
    `).join('');
  }

  function renderProjection(proj, trusted) {
    const main  = $('projMain');
    const sub   = $('projSub');
    const badge = $('projBadge');
    if (!main || !proj) return;

    if (trusted) {
      main.textContent = 'Trust override active';
      sub.textContent  = 'No projection shown for trusted domains';
      badge.textContent = '—';
      badge.className = 'proj-badge proj-flat';
      return;
    }

    const projected = proj.projectedRiskIn30Days ?? '?';
    const trend     = proj.trend || 'STABLE';
    const conf      = proj.confidence || 'LOW';
    const cluster   = proj.clusterName;

    main.textContent = `Projected risk: ${projected}/100 in 30 days`;
    sub.textContent  = `Confidence: ${conf} · Cluster: ${cluster || 'unknown'}`;
    badge.textContent = trend === 'INCREASING' ? '↑ Rising' : trend === 'DECREASING' ? '↓ Falling' : '→ Stable';
    badge.className  = `proj-badge ${trend === 'INCREASING' ? 'proj-up' : trend === 'DECREASING' ? 'proj-down' : 'proj-flat'}`;
  }

  // ── Message helper ──────────────────────────────────────────────────────────
  function msg(payload) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({}), 3000);
      try {
        chrome.runtime.sendMessage(payload, resp => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(resp || {});
        });
      } catch { clearTimeout(timer); resolve({}); }
    });
  }

  // ── Fetch & Refresh ─────────────────────────────────────────────────────────
  async function fetchAndRender() {
    const data = await msg({ action: 'GET_TAB_STATS' });
    if (data && (data.domain || data.riskScore !== undefined)) render(data);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    // Set domain from active tab immediately
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab  = tabs[0];
      if (tab?.url && !tab.url.startsWith('chrome://')) {
        currentDomain = new URL(tab.url).hostname.replace(/^www\./, '');
        if ($('currentSite')) $('currentSite').textContent = currentDomain;
      } else {
        $('loading').style.display  = 'none';
        $('content').style.display  = 'block';
        if ($('currentSite')) $('currentSite').textContent = 'Internal page';
        if ($('factorList')) $('factorList').innerHTML = '<div class="empty-state">Extension does not run on Chrome internal pages.</div>';
        return;
      }
    } catch {}

    // Load research mode state
    try {
      const local = await chrome.storage.local.get('researchModeEnabled');
      if ($('researchToggle')) $('researchToggle').checked = !!local.researchModeEnabled;
    } catch {}

    await fetchAndRender();

    // Live polling every 2.5s
    setInterval(fetchAndRender, 2500);

    // ── Trust Site ──────────────────────────────────────────────────────────
    $('trustBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      await msg({ action: 'TRUST_DOMAIN', domain: currentDomain });
      await fetchAndRender();
    });

    // ── Untrust Site ────────────────────────────────────────────────────────
    $('untrustBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      await msg({ action: 'UNTRUST_DOMAIN', domain: currentDomain });
      await fetchAndRender();
    });

    // ── Dashboard ────────────────────────────────────────────────────────────
    $('dashboardBtn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });

    // ── Research Mode Toggle ─────────────────────────────────────────────────
    $('researchToggle')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try { await chrome.storage.local.set({ researchModeEnabled: enabled }); } catch {}
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();

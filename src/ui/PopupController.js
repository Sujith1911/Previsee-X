/**
 * PRIVISEE-X v5.0 — PopupController
 * Central State Management + Risk Delta + Toast Notifications
 * Sparkline Time Filters + Immediate Trust/Delete UI Updates
 * Smart Suggestions Integration
 */

'use strict';

(function () {
  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const msg = (m) => new Promise(res => {
    try {
      chrome.runtime.sendMessage(m, r => {
        if (chrome.runtime.lastError) res(null);
        else res(r || null);
      });
    } catch { res(null); }
  });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v || 0));

  /* ── Risk color helpers ───────────────────────────────────────────────── */
  function riskColor(score) {
    if (score <= 15) return '#10b981';
    if (score <= 35) return '#22c55e';
    if (score <= 60) return '#f59e0b';
    if (score <= 80) return '#f97316';
    return '#ef4444';
  }
  function waStatusClass(score) {
    if (score <= 25) return 'safe';
    if (score <= 60) return 'caution';
    return 'dangerous';
  }
  function waIcon(score) {
    if (score <= 25) return '🟢';
    if (score <= 60) return '🟡';
    return '🔴';
  }
  function waLabel(score) {
    if (score <= 25) return 'SAFE';
    if (score <= 60) return 'CAUTION';
    return 'DANGEROUS';
  }
  function waSubText(score, riskLevel) {
    if (score <= 15) return 'Site is very safe to browse';
    if (score <= 25) return 'Site appears safe to browse';
    if (score <= 60) return 'Exercise caution on this site';
    return `⚠️ High risk detected — Level: ${riskLevel}`;
  }
  function relTime(ts) {
    if (!ts) return '';
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.round(d/60000)}m ago`;
    if (d < 86400000) return `${Math.round(d/3600000)}h ago`;
    return `${Math.round(d/86400000)}d ago`;
  }
  function deltaArrow(delta) {
    if (!delta || delta === 0) return { arrow: '→', color: '#6366f1', text: 'Stable' };
    if (delta > 0) return { arrow: '↑', color: '#ef4444', text: `+${delta} from last visit` };
    return { arrow: '↓', color: '#10b981', text: `${delta} from last visit` };
  }

  /* ── Toast Notification System ───────────────────────────────────────── */
  function showToast(message, type = 'success', duration = 2500) {
    let container = $('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
      document.body.appendChild(container);
    }
    const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1', warning: '#f59e0b' };
    const icons  = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast  = document.createElement('div');
    toast.style.cssText = `background:#1e2438;border:1px solid ${colors[type]}50;color:#e2e8f0;padding:8px 14px;border-radius:8px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:7px;box-shadow:0 4px 16px rgba(0,0,0,.5);animation:fadeInUp .2s ease;pointer-events:auto;border-left:3px solid ${colors[type]};`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0'; toast.style.transition = 'opacity .3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /* ── State ─────────────────────────────────────────────────────────── */
  let lastData          = null;
  let currentDomain     = null;
  let blockHistory      = [];
  let trackerItems      = [];
  let pushListenerBound = false;
  let activeRange       = 'today'; // sparkline time range: today | 7d | 30d | all
  let expandedTrackers  = new Set();

  /* ══════════════════════════════════════════════════════════════════════
     fetchAndRender — main data fetch + full render
  ══════════════════════════════════════════════════════════════════════ */
  async function fetchAndRender() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      showError('Cannot inspect this page'); return;
    }

    // Primary data
    const data = await msg({ action: 'GET_STATS' });
    if (!data) { showError('Extension not ready'); return; }
    lastData      = data;
    currentDomain = data.domain || '';

    // Parallel: security layer + advisory + filtered domain history
    const [sec, advisory, hist] = await Promise.all([
      msg({ action: 'GET_SECURITY_LAYER' }),
      msg({ action: 'GET_ADVISORY' }),
      currentDomain
        ? msg({ action: 'GET_RISK_HISTORY_FILTERED', domain: currentDomain, range: activeRange })
        : Promise.resolve(null),
    ]);

    // Blocked log
    const blockedData = await msg({ action: 'GET_BLOCKED_LOG' });
    blockHistory  = (blockedData?.items || []).slice().reverse();
    trackerItems  = buildTrackerItems(data);

    // Setup push listeners once
    if (!pushListenerBound) {
      pushListenerBound = true;
      chrome.runtime.onMessage.addListener(handlePushUpdate);
    }

    render(data, sec, advisory, hist?.history || []);
  }

  /* ── Push update handler ─────────────────────────────────────────────── */
  function handlePushUpdate(message) {
    if (!message) return;
    if (message.type === 'STATS_UPDATE' || message.type === 'TRUST_CHANGED') {
      // Re-fetch with a short delay to allow background to settle
      setTimeout(fetchAndRender, 150);
    }
  }

  /* ── Build tracker items from data ───────────────────────────────────── */
  function buildTrackerItems(data) {
    const items = [];
    const seen  = new Set();
    for (const b of blockHistory.slice(0, 60)) {
      const k = b.domain + b.type;
      if (!seen.has(k)) {
        seen.add(k);
        items.push({ domain: b.domain, type: b.type || 'tracker', ts: b.ts, count: 1 });
      }
    }
    if (data.trackerCount > items.length) {
      items.push({ domain: currentDomain, type: 'tracker', synthetic: true, count: data.trackerCount - items.length });
    }
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════
     render — update all UI panels
  ══════════════════════════════════════════════════════════════════════ */
  function render(data, sec, advisory, histPoints = []) {
    $('loading').style.display = 'none';
    $('content').style.display = 'block';

    const trusted = data.trusted || data.trustOverride;
    const score   = trusted ? 0 : clamp(data.riskScore, 0, 100);
    const delta   = trusted ? 0 : (data.riskDelta || 0);

    // ── Header ────────────────────────────────────────────────────────
    $('currentSite').textContent = data.domain || 'Unknown Site';
    $('dnaHash').textContent     = data.dnaHash ? data.dnaHash.slice(0, 8) : 'DNA—';
    if (data.dnaHash) $('dnaHash').title = data.dnaHash;

    // ── Trust state ───────────────────────────────────────────────────
    $('trustBadge').classList.toggle('hidden', !trusted);
    $('trustBanner').style.display = trusted ? 'flex' : 'none';
    const tb = $('trustBtn');
    if (trusted) {
      tb.textContent  = '⛔ Untrust Site';
      tb.style.cssText = 'background:#ef444415;color:#ef4444;border:1px solid #ef444430;';
    } else {
      tb.textContent  = '🤝 Trust Site';
      tb.style.cssText = '';
    }

    // ── WebAdvisor Badge ──────────────────────────────────────────────
    renderWABadge(score, data.riskLevel, data.riskClassification, delta, trusted);

    // ── Score Bars ────────────────────────────────────────────────────
    const b  = clamp(data.behavioralScore, 0, 100);
    const s  = clamp(data.staticScore, 0, 100);
    const r  = clamp(data.reputationScore, 0, 100);
    const sl = clamp(data.securityLayerScore, 0, 100);
    setBar('barBehavioral',  'valBehavioral',  b,  riskColor(b));
    setBar('barStatic',      'valStatic',      s,  riskColor(s));
    setBar('barReputation',  'valReputation',  r,  riskColor(r));
    setBar('barSecurity',    'valSecurity',    sl, sl >= 60 ? '#10b981' : sl >= 30 ? '#f59e0b' : '#ef4444');

    // ── Sparkline ─────────────────────────────────────────────────────
    renderSparkline(histPoints, score, data.avg7d || 0);

    // ── Firewall Stats ─────────────────────────────────────────────────
    $('adsBlockedCount').textContent      = data.adsBlockedCount || 0;
    $('trackersBlockedCount').textContent = data.trackersBlockedCount || 0;
    $('trackerCount').textContent         = data.trackerCount || 0;
    $('cookieCount').textContent          = data.cookieCount  || 0;

    // ── Security Layer Panel ───────────────────────────────────────────
    if (sec) renderSecurityLayer(sec);

    // ── Advisory + Smart Suggestions ──────────────────────────────────
    if (advisory) renderAdvisory(advisory, data);

    // ── Tracker List ───────────────────────────────────────────────────
    renderTrackerList(trackerItems);

    // ── Risk Breakdown ─────────────────────────────────────────────────
    renderBreakdown(data.staticBreakdown || []);

    // ── Blocked Resources ──────────────────────────────────────────────
    renderBlockedResources(blockHistory);

    // ── Predictive Risk ────────────────────────────────────────────────
    renderProjection(data);

    // ── Research Mode ──────────────────────────────────────────────────
    const researchOn = $('researchToggle')?.checked;
    if (researchOn) renderResearch(data, sec);

    // ── Strict Mode blocked domains (Phase 8) ─────────────────────────
    if (data.strictMode) renderStrictBlockedDomains();

    // ── Search Filter ──────────────────────────────────────────────────
    const q = $('searchBar')?.value?.toLowerCase() || '';
    if (q) applySearchFilter(q);
  }

  /* ── WebAdvisor Badge ─────────────────────────────────────────────── */
  function renderWABadge(score, level, classification, delta, trusted) {
    const cls   = waStatusClass(score);
    const badge = $('waBadge');
    badge.className = `wa-badge ${cls}`;

    $('waIcon').textContent = waIcon(score);

    const statusEl = $('waStatus');
    statusEl.className = `wa-status ${cls}`;
    statusEl.textContent = trusted ? 'TRUSTED' : waLabel(score);

    $('waSub').textContent = trusted
      ? 'Site trusted by you — analysis still runs in background'
      : waSubText(score, level);

    const ring = $('waRing');
    const c = riskColor(score);
    ring.style.borderColor = c;
    $('riskScore').textContent = score;
    $('riskScore').style.color = c;

    // ── Classification label ──────────────────────────────────────────
    const classEl = $('riskClassification');
    if (classEl) {
      classEl.textContent = trusted ? 'Trusted' : (classification || '—');
      classEl.style.color = c;
    }

    // ── Risk Delta badge ──────────────────────────────────────────────
    const deltaEl = $('riskDeltaBadge');
    if (deltaEl && !trusted) {
      const { arrow, color, text } = deltaArrow(delta);
      if (delta !== 0) {
        deltaEl.innerHTML = `<span style="color:${color};font-weight:700">${arrow} ${Math.abs(delta)}</span>`;
        deltaEl.title = text;
        deltaEl.style.display = 'inline-flex';
      } else {
        deltaEl.style.display = 'none';
      }
    } else if (deltaEl) {
      deltaEl.style.display = 'none';
    }
  }

  /* ── Score bar setter ─────────────────────────────────────────────── */
  function setBar(barId, valId, value, color) {
    const el = $(barId);
    if (el) { el.style.width = value + '%'; el.style.background = color; }
    if (valId) { const v = $(valId); if (v) v.textContent = value; }
  }

  /* ── Canvas Sparkline with Time Range ────────────────────────────── */
  function renderSparkline(history, currentScore, avg7d) {
    const canvas = $('sparkline');
    if (!canvas) return;

    // Update active range button styles
    document.querySelectorAll('.sparkline-range-btn').forEach(btn => {
      btn.style.background = btn.dataset.range === activeRange ? 'var(--acc)' : 'var(--s3)';
      btn.style.color      = btn.dataset.range === activeRange ? 'white' : 'var(--muted)';
    });

    const points = [...(history || []).map(p => p.score || p)];
    if (!points.length || points[points.length - 1] !== currentScore) points.push(currentScore);

    const W = Math.max(240, points.length * 14);
    canvas.width  = W;
    canvas.height = 50;
    canvas.parentElement.scrollLeft = W;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, 50);

    if (points.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText('Not enough history for this range', 8, 26);
      if ($('sparklineLabel')) $('sparklineLabel').textContent = '';
      if ($('sparklineAvg')) $('sparklineAvg').textContent = '';
      return;
    }

    const maxVal = Math.max(...points, 1);
    const px     = (v) => 4 + (v / Math.max(maxVal, 1)) * 42;
    const stepX  = W / (points.length - 1);

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 50);
    grad.addColorStop(0, 'rgba(99,102,241,.5)');
    grad.addColorStop(1, 'rgba(99,102,241,.02)');
    ctx.beginPath();
    ctx.moveTo(0, 50 - px(points[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(i * stepX, 50 - px(points[i]));
    ctx.lineTo(W, 50); ctx.lineTo(0, 50); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(0, 50 - px(points[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(i * stepX, 50 - px(points[i]));
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.stroke();

    // 7-day average line (if available)
    if (avg7d > 0) {
      const avgY = 50 - px(avg7d);
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(0, avgY); ctx.lineTo(W, avgY);
      ctx.strokeStyle = '#f59e0b40'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);
    }

    // Last point dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc((points.length - 1) * stepX, 50 - px(last), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = riskColor(last); ctx.fill();

    const peakVal = Math.max(...points);
    if ($('sparklineLabel')) $('sparklineLabel').textContent = `${points.length} pts · peak ${peakVal}`;
    if ($('sparklineAvg') && avg7d > 0) {
      $('sparklineAvg').textContent = `7d avg: ${avg7d}`;
      $('sparklineAvg').style.color = riskColor(avg7d);
    }

    // Tooltip on hover
    canvas.onmousemove = (e) => {
      const rect  = canvas.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const idx   = Math.round(x / stepX);
      if (idx >= 0 && idx < points.length) {
        const entry = history?.[idx];
        canvas.title = entry?.ts
          ? `Risk: ${points[idx]} · ${relTime(entry.ts)}`
          : `Risk: ${points[idx]}`;
      }
    };
  }

  /* ── Security Layer Panel (v5.0: TLS issuer, expiry, encryption strength) ── */
  function renderSecurityLayer(sec) {
    if (!sec) return;

    // Encryption row — show strength label (TLS 1.3 / TLS 1.2 / HTTP)
    const encLabel = sec.tlsVersion
      ? `${sec.tlsVersion} — ${sec.encryptionRaw || ''}`
      : (sec.encryption || '—');
    setSecItem('encDot', 'encVal',
      sec.encryptionRaw === 'STRONG' ? 'green' : sec.encryptionRaw === 'WEAK' ? 'yellow' : 'red',
      encLabel
    );

    // Certificate row — show issuer + expiry
    const certClass = (sec.certSeverity === 'NONE') ? 'green' :
                      (sec.certSeverity === 'WARNING') ? 'yellow' : 'red';
    let certLabel = sec.certStatus || '—';
    if (sec.certIssuer) certLabel += ` · ${sec.certIssuer.split(' ').slice(0,3).join(' ')}`;
    if (sec.certExpiry) {
      const daysLeft = Math.round((new Date(sec.certExpiry) - Date.now()) / 86400000);
      certLabel += daysLeft > 0 ? ` · ${daysLeft}d` : ' · EXPIRED';
    }
    setSecItem('certDot', 'certVal', certClass, certLabel);

    // HSTS row
    setSecItem('hstsDot', 'hstsVal',
      sec.hsts ? 'green' : 'yellow',
      sec.hsts ? 'Enabled' : 'Missing'
    );

    // Mixed content row
    setSecItem('mixedDot', 'mixedVal',
      sec.mixedContent ? 'red' : 'green',
      sec.mixedContent ? 'Detected' : 'Clean'
    );

    // Security headers score bar
    const hsc = clamp(sec.securityHeadersScore, 0, 100);
    const hb  = $('barSecHeaders');
    if (hb) { hb.style.width = hsc + '%'; hb.style.background = hsc >= 60 ? '#10b981' : hsc >= 30 ? '#f59e0b' : '#ef4444'; }
    if ($('secHeaderScore')) {
      $('secHeaderScore').textContent = `${hsc}/100`;
      $('secHeaderScore').style.color = hsc >= 60 ? '#10b981' : hsc >= 30 ? '#f59e0b' : '#ef4444';
    }
  }

  function setSecItem(dotId, valId, cls, text) {
    const dot = $(dotId); const val = $(valId);
    if (dot) dot.className = `sec-dot ${cls}`;
    if (val) { val.className = `val ${cls}`; val.textContent = text; }
  }

  /* ── Advisory + Smart Suggestions Panel ──────────────────────────── */
  function renderAdvisory(advisory, data) {
    const el = $('advisoryContent');
    if (!el) return;

    const obs  = advisory.observations || [];
    const recs = advisory.recommendations || [];

    // Smart Suggestions via SmartSuggestionEngine (if available)
    let smartSugs = [];
    if (window.SmartSuggestionEngine && data) {
      smartSugs = SmartSuggestionEngine.generate({
        trackerCount:    data.trackerCount || 0,
        cookieCount:     data.cookieCount  || 0,
        riskScore:       data.riskScore    || 0,
        fingerprintCount:data.fingerprintCount || 0,
        adCount:         data.adCount || 0,
        certWarning:     data.certWarning || null,
        clusterName:     data.clusterName || '',
        strictMode:      data.strictMode  || false,
        trusted:         data.trusted     || false,
        staticBreakdown: data.staticBreakdown || [],
      });
    }

    if (!obs.length && !recs.length && !smartSugs.length) {
      el.innerHTML = `<div class="advisory-empty">Analysis complete — no issues detected</div>`;
      return;
    }

    const obsHtml = obs.length ? `
      <div class="advisory-obs">
        ${obs.map(o => `
          <div class="obs-item">
            <div class="obs-dot"></div>
            <span>${o}</span>
          </div>`).join('')}
      </div>` : '';

    const sugHtml = smartSugs.length ? `
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 5px;">
        💡 Smart Suggestions
      </div>
      <div class="rec-list">
        ${smartSugs.slice(0, 4).map(s => `
          <div class="rec-item" style="margin-bottom:5px;">
            <span style="flex-shrink:0;">${s.icon}</span>
            <span>
              <span style="font-weight:700;color:var(--text)">${s.title}</span>
              <span style="display:block;font-size:10px;color:var(--muted);margin-top:1px;">${s.description}</span>
            </span>
          </div>`).join('')}
      </div>` : '';

    const recHtml = recs.length && !smartSugs.length ? `
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Recommendations</div>
      <div class="rec-list">
        ${recs.map(r => `
          <div class="rec-item">
            <span class="rec-icon">→</span>
            <span>${r}</span>
          </div>`).join('')}
      </div>` : '';

    el.innerHTML = obsHtml + sugHtml + recHtml;
  }

  /* ── Tracker List with Expandable Rows ───────────────────────────── */
  function renderTrackerList(items) {
    if ($('trackerListCount')) $('trackerListCount').textContent = `(${items.length})`;
    applyTrackerFilter();
  }

  function applyTrackerFilter() {
    const wrap   = $('trackerList');
    if (!wrap) return;
    const search = ($('trackerSearch')?.value || '').toLowerCase();
    const filter = $('trackerFilter')?.value || 'all';

    const filtered = trackerItems.filter(item => {
      if (filter !== 'all' && item.type !== filter) return false;
      if (search && !item.domain.toLowerCase().includes(search)) return false;
      return true;
    });

    if (!filtered.length) {
      wrap.innerHTML = `<div class="empty-state">${trackerItems.length ? 'No matches' : 'No trackers detected yet'}</div>`;
      return;
    }

    wrap.innerHTML = filtered.map((item, idx) => {
      const typeLabel = item.type === 'ad' ? 'AD' : item.type === 'fingerprint' ? 'FP' : 'TRK';
      const typeCls   = item.type === 'ad' ? 'tt-ad' : item.type === 'fingerprint' ? 'tt-fingerprint' : 'tt-tracker';
      const isExpanded = expandedTrackers.has(idx);
      const blockedLabel = item.type === 'ad' ? '🚫 Blocked' : '📡 Detected';
      const blockedColor = item.type === 'ad' ? '#ef444490' : '#f59e0b90';

      return `<div class="tracker-item" style="flex-direction:column;align-items:flex-start;cursor:pointer;" data-idx="${idx}">
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <span class="tracker-type ${typeCls}">${typeLabel}</span>
          <span class="tracker-domain" title="${item.domain}">${item.domain}</span>
          <span class="tracker-risk">${item.ts ? relTime(item.ts) : ''}</span>
          <span style="font-size:9px;color:var(--muted);margin-left:auto;">${isExpanded ? '▲' : '▼'}</span>
        </div>
        ${isExpanded ? `<div style="width:100%;margin-top:5px;padding:6px 8px;background:var(--s3);border-radius:5px;font-size:10px;color:var(--muted);">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span>Type: <strong style="color:var(--text)">${item.type}</strong></span>
            <span style="color:${blockedColor};font-weight:700;">${blockedLabel}</span>
          </div>
          ${item.ts ? `<div>First seen: <strong style="color:var(--dim)">${new Date(item.ts).toLocaleString([],{dateStyle:'short',timeStyle:'short'})}</strong></div>` : ''}
          ${item.count > 1 ? `<div>Hits: <strong style="color:var(--dim)">${item.count}</strong></div>` : ''}
        </div>` : ''}
      </div>`;
    }).join('');

    // Attach expand/collapse handlers
    wrap.querySelectorAll('.tracker-item[data-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        if (expandedTrackers.has(idx)) expandedTrackers.delete(idx);
        else expandedTrackers.add(idx);
        applyTrackerFilter();
      });
    });
  }

  /* ── Risk Breakdown ───────────────────────────────────────────────── */
  function renderBreakdown(breakdown) {
    const el = $('factorList');
    if (!el) return;
    const factors = (breakdown || []).filter(f => f.delta > 0).sort((a, b) => b.delta - a.delta);
    if (!factors.length) {
      el.innerHTML = `<div class="empty-state">No static risk factors detected</div>`; return;
    }
    el.innerHTML = factors.slice(0, 8).map(f => `
      <div class="factor">
        <span class="icon">▪</span>
        <span class="text">${f.factor}</span>
        <span class="delta">+${f.delta}</span>
      </div>`).join('');
  }

  /* ── Blocked Resources ────────────────────────────────────────────── */
  function renderBlockedResources(items) {
    if ($('blockedCount')) $('blockedCount').textContent = `(${items.length})`;
    const wrap = $('blockedPanel');
    if (!wrap) return;

    if (!items.length) {
      wrap.innerHTML = `<div class="empty-state">No blocked resources yet</div>`; return;
    }

    wrap.innerHTML = items.slice(0, 30).map(b => {
      const typeCls = b.type === 'ad' ? 'bt-ad' : b.type === 'redirect' ? 'bt-redirect' : 'bt-tracker';
      const label   = b.type === 'ad' ? 'AD' : b.type === 'redirect' ? 'RDR' : 'TRK';
      return `<div class="blocked-item">
        <span class="blocked-type ${typeCls}">${label}</span>
        <span class="blocked-domain" title="${b.domain}">${b.domain}</span>
        <span class="blocked-ts">${relTime(b.ts)}</span>
        <button class="blocked-copy" data-domain="${b.domain}" title="Copy">⧉</button>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.blocked-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(btn.dataset.domain).catch(() => {});
        btn.textContent = '✓'; setTimeout(() => btn.textContent = '⧉', 1200);
      });
    });
  }

  /* ── Strict Mode — Blocked Domains (Phase 8) ─────────────────────── */
  async function renderStrictBlockedDomains() {
    // Reuse or create the section
    let panel = $('strictBlockedPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'strictBlockedPanel';
      panel.style.cssText = 'margin-top:10px;border-radius:8px;overflow:hidden;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.05);';
      // Insert after the blocked resources section, or before the actions
      const anchor = $('actionBtns') || document.querySelector('.action-btns') || document.body;
      anchor.parentElement?.insertBefore(panel, anchor);
    }

    const resp = await msg({ action: 'GET_BLOCKED_DOMAINS' });
    const domains = resp?.domains || [];

    panel.innerHTML = `
      <div id="strictBlockedHeader" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;">
        <span style="font-size:11px;font-weight:700;color:#f87171;">
          🚫 Strict Mode — ${domains.length} domain${domains.length !== 1 ? 's' : ''} blocked
        </span>
        <span id="strictBlockedChevron" style="font-size:9px;color:#f87171;">▼</span>
      </div>
      <div id="strictBlockedList" style="display:none;padding:0 12px 8px;max-height:160px;overflow-y:auto;">
        ${domains.length
          ? domains.map(d => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;">
                <span style="color:#fca5a5;">${d}</span>
                <button data-unblock="${d}" style="font-size:10px;background:transparent;border:1px solid rgba(239,68,68,.35);color:#f87171;border-radius:4px;padding:1px 7px;cursor:pointer;">
                  Unblock
                </button>
              </div>`).join('')
          : '<div style="color:#64748b;font-size:11px;padding:6px 0;">No domains blocked yet.</div>'
        }
      </div>`;

    // Toggle expand/collapse
    panel.querySelector('#strictBlockedHeader').addEventListener('click', () => {
      const list     = panel.querySelector('#strictBlockedList');
      const chevron  = panel.querySelector('#strictBlockedChevron');
      const expanded = list.style.display !== 'none';
      list.style.display  = expanded ? 'none' : 'block';
      chevron.textContent = expanded ? '▼' : '▲';
    });

    // Unblock button handlers
    panel.querySelectorAll('[data-unblock]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const domain = btn.dataset.unblock;
        await msg({ action: 'UNBLOCK_DOMAIN', domain });
        showToast(`✅ Unblocked "${domain}"`, 'success');
        renderStrictBlockedDomains(); // Re-render the list
      });
    });
  }

  /* ── Predictive Risk ──────────────────────────────────────────────── */
  function renderProjection(data) {
    const current = clamp(data.riskScore, 0, 100);
    const proj    = data.projection;
    const future  = proj ? clamp(proj?.projectedRiskIn30Days ?? proj, 0, 100) : null;

    if ($('projCurrent')) {
      $('projCurrent').textContent = current;
      $('projCurrent').style.color = riskColor(current);
    }
    if ($('projCurrentLbl')) {
      $('projCurrentLbl').textContent = data.riskClassification || data.riskLevel || '—';
      $('projCurrentLbl').style.color = riskColor(current);
    }

    if (future !== null) {
      if ($('projFuture')) { $('projFuture').textContent = future; $('projFuture').style.color = riskColor(future); }
      if ($('projConf'))   $('projConf').textContent = `Confidence: ${proj?.confidence || 'LOW'}`;
      const diff = future - current;
      if ($('projArrow')) { $('projArrow').textContent = diff > 5 ? '↗' : diff < -5 ? '↘' : '→'; $('projArrow').style.color = diff > 5 ? '#ef4444' : diff < -5 ? '#10b981' : '#6366f1'; }
      if ($('projInfo'))  $('projInfo').textContent = diff > 5 ? `Risk trending higher (+${diff} pts)` : diff < -5 ? `Risk improving (${diff} pts)` : 'Risk stable based on history';
    } else {
      if ($('projFuture')) $('projFuture').textContent = '—';
      if ($('projConf'))   $('projConf').textContent = 'Collecting data…';
      if ($('projArrow')) { $('projArrow').textContent = '→'; $('projArrow').style.color = '#6366f1'; }
      if ($('projInfo'))  $('projInfo').textContent = 'More browsing data needed for projection';
    }
  }

  /* ── Research Mode ────────────────────────────────────────────────── */
  function renderResearch(data, sec) {
    if ($('r_sessionRisk'))   $('r_sessionRisk').textContent  = data.currentSessionRisk ?? data.riskScore ?? '—';
    if ($('r_historicalRisk'))$('r_historicalRisk').textContent = data.historicalRisk ?? '—';
    if ($('r_dnaHash'))       $('r_dnaHash').textContent      = data.dnaHash || '—';
    if ($('r_static'))        $('r_static').textContent       = data.staticScore ?? '—';
    if ($('r_security'))      $('r_security').textContent     = data.securityLayerScore ?? '—';
    if ($('r_projConf'))      $('r_projConf').textContent     = data.projection ? `${data.projection?.projectedRiskIn30Days ?? data.projection}/100` : '—';
    if ($('r_cluster'))       $('r_cluster').textContent      = data.dnaHash ? (data.clusterName || 'computed') : '—';
    if ($('r_tls')) $('r_tls').textContent = sec
      ? `${sec.encryption || '?'} | HSTS:${sec.hsts ? 'yes' : 'no'} | ${sec.certStatus || '?'}`
      : '—';

    const rawH = data.rawHeaders || {};
    const importantH = ['content-security-policy','strict-transport-security','x-frame-options','referrer-policy','permissions-policy','x-content-type-options'];
    const headerLines = importantH.filter(k => rawH[k]).map(k => `${k}: ${rawH[k].slice(0, 60)}${rawH[k].length > 60 ? '…' : ''}`);
    if ($('r_headers')) $('r_headers').textContent = headerLines.length ? headerLines.join('\n') : Object.keys(rawH).length ? '(headers present — none of interest)' : 'No headers captured yet';
    if ($('r_behavLogs')) $('r_behavLogs').textContent = '(Session counts appear in Statistics section above)';
  }

  /* ── Search Filter ────────────────────────────────────────────────── */
  function applySearchFilter(q) {
    if (!q) return;
    if ($('trackerSearch')) $('trackerSearch').value = q;
    applyTrackerFilter();
  }

  /* ── Export Helper ────────────────────────────────────────────────── */
  async function doExport() {
    const blob = new Blob([JSON.stringify({ ...lastData, blockHistory, timestamp: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `privisee-${currentDomain}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Show error helper ────────────────────────────────────────────── */
  function showError(errMsg) {
    $('loading').style.display = 'none';
    $('content').style.display = 'block';
    if ($('waSub')) $('waSub').textContent = errMsg;
  }

  /* ══════════════════════════════════════════════════════════════════════
     Event Listeners
  ══════════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', async () => {

    // Load persisted toggles
    try {
      const stored = await chrome.storage.local.get(['strictMode', 'researchModeEnabled']);
      if ($('strictToggle'))   $('strictToggle').checked   = !!stored.strictMode;
      if ($('researchToggle')) $('researchToggle').checked = !!stored.researchModeEnabled;
      if (stored.researchModeEnabled && $('researchPanel')) $('researchPanel').style.display = 'block';
    } catch {}

    // Dashboard button
    $('dashboardBtn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });

    // Trust / Untrust button — immediate local update then re-fetch
    $('trustBtn')?.addEventListener('click', async () => {
      if (!currentDomain || !lastData) return;
      const trusted = lastData.trusted || lastData.trustOverride;
      $('trustBtn').disabled = true;

      // Immediate local state flip for snappy UX
      if (lastData) {
        lastData.trusted = !trusted;
        lastData.trustOverride = !trusted;
        lastData.riskScore = !trusted ? 0 : lastData.currentSessionRisk || 0;
        render(lastData, null, null, []);
      }

      try {
        const action = trusted ? 'UNTRUST_DOMAIN' : 'TRUST_DOMAIN';
        const res = await msg({ action, domain: currentDomain });
        if (res?.success) {
          showToast(trusted ? '🔓 Site untrusted' : '✅ Site trusted — risk suppressed', 'success');
        }
        await fetchAndRender();
      } catch {
        await fetchAndRender();
      } finally {
        $('trustBtn').disabled = false;
      }
    });

    // Untrust from banner
    $('untrustBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      await msg({ action: 'UNTRUST_DOMAIN', domain: currentDomain });
      showToast('🔓 Site untrusted', 'info');
      await fetchAndRender();
    });

    // Delete Cookies — immediate feedback + re-render
    $('deleteCookiesBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      const btn = $('deleteCookiesBtn');
      btn.disabled = true; btn.textContent = '⏳ Deleting…';
      try {
        const res = await msg({ action: 'DELETE_COOKIES', domain: currentDomain });
        if (res?.success !== false) {
          // Immediately update local cookie count
          if (lastData) { lastData.cookieCount = 0; }
          if ($('cookieCount')) $('cookieCount').textContent = '0';
          showToast('🍪 Cookies cleared successfully', 'success');
          btn.textContent = '✓ Cleared';
          setTimeout(() => { btn.textContent = '🍪 Delete Cookies'; btn.disabled = false; }, 1800);
          // Re-fetch to get updated risk score
          setTimeout(fetchAndRender, 500);
        } else {
          showToast('Could not delete some cookies', 'warning');
          btn.disabled = false; btn.textContent = '🍪 Delete Cookies';
        }
      } catch {
        btn.disabled = false; btn.textContent = '🍪 Delete Cookies';
        showToast('Delete failed — try again', 'error');
      }
    });

    // Strict Mode
    $('strictToggle')?.addEventListener('change', async (e) => {
      const on = e.target.checked;
      await chrome.storage.local.set({ strictMode: on });
      await msg({ action: 'SET_STRICT_MODE', enabled: on });
      showToast(on ? '🛡️ Strict Mode enabled' : '🛡️ Strict Mode disabled', 'info');
      await fetchAndRender();
    });

    // Research Mode
    $('researchToggle')?.addEventListener('change', async (e) => {
      const on = e.target.checked;
      await chrome.storage.local.set({ researchModeEnabled: on });
      if ($('researchPanel')) $('researchPanel').style.display = on ? 'block' : 'none';
      if (on && lastData) {
        const sec = await msg({ action: 'GET_SECURITY_LAYER' });
        renderResearch(lastData, sec);
      }
    });

    // Sparkline time range buttons
    document.querySelectorAll('.sparkline-range-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        activeRange = btn.dataset.range;
        if (!currentDomain) return;
        const hist = await msg({ action: 'GET_RISK_HISTORY_FILTERED', domain: currentDomain, range: activeRange });
        const score = lastData?.riskScore || 0;
        const avg7d = lastData?.avg7d || 0;
        renderSparkline(hist?.history || [], score, avg7d);
      });
    });

    // Tracker list filter + search
    $('trackerSearch')?.addEventListener('input', applyTrackerFilter);
    $('trackerFilter')?.addEventListener('change', applyTrackerFilter);

    // Collapsible: Tracker list
    $('trackerListToggle')?.addEventListener('click', () => {
      const wrap = $('trackerListWrap');
      if (!wrap) return;
      const hidden = wrap.style.display === 'none';
      wrap.style.display = hidden ? '' : 'none';
      $('trackerListToggle').textContent = `🕵️ Trackers ${$('trackerListCount')?.textContent || ''} ${hidden ? '▼' : '▶'}`;
    });

    // Collapsible: Blocked
    $('blockedToggle')?.addEventListener('click', () => {
      const wrap = $('blockedListWrap');
      if (!wrap) return;
      const hidden = wrap.style.display === 'none';
      wrap.style.display = hidden ? '' : 'none';
      $('blockedToggle').textContent = `🚫 Blocked Resources ${$('blockedCount')?.textContent || ''} ${hidden ? '▼' : '▶'}`;
    });

    // Clear Blocked
    $('clearBlockedBtn')?.addEventListener('click', async () => {
      await msg({ action: 'CLEAR_BLOCKED_LOG' });
      blockHistory = [];
      renderBlockedResources([]);
      showToast('🔥 Blocked log cleared', 'info');
    });

    // Export
    $('exportBlockedBtn')?.addEventListener('click', () => doExport());
    $('exportBtn')?.addEventListener('click', () => doExport());

    // Global search bar
    $('searchBar')?.addEventListener('input', (e) => {
      applySearchFilter(e.target.value.toLowerCase());
    });

    // Initial fetch
    await fetchAndRender();

    // Polling fallback (every 15s)
    setInterval(fetchAndRender, 15000);
  });

})();

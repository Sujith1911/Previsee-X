/**
 * PRIVISEE-X v4.0 — PopupController
 * WebAdvisor Mode UI Controller
 * Push-based updates via chrome.runtime.onMessage + polling fallback
 */

'use strict';

(function () {
  /* ── Helpers ──────────────────────────────────────────────────────────── */
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

  /* ── Risk color helpers ──────────────────────────────────────────────── */
  function riskColor(score) {
    if (score <= 25) return '#10b981';
    if (score <= 60) return '#f59e0b';
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

  /* ── State ──────────────────────────────────────────────────────────── */
  let lastData           = null;
  let currentDomain      = null;
  let blockHistory       = [];
  let trackerItems       = [];
  let collapsedTracker   = false;
  let collapsedBlocked   = false;
  let pushListenerBound  = false;

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
    lastData = data;
    currentDomain = data.domain || '';

    // Parallel: security layer + advisory + domain history
    const [sec, advisory, hist] = await Promise.all([
      msg({ action: 'GET_SECURITY_LAYER' }),
      msg({ action: 'GET_ADVISORY' }),
      currentDomain ? msg({ action: 'GET_DOMAIN_HISTORY', domain: currentDomain }) : Promise.resolve(null),
    ]);

    // Blocked log
    const blockedData = await msg({ action: 'GET_BLOCKED_LOG' });
    blockHistory = (blockedData?.items || []).slice().reverse();
    trackerItems = buildTrackerItems(data);

    // Setup push listener once
    if (!pushListenerBound) {
      pushListenerBound = true;
      chrome.runtime.onMessage.addListener(handlePushUpdate);
    }

    render(data, sec, advisory, hist);
  }

  /* ── Push update handler ─────────────────────────────────────────────── */
  function handlePushUpdate(message) {
    if (!message || message.type !== 'RISK_UPDATE') return;
    if (!lastData) return;
    // Merge updated data and re-render
    lastData = { ...lastData, ...message.data };
    fetchAndRender();
  }

  /* ── Build tracker items from data ──────────────────────────────────── */
  function buildTrackerItems(data) {
    const items = [];
    const seen  = new Set();
    // From blocked log
    for (const b of blockHistory.slice(0, 50)) {
      const k = b.domain + b.type;
      if (!seen.has(k)) {
        seen.add(k);
        items.push({ domain: b.domain, type: b.type || 'tracker', ts: b.ts, count: 1 });
      }
    }
    // Synthetic from stats (if not in blocked)
    if (data.trackerCount > items.length) {
      items.push({ domain: currentDomain, type: 'tracker', synthetic: true, count: data.trackerCount - items.length });
    }
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════
     render — update all UI panels
  ══════════════════════════════════════════════════════════════════════ */
  function render(data, sec, advisory, histData) {
    $('loading').style.display = 'none';
    $('content').style.display = 'block';

    const trusted = data.trusted || data.trustOverride;
    const score   = trusted ? 0 : clamp(data.riskScore, 0, 100);

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
    renderWABadge(score, data.riskLevel, trusted);

    // ── Score Bars ────────────────────────────────────────────────────
    const b = clamp(data.behavioralScore, 0, 100);
    const s = clamp(data.staticScore, 0, 100);
    const r = clamp(data.reputationScore, 0, 100);
    const sl = clamp(data.securityLayerScore, 0, 100);

    setBar('barBehavioral', 'valBehavioral', b, riskColor(b));
    setBar('barStatic', 'valStatic', s, riskColor(s));
    setBar('barReputation', 'valReputation', r, riskColor(r));
    // Security layer is: higher = better → green
    setBar('barSecurity', 'valSecurity', sl, sl >= 60 ? '#10b981' : sl >= 30 ? '#f59e0b' : '#ef4444');

    // ── Sparkline (risk history) ───────────────────────────────────────
    const timeline = histData?.riskTimeline || [];
    renderSparkline(timeline, score);

    // ── Firewall Stats ─────────────────────────────────────────────────
    $('adsBlockedCount').textContent      = data.adsBlockedCount || 0;
    $('trackersBlockedCount').textContent = data.trackersBlockedCount || 0;
    $('trackerCount').textContent         = data.trackerCount || 0;
    $('cookieCount').textContent          = data.cookieCount  || 0;

    // ── Security Layer Panel ───────────────────────────────────────────
    if (sec) renderSecurityLayer(sec);

    // ── Advisory Engine ────────────────────────────────────────────────
    if (advisory) renderAdvisory(advisory);

    // ── Tracker List ───────────────────────────────────────────────────
    renderTrackerList(trackerItems);

    // ── Risk Breakdown ─────────────────────────────────────────────────
    renderBreakdown(data.staticBreakdown || []);

    // ── Blocked Resources ──────────────────────────────────────────────
    renderBlockedResources(blockHistory);

    // ── Predictive Risk ────────────────────────────────────────────────
    renderProjection(data);

    // ── Research Mode ──────────────────────────────────────────────────
    const researchOn = $('researchToggle').checked;
    if (researchOn) renderResearch(data, sec);

    // ── Mode Toggles state ─────────────────────────────────────────────
    applySearchFilter($('searchBar').value.toLowerCase());
  }

  /* ── WebAdvisor Badge ─────────────────────────────────────────────── */
  function renderWABadge(score, level, trusted) {
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
  }

  /* ── Score bar setter ─────────────────────────────────────────────── */
  function setBar(barId, valId, value, color) {
    const el = $(barId);
    if (el) { el.style.width = value + '%'; el.style.background = color; }
    if (valId) { const v = $(valId); if (v) v.textContent = value; }
  }

  /* ── Canvas Sparkline ─────────────────────────────────────────────── */
  function renderSparkline(timeline, currentScore) {
    const canvas = $('sparkline');
    if (!canvas) return;

    const points = [...timeline.map(p => p.score)];
    if (!points.length || points[points.length - 1] !== currentScore) points.push(currentScore);

    const W = Math.max(240, points.length * 14);
    canvas.width  = W;
    canvas.height = 40;
    canvas.parentElement.scrollLeft = W; // scroll to end

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, 40);

    if (points.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText('Not enough history', 8, 22);
      $('sparklineLabel').textContent = '';
      return;
    }

    const min   = Math.min(...points);
    const max   = Math.max(...points, 1);
    const px    = (v) => 4 + (v / Math.max(max, 1)) * 32;
    const stepX = W / (points.length - 1);

    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 40);
    grad.addColorStop(0, 'rgba(99,102,241,.4)');
    grad.addColorStop(1, 'rgba(99,102,241,.01)');
    ctx.beginPath();
    ctx.moveTo(0, 40 - px(points[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(i * stepX, 40 - px(points[i]));
    ctx.lineTo(W, 40); ctx.lineTo(0, 40); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(0, 40 - px(points[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(i * stepX, 40 - px(points[i]));
    ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.stroke();

    // Last point dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc((points.length - 1) * stepX, 40 - px(last), 3, 0, Math.PI * 2);
    ctx.fillStyle = riskColor(last); ctx.fill();

    $('sparklineLabel').textContent = `${points.length} data points · peak ${max}`;

    // Tooltip on hover
    canvas.onmousemove = (e) => {
      const rect  = canvas.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const idx   = Math.round(x / stepX);
      if (idx >= 0 && idx < points.length) {
        const entry = timeline[idx];
        canvas.title = entry
          ? `Risk: ${points[idx]} · ${relTime(entry.ts)}`
          : `Risk: ${points[idx]}`;
      }
    };
  }

  /* ── Security Layer Panel ─────────────────────────────────────────── */
  function renderSecurityLayer(sec) {
    if (!sec) return;

    // Encryption
    setSecItem('encDot', 'encVal',
      sec.encryptionRaw === 'STRONG' ? 'green' : sec.encryptionRaw === 'WEAK' ? 'yellow' : 'red',
      sec.encryption || '—'
    );
    // Certificate
    const certClass = (sec.certSeverity === 'NONE') ? 'green' :
                      (sec.certSeverity === 'WARNING') ? 'yellow' : 'red';
    setSecItem('certDot', 'certVal', certClass, sec.certStatus || '—');

    // HSTS
    setSecItem('hstsDot', 'hstsVal',
      sec.hsts ? 'green' : 'yellow',
      sec.hsts ? 'Enabled' : 'Missing'
    );
    // Mixed Content
    setSecItem('mixedDot', 'mixedVal',
      sec.mixedContent ? 'red' : 'green',
      sec.mixedContent ? 'Detected' : 'Clean'
    );

    // Security Headers score bar
    const hsc = clamp(sec.securityHeadersScore, 0, 100);
    $('barSecHeaders').style.width = hsc + '%';
    $('barSecHeaders').style.background = hsc >= 60 ? '#10b981' : hsc >= 30 ? '#f59e0b' : '#ef4444';
    $('secHeaderScore').textContent = `${hsc}/100`;
    $('secHeaderScore').style.color = hsc >= 60 ? '#10b981' : hsc >= 30 ? '#f59e0b' : '#ef4444';
  }

  function setSecItem(dotId, valId, cls, text) {
    const dot = $(dotId); const val = $(valId);
    if (dot) dot.className = `sec-dot ${cls}`;
    if (val) { val.className = `val ${cls}`; val.textContent = text; }
  }

  /* ── Advisory Panel ───────────────────────────────────────────────── */
  function renderAdvisory(advisory) {
    const el = $('advisoryContent');
    if (!el) return;

    const obs  = advisory.observations || [];
    const recs = advisory.recommendations || [];

    if (!obs.length && !recs.length) {
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

    const recHtml = recs.length ? `
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px;">Recommendations</div>
      <div class="rec-list">
        ${recs.map(r => `
          <div class="rec-item">
            <span class="rec-icon">→</span>
            <span>${r}</span>
          </div>`).join('')}
      </div>` : '';

    el.innerHTML = obsHtml + recHtml;
  }

  /* ── Tracker List ─────────────────────────────────────────────────── */
  function renderTrackerList(items) {
    $('trackerListCount').textContent = `(${items.length})`;
    applyTrackerFilter();
  }

  function applyTrackerFilter() {
    const wrap  = $('trackerList');
    if (!wrap) return;
    const search = ($('trackerSearch')?.value || '').toLowerCase();
    const filter = $('trackerFilter')?.value || 'all';

    let filtered = trackerItems.filter(item => {
      if (filter !== 'all' && item.type !== filter) return false;
      if (search && !item.domain.toLowerCase().includes(search)) return false;
      return true;
    });

    if (!filtered.length) {
      wrap.innerHTML = `<div class="empty-state">${trackerItems.length ? 'No matches' : 'No trackers detected yet'}</div>`;
      return;
    }

    wrap.innerHTML = filtered.map(item => {
      const typeLabel = item.type === 'ad' ? 'AD' : item.type === 'fingerprint' ? 'FP' : 'TRK';
      const typeCls   = item.type === 'ad' ? 'tt-ad' : item.type === 'fingerprint' ? 'tt-fingerprint' : 'tt-tracker';
      return `<div class="tracker-item">
        <span class="tracker-type ${typeCls}">${typeLabel}</span>
        <span class="tracker-domain" title="${item.domain}">${item.domain}</span>
        <span class="tracker-risk">${item.ts ? relTime(item.ts) : ''}</span>
      </div>`;
    }).join('');
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
    $('blockedCount').textContent = `(${items.length})`;
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

    // Copy buttons
    wrap.querySelectorAll('.blocked-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard?.writeText(btn.dataset.domain).catch(() => {});
        btn.textContent = '✓'; setTimeout(() => btn.textContent = '⧉', 1200);
      });
    });
  }

  /* ── Predictive Risk ──────────────────────────────────────────────── */
  function renderProjection(data) {
    const current = clamp(data.riskScore, 0, 100);
    const proj    = data.projection;
    const future  = proj ? clamp(proj, 0, 100) : null;

    $('projCurrent').textContent = current;
    $('projCurrent').style.color = riskColor(current);
    $('projCurrentLbl').textContent = data.riskLevel || '—';
    $('projCurrentLbl').style.color = riskColor(current);

    if (future !== null) {
      $('projFuture').textContent = future;
      $('projFuture').style.color = riskColor(future);
      $('projConf').textContent = 'Based on 30-day trend';

      const diff = future - current;
      const trend = $('projTrend');
      $('projArrow').textContent = diff > 5 ? '↗' : diff < -5 ? '↘' : '→';
      $('projArrow').style.color = diff > 5 ? '#ef4444' : diff < -5 ? '#10b981' : '#6366f1';
      $('projInfo').textContent  = diff > 5
        ? `Risk trending higher (+${diff} pts)`
        : diff < -5 ? `Risk improving (${diff} pts)`
        : 'Risk stable based on history';
    } else {
      $('projFuture').textContent = '—';
      $('projConf').textContent = 'Collecting data…';
      $('projArrow').textContent = '→';
      $('projArrow').style.color = '#6366f1';
      $('projInfo').textContent = 'More browsing data needed for projection';
    }
  }

  /* ── Research Mode ────────────────────────────────────────────────── */
  function renderResearch(data, sec) {
    $('r_sessionRisk').textContent  = data.currentSessionRisk ?? data.riskScore ?? '—';
    $('r_historicalRisk').textContent = data.historicalRisk ?? '—';
    $('r_dnaHash').textContent      = data.dnaHash || '—';
    $('r_static').textContent       = data.staticScore ?? '—';
    $('r_security').textContent     = data.securityLayerScore ?? '—';
    $('r_projConf').textContent     = data.projection ? `${data.projection}/100` : '—';
    $('r_cluster').textContent      = data.dnaHash ? (data.clusterName || 'computed') : '—';
    $('r_tls').textContent          = sec
      ? `${sec.encryption || '?'} | HSTS:${sec.hsts ? 'yes' : 'no'} | ${sec.certStatus || '?'}`
      : '—';

    // Raw security headers
    const rawH = data.rawHeaders || {};
    const importantH = ['content-security-policy','strict-transport-security','x-frame-options',
      'referrer-policy','permissions-policy','x-content-type-options'];
    const headerLines = importantH
      .filter(k => rawH[k])
      .map(k => `${k}: ${rawH[k].slice(0, 60)}${rawH[k].length > 60 ? '…' : ''}`);
    $('r_headers').textContent = headerLines.length
      ? headerLines.join('\n')
      : Object.keys(rawH).length ? '(headers present — none of interest)' : 'No headers captured yet';

    // Behavioral log
    const behavKeys = ['canvas','webgl','audio','fonts','webrtc','fetch','xhr','websocket','clipboard'];
    const behavLog = behavKeys.map(k => `${k}: ${0}`).join(' | ');
    $('r_behavLogs').textContent = '(Session counts appear in Statistics section above)';
  }

  /* ── Search Filter ────────────────────────────────────────────────── */
  function applySearchFilter(q) {
    if (!q) return; // no global filter when empty — local filters handle it
    $('trackerSearch').value = q;
    applyTrackerFilter();
  }

  /* ── Collapsible Sections ──────────────────────────────────────────── */
  function toggleCollapse(wrapId, flagRef) {
    return () => {
      const el = $(wrapId);
      if (!el) return;
      const hidden = el.style.display === 'none';
      el.style.display = hidden ? '' : 'none';
    };
  }

  /* ── Export Helper ────────────────────────────────────────────────── */
  async function doExport() {
    const blob = new Blob([JSON.stringify({ ...lastData, blockHistory, timestamp: new Date().toISOString() }, null, 2)],
      { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `privisee-${currentDomain}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Show error helper ────────────────────────────────────────────── */
  function showError(msg) {
    $('loading').style.display = 'none';
    $('content').style.display = 'block';
    $('waSub').textContent = msg;
  }

  /* ══════════════════════════════════════════════════════════════════════
     Event Listeners — set up once on DOMContentLoaded
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

    // Trust / Untrust button (single handler, async, immediate UI)
    $('trustBtn')?.addEventListener('click', async () => {
      if (!currentDomain || !lastData) return;
      const trusted = lastData.trusted || lastData.trustOverride;
      $('trustBtn').disabled = true;
      try {
        if (trusted) {
          await msg({ action: 'UNTRUST_DOMAIN', domain: currentDomain });
        } else {
          await msg({ action: 'TRUST_DOMAIN', domain: currentDomain });
        }
        await fetchAndRender();
      } finally {
        $('trustBtn').disabled = false;
      }
    });

    // Untrust from banner
    $('untrustBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      await msg({ action: 'UNTRUST_DOMAIN', domain: currentDomain });
      await fetchAndRender();
    });

    // Delete Cookies
    $('deleteCookiesBtn')?.addEventListener('click', async () => {
      if (!currentDomain) return;
      const btn = $('deleteCookiesBtn');
      btn.disabled = true; btn.textContent = '⏳ Deleting…';
      try {
        await msg({ action: 'DELETE_COOKIES', domain: currentDomain });
        btn.textContent = '✓ Cookies Cleared';
        setTimeout(() => { btn.textContent = '🍪 Delete Cookies'; btn.disabled = false; }, 1500);
        await fetchAndRender();
      } catch {
        btn.disabled = false; btn.textContent = '🍪 Delete Cookies';
      }
    });

    // Strict Mode
    $('strictToggle')?.addEventListener('change', async (e) => {
      const on = e.target.checked;
      await chrome.storage.local.set({ strictMode: on });
      await msg({ action: 'SET_STRICT_MODE', enabled: on });
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

    // Tracker list filter + search
    $('trackerSearch')?.addEventListener('input', applyTrackerFilter);
    $('trackerFilter')?.addEventListener('change', applyTrackerFilter);

    // Collapsible: Tracker list
    $('trackerListToggle')?.addEventListener('click', () => {
      const wrap = $('trackerListWrap');
      if (!wrap) return;
      const hidden = wrap.style.display === 'none';
      wrap.style.display = hidden ? '' : 'none';
      $('trackerListToggle').textContent =
        `🕵️ Trackers ${$('trackerListCount').textContent} ${hidden ? '▼' : '▶'}`;
    });

    // Collapsible: Blocked
    $('blockedToggle')?.addEventListener('click', () => {
      const wrap = $('blockedListWrap');
      if (!wrap) return;
      const hidden = wrap.style.display === 'none';
      wrap.style.display = hidden ? '' : 'none';
      $('blockedToggle').textContent =
        `🚫 Blocked Resources ${$('blockedCount').textContent} ${hidden ? '▼' : '▶'}`;
    });

    // Clear Blocked
    $('clearBlockedBtn')?.addEventListener('click', async () => {
      await msg({ action: 'CLEAR_BLOCKED_LOG' });
      blockHistory = [];
      renderBlockedResources([]);
    });

    // Export Blocked
    $('exportBlockedBtn')?.addEventListener('click', () => doExport());

    // Export All
    $('exportBtn')?.addEventListener('click', () => doExport());

    // Global search bar
    $('searchBar')?.addEventListener('input', (e) => {
      applySearchFilter(e.target.value.toLowerCase());
    });

    // Initial fetch
    await fetchAndRender();

    // Polling fallback for tabs that don't push updates (every 20s)
    setInterval(fetchAndRender, 20000);
  });

})();

/**
 * PRIVISEE-X v5.0 — DashboardController
 *
 * Features:
 *  - Global site filter bar — applies to ALL tabs simultaneously
 *  - Advanced filters: Risk Level, Date Range, Certificate Status, Trusted/Untrusted
 *  - Blocked Ads tab + Firewall Log tab (blocked requests with full URL toggle)
 *  - Global real-time search across all tabs
 *  - Cookie delete per-row + Delete All Cookies for Site
 *  - Tracker delete per-row + Delete All Trackers for Site
 *  - Sites tab with full stats + delete/whitelist per site
 *  - Risk timeline chart with range filtering + improved tooltips
 *  - Export JSON (full analytics)
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // ── State ──────────────────────────────────────────────────────────────────
  let allSites      = [];
  let allCookies    = [];
  let allTrackers   = [];
  let allBlocked    = [];
  let riskChart     = null;
  let selectedSite  = '';
  let showFullURLs  = false;
  let globalSearch  = '';
  let adsBlockedTotal      = 0;
  let trackersBlockedTotal = 0;

  // v5.0 Advanced filter state
  let activeRiskLevel   = 'all';  // all | safe | moderate | high | critical
  let activeDateRange   = 'all';  // all | today | 7d | 30d
  let showTrustedOnly   = false;
  let activeChartRange  = '24h';  // 24h | 7d | 30d | all
  let activeCertFilter  = 'all';  // all | clean | warning | invalid
  let lastHistory       = [];

  // ── Messenger ──────────────────────────────────────────────────────────────
  function send(payload) {
    return new Promise(resolve => {
      const t = setTimeout(() => resolve(null), 8000);
      try {
        chrome.runtime.sendMessage(payload, resp => {
          clearTimeout(t);
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(resp);
        });
      } catch { clearTimeout(t); resolve(null); }
    });
  }

  // ── Formatters ─────────────────────────────────────────────────────────────
  function riskBadge(score) {
    score = score || 0;
    if (score >= 75) return `<span class="badge b-crit">CRIT&nbsp;${score}</span>`;
    if (score >= 50) return `<span class="badge b-high">HIGH&nbsp;${score}</span>`;
    if (score >= 20) return `<span class="badge b-mod">MED&nbsp;${score}</span>`;
    if (score >= 1)  return `<span class="badge b-low">LOW&nbsp;${score}</span>`;
    return `<span class="badge b-safe">SAFE</span>`;
  }

  function expiryPill(days, isSession) {
    if (isSession || days == null) return '<span class="ep ep-sess">Session</span>';
    if (days <= 0)  return '<span class="ep ep-exp">Expired</span>';
    if (days <= 7)  return `<span class="ep ep-soon">${days}d</span>`;
    return `<span class="ep ep-ok">${days}d</span>`;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function relTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString([], { dateStyle:'short', timeStyle:'short' });
  }

  function categoryOf(domain) {
    const ad  = ['doubleclick','googlesyndication','amazon-adsystem','adnxs','criteo','pubmatic','rubiconproject','openx','taboola','outbrain','adroll','media.net'];
    const ana = ['google-analytics','analytics.twitter','hotjar','fullstory','mouseflow','clarity.ms','mixpanel','amplitude','segment','heap','newrelic'];
    const d = domain.toLowerCase();
    if (ad.some(k => d.includes(k)))  return '<span style="color:#f97316">📢 Advertising</span>';
    if (ana.some(k => d.includes(k))) return '<span style="color:#f59e0b">📊 Analytics</span>';
    return '<span style="color:#64748b">🔌 Other</span>';
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  async function fetchAll() {
    const hours = activeChartRange === '7d' ? 168 : activeChartRange === '30d' ? 720 : activeChartRange === 'all' ? 876000 : 24;
    const [dash, ck, tr, hist, bl] = await Promise.all([
      send({ action: 'GET_DASHBOARD_DATA' }),
      send({ action: 'GET_ALL_COOKIES', domain: selectedSite || undefined }),
      send({ action: 'GET_TRACKERS_FOR_SITE', siteDomain: selectedSite || undefined }),
      send({ action: 'GET_RISK_HISTORY', hours }),
      send({ action: 'GET_BLOCKED_REQUESTS', limit: 500 })
    ]);
    allSites      = (dash?.sites || []).filter(s => s.domain && s.domain !== '__whitelist__');
    allCookies    = ck?.cookies  || [];
    allTrackers   = tr?.trackers || [];
    allBlocked    = bl?.blocked  || [];
    adsBlockedTotal      = bl?.adsBlockedCount      || dash?.adsBlockedCount      || 0;
    trackersBlockedTotal = bl?.trackersBlockedCount || dash?.trackersBlockedCount || 0;
    lastHistory          = hist?.history || [];
    return lastHistory;
  }

  // ── Global site-filter selector ────────────────────────────────────────────
  function populateSiteFilter() {
    const sel = $('globalSiteFilter');
    const cur = sel.value;
    const domains = allSites.map(s => s.domain).sort();
    sel.innerHTML = '<option value="">All Sites</option>' +
      domains.map(d => `<option value="${esc(d)}" ${d === cur ? 'selected' : ''}>${esc(d)}</option>`).join('');
    if (cur && domains.includes(cur)) sel.value = cur;
  }

  function applyGlobalFilter(site) {
    selectedSite = site;
    const info = $('filterInfo');
    if (info) info.textContent = site ? `Showing data for: ${site}` : '';
    const btn = $('deleteAllCookiesForSite');
    const btn2 = $('deleteAllTrackersForSite');
    if (btn) btn.style.display  = site ? 'inline-flex' : 'none';
    if (btn2) btn2.style.display = site ? 'inline-flex' : 'none';
  }

  // ── Stats row ───────────────────────────────────────────────────────────────
  function renderStats() {
    try {
      const src = selectedSite ? allSites.filter(s => s.domain === selectedSite) : allSites;
      const total    = src.length;
      const trackers = src.reduce((a,s) => a + (s.trackerCount || 0), 0);
      const blocked  = src.reduce((a,s) => a + (s.blockedAds   || 0), 0);
      const ads      = src.reduce((a,s) => a + (s.adCount      || 0), 0);
      const cookies  = allCookies.length;
      const fp       = src.reduce((a,s) => a + (s.fingerprintCount || 0), 0);
      const avgRisk  = total > 0 ? Math.round(src.reduce((a,s) => a + (s.riskScore||0), 0) / total) : 0;
      const highRisk = src.filter(s => (s.riskScore||0) >= 50).length;

      $('st-sites').textContent    = total;
      $('st-trackers').textContent = trackers;
      $('st-blocked').textContent  = adsBlockedTotal || blocked;
      if ($('st-trackers-blocked')) $('st-trackers-blocked').textContent = trackersBlockedTotal;
      $('st-ads').textContent      = ads;
      $('st-cookies').textContent  = cookies;
      $('st-fp').textContent       = fp;
      $('st-risk').textContent     = avgRisk;
      $('st-highrisk').textContent = highRisk;
    } catch(e) { console.error('[Dash] stats:', e); }
  }

  // ── Risk chart ──────────────────────────────────────────────────────────────
  function renderChart(history) {
    try {
      if (typeof Chart === 'undefined') {
        $('chartMsg').style.display  = 'block';
        $('riskChart').style.display = 'none'; return;
      }
      let filtered = history || [];
      if (selectedSite) filtered = filtered.filter(h => h.domain === selectedSite);
      filtered.sort((a,b) => a.timestamp - b.timestamp);

      // Bucket by 15 min
      const bucket = {};
      filtered.forEach(h => {
        const k = Math.floor(h.timestamp / 900000) * 900000;
        if (!bucket[k] || h.score > bucket[k]) bucket[k] = h.score;
      });
      const pts    = Object.keys(bucket).sort().map(k => ({ t:+k, s:bucket[k] }));
      const labels = pts.map(p => new Date(p.t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));
      const scores = pts.map(p => p.s);

      if (riskChart) { riskChart.destroy(); riskChart = null; }

      if (!pts.length) {
        $('chartMsg').style.display  = 'block';
        $('riskChart').style.display = 'none'; return;
      }
      $('chartMsg').style.display  = 'none';
      $('riskChart').style.display = 'block';

      riskChart = new Chart($('riskChart').getContext('2d'), {
        type:'line',
        data:{
          labels,
          datasets:[{
            label:'Risk',data:scores,
            borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.1)',
            fill:true,tension:.4,borderWidth:2,
            pointBackgroundColor:scores.map(s=>s>=75?'#ef4444':s>=50?'#f97316':s>=20?'#f59e0b':'#10b981'),
            pointRadius:5,pointHoverRadius:7
          }]
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:i=>` Risk: ${i.raw}`}}},
          scales:{
            y:{min:0,max:100,ticks:{color:'#64748b'},grid:{color:'rgba(255,255,255,0.04)'}},
            x:{ticks:{color:'#64748b',maxRotation:30},grid:{color:'rgba(255,255,255,0.02)'}}
          }
        }
      });
    } catch(e) {
      console.error('[Dash] chart:', e);
      try { $('chartMsg').style.display='block'; $('riskChart').style.display='none'; } catch {}
    }
  }

  // ── Sites tab ───────────────────────────────────────────────────────────────
  // ── Sites tab (v5.0: multi-criteria filter) ──────────────────────────────────
  function renderSites(q = '') {
    try {
      const tbody = $('sitesBody');
      const fl    = q.toLowerCase();

      // Date cutoff for activeDateRange filter
      let dateCutoff = 0;
      if      (activeDateRange === 'today') dateCutoff = new Date().setHours(0,0,0,0);
      else if (activeDateRange === '7d')    dateCutoff = Date.now() - 7*86400000;
      else if (activeDateRange === '30d')   dateCutoff = Date.now() - 30*86400000;

      const rows = allSites
        .filter(s => (!selectedSite || s.domain === selectedSite))
        .filter(s => !fl || s.domain.toLowerCase().includes(fl))
        // Risk level filter
        .filter(s => {
          const sc = s.riskScore || 0;
          if (activeRiskLevel === 'safe')     return sc <= 15;
          if (activeRiskLevel === 'moderate') return sc > 15 && sc <= 60;
          if (activeRiskLevel === 'high')     return sc > 60 && sc <= 80;
          if (activeRiskLevel === 'critical') return sc > 80;
          return true; // 'all'
        })
        // Date range filter (by lastVisit)
        .filter(s => !dateCutoff || (s.lastVisit && s.lastVisit >= dateCutoff))
        // Trusted filter
        .filter(s => !showTrustedOnly || s.trusted)
        // Certificate status filter
        .filter(s => {
          if (activeCertFilter === 'all') return true;
          const sev = (s.certSeverity || 'NONE').toUpperCase();
          if (activeCertFilter === 'clean')   return sev === 'NONE';
          if (activeCertFilter === 'warning') return sev === 'WARNING';
          if (activeCertFilter === 'invalid') return sev === 'CRITICAL' || sev === 'ERROR';
          return true;
        })
        .sort((a,b) => (b.riskScore||0) - (a.riskScore||0));

      $('siteCnt').textContent = `${rows.length} site${rows.length!==1?'s':''}` +
        (activeRiskLevel !== 'all' || activeDateRange !== 'all' || activeCertFilter !== 'all' ? ' (filtered)' : '');

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
          <div class="ico">🌐</div>
          ${q||selectedSite ? 'No sites match your filters.' : 'No sites yet. Browse some websites, then refresh.'}
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(s => `<tr>
        <td><strong style="cursor:pointer;color:var(--acc)" onclick="filterBySite('${esc(s.domain)}')">${esc(s.domain)}</strong></td>
        <td>${riskBadge(s.riskScore)}</td>
        <td style="color:${(s.trackerCount||0)>10?'var(--orange)':'inherit'}">${s.trackerCount||0}</td>
        <td style="color:${(s.blockedAds||0)>0?'var(--red)':'var(--muted)'}"><strong>${s.blockedAds||0}</strong>${(s.blockedAds||0)>0?' 🚫':''}</td>
        <td>${s.cookieCount||0}</td>
        <td style="color:${(s.fingerprintCount||0)>0?'var(--yellow)':'var(--muted)'}">
          ${s.fingerprintCount||0}${(s.fingerprintCount||0)>0?' ⚠️':''}
        </td>
        <td style="color:var(--muted);font-size:12px">${relTime(s.lastVisit)}</td>
        <td><div class="ac">
          <button class="btn btn-sm btn-trust" onclick="doWhitelist('${esc(s.domain)}')">✓ Trust</button>
          <button class="btn btn-sm" style="background:var(--s2);color:var(--text)" onclick="filterBySite('${esc(s.domain)}')">🔍 Filter</button>
          <button class="btn btn-sm btn-danger" onclick="doDeleteSite('${esc(s.domain)}')">🗑</button>
        </div></td>
      </tr>`).join('');
    } catch(e) { console.error('[Dash] sites:', e); }
  }

  // ── Cookies tab ─────────────────────────────────────────────────────────────
  function renderCookies(q = '', sortBy = 'domain') {
    try {
      const tbody = $('ckBody');
      const fl    = q.toLowerCase();
      let rows    = allCookies.filter(c => {
        const d = (c.domain||'').replace(/^\./,'');
        if (selectedSite && !d.includes(selectedSite) && !selectedSite.includes(d)) return false;
        if (fl && !d.includes(fl) && !(c.name||'').toLowerCase().includes(fl)) return false;
        return true;
      });

      // Sort
      if (sortBy === 'expiry_soon') rows.sort((a,b) => (a.isSession?99999:a.daysRemaining??99998) - (b.isSession?99999:b.daysRemaining??99998));
      else if (sortBy === 'expiry_late') rows.sort((a,b) => (b.isSession?-1:b.daysRemaining??-1) - (a.isSession?-1:a.daysRemaining??-1));
      else if (sortBy === 'name')   rows.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      else                          rows.sort((a,b) => (a.domain||'').localeCompare(b.domain||''));

      $('ckCnt').textContent = `${rows.length} cookie${rows.length!==1?'s':''}`;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
          <div class="ico">🍪</div>${fl||selectedSite ? 'No matching cookies.' : 'No cookies found.'}
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((c, i) => {
        const domain = (c.domain||'').replace(/^\./,'');
        const url    = `${c.secure?'https':'http'}://${domain}${c.path||'/'}`;
        return `<tr>
          <td style="color:var(--muted);font-size:12px">${esc(domain)}</td>
          <td><strong>${esc(c.name)}</strong></td>
          <td style="font-size:12px;color:var(--muted)">${esc(c.expiryFormatted||'Session')}</td>
          <td>${expiryPill(c.daysRemaining, c.isSession)}</td>
          <td>${c.secure?'🔒':'<span style="color:var(--muted)">—</span>'}</td>
          <td style="font-size:12px">${c.httpOnly?'✓':'<span style="color:var(--muted)">—</span>'}</td>
          <td style="font-size:12px;color:var(--muted)">${esc(c.sameSite||'—')}</td>
          <td><button class="btn btn-sm btn-danger" onclick="doDeleteCookie('${esc(c.name)}','${esc(url)}',${i})">🗑 Delete</button></td>
        </tr>`;
      }).join('');
    } catch(e) { console.error('[Dash] cookies:', e); }
  }

  // ── Trackers tab ─────────────────────────────────────────────────────────────
  function renderTrackers(q = '') {
    try {
      const tbody = $('trBody');
      const fl    = q.toLowerCase();
      const rows  = allTrackers.filter(t => {
        if (selectedSite && t.siteDomain !== selectedSite) return false;
        if (fl && !t.trackerDomain.toLowerCase().includes(fl) && !t.siteDomain.toLowerCase().includes(fl)) return false;
        return true;
      }).sort((a,b) => (b.count||0) - (a.count||0));

      $('trCnt').textContent = `${rows.length} tracker${rows.length!==1?'s':''}`;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
          <div class="ico">🕵️</div>${fl||selectedSite ? 'No matching trackers.' : 'No trackers detected yet.'}
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(t => `<tr>
        <td style="color:var(--muted);font-size:12px">
          <span style="cursor:pointer;color:var(--acc)" onclick="filterBySite('${esc(t.siteDomain)}')">${esc(t.siteDomain)}</span>
        </td>
        <td><strong>${esc(t.trackerDomain)}</strong></td>
        <td>${categoryOf(t.trackerDomain)}</td>
        <td>${t.count||1}</td>
        <td style="color:var(--muted);font-size:12px">${relTime(t.lastSeen)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="doDeleteTracker('${esc(t.id)}')">🗑 Delete</button></td>
      </tr>`).join('');
    } catch(e) { console.error('[Dash] trackers:', e); }
  }

  // ── Blocked Ads tab ───────────────────────────────────────────────────────────
  function renderAds(q = '') {
    try {
      const tbody = $('adBody');
      const fl    = q.toLowerCase();
      const rows  = allSites
        .filter(s => (s.blockedAds||0) > 0 || (s.adCount||0) > 0)
        .filter(s => !selectedSite || s.domain === selectedSite)
        .filter(s => !fl || s.domain.toLowerCase().includes(fl))
        .sort((a,b) => (b.blockedAds||0) - (a.blockedAds||0));

      $('adCnt').textContent = `${rows.length} site${rows.length!==1?'s':''} with ad activity`;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
          <div class="ico">🚫</div>${fl||selectedSite ? 'No matching sites.' : 'No ads detected yet. Browse websites to start capturing data.'}
        </div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(s => `<tr>
        <td>
          <strong style="cursor:pointer;color:var(--acc)" onclick="filterBySite('${esc(s.domain)}')">${esc(s.domain)}</strong>
        </td>
        <td><span style="color:var(--red);font-size:18px;font-weight:700">${s.blockedAds||0}</span> 🚫</td>
        <td>${s.trackerCount||0}</td>
        <td>${riskBadge(s.riskScore)}</td>
        <td><div class="ac">
          <button class="btn btn-sm btn-trust" onclick="doWhitelist('${esc(s.domain)}')">✓ Trust Domain</button>
          <button class="btn btn-sm btn-danger" onclick="doDeleteSite('${esc(s.domain)}')">🗑 Remove</button>
          <button class="btn btn-sm btn-trust" data-action="whitelist" data-domain="${esc(s.domain)}">✓ Trust Domain</button>
          <button class="btn btn-sm btn-danger" data-action="deleteSite" data-domain="${esc(s.domain)}">🗑 Remove</button>
        </div></td>
      </tr>`).join('');
    } catch(e) { console.error('[Dash] ads:', e); }
  }

  // ── Event Delegation for table row actions ───────────────────────────
  // Data-action attributes on buttons prevent window namespace pollution.
  // Handlers here are attached to stable ancestor elements.

  function attachTableDelegation() {
    // Unified click handler for all data-tables
    const delegateClick = async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, domain, id, name, url } = btn.dataset;

      switch (action) {
        case 'filterSite':
          _filterBySite(domain);
          break;
        case 'deleteSite':
          await _doDeleteSite(domain);
          break;
        case 'whitelist':
          await _doWhitelist(domain);
          break;
        case 'deleteCookie': {
          const ok = await send({ action: 'DELETE_COOKIE', name, url });
          if (ok?.success) {
            allCookies = allCookies.filter(c => !(c.name === name && c.domain === btn.dataset.cookieDomain));
            renderStats();
            renderCookies($('ckSearch')?.value || '', $('ckSort')?.value || 'domain');
          } else {
            alert('Could not delete cookie. Some browser cookies are protected.');
          }
          break;
        }
        case 'deleteTracker':
          await send({ action: 'DELETE_TRACKER', id });
          allTrackers = allTrackers.filter(t => t.id !== id);
          renderTrackers($('trSearch')?.value || '');
          renderStats();
          break;
      }
    };

    ['sitesBody', 'ckBody', 'trBody', 'adBody'].forEach(tbodyId => {
      const el = $(tbodyId);
      if (el) el.addEventListener('click', delegateClick);
    });
  }

  // Internal action helpers (not on window)
  function _filterBySite(domain) {
    selectedSite = domain || '';
    $('globalSiteFilter').value = selectedSite;
    applyGlobalFilter(selectedSite);
    renderAll(lastHistory);
  }

  async function _doDeleteSite(domain) {
    if (!confirm(`Remove "${domain}" and all its data?`)) return;
    await send({ action: 'DELETE_SITE', domain });
    allSites    = allSites.filter(s => s.domain !== domain);
    allTrackers = allTrackers.filter(t => t.siteDomain !== domain);
    if (selectedSite === domain) { selectedSite = ''; $('globalSiteFilter').value = ''; applyGlobalFilter(''); }
    renderStats(); populateSiteFilter();
    renderSites($('siteSearch')?.value || '');
    renderTrackers($('trSearch')?.value || '');
    renderAds($('adSearch')?.value || '');
  }

  async function _doWhitelist(domain) {
    await send({ action: 'WHITELIST_DOMAIN', domain });
    showDashToast(`✅ "${domain}" trusted — domain will no longer affect risk score`, 'success');
    await refresh();
  }

  // ── Dashboard toast helper ───────────────────────────────────────────────────
  function showDashToast(message, type = 'success', duration = 2500) {
    let container = $('dashToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dashToastContainer';
      container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
      document.body.appendChild(container);
    }
    const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1', warning: '#f59e0b' };
    const icons  = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast  = document.createElement('div');
    toast.style.cssText = `background:#1e2438;border:1px solid ${colors[type]}50;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,.6);pointer-events:auto;border-left:3px solid ${colors[type]};max-width:320px;`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // Keep minimal window. exports for HTML onclick fallback (backwards compat with popup)
  window.filterBySite = _filterBySite;

  window.doDeleteSite    = _doDeleteSite;
  window.doWhitelist     = _doWhitelist;

  // ── Firewall Log Tab ──────────────────────────────────────────────────────────
  function renderBlocked(q = '') {
    try {
      const tbody = $('blBody'); if (!tbody) return;
      const fl = (q || globalSearch).toLowerCase();
      const rows = allBlocked.filter(b => {
        if (selectedSite && b.domain !== selectedSite && !b.domain.includes(selectedSite)) return false;
        if (fl && !b.domain.includes(fl) && !(showFullURLs && b.fullURL.includes(fl))) return false;
        return true;
      });
      if ($('blCnt')) $('blCnt').textContent = `${rows.length} entries`;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="ico">🔥</div>${fl||selectedSite?'No matching entries.':'Firewall log is empty. Browse sites to capture blocked requests.'}</div></td></tr>`;
        return;
      }
      tbody.innerHTML = rows.slice(0,250).map(b => {
        const typeColor = b.type==='ad'?'var(--red)':b.type==='tracker'?'var(--yellow)':'#a78bfa';
        const displayURL = showFullURLs ? esc(b.fullURL) : esc(b.domain);
        const ts = new Date(b.timestamp).toLocaleString([],{dateStyle:'short',timeStyle:'short'});
        return `<tr>
          <td><strong>${esc(b.domain)}</strong></td>
          <td><span style="color:${typeColor};font-size:11px;font-weight:700">${b.type}</span></td>
          <td style="font-size:11px;color:var(--muted);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(b.fullURL)}">${displayURL}</td>
          <td style="font-size:11px;color:var(--muted)">${ts}</td>
        </tr>`;
      }).join('');
    } catch(e) { console.error('[Dash] blocked:', e); }
  }

  // ── Export JSON ────────────────────────────────────────────────────────────
  async function exportJSON() {
    const src = selectedSite ? allSites.filter(s => s.domain===selectedSite) : allSites;
    const out = {
      exportedAt: new Date().toISOString(),
      filter: selectedSite || 'all',
      summary: { sites: src.length, adsBlockedTotal, trackersBlockedTotal },
      sites:   src,
      trackers:allTrackers.filter(t => !selectedSite || t.siteDomain===selectedSite),
      blockedRequests: allBlocked.filter(b => !selectedSite || b.domain.includes(selectedSite))
    };
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'})),
      download: `privisee_x_${selectedSite||'all'}_${Date.now()}.json`
    });
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  }

  // ── Render all tabs ────────────────────────────────────────────────────────
  function renderAll(history) {
    renderStats();
    if (history !== undefined) renderChart(history);
    renderSites($('siteSearch')?.value||'');
    renderCookies($('ckSearch')?.value||'', $('ckSort')?.value||'domain');
    renderTrackers($('trSearch')?.value||'');
    renderAds($('adSearch')?.value||'');
    renderBlocked($('blSearch')?.value||'');
  }

  // ── Graph Panel (v5.0: zoom/pan + tooltip + risk rings) ──────────
  async function renderGraph() {
    const container = $('graphPanel');
    if (!container) return;
    const resp = await send({ action: 'GET_GRAPH_DATA' });
    if (!resp?.success || !resp.nodes.length) {
      container.innerHTML = '<div class="empty-state"><div class="ico">🕸️</div>No graph data yet. Browse some websites first.</div>';
      return;
    }
    const { nodes, links } = resp;

    if (typeof d3 === 'undefined') {
      container.innerHTML = '<div class="empty-state">Graph library not loaded. Ensure src/lib/d3.min.js is present.</div>';
      return;
    }

    container.innerHTML = '';
    container.style.position = 'relative';
    const W = container.clientWidth  || 900;
    const H = container.clientHeight || 500;

    // ── Floating tooltip ──────────────────────────────────────────
    let tip = document.getElementById('graphTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'graphTooltip';
      tip.style.cssText = 'position:fixed;pointer-events:none;background:#1e2438;border:1px solid rgba(99,102,241,.45);border-radius:8px;padding:8px 12px;font-size:11px;color:#e2e8f0;z-index:9000;display:none;max-width:220px;box-shadow:0 4px 20px rgba(0,0,0,.7);line-height:1.7;';
      document.body.appendChild(tip);
    }

    const riskC = s => s >= 75 ? '#ef4444' : s >= 50 ? '#f97316' : s >= 20 ? '#f59e0b' : '#10b981';

    const svg = d3.select(container)
      .append('svg').attr('width', W).attr('height', H)
      .attr('style', 'background:#0f172a;border-radius:8px;cursor:grab;');

    // ── Zoom/pan ───────────────────────────────────────────────────
    const zoomLayer = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.15, 5])
      .on('zoom', ev => zoomLayer.attr('transform', ev.transform));
    svg.call(zoom);

    // Zoom controls overlay
    const ctrlWrap = d3.select(container).append('div')
      .style('position','absolute').style('top','10px').style('right','10px')
      .style('display','flex').style('flex-direction','column').style('gap','4px').style('z-index','50');
    [['＋', () => svg.transition().call(zoom.scaleBy, 1.45)],
     ['－', () => svg.transition().call(zoom.scaleBy, 0.7)],
     ['⌂',  () => svg.transition().call(zoom.transform, d3.zoomIdentity)]
    ].forEach(([label, action]) => {
      ctrlWrap.append('button').text(label)
        .style('width','28px').style('height','28px').style('border-radius','6px')
        .style('border','1px solid rgba(255,255,255,.1)').style('background','rgba(30,36,56,.9)')
        .style('color','#e2e8f0').style('cursor','pointer').style('font-size','14px')
        .on('click', action);
    });

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(130))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(22));

    // Edges — colour by category
    const link = zoomLayer.append('g').selectAll('line')
      .data(links).join('line')
      .attr('stroke', d => {
        const t = (d.category || '').toLowerCase();
        return t === 'advertising' ? '#ef444455' : t === 'analytics' ? '#f59e0b55' : 'rgba(255,255,255,0.12)';
      })
      .attr('stroke-width', d => Math.min(4, Math.sqrt(d.value || 1)));

    const nodeG = zoomLayer.append('g').selectAll('g')
      .data(nodes).join('g')
      .call(d3.drag()
        .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
        .on('drag',  (ev, d) => { d.fx=ev.x; d.fy=ev.y; })
        .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }));

    // Risk ring on site nodes
    nodeG.filter(d => d.type === 'site').append('circle')
      .attr('r', 14).attr('fill','none')
      .attr('stroke', d => riskC(d.riskScore || 0))
      .attr('stroke-width', 2.5).attr('stroke-dasharray','4 2');

    // Main circle
    nodeG.append('circle')
      .attr('r', d => d.type === 'site' ? 10 : Math.min(18, 6 + Math.log2((d.weight||1) + 1) * 3))
      .attr('fill', d => d.type === 'site' ? '#6366f1' : '#f97316')
      .attr('stroke','#fff').attr('stroke-width',1.5);

    // Label
    nodeG.append('text')
      .text(d => d.id.length > 22 ? d.id.substring(0,20)+'\u2026' : d.id)
      .attr('fill','#94a3b8').attr('font-size','9px')
      .attr('dy', d => d.type === 'site' ? 28 : 24).attr('text-anchor','middle');

    // Tooltip events
    nodeG.on('mouseenter', (ev, d) => {
        const sc = d.riskScore != null ? d.riskScore : null;
        tip.innerHTML = [
          `<strong style="color:${d.type==='site'?'#818cf8':'#fb923c'}">${d.id}</strong>`,
          `<span style="color:#64748b;font-size:10px;text-transform:uppercase">${d.type}</span>`,
          d.weight  ? `Connections: <strong>${d.weight}</strong>`  : '',
          sc != null ? `Risk: <strong style="color:${riskC(sc)}">${sc}</strong>` : '',
          d.category ? `Category: <em>${d.category}</em>` : '',
        ].filter(Boolean).join('<br>');
        tip.style.display='block';
      })
      .on('mousemove', ev => { tip.style.left=(ev.clientX+14)+'px'; tip.style.top=(ev.clientY-10)+'px'; })
      .on('mouseleave', () => { tip.style.display='none'; });

    sim.on('tick', () => {
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
          .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      nodeG.attr('transform', d=>`translate(${d.x},${d.y})`);
    });

    // Legend
    const lg = svg.append('g').attr('transform','translate(16,16)');
    [['#6366f1','Visited Site'],['#f97316','Tracker Hub'],['#10b981','Low Risk ◎'],['#ef4444','Critical ◎']]
      .forEach(([color,label],i)=>{
        lg.append('circle').attr('cx',8).attr('cy',i*20).attr('r',6).attr('fill',color);
        lg.append('text').attr('x',18).attr('y',i*20+4).attr('fill','#94a3b8').attr('font-size','11px').text(label);
      });
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  async function refresh() {
    const btn = $('refreshBtn');
    if (btn) { btn.textContent='⏳'; btn.disabled=true; }
    try {
      lastHistory = await fetchAll();
      populateSiteFilter();
      renderAll(lastHistory);
      const lu = $('lastUpdated');
      if (lu) lu.textContent = 'Updated ' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    } catch(e) { console.error('[Dash] refresh:', e); }
    finally {
      if (btn) { btn.textContent='🔄 Refresh'; btn.disabled=false; }
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        $('tab-' + b.dataset.tab).classList.add('active');
      });
    });

    // Global site filter
    $('globalSiteFilter')?.addEventListener('change', e => {
      selectedSite = e.target.value;
      applyGlobalFilter(selectedSite);
      renderAll(lastHistory);
    });
    $('clearFilter')?.addEventListener('click', () => {
      selectedSite = '';
      $('globalSiteFilter').value = '';
      applyGlobalFilter('');
      renderAll(lastHistory);
    });

    // Global search bar
    $('globalSearch')?.addEventListener('input', e => {
      globalSearch = e.target.value.toLowerCase().trim();
      renderSites(globalSearch); renderTrackers(globalSearch);
      renderAds(globalSearch); renderBlocked(globalSearch);
    });

    // Buttons
    $('refreshBtn')?.addEventListener('click', refresh);
    $('exportBtn') ?.addEventListener('click', exportJSON);
    $('clearBtn')  ?.addEventListener('click', async () => {
      if (!confirm('Clear ALL PRIVISEE-X data? Cannot be undone.')) return;
      await send({ action: 'CLEAR_ALL' });
      allSites=[]; allCookies=[]; allTrackers=[];
      populateSiteFilter(); renderAll([]);
    });

    // Delete All cookies/trackers for selected site
    $('deleteAllCookiesForSite')?.addEventListener('click', async () => {
      if (!selectedSite) return;
      if (!confirm(`Delete ALL cookies for "${selectedSite}"?`)) return;
      const r = await send({ action: 'DELETE_ALL_COOKIES_FOR_SITE', domain: selectedSite });
      await refresh();
      showDashToast(`🍪 Removed ${r?.removed||'?'} cookies for ${selectedSite}`, 'success');
    });
    $('deleteAllTrackersForSite')?.addEventListener('click', async () => {
      if (!selectedSite) return;
      if (!confirm(`Delete ALL tracker records for "${selectedSite}"?`)) return;
      const forSite = allTrackers.filter(t => t.siteDomain === selectedSite);
      await Promise.all(forSite.map(t => send({ action: 'DELETE_TRACKER', id: t.id })));
      allTrackers = allTrackers.filter(t => t.siteDomain !== selectedSite);
      renderTrackers(); renderStats();
    });

    // Search listeners
    $('siteSearch')?.addEventListener('input', e => renderSites(e.target.value));
    $('ckSearch')  ?.addEventListener('input', () => renderCookies($('ckSearch').value, $('ckSort').value));
    $('ckSort')    ?.addEventListener('change',() => renderCookies($('ckSearch').value, $('ckSort').value));
    $('trSearch')  ?.addEventListener('input', e => renderTrackers(e.target.value));
    $('adSearch')  ?.addEventListener('input', e => renderAds(e.target.value));
    $('blSearch')  ?.addEventListener('input', e => renderBlocked(e.target.value));
    $('showFullURLs')?.addEventListener('change', e => { showFullURLs=e.target.checked; renderBlocked($('blSearch')?.value||''); });
    $('clearBlockedBtn')?.addEventListener('click', async () => {
      if (!confirm('Clear the entire Firewall Log? This cannot be undone.')) return;
      await send({action:'CLEAR_BLOCKED_REQUESTS'}); allBlocked=[]; renderBlocked('');
    });

    // Attach event delegation for table row buttons
    attachTableDelegation();

    // ── Advanced filter controls (v5.0) ─────────────────────────────────
    $('filterRiskLevel')?.addEventListener('change', e => {
      activeRiskLevel = e.target.value;
      renderSites($('siteSearch')?.value || '');
    });
    $('filterDateRange')?.addEventListener('change', e => {
      activeDateRange = e.target.value;
      renderSites($('siteSearch')?.value || '');
    });
    $('filterTrustedOnly')?.addEventListener('change', e => {
      showTrustedOnly = e.target.checked;
      renderSites($('siteSearch')?.value || '');
    });
    $('filterChartRange')?.addEventListener('change', async e => {
      activeChartRange = e.target.value;
      lastHistory = await fetchAll();
      renderChart(lastHistory);
    });
    $('filterCertStatus')?.addEventListener('change', e => {
      activeCertFilter = e.target.value;
      renderSites($('siteSearch')?.value || '');
    });
    // Reset all advanced filters
    $('resetFiltersBtn')?.addEventListener('click', () => {
      activeRiskLevel  = 'all';
      activeDateRange  = 'all';
      showTrustedOnly  = false;
      activeCertFilter = 'all';
      if ($('filterRiskLevel'))   $('filterRiskLevel').value   = 'all';
      if ($('filterDateRange'))   $('filterDateRange').value   = 'all';
      if ($('filterTrustedOnly')) $('filterTrustedOnly').checked = false;
      if ($('filterCertStatus'))  $('filterCertStatus').value  = 'all';
      renderSites($('siteSearch')?.value || '');
    });

    // Graph tab — render when tab is clicked
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab === 'graph') {
        b.addEventListener('click', () => { setTimeout(renderGraph, 50); });
      }
      // Research tab — lazy-render ResearchMode panel on first click, refresh on subsequent
      if (b.dataset.tab === 'research') {
        let researchInitialized = false;
        b.addEventListener('click', () => {
          const container = document.getElementById('researchPanelContainer');
          if (!container) return;
          if (typeof window.ResearchMode !== 'undefined') {
            if (!researchInitialized) {
              researchInitialized = true;
              window.ResearchMode.renderPanel(container);
            } else {
              // Re-render on each tab re-open to get fresh data
              window.ResearchMode.renderPanel(container);
            }
          } else {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b">ResearchMode not available. Try reloading the dashboard.</div>';
          }
        });
      }
    });

    // Pause/resume auto-refresh based on page visibility (avoids ghost timers)
    let refreshInterval = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      } else {
        if (!refreshInterval) {
          refresh();
          refreshInterval = setInterval(refresh, 15000);
        }
      }
    });

    // Load
    refresh();
  });
})();

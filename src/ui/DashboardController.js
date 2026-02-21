/**
 * PRIVISEE-X v2.0 — DashboardController
 *
 * Features:
 *  - Global site filter bar — applies to ALL tabs simultaneously
 *  - Blocked Ads tab (shown separately from detected ads)
 *  - Cookie delete per-row + Delete All Cookies for Site
 *  - Tracker delete per-row + Delete All Trackers for Site
 *  - Sites tab with full stats + delete/whitelist per site
 *  - Risk timeline chart (defensive, won't block rest of UI)
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // ── State ──────────────────────────────────────────────────────────────────
  let allSites    = [];
  let allCookies  = [];
  let allTrackers = [];     // tracker entries {id, siteDomain, trackerDomain, count, lastSeen}
  let riskChart   = null;
  let selectedSite = '';    // global cross-tab filter

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
    const [dash, ck, tr, hist] = await Promise.all([
      send({ action: 'GET_DASHBOARD_DATA' }),
      send({ action: 'GET_ALL_COOKIES', domain: selectedSite || undefined }),
      send({ action: 'GET_TRACKERS_FOR_SITE', siteDomain: selectedSite || undefined }),
      send({ action: 'GET_RISK_HISTORY', hours: 24 })
    ]);
    allSites    = (dash?.sites    || []).filter(s => s.domain && s.domain !== '__whitelist__');
    allCookies  = ck?.cookies  || [];
    allTrackers = tr?.trackers || [];
    return hist?.history || [];
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
      $('st-blocked').textContent  = blocked;
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
  function renderSites(q = '') {
    try {
      const tbody = $('sitesBody');
      const fl    = q.toLowerCase();
      const rows  = allSites
        .filter(s => (!selectedSite || s.domain === selectedSite) && (!fl || s.domain.toLowerCase().includes(fl)))
        .sort((a,b) => (b.riskScore||0) - (a.riskScore||0));

      $('siteCnt').textContent = `${rows.length} site${rows.length!==1?'s':''}`;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
          <div class="ico">🌐</div>
          ${q||selectedSite ? 'No sites match.' : 'No sites yet. Browse some websites, then refresh.'}
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
    alert(`"${domain}" trusted. That domain will no longer affect your risk score.`);
    await refresh();
  }

  // Keep minimal window. exports for HTML onclick fallback (backwards compat with popup)
  window.filterBySite = _filterBySite;

  window.doDeleteSite    = _doDeleteSite;
  window.doWhitelist     = _doWhitelist;

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!allSites.length) { alert('No data to export.'); return; }
    let csv = 'Domain,Risk Score,Risk Level,Trackers,Blocked Ads,Cookies,Fingerprinting,Last Visit\n';
    const src = selectedSite ? allSites.filter(s => s.domain===selectedSite) : allSites;
    src.forEach(s => {
      csv += [s.domain, s.riskScore||0, s.riskLevel||'LOW', s.trackerCount||0, s.blockedAds||0,
              s.cookieCount||0, s.fingerprintCount||0,
              s.lastVisit ? new Date(s.lastVisit).toISOString() : ''].join(',') + '\n';
    });
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
      download: `privisee_x_${selectedSite||'all'}_${new Date().toISOString().split('T')[0]}.csv`
    });
    a.click();
  }

  // ── Render all tabs ────────────────────────────────────────────────────────
  function renderAll(history) {
    renderStats();
    if (history !== undefined) renderChart(history);
    renderSites($('siteSearch')?.value||'');
    renderCookies($('ckSearch')?.value||'', $('ckSort')?.value||'domain');
    renderTrackers($('trSearch')?.value||'');
    renderAds($('adSearch')?.value||'');
  }

  // ── Graph Panel ───────────────────────────────────────────────
  async function renderGraph() {
    const container = $('graphPanel');
    if (!container) return;
    const resp = await send({ action: 'GET_GRAPH_DATA' });
    if (!resp?.success || !resp.nodes.length) {
      container.innerHTML = '<div class="empty-state"><div class="ico">🕸️</div>No graph data yet. Browse some websites first.</div>';
      return;
    }
    const { nodes, links } = resp;

    // Use bundled D3 from src/lib/d3.min.js
    if (typeof d3 === 'undefined') {
      container.innerHTML = '<div class="empty-state">Graph library not loaded. Ensure src/lib/d3.min.js is present.</div>';
      return;
    }

    container.innerHTML = '';
    const W = container.clientWidth  || 900;
    const H = container.clientHeight || 500;

    const svg = d3.select(container)
      .append('svg').attr('width', W).attr('height', H)
      .attr('style', 'background:#0f172a;border-radius:8px');

    const COLOR = { site: '#6366f1', tracker: '#f97316' };

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(18));

    const link = svg.append('g').selectAll('line')
      .data(links).join('line')
      .attr('stroke', 'rgba(255,255,255,0.15)').attr('stroke-width', d => Math.min(4, Math.sqrt(d.value || 1)));

    const node = svg.append('g').selectAll('g')
      .data(nodes).join('g')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append('circle')
      .attr('r', d => d.type === 'site' ? 8 : Math.min(18, 6 + Math.log2(d.weight + 1) * 3))
      .attr('fill', d => COLOR[d.type] || '#64748b')
      .attr('stroke', '#fff').attr('stroke-width', 1.5);

    node.append('title').text(d => `${d.id} (${d.type}, weight:${d.weight})`);

    node.append('text')
      .text(d => d.id.length > 20 ? d.id.substring(0, 18) + '…' : d.id)
      .attr('fill', '#94a3b8').attr('font-size', '10px').attr('dy', 20).attr('text-anchor', 'middle');

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Legend
    const legend = svg.append('g').attr('transform', 'translate(16,16)');
    [['#6366f1', 'Site'], ['#f97316', 'Tracker']].forEach(([color, label], i) => {
      legend.append('circle').attr('cx', 8).attr('cy', i * 20).attr('r', 6).attr('fill', color);
      legend.append('text').attr('x', 18).attr('y', i * 20 + 4).attr('fill', '#94a3b8').attr('font-size', '12px').text(label);
    });
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  let lastHistory = [];
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

    // Buttons
    $('refreshBtn')?.addEventListener('click', refresh);
    $('exportBtn') ?.addEventListener('click', exportCSV);
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
      alert(`Removed ${r?.removed||'?'} cookies for ${selectedSite}.`);
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

    // Attach event delegation for table row buttons
    attachTableDelegation();

    // Graph tab — render when tab is clicked
    document.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab === 'graph') {
        b.addEventListener('click', () => { setTimeout(renderGraph, 50); });
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

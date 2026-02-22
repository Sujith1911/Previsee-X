/**
 * PRIVISEE-X v4.0 — ResearchMode
 * UI: Raw Data Collector & JSON Exporter (WebAdvisor Mode)
 *
 * v4.0 additions:
 *  - Security layer snapshot (cert warning, security headers, HSTS, encryption)
 *  - Advisory data from AdvisoryEngine
 *  - Domain history timeline (riskTimeline, trackerCountTimeline, securityTimeline)
 *  - v4.0 scoring breakdown (35/30/20/15 weights) in export
 *  - Sectioned visual render (Risk | Security | Advisory | DNA | Firewall)
 */

(function () {
  'use strict';

  // ── Message helper ─────────────────────────────────────────────────────────
  function msg(payload) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({}), 4000);
      try {
        chrome.runtime.sendMessage(payload, resp => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve(resp || {});
        });
      } catch { clearTimeout(timer); resolve({}); }
    });
  }

  // ── Collect Full v4.0 Research Snapshot ────────────────────────────────────
  async function collectSnapshot() {
    const [tabRes, secRes, advRes, graphRes, histSummaryRes, blRes] = await Promise.all([
      msg({ action: 'GET_RESEARCH_DATA' }),
      msg({ action: 'GET_SECURITY_LAYER' }),
      msg({ action: 'GET_ADVISORY' }),
      msg({ action: 'GET_GRAPH_DATA' }),
      msg({ action: 'GET_RISK_HISTORY', hours: 168 }), // 7 days
      msg({ action: 'GET_BLOCKED_LOG' })
    ]);

    const domain = tabRes.domain || 'unknown';

    // Domain-specific history timeline
    let domainTimeline = { riskTimeline: [], trackerCountTimeline: [], securityTimeline: [] };
    if (domain !== 'unknown') {
      const histDetail = await msg({ action: 'GET_DOMAIN_HISTORY', domain });
      if (histDetail.success) domainTimeline = histDetail;
    }

    const domainHistory = ((histSummaryRes.history || []))
      .filter(h => h.domain === domain)
      .sort((a, b) => a.timestamp - b.timestamp);

    const blockedItems = (blRes.items || []).filter(b =>
      !domain || b.domain === domain || b.domain?.includes(domain)
    );

    return {
      meta: {
        exportedAt:   new Date().toISOString(),
        tool:         'PRIVISEE-X v4.0 — WebAdvisor Mode',
        domain,
        capturedUrl:  tabRes.domain ? `https://${tabRes.domain}` : 'unknown'
      },

      // ── v4.0 Risk Breakdown ──────────────────────────────────────────
      riskSummary: {
        riskScore:          tabRes.riskScore          ?? null,
        riskLevel:          tabRes.riskLevel          ?? null,
        webAdvisorStatus:   tabRes.webAdvisorStatus   ?? null,
        currentSessionRisk: tabRes.currentSessionRisk ?? null,
        historicalRisk:     tabRes.historicalRisk     ?? null,
        weights: { behavioral: '35%', static: '30%', reputation: '20%', securityLayer: '15%' },
        components: {
          behavioralScore:    tabRes.behavioralScore    ?? null,
          staticScore:        tabRes.staticScore        ?? null,
          reputationScore:    tabRes.reputationScore    ?? null,
          securityLayerScore: tabRes.securityLayerScore ?? null,
        },
        staticBreakdown:    tabRes.staticBreakdown    || [],
        rawHeaders:         tabRes.rawHeaders         || {},
        projection:         tabRes.projection         || null
      },

      // ── v4.0 Security Layer ──────────────────────────────────────────
      securityLayer: {
        encryption:           secRes.encryption          || null,
        encryptionRaw:        secRes.encryptionRaw       || null,
        certStatus:           secRes.certStatus          || null,
        certSeverity:         secRes.certSeverity        || null,
        isInvalid:            secRes.isInvalid           || false,
        hasWarning:           secRes.hasWarning          || false,
        hsts:                 secRes.hsts                || false,
        mixedContent:         secRes.mixedContent        || false,
        securityHeadersScore: secRes.securityHeadersScore || 0,
        securityLayerScore:   secRes.securityLayerScore  || 0,
        certIssues:           secRes.certIssues          || [],
        isHTTPS:              secRes.isHTTPS             || false
      },

      // ── Advisory Engine output ───────────────────────────────────────
      advisory: {
        observations:     advRes.observations     || [],
        recommendations:  advRes.recommendations  || [],
        riskSummary:      advRes.riskSummary      || null
      },

      // ── Firewall ─────────────────────────────────────────────────────
      firewallSummary: {
        adsBlockedTotal:      tabRes.adsBlockedCount      || 0,
        trackersBlockedTotal: tabRes.trackersBlockedCount || 0,
        blockedSample:        blockedItems.slice(0, 50),
        strictMode:           tabRes.strictMode           || false
      },

      // ── Behavioral DNA ───────────────────────────────────────────────
      behavioralDNA: {
        hash:         tabRes.dnaHash             || null,
        signature:    tabRes.behavioralSignature || null,
        clusterMatch: tabRes.clusterMatch        || null
      },

      // ── Domain History Timeline (v4.0) ───────────────────────────────
      domainTimeline: {
        domain,
        riskTimeline:          domainTimeline.riskTimeline          || [],
        trackerCountTimeline:  domainTimeline.trackerCountTimeline  || [],
        securityTimeline:      domainTimeline.securityTimeline      || []
      },

      // ── Risk History (global) ────────────────────────────────────────
      riskHistory: {
        domain,
        windowDays: 7,
        records:    domainHistory
      },

      // ── Tracker Graph ────────────────────────────────────────────────
      trackerGraph: {
        nodes: graphRes.nodes || [],
        links: graphRes.links || []
      }
    };
  }

  // ── Export as JSON Download ────────────────────────────────────────────────
  function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href     = url;
    a.download = `privisee-x_${data.meta.domain}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // ── Copy to Clipboard ──────────────────────────────────────────────────────
  async function copyToClipboard(data) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      return true;
    } catch { return false; }
  }

  // ── Section badge helper ───────────────────────────────────────────────────
  function badge(label, color) {
    return `<span style="font-size:10px;background:${color}18;color:${color};border:1px solid ${color}30;padding:2px 7px;border-radius:4px;margin-left:6px">${label}</span>`;
  }

  // ── Render Research Panel ──────────────────────────────────────────────────
  async function renderPanel(container) {
    const S = (t, color='#e2e8f0') => `<span style="color:${color}">${t}</span>`;

    container.innerHTML = `
      <div style="padding:20px;max-width:960px;margin:0 auto;font-family:monospace">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div>
            <h3 style="font-size:15px;font-weight:700;color:#e2e8f0;margin-bottom:2px">
              🔬 Research Mode ${badge('v4.0','#6366f1')}
            </h3>
            <p style="font-size:12px;color:#64748b">Full raw data snapshot — v4.0 WebAdvisor format</p>
          </div>
          <div style="display:flex;gap:8px">
            <button id="rmRefresh" style="padding:6px 14px;background:#1e2235;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600">🔄 Refresh</button>
            <button id="rmCopy"    style="padding:6px 14px;background:#1e2235;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600">📋 Copy JSON</button>
            <button id="rmExport"  style="padding:6px 14px;background:#6366f1;border:none;border-radius:8px;color:white;cursor:pointer;font-size:12px;font-weight:600">⬇️ Export JSON</button>
          </div>
        </div>

        <div id="rmSections" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px"></div>

        <div id="rmLoading" style="text-align:center;padding:40px;color:#64748b">Collecting v4.0 data…</div>
        <pre id="rmPre" style="display:none;background:#0d0f18;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:16px;font-size:11px;color:#94a3b8;overflow:auto;max-height:480px;white-space:pre-wrap;word-break:break-all"></pre>
        <div id="rmMsg" style="display:none;text-align:center;padding:8px;font-size:12px;border-radius:6px;margin-top:8px"></div>
      </div>
    `;

    let snapshot = null;

    function card(title, rows) {
      const rowsHtml = rows.map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          <span style="color:#64748b;font-size:11px">${k}</span>
          <span style="color:#e2e8f0;font-size:11px;max-width:54%;text-align:right;word-break:break-all">${v ?? '—'}</span>
        </div>`).join('');
      return `
        <div style="background:#0d0f18;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px">
          <div style="font-size:11px;font-weight:700;color:#818cf8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${title}</div>
          ${rowsHtml}
        </div>`;
    }

    function renderSections(snap) {
      const r = snap.riskSummary;
      const s = snap.securityLayer;
      const f = snap.firewallSummary;
      const d = snap.behavioralDNA;

      container.querySelector('#rmSections').innerHTML =
        card('Risk Score (v4.0)', [
          ['Score', `${r.riskScore ?? '—'}/100`],
          ['Level', r.riskLevel ?? '—'],
          ['WebAdvisor', r.webAdvisorStatus ?? '—'],
          ['Behavioral (35%)', `${r.components?.behavioralScore ?? '—'}/100`],
          ['Static (30%)',     `${r.components?.staticScore ?? '—'}/100`],
          ['Reputation (20%)', `${r.components?.reputationScore ?? '—'}/100`],
          ['Security (15%)',   `${r.components?.securityLayerScore ?? '—'}/100`],
          ['Projection',       r.projection?.projectedRiskIn30Days ? `~${r.projection.projectedRiskIn30Days}/100 in 30d` : 'Collecting…']
        ]) +
        card('Security Layer', [
          ['Encryption',    s.encryption ?? '—'],
          ['Certificate',   s.certStatus ?? '—'],
          ['HSTS',          s.hsts ? '✅ Enabled' : '❌ Missing'],
          ['Mixed Content', s.mixedContent ? '⚠️ Detected' : '✅ Clean'],
          ['Headers Score', `${s.securityHeadersScore ?? 0}/100`],
          ['HTTPS',         s.isHTTPS ? 'Yes' : 'No'],
          ['Issues',        (s.certIssues || []).join(', ') || 'None']
        ]) +
        card('Firewall & Blocking', [
          ['Ads Blocked (total)',     f.adsBlockedTotal],
          ['Trackers Blocked (total)',f.trackersBlockedTotal],
          ['Strict Mode',            f.strictMode ? '🔥 ON' : 'OFF'],
          ['Recent Blocks',          (f.blockedSample || []).length + ' entries captured']
        ]) +
        card('Behavioral DNA', [
          ['DNA Hash',    d.hash ? d.hash.slice(0, 16) + '…' : '—'],
          ['Cluster',     d.clusterMatch?.name ?? '—'],
          ['Similarity',  d.clusterMatch?.similarity ?? '—'],
          ['Risk Boost',  d.clusterMatch?.riskBoost != null ? `+${d.clusterMatch.riskBoost}` : '—']
        ]);
    }

    async function refresh() {
      const loading = container.querySelector('#rmLoading');
      const pre     = container.querySelector('#rmPre');
      loading.style.display = 'block';
      pre.style.display     = 'none';
      container.querySelector('#rmSections').innerHTML = '';
      snapshot = await collectSnapshot();
      loading.style.display = 'none';
      pre.style.display     = 'block';
      pre.textContent       = JSON.stringify(snapshot, null, 2);
      renderSections(snapshot);
    }

    function showMsg(text, color) {
      const el = container.querySelector('#rmMsg');
      el.style.display    = 'block';
      el.style.color      = color;
      el.style.background = color + '18';
      el.textContent      = text;
      setTimeout(() => { el.style.display = 'none'; }, 2500);
    }

    await refresh();

    container.querySelector('#rmRefresh').onclick = refresh;
    container.querySelector('#rmExport').onclick  = () => { if (snapshot) downloadJSON(snapshot); };
    container.querySelector('#rmCopy').onclick    = async () => {
      if (!snapshot) return;
      const ok = await copyToClipboard(snapshot);
      showMsg(ok ? '✅ Copied to clipboard!' : '❌ Clipboard write failed', ok ? '#10b981' : '#ef4444');
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.ResearchMode = { renderPanel, collectSnapshot, downloadJSON };

})();

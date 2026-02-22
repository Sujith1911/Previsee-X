/**
 * PRIVISEE-X v3.0
 * UI: ResearchMode — Raw Data Collector & JSON Exporter
 *
 * Provides researchers access to a full internal data snapshot:
 * behavioral DNA, static score breakdown, threat projection,
 * risk history, tracker graph, firewall blocked log, and raw headers.
 *
 * Exports clean JSON file via browser download.
 */

(function() {
  'use strict';

  // ── Message helper ──────────────────────────────────────────────────────────
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

  // ── Collect Full Research Snapshot ─────────────────────────────────────────
  async function collectSnapshot() {
    const [tabRes, graphRes, histRes, blRes] = await Promise.all([
      msg({ action: 'GET_RESEARCH_DATA' }),
      msg({ action: 'GET_GRAPH_DATA' }),
      msg({ action: 'GET_RISK_HISTORY', hours: 168 }), // 7 days
      msg({ action: 'GET_BLOCKED_REQUESTS', limit: 500 })
    ]);

    const domain = tabRes.domain || 'unknown';

    // Filter history to this domain
    const domainHistory = (histRes.history || [])
      .filter(h => h.domain === domain)
      .sort((a, b) => a.timestamp - b.timestamp);

    const blockedForDomain = (blRes.blocked || [])
      .filter(b => b.domain === domain || b.domain.includes(domain));

    return {
      meta: {
        exportedAt:   new Date().toISOString(),
        tool:         'PRIVISEE-X v3.0',
        domain,
        capturedUrl:  `https://${domain}`
      },
      riskSummary: {
        riskScore:          tabRes.riskScore          ?? null,
        currentSessionRisk: tabRes.currentSessionRisk ?? null,
        historicalRisk:     tabRes.historicalRisk     ?? null,
        staticScore:        tabRes.staticScore        ?? null,
        behavioralScore:    tabRes.behavioralScore    ?? null,
        reputationScore:    tabRes.reputationScore    ?? null,
        staticBreakdown:    tabRes.staticBreakdown    || [],
        rawHeaders:         tabRes.rawHeaders         || {}
      },
      firewallSummary: {
        adsBlockedTotal:      tabRes.adsBlockedCount      || 0,
        trackersBlockedTotal: tabRes.trackersBlockedCount || 0,
        blockedForDomain,
        strictMode:           tabRes.strictMode || false
      },
      behavioralDNA: {
        hash:              tabRes.dnaHash             || null,
        signature:         tabRes.behavioralSignature || null,
        clusterMatch:      tabRes.clusterMatch        || null
      },
      threatProjection: tabRes.projection || null,
      riskHistory: {
        domain,
        windowDays: 7,
        records:    domainHistory
      },
      trackerGraph: {
        nodes: graphRes.nodes || [],
        links: graphRes.links || []
      }
    };
  }

  // ── Export as JSON Download ─────────────────────────────────────────────────
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

  // ── Copy to Clipboard ────────────────────────────────────────────────────────
  async function copyToClipboard(data) {
    const text = JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // ── Render Research Panel (into provided container element) ─────────────────
  async function renderPanel(container) {
    container.innerHTML = `
      <div style="padding:20px;max-width:900px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div>
            <h3 style="font-size:15px;font-weight:700;color:#e2e8f0;margin-bottom:2px">🔬 Research Mode</h3>
            <p style="font-size:12px;color:#64748b">Full raw behavioral + static data snapshot for current tab</p>
          </div>
          <div style="display:flex;gap:8px">
            <button id="rmRefresh" style="padding:6px 14px;background:#1e2235;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600">🔄 Refresh</button>
            <button id="rmCopy"    style="padding:6px 14px;background:#1e2235;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600">📋 Copy JSON</button>
            <button id="rmExport"  style="padding:6px 14px;background:#6366f1;border:none;border-radius:8px;color:white;cursor:pointer;font-size:12px;font-weight:600">⬇️ Export JSON</button>
          </div>
        </div>
        <div id="rmLoading" style="text-align:center;padding:40px;color:#64748b">Collecting data…</div>
        <pre id="rmPre" style="display:none;background:#0d0f18;border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:16px;font-size:11px;color:#94a3b8;overflow:auto;max-height:520px;white-space:pre-wrap;word-break:break-all;font-family:monospace"></pre>
        <div id="rmMsg" style="display:none;text-align:center;padding:8px;font-size:12px;border-radius:6px"></div>
      </div>
    `;

    let snapshot = null;

    async function refresh() {
      const loading = container.querySelector('#rmLoading');
      const pre     = container.querySelector('#rmPre');
      loading.style.display = 'block';
      pre.style.display     = 'none';
      snapshot = await collectSnapshot();
      loading.style.display = 'none';
      pre.style.display     = 'block';
      pre.textContent       = JSON.stringify(snapshot, null, 2);
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

  // ── Public API ──────────────────────────────────────────────────────────────
  window.ResearchMode = { renderPanel, collectSnapshot, downloadJSON };

})();

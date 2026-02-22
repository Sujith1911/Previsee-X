/**
 * PRIVISEE-X v3.0
 * UI: PopupController — full firewall + behavioral + search + research UI
 */
(async function() {
  'use strict';
  const $ = id => document.getElementById(id);
  let currentDomain = '';
  let lastData = {};
  let searchQuery = '';
  let blockedItems = [];
  let blockedPanelOpen = true;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function riskColor(s) { return s>=75?'#ef4444':s>=50?'#f97316':s>=20?'#f59e0b':'#10b981'; }
  function chipClass(s) { return s>=75?'chip-crit':s>=50?'chip-high':s>=20?'chip-mod':'chip-low'; }
  function riskLabel(s) { return s>=75?'CRITICAL':s>=50?'HIGH RISK':s>=20?'MODERATE':'LOW RISK'; }
  function timeAgo(ts) {
    const s=Math.floor((Date.now()-ts)/1000);
    if (s<60) return `${s}s ago`; if (s<3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  }

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

  // ── Sparkline ──────────────────────────────────────────────────────────────
  async function drawSparkline(domain) {
    const canvas = $('sparkline');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 380;
    const H = 36;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0,0,W,H);

    let hist = [];
    try {
      const r = await msg({action:'GET_RISK_HISTORY', domain});
      hist = (r.history||[]).slice(-10);
    } catch {}

    if (hist.length < 2) {
      ctx.fillStyle='#64748b'; ctx.font='9px sans-serif'; ctx.textAlign='center';
      ctx.fillText('Not enough history yet', W/2, H/2+3);
      return;
    }

    const scores = hist.map(h=>h.score||0);
    const max = Math.max(...scores,1);
    const pts = scores.map((s,i)=>({ x:(i/(scores.length-1))*(W-16)+8, y:H-4-(s/max)*(H-10) }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'rgba(99,102,241,0.4)');
    grad.addColorStop(1,'rgba(99,102,241,0.0)');
    ctx.beginPath();
    ctx.moveTo(pts[0].x,H);
    pts.forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,H);
    ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();

    // Line
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    pts.forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.strokeStyle='#6366f1'; ctx.lineWidth=1.5; ctx.stroke();

    // Last point dot
    const last=pts[pts.length-1];
    ctx.beginPath(); ctx.arc(last.x,last.y,3,0,Math.PI*2);
    ctx.fillStyle=riskColor(scores[scores.length-1]); ctx.fill();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render(data) {
    const {
      domain='', riskScore=0, trusted=false,
      trackerCount=0, cookieCount=0,
      staticScore=0, behavioralScore=0, reputationScore=0,
      staticBreakdown=[], dnaHash=null, projection=null,
      fingerprintCount=0, adsBlockedCount=0, trackersBlockedCount=0,
      currentSessionRisk=0, historicalRisk=0, clusterMatch=null,
      strictMode=false, rawHeaders={}
    } = data;
    lastData = data;

    currentDomain = domain;
    $('loading').style.display = 'none';
    $('content').style.display = 'block';
    if ($('currentSite')) $('currentSite').textContent = domain || 'Unknown';

    // Trust UI
    const trustBadge = $('trustBadge');
    const trustBanner = $('trustBanner');
    if (trusted) {
      trustBadge.classList.remove('hidden');
      trustBanner.style.display='flex';
    } else {
      trustBadge.classList.add('hidden');
      trustBanner.style.display='none';
    }

    // Score circle
    const score = trusted ? 0 : riskScore;
    const color = riskColor(score);
    const circle = $('scoreCircle');
    if (circle) { circle.style.borderColor=color; circle.style.boxShadow=`0 0 12px ${color}30`; }
    if ($('riskScore')) { $('riskScore').textContent=score; $('riskScore').style.color=color; }
    const chip=$('riskLevelChip');
    if (chip) {
      chip.textContent=trusted?'✓ TRUSTED':riskLabel(score);
      chip.className=`risk-level-chip ${trusted?'chip-low':chipClass(score)}`;
    }

    // Bars
    const bBeh=trusted?0:behavioralScore, bSta=trusted?0:staticScore, bRep=trusted?0:reputationScore;
    $('barBehavioral').style.width=bBeh+'%'; $('valBehavioral').textContent=bBeh;
    $('barStatic').style.width=bSta+'%';     $('valStatic').textContent=bSta;
    $('barReputation').style.width=bRep+'%'; $('valReputation').textContent=bRep;

    // Firewall counters
    if ($('adsBlockedCount'))      $('adsBlockedCount').textContent=adsBlockedCount;
    if ($('trackersBlockedCount')) $('trackersBlockedCount').textContent=trackersBlockedCount;
    if ($('trackerCount'))         $('trackerCount').textContent=trackerCount;
    if ($('cookieCount'))          $('cookieCount').textContent=cookieCount;

    // DNA hash
    if ($('dnaHash')) { $('dnaHash').textContent=dnaHash?`DNA:${dnaHash}`:'—'; }

    // Breakdown
    renderBreakdown({ trackerCount, fingerprintCount, staticBreakdown, staticScore, behavioralScore, reputationScore, trusted });

    // Projection
    renderProjection(projection, trusted);

    // Trust button
    const tb=$('trustBtn');
    if (tb) { tb.textContent=trusted?'🔓 Trusted':'🤝 Trust Site'; tb.disabled=trusted; tb.style.opacity=trusted?'0.5':'1'; }

    // Strict mode toggle
    if ($('strictToggle')) $('strictToggle').checked=!!strictMode;

    // Research panel data
    if ($('r_sessionRisk'))    $('r_sessionRisk').textContent=currentSessionRisk;
    if ($('r_historicalRisk')) $('r_historicalRisk').textContent=historicalRisk;
    if ($('r_dnaHash'))        $('r_dnaHash').textContent=dnaHash||'—';
    if ($('r_cluster'))        $('r_cluster').textContent=clusterMatch?`${clusterMatch.name} (${Math.round((clusterMatch.similarity||0)*100)}%)`:'—';
    if ($('r_static'))         $('r_static').textContent=staticScore;
    if ($('r_behavioral'))     $('r_behavioral').textContent=behavioralScore;
    if ($('r_headers')) {
      const headerKeys=Object.keys(rawHeaders||{});
      $('r_headers').textContent=headerKeys.length?headerKeys.map(k=>`${k}: ${rawHeaders[k]}`).join('\n'):'(No headers captured yet)';
    }
  }

  function renderBreakdown({ trackerCount, fingerprintCount, staticBreakdown, trusted }) {
    const list=$('factorList'); if (!list) return;
    if (trusted) { list.innerHTML='<div class="empty-state">✅ Trust override active — scores still computed internally</div>'; return; }
    const factors=[];
    if (trackerCount>0) {
      const d=Math.round(Math.min(40,Math.log2(trackerCount+1)*13));
      factors.push({icon:'🕵️',text:`${trackerCount} tracker${trackerCount>1?'s':''} detected`,delta:`+${d}`,weight:d});
    }
    if (fingerprintCount>0) {
      const d=Math.min(30,fingerprintCount*10);
      factors.push({icon:'🖨️',text:`${fingerprintCount} fingerprint API${fingerprintCount>1?'s':''} used`,delta:`+${d}`,weight:d});
    }
    for (const f of (staticBreakdown||[]).slice(0,6)) {
      factors.push({icon:'🔒',text:f.factor,delta:`+${f.delta}`,weight:f.delta});
    }
    factors.sort((a,b)=>b.weight-a.weight);
    if (!factors.length) { list.innerHTML='<div class="empty-state">No significant risk signals detected</div>'; return; }
    list.innerHTML=factors.map(f=>`
      <div class="factor">
        <span class="icon">${f.icon}</span>
        <span class="text">${f.text}</span>
        <span class="delta">${f.delta}</span>
      </div>`).join('');
  }

  function renderProjection(proj, trusted) {
    const main=$('projMain'),sub=$('projSub'),badge=$('projBadge');
    if (!main) return;
    if (trusted) { main.textContent='Trust override active'; sub.textContent='Projection hidden for trusted domains'; badge.textContent='—'; badge.className='proj-badge proj-flat'; return; }
    if (!proj) { main.textContent='Collecting history…'; return; }
    const projected=proj.projectedRiskIn30Days??'?';
    const trend=proj.trend||'STABLE', conf=proj.confidence||'LOW';
    main.textContent=`Projected risk: ${projected}/100 in 30 days`;
    sub.textContent=`Confidence: ${conf} · Cluster: ${proj.clusterName||'unknown'}`;
    badge.textContent=trend==='INCREASING'?'↑ Rising':trend==='DECREASING'?'↓ Falling':'→ Stable';
    badge.className=`proj-badge ${trend==='INCREASING'?'proj-up':trend==='DECREASING'?'proj-down':'proj-flat'}`;
  }

  // ── Blocked Domains Rendering ─────────────────────────────────────────────
  async function loadAndRenderBlocked() {
    const r=await msg({action:'GET_BLOCKED_REQUESTS', limit:100});
    blockedItems=r.blocked||[];
    renderBlocked(blockedItems);
  }

  function renderBlocked(items) {
    const panel=$('blockedPanel'); if (!panel) return;
    const filtered=searchQuery
      ? items.filter(i=>i.domain.includes(searchQuery)||i.fullURL.includes(searchQuery))
      : items;
    if ($('blockedCount')) $('blockedCount').textContent=`(${filtered.length})`;
    if (!filtered.length) { panel.innerHTML='<div class="empty-state">No blocked domains yet</div>'; return; }
    panel.innerHTML=filtered.slice(0,30).map(b=>`
      <div class="blocked-item">
        <span class="blocked-type type-${b.type}">${b.type}</span>
        <span class="blocked-domain" title="${b.fullURL}">${b.domain}</span>
        <span class="blocked-ts">${timeAgo(b.timestamp)}</span>
        <button class="copy-btn" data-url="${b.fullURL}" title="Copy URL">⧉</button>
      </div>`).join('');
    panel.querySelectorAll('.copy-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{ try{navigator.clipboard.writeText(btn.dataset.url);}catch{} });
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  function applySearch(q) {
    searchQuery=q.toLowerCase().trim();
    renderBlocked(blockedItems);
    if (!searchQuery) {
      renderBreakdown(lastData);
      return;
    }
    // Filter factor list
    const list=$('factorList');
    if (list) {
      list.querySelectorAll('.factor').forEach(f=>{
        const txt=f.querySelector('.text')?.textContent||'';
        f.style.display=txt.toLowerCase().includes(searchQuery)?'flex':'none';
      });
    }
  }

  // ── Fetch & Refresh ───────────────────────────────────────────────────────
  async function fetchAndRender() {
    const data=await msg({action:'GET_TAB_STATS'});
    if (data&&(data.domain||data.riskScore!==undefined)) render(data);
    if (currentDomain) drawSparkline(currentDomain);
  }

  // ── Export JSON ───────────────────────────────────────────────────────────
  async function exportAnalytics() {
    const rd=await msg({action:'GET_RESEARCH_DATA'});
    const rh=await msg({action:'GET_RISK_HISTORY', domain:currentDomain});
    const bl=await msg({action:'GET_BLOCKED_REQUESTS', limit:500});
    const tk=await msg({action:'GET_TRACKERS_FOR_SITE', siteDomain:currentDomain});
    const out={
      exportedAt:new Date().toISOString(),
      domain:currentDomain,
      analytics:{
        riskHistory:rh.history||[],
        trackers:tk.trackers||[],
        blockedRequests:bl.blocked||[],
        adsBlockedTotal:rd.adsBlockedCount||0,
        trackersBlockedTotal:rd.trackersBlockedCount||0
      },
      riskSnapshot:{ score:rd.riskScore, static:rd.staticScore, behavioral:rd.behavioralScore, reputation:rd.reputationScore },
      dnaSignature:{ hash:rd.dnaHash, cluster:rd.clusterMatch, signature:rd.behavioralSignature },
      projection:rd.projection,
      securityHeaders:rd.rawHeaders||{},
      staticBreakdown:rd.staticBreakdown||[]
    };
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`privisee-x-${currentDomain}-${Date.now()}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const tabs=await chrome.tabs.query({active:true,currentWindow:true});
      const tab=tabs[0];
      if (tab?.url&&!tab.url.startsWith('chrome://')) {
        currentDomain=new URL(tab.url).hostname.replace(/^www\./,'');
        if ($('currentSite')) $('currentSite').textContent=currentDomain;
      } else {
        $('loading').style.display='none'; $('content').style.display='block';
        if ($('currentSite')) $('currentSite').textContent='Internal page';
        if ($('factorList')) $('factorList').innerHTML='<div class="empty-state">Extension does not run on Chrome internal pages.</div>';
        return;
      }
    } catch {}

    // Load toggles from storage
    try {
      const local=await chrome.storage.local.get(['researchModeEnabled','strictMode']);
      if ($('researchToggle')) $('researchToggle').checked=!!local.researchModeEnabled;
      if (local.researchModeEnabled&&$('researchPanel')) $('researchPanel').style.display='block';
    } catch {}

    await fetchAndRender();
    await loadAndRenderBlocked();

    // Live poll
    setInterval(async()=>{ await fetchAndRender(); await loadAndRenderBlocked(); },3000);

    // ── Trust ────────────────────────────────────────────────────────────────
    $('trustBtn')?.addEventListener('click',async()=>{
      if (!currentDomain) return;
      await msg({action:'TRUST_DOMAIN',domain:currentDomain});
      await fetchAndRender();
    });
    $('untrustBtn')?.addEventListener('click',async()=>{
      if (!currentDomain) return;
      await msg({action:'UNTRUST_DOMAIN',domain:currentDomain});
      await fetchAndRender();
    });

    // ── Dashboard ─────────────────────────────────────────────────────────────
    $('dashboardBtn')?.addEventListener('click',()=>{
      chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')});
    });

    // ── Strict Mode ───────────────────────────────────────────────────────────
    $('strictToggle')?.addEventListener('change',async(e)=>{
      await msg({action:'SET_STRICT_MODE',enabled:e.target.checked});
      try{await chrome.storage.local.set({strictMode:e.target.checked});}catch{}
    });

    // ── Research Mode ─────────────────────────────────────────────────────────
    $('researchToggle')?.addEventListener('change',async(e)=>{
      const on=e.target.checked;
      try{await chrome.storage.local.set({researchModeEnabled:on});}catch{}
      if ($('researchPanel')) $('researchPanel').style.display=on?'block':'none';
      if (on) {
        const rd=await msg({action:'GET_RESEARCH_DATA'});
        if (rd.domain) render({...lastData,...rd});
      }
    });

    // ── Export ────────────────────────────────────────────────────────────────
    $('exportBtn')?.addEventListener('click',exportAnalytics);

    // ── Blocked panel toggle ──────────────────────────────────────────────────
    $('blockedToggle')?.addEventListener('click',()=>{
      blockedPanelOpen=!blockedPanelOpen;
      const panel=$('blockedPanel');
      if (panel) panel.style.display=blockedPanelOpen?'flex':'none';
      $('blockedToggle').textContent=($('blockedToggle').textContent||'').replace(/[▼▲]/,blockedPanelOpen?'▼':'▲');
    });

    // ── Clear blocked ─────────────────────────────────────────────────────────
    $('clearBlockedBtn')?.addEventListener('click',async()=>{
      await msg({action:'CLEAR_BLOCKED_REQUESTS'});
      blockedItems=[]; renderBlocked([]);
    });

    // ── Search ────────────────────────────────────────────────────────────────
    $('searchBar')?.addEventListener('input',e=>applySearch(e.target.value));
  }

  document.addEventListener('DOMContentLoaded',init);
})();

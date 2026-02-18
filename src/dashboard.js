/**
 * PRIVISEE-X Dashboard
 * Main dashboard interface for privacy intelligence
 */

// Chart instances
let riskGaugeChart = null;
let trendsChart = null;

// Data cache
let sitesData = [];
let currentSiteData = null;
let graphData = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
  await initializeDashboard();
  setupEventListeners();
});

/**
 * Initialize all dashboard components
 */
async function initializeDashboard() {
  try {
    // Load current site data
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      await loadCurrentSiteData(domain);
    }

    // Load all sites data
    await loadAllSites();

    // Load graph data
    await loadGraphData();

    // Initialize charts
    initializeRiskGauge();
    initializeTrendsChart();

    // Load stats
    updateOverallStats();

    // Load top trackers
    loadTopTrackers();

  } catch (error) {
    console.error('[Dashboard] Initialization error:', error);
  }
}

/**
 * Load current site data
 */
async function loadCurrentSiteData(domain) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_SITE_DATA',
    domain: domain
  });

  if (response && response.success) {
    currentSiteData = response.data;
    updateCurrentSiteDisplay();
  }
}

/**
 * Update current site display
 */
function updateCurrentSiteDisplay() {
  if (!currentSiteData) {
    document.getElementById('currentSite').textContent = 'No active site';
    return;
  }

  const score = currentSiteData.riskScore || 0;
  const level = currentSiteData.riskLevel || 'Low';

  document.getElementById('currentRiskScore').textContent = score;
  document.getElementById('currentRiskLevel').textContent = level;
  document.getElementById('currentSite').textContent = currentSiteData.domain;

  // Update gauge color
  if (riskGaugeChart) {
    updateRiskGaugeColor(score);
  }
}

/**
 * Initialize risk gauge chart
 */
function initializeRiskGauge() {
  const ctx = document.getElementById('riskGauge').getContext('2d');
  
  const score = currentSiteData ? currentSiteData.riskScore || 0 : 0;
  const color = getRiskColor(score);

  riskGaugeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: [color, 'rgba(255, 255, 255, 0.05)'],
        borderWidth: 0,
        circumference: 270,
        rotation: 225
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '85%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

/**
 * Update risk gauge color
 */
function updateRiskGaugeColor(score) {
  const color = getRiskColor(score);
  riskGaugeChart.data.datasets[0].data = [score, 100 - score];
  riskGaugeChart.data.datasets[0].backgroundColor = [color, 'rgba(255, 255, 255, 0.05)'];
  riskGaugeChart.update('none');
}

/**
 * Get risk color based on score
 */
function getRiskColor(score) {
  if (score >= 75) return '#ef4444'; // Critical
  if (score >= 50) return '#f97316'; // High
  if (score >= 25) return '#eab308'; // Moderate
  return '#22c55e'; // Low
}

/**
 * Initialize trends chart
 */
function initializeTrendsChart() {
  const ctx = document.getElementById('trendsChart').getContext('2d');
  
  // Generate last 7 days data
  const labels = [];
  const data = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
    
    // Calculate average risk for that day
    const dayRisk = calculateDayAverageRisk(date);
    data.push(dayRisk);
  }

  trendsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Average Risk Score',
        data: data,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)'
          }
        }
      }
    }
  });
}

/**
 * Calculate average risk for a specific day
 */
function calculateDayAverageRisk(date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const daySites = sitesData.filter(site => {
    const siteDate = new Date(site.lastVisit);
    return siteDate >= dayStart && siteDate <= dayEnd;
  });

  if (daySites.length === 0) return 0;

  const totalRisk = daySites.reduce((sum, site) => sum + (site.riskScore || 0), 0);
  return Math.round(totalRisk / daySites.length);
}

/**
 * Load all sites data
 */
async function loadAllSites() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_ALL_SITES',
    limit: 100
  });

  if (response && response.success) {
    sitesData = response.sites || [];
    renderSites(sitesData);
  } else {
    document.getElementById('sitesContainer').innerHTML = 
      '<div class="loading">No sites data available. Visit some websites to see analysis.</div>';
  }
}

/**
 * Render sites list
 */
function renderSites(sites) {
  const container = document.getElementById('sitesContainer');
  
  if (!sites || sites.length === 0) {
    container.innerHTML = '<div class="loading">No sites to display</div>';
    return;
  }

  container.innerHTML = sites.map(site => {
    const riskClass = `risk-${(site.riskLevel || 'low').toLowerCase()}`;
    const riskColor = getRiskColor(site.riskScore || 0);
    
    return `
      <div class="site-card ${riskClass}" data-domain="${site.domain}">
        <div class="site-domain">${site.domain}</div>
        <div class="site-risk">
          <div class="site-risk-badge" style="color: ${riskColor}">${site.riskScore || 0}</div>
          <div class="site-risk-label">${site.riskLevel || 'Low'}</div>
        </div>
        <div class="site-stats">
          <div class="site-stat">
            <span>🚫</span>
            <span>${site.trackerCount || 0} trackers</span>
          </div>
          <div class="site-stat">
            <span>🍪</span>
            <span>${site.cookieCount || 0} cookies</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click listeners
  container.querySelectorAll('.site-card').forEach(card => {
    card.addEventListener('click', () => {
      const domain = card.dataset.domain;
      showSiteDetails(domain);
    });
  });
}

/**
 * Show site details modal
 */
async function showSiteDetails(domain) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_SITE_DATA',
    domain: domain
  });

  if (!response || !response.success) {
    return;
  }

  const data = response.data;
  const modal = document.getElementById('siteModal');

  // Update modal content
  document.getElementById('modalSiteName').textContent = domain;
  document.getElementById('detailRiskScore').textContent = data.riskScore || 0;
  document.getElementById('detailRiskLevel').textContent = data.riskLevel || 'Low';
  document.getElementById('detailExplanation').textContent = data.explanation || 'No explanation available.';

  // Trackers
  const trackersHtml = (data.trackers || []).length > 0 
    ? data.trackers.map(t => `
        <div class="detail-list-item">
          <span>${t.domain}</span>
          <span style="text-transform: capitalize; opacity: 0.7;">${t.category || 'unknown'}</span>
        </div>
      `).join('')
    : '<div class="loading">No trackers detected</div>';
  document.getElementById('detailTrackers').innerHTML = trackersHtml;

  // Cookies
  const cookiesHtml = (data.cookies || []).length > 0
    ? data.cookies.slice(0, 10).map(c => `
        <div class="detail-list-item">
          <span>${c.name}</span>
          <span style="opacity: 0.7;">${c.isThirdParty ? '3rd party' : '1st party'}</span>
        </div>
      `).join('')
    : '<div class="loading">No cookies detected</div>';
  document.getElementById('detailCookies').innerHTML = cookiesHtml;

  // Fingerprinting
  const fp = data.fingerprinting || {};
  const fpHtml = `
    <div class="fingerprint-item">
      <span>Canvas</span>
      <span class="${fp.canvas ? 'fingerprint-detected' : ''}">${fp.canvas || 0} attempts</span>
    </div>
    <div class="fingerprint-item">
      <span>WebGL</span>
      <span class="${fp.webgl ? 'fingerprint-detected' : ''}">${fp.webgl || 0} attempts</span>
    </div>
    <div class="fingerprint-item">
      <span>Audio</span>
      <span class="${fp.audio ? 'fingerprint-detected' : ''}">${fp.audio || 0} attempts</span>
    </div>
    <div class="fingerprint-item">
      <span>Fonts</span>
      <span class="${fp.fonts ? 'fingerprint-detected' : ''}">${fp.fonts || 0} checks</span>
    </div>
  `;
  document.getElementById('detailFingerprinting').innerHTML = fpHtml;

  modal.classList.add('active');
}

/**
 * Load graph data
 */
async function loadGraphData() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_GRAPH'
  });

  if (response && response.success) {
    graphData = response.graph;
    renderGraph(graphData);
  } else {
    document.getElementById('graphContainer').innerHTML = 
      '<div class="loading">Not enough data to build graph. Visit more sites.</div>';
  }
}

/**
 * Render D3 graph
 */
function renderGraph(data) {
  if (!data || !data.nodes || data.nodes.length === 0) {
    document.getElementById('graphContainer').innerHTML = 
      '<div class="loading">Not enough data to build graph</div>';
    return;
  }

  const container = document.getElementById('graphContainer');
  container.innerHTML = ''; // Clear loading

  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select('#graphContainer')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30));

  // Links
  const link = svg.append('g')
    .selectAll('line')
    .data(data.links)
    .enter().append('line')
    .attr('stroke', 'rgba(255, 255, 255, 0.1)')
    .attr('stroke-width', 1);

  // Nodes
  const node = svg.append('g')
    .selectAll('circle')
    .data(data.nodes)
    .enter().append('circle')
    .attr('r', d => d.isHub ? 12 : 8)
    .attr('fill', d => {
      if (d.type === 'site') return '#667eea';
      return d.isHub ? '#f97316' : '#ef4444';
    })
    .attr('stroke', 'rgba(255, 255, 255, 0.3)')
    .attr('stroke-width', 2)
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Labels
  const labels = svg.append('g')
    .selectAll('text')
    .data(data.nodes)
    .enter().append('text')
    .text(d => d.id)
    .attr('font-size', 10)
    .attr('fill', 'rgba(255, 255, 255, 0.7)')
    .attr('dx', 12)
    .attr('dy', 4);

  // Tooltip
  node.append('title')
    .text(d => `${d.id}\n${d.type === 'site' ? 'Website' : 'Tracker'}`);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    labels
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

/**
 * Update overall stats
 */
function updateOverallStats() {
  const totalSites = sitesData.length;
  const totalTrackers = sitesData.reduce((sum, site) => sum + (site.trackerCount || 0), 0);
  const totalCookies = sitesData.reduce((sum, site) => sum + (site.cookieCount || 0), 0);
  
  // Estimate fingerprint attempts (would need to aggregate from detailed data)
  const fingerprintAttempts = sitesData.filter(site => site.fingerprintingDetected).length;

  document.getElementById('totalSites').textContent = totalSites;
  document.getElementById('totalTrackers').textContent = totalTrackers;
  document.getElementById('totalCookies').textContent = totalCookies;
  document.getElementById('fingerprintAttempts').textContent = fingerprintAttempts;
}

/**
 * Load top trackers
 */
function loadTopTrackers() {
  // Aggregate trackers across all sites
  const trackerMap = new Map();

  sitesData.forEach(site => {
    if (site.trackers) {
      site.trackers.forEach(tracker => {
        if (trackerMap.has(tracker.domain)) {
          const existing = trackerMap.get(tracker.domain);
          existing.count++;
          existing.sites.add(site.domain);
        } else {
          trackerMap.set(tracker.domain, {
            domain: tracker.domain,
            category: tracker.category,
            count: 1,
            sites: new Set([site.domain])
          });
        }
      });
    }
  });

  // Convert to array and sort
  const trackers = Array.from(trackerMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  renderTopTrackers(trackers);
}

/**
 * Render top trackers
 */
function renderTopTrackers(trackers) {
  const container = document.getElementById('trackersContainer');

  if (!trackers || trackers.length === 0) {
    container.innerHTML = '<div class="loading">No tracker data available</div>';
    return;
  }

  container.innerHTML = trackers.map(tracker => `
    <div class="tracker-item">
      <div class="tracker-info">
        <div class="tracker-domain">${tracker.domain}</div>
        <div class="tracker-category">${tracker.category || 'Unknown'}</div>
      </div>
      <div class="tracker-stats">
        <div class="tracker-stat">
          <div class="tracker-stat-value">${tracker.sites.size}</div>
          <div class="tracker-stat-label">Sites</div>
        </div>
        <div class="tracker-stat">
          <div class="tracker-stat-value">${tracker.count}</div>
          <div class="tracker-stat-label">Requests</div>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportData);

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', clearAllData);

  // Refresh graph button
  document.getElementById('refreshGraph').addEventListener('click', async () => {
    await loadGraphData();
  });

  // Search sites
  document.getElementById('searchSites').addEventListener('input', (e) => {
    filterSites();
  });

  // Filter by risk
  document.getElementById('filterRisk').addEventListener('change', () => {
    filterSites();
  });

  // Sort sites
  document.getElementById('sortSites').addEventListener('change', () => {
    filterSites();
  });

  // Close modal
  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('siteModal').classList.remove('active');
  });

  // Close modal on background click
  document.getElementById('siteModal').addEventListener('click', (e) => {
    if (e.target.id === 'siteModal') {
      document.getElementById('siteModal').classList.remove('active');
    }
  });
}

/**
 * Filter and sort sites
 */
function filterSites() {
  const searchTerm = document.getElementById('searchSites').value.toLowerCase();
  const riskFilter = document.getElementById('filterRisk').value;
  const sortBy = document.getElementById('sortSites').value;

  let filtered = [...sitesData];

  // Apply search
  if (searchTerm) {
    filtered = filtered.filter(site => 
      site.domain.toLowerCase().includes(searchTerm)
    );
  }

  // Apply risk filter
  if (riskFilter !== 'all') {
    filtered = filtered.filter(site => 
      (site.riskLevel || 'low').toLowerCase() === riskFilter
    );
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'risk':
        return (b.riskScore || 0) - (a.riskScore || 0);
      case 'trackers':
        return (b.trackerCount || 0) - (a.trackerCount || 0);
      case 'recent':
        return (b.lastVisit || 0) - (a.lastVisit || 0);
      default:
        return 0;
    }
  });

  renderSites(filtered);
}

/**
 * Export data as JSON
 */
async function exportData() {
  const data = {
    sites: sitesData,
    exportDate: new Date().toISOString(),
    version: '1.0.0'
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `privisee-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Clear all data
 */
async function clearAllData() {
  if (!confirm('Are you sure you want to clear all tracking data? This cannot be undone.')) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'CLEAR_ALL'
  });

  if (response && response.success) {
    window.location.reload();
  }
}

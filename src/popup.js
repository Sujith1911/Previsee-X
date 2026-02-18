// PRIVISEE-X Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url) {
    showError('Cannot analyze this page');
    return;
  }

  const url = new URL(tab.url);
  const domain = url.hostname;

  // Request site data from background
  chrome.runtime.sendMessage({
    type: 'GET_SITE_DATA',
    domain: domain
  }, (response) => {
    if (response && response.success) {
      displaySiteData(response.data);
    } else {
      showMessage('No tracking data available yet. Visit more pages to see analysis.');
    }
  });

  // Dashboard button
  document.getElementById('dashboardBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

function displaySiteData(data) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  // Risk score
  const score = data.riskScore || 0;
  const level = data.riskLevel || 'Low';
  
  document.getElementById('riskScore').textContent = score;
  document.getElementById('riskLevel').textContent = level;

  // Color based on risk
  const colors = {
    'Critical': '#ef4444',
    'High': '#f97316',
    'Moderate': '#eab308',
    'Low': '#22c55e'
  };
  document.querySelector('.risk-gauge').style.borderLeft = `4px solid ${colors[level] || '#22c55e'}`;

  // Stats
  document.getElementById('trackerCount').textContent = data.trackerCount || 0;
  document.getElementById('cookieCount').textContent = data.cookieCount || 0;

  // Explanation
  const explanation = data.explanation || 'Privacy analysis complete.';
  document.getElementById('explanation').textContent = explanation;
}

function showMessage(msg) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  document.getElementById('explanation').textContent = msg;
}

function showError(msg) {
  document.getElementById('loading').innerHTML = `<p style="color: #ef4444;">${msg}</p>`;
}

# PRIVISEE-X API Documentation

## Message Passing API

PRIVISEE-X uses Chrome's message passing system for communication between components.

## Background ← Content Script Messages

### FINGERPRINT_DETECTED

Sent when fingerprinting attempts are detected on a web page.

**Direction**: Content Script → Background Worker

**Message Format**:
```javascript
{
  type: 'FINGERPRINT_DETECTED',
  data: {
    canvas: number,        // Number of Canvas API calls
    webgl: number,         // Number of WebGL queries
    audio: number,         // Number of AudioContext creations
    fonts: number,         // Number of font checks
    battery: number,       // Battery API access count
    device: number,        // Device info queries
    webrtc: number,        // WebRTC connection attempts
    timestamp: number      // Unix timestamp (ms)
  }
}
```

**Example**:
```javascript
chrome.runtime.sendMessage({
  type: 'FINGERPRINT_DETECTED',
  data: {
    canvas: 3,
    webgl: 2,
    audio: 1,
    fonts: 25,
    battery: 0,
    device: 1,
    webrtc: 0,
    timestamp: 1709876543210
  }
});
```

---

## Background ← UI Messages

### GET_SITE_DATA

Request data for a specific site.

**Direction**: UI (Popup/Dashboard) → Background Worker

**Request**:
```javascript
{
  type: 'GET_SITE_DATA',
  domain: string  // Domain to query (e.g., 'example.com')
}
```

**Response**:
```javascript
{
  success: boolean,
  data: {
    domain: string,
    riskScore: number,             // 0-100
    riskLevel: string,             // 'Low' | 'Moderate' | 'High' | 'Critical'
    trackerCount: number,
    cookieCount: number,
    thirdPartyCount: number,
    lastVisit: number,             // Unix timestamp
    visitCount: number,
    trackers: Array<{
      domain: string,
      category: string,
      confidence: number,
      occurrences: number
    }>,
    cookies: Array<{
      name: string,
      domain: string,
      isThirdParty: boolean,
      httpOnly: boolean,
      secure: boolean,
      sameSite: string
    }>,
    fingerprinting: {
      canvas: number,
      webgl: number,
      audio: number,
      fonts: number,
      battery: number,
      device: number,
      webrtc: number
    },
    anomaly: {
      isAnomalous: boolean,
      score: number,
      reasons: string[]
    },
    explanation: string,            // Human-readable risk explanation
    recommendations: string[]       // Actionable recommendations
  }
}
```

**Example**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'GET_SITE_DATA',
  domain: 'example.com'
});

if (response.success) {
  console.log(`Risk Score: ${response.data.riskScore}`);
  console.log(`Trackers: ${response.data.trackerCount}`);
}
```

---

### GET_ALL_SITES

Retrieve list of all tracked sites.

**Request**:
```javascript
{
  type: 'GET_ALL_SITES',
  limit: number,          // Optional, default: 100
  offset: number,         // Optional, default: 0
  sortBy: string,         // Optional: 'riskScore' | 'trackerCount' | 'lastVisit'
  sortOrder: string,      // Optional: 'asc' | 'desc'
  filter: {               // Optional filters
    riskLevel: string,    // 'Low' | 'Moderate' | 'High' | 'Critical'
    minTrackers: number,
    maxTrackers: number
  }
}
```

**Response**:
```javascript
{
  success: boolean,
  sites: Array<SiteData>,  // Array of site objects (same structure as GET_SITE_DATA)
  total: number,           // Total number of sites (before pagination)
  hasMore: boolean         // Whether more pages exist
}
```

**Example**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'GET_ALL_SITES',
  limit: 20,
  sortBy: 'riskScore',
  sortOrder: 'desc',
  filter: {
    riskLevel: 'High'
  }
});

console.log(`Found ${response.total} high-risk sites`);
response.sites.forEach(site => {
  console.log(`${site.domain}: ${site.riskScore}`);
});
```

---

### GET_GRAPH

Request tracker network graph data.

**Request**:
```javascript
{
  type: 'GET_GRAPH',
  maxNodes: number,       // Optional, default: 100
  includeIsolated: boolean // Optional, default: false
}
```

**Response**:
```javascript
{
  success: boolean,
  graph: {
    nodes: Array<{
      id: string,           // Unique identifier
      label: string,        // Display name
      type: string,         // 'site' | 'tracker'
      category: string,     // For trackers: 'advertising', 'analytics', etc.
      degree: number,       // Number of connections
      pageRank: number,     // PageRank score
      isHub: boolean        // Whether node is a hub (high centrality)
    }>,
    edges: Array<{
      source: string,       // Source node ID
      target: string,       // Target node ID
      weight: number        // Edge weight (occurrences)
    }>,
    stats: {
      totalNodes: number,
      totalEdges: number,
      avgDegree: number,
      topHubs: string[]     // Top 5 hub tracker domains
    }
  }
}
```

**Example**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'GET_GRAPH',
  maxNodes: 50
});

const { nodes, edges } = response.graph;
console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges`);
```

---

### GET_STATS

Get aggregated statistics.

**Request**:
```javascript
{
  type: 'GET_STATS',
  timeRange: number       // Optional: days to include (default: 7)
}
```

**Response**:
```javascript
{
  success: boolean,
  stats: {
    totalSites: number,
    totalTrackers: number,
    totalCookies: number,
    totalFingerprints: number,
    avgRiskScore: number,
    highRiskSites: number,
    topTrackers: Array<{
      domain: string,
      category: string,
      occurrences: number,
      siteCount: number
    }>,
    riskDistribution: {
      Low: number,
      Moderate: number,
      High: number,
      Critical: number
    },
    dailyTrends: Array<{
      date: string,
      sitesVisited: number,
      avgRisk: number,
      totalTrackers: number
    }>
  }
}
```

---

### CLEAR_ALL

Clear all stored data.

**Request**:
```javascript
{
  type: 'CLEAR_ALL'
}
```

**Response**:
```javascript
{
  success: boolean,
  message: string
}
```

**Example**:
```javascript
const response = await chrome.runtime.sendMessage({
  type: 'CLEAR_ALL'
});

if (response.success) {
  console.log('All data cleared');
}
```

---

### EXPORT_DATA

Export all data as JSON.

**Request**:
```javascript
{
  type: 'EXPORT_DATA',
  includeHistory: boolean  // Optional, default: true
}
```

**Response**:
```javascript
{
  success: boolean,
  data: {
    version: string,
    exportDate: string,
    sites: Array<SiteData>,
    graph: GraphData,
    config: ConfigData
  }
}
```

---

### IMPORT_SITES

Import previously exported site data.

**Request**:
```javascript
{
  type: 'IMPORT_SITES',
  sites: Array<SiteData>
}
```

**Response**:
```javascript
{
  success: boolean,
  imported: number,
  skipped: number,
  errors: string[]
}
```

---

### CONFIG_UPDATED

Notify background worker of configuration changes.

**Request**:
```javascript
{
  type: 'CONFIG_UPDATED',
  config: {
    weights: {
      tracker: number,
      cookie: number,
      fingerprint: number,
      anomaly: number,
      thirdParty: number
    },
    features: {
      trackerDetection: boolean,
      fingerprintDetection: boolean,
      anomalyDetection: boolean,
      graphIntelligence: boolean,
      federatedLearning: boolean
    },
    retentionDays: number
  }
}
```

**Response**:
```javascript
{
  success: boolean,
  message: string
}
```

---

## Storage API

### IndexedDB Schema

**Database**: `privisee-db`  
**Version**: 1

#### Object Stores

**1. sites**
- **keyPath**: `domain`
- **Indexes**:
  - `riskLevel` (non-unique)
  - `lastVisit` (non-unique)
  - `riskScore` (non-unique)

**Record Structure**:
```javascript
{
  domain: string,
  riskScore: number,
  riskLevel: string,
  trackerCount: number,
  cookieCount: number,
  thirdPartyCount: number,
  lastVisit: number,
  visitCount: number,
  trackers: Array<Tracker>,
  cookies: Array<Cookie>,
  fingerprinting: FingerprintData,
  anomaly: AnomalyData,
  explanation: string,
  recommendations: string[],
  createdAt: number,
  updatedAt: number
}
```

**2. trackers**
- **keyPath**: `id` (auto-increment)
- **Indexes**:
  - `domain` (non-unique)
  - `category` (non-unique)

**Record Structure**:
```javascript
{
  id: number,
  domain: string,
  category: string,
  confidence: number,
  firstSeen: number,
  lastSeen: number,
  totalOccurrences: number,
  sites: string[]  // Domains where tracker was seen
}
```

**3. graph**
- **keyPath**: `id`

**Record Structure**:
```javascript
{
  id: 'main',
  nodes: Array<GraphNode>,
  edges: Array<GraphEdge>,
  updatedAt: number
}
```

---

## Chrome Extension APIs Used

### Permissions Required

```json
{
  "permissions": [
    "storage",
    "tabs",
    "webRequest",
    "cookies",
    "alarms"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

### APIs

#### chrome.storage.local

Used for configuration and small data.

```javascript
// Save
await chrome.storage.local.set({ config: configData });

// Retrieve
const { config } = await chrome.storage.local.get(['config']);
```

#### chrome.webRequest

Monitor network requests.

```javascript
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Analyze request
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);
```

#### chrome.cookies

Access cookie data.

```javascript
const cookies = await chrome.cookies.getAll({ domain: 'example.com' });
```

#### chrome.tabs

Query active tabs.

```javascript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
```

#### chrome.alarms

Schedule periodic tasks.

```javascript
chrome.alarms.create('cleanup', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    // Run cleanup
  }
});
```

---

## Error Handling

All API responses include error information when `success: false`:

```javascript
{
  success: false,
  error: {
    code: string,      // Error code (e.g., 'STORAGE_ERROR', 'INVALID_DOMAIN')
    message: string,   // Human-readable error message
    details: any       // Optional additional error details
  }
}
```

**Common Error Codes**:
- `STORAGE_ERROR`: Database operation failed
- `INVALID_DOMAIN`: Invalid domain format
- `NOT_FOUND`: Requested resource not found
- `PERMISSION_DENIED`: Missing required permissions
- `INVALID_REQUEST`: Malformed request

---

## Rate Limiting

To prevent performance issues:
- Fingerprint detection: Max 1 report per second per page
- Risk calculation: Max 10 per second
- Graph updates: Max 1 per 5 seconds

---

## Versioning

API Version: **1.0.0**

Breaking changes will increment major version. Check `chrome.runtime.getManifest().version` for extension version.

# PRIVISEE-X: Explainable Behavioral Privacy Intelligence

**Multi-Layer Client-Side Privacy Intelligence for the Modern Web**  
*Zero Telemetry · Zero External Dependencies · <1ms Latency · MV3 Compliant*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Version](https://img.shields.io/badge/Version-2.0.0-purple.svg)](https://github.com/Sujith1911/Previsee-X)

---

## What PRIVISEE-X Does

PRIVISEE-X is a Chrome extension that watches every website you visit and assigns it a **real-time risk score** — not from a static list, but from live behavioral analysis. Unlike blockers that rely on filter lists alone, PRIVISEE-X scores every site across four dimensions and explains *why* it's risky.

---

## Table of Contents

1. [v2.0 Feature Overview](#v20-feature-overview)
2. [Risk Engine Architecture](#risk-engine-architecture)
3. [Behavioral DNA System](#behavioral-dna-system)
4. [Threat Projection](#threat-projection)
5. [Machine Learning Pipeline](#machine-learning-pipeline)
6. [Installation & Setup](#installation--setup)
7. [Using the Extension](#using-the-extension)
8. [File Structure](#file-structure)
9. [Privacy Guarantee](#privacy-guarantee)

---

## v2.0 Feature Overview

| Feature | What it does |
|---------|-------------|
| **Dual-Layer Risk Score** | 40% Behavioral + 30% Static + 20% Reputation + 10% History |
| **Static Intelligence Engine** | Scores every site on HTTP security headers + TLS + cookie flags even with zero trackers |
| **Behavioral DNA** | Generates a behavioral hash per site from 14 browser API signals; matches against malicious clusters |
| **Threat Projection** | Predicts your risk in 30 days using EMA + cluster matches — INCREASING / STABLE / DECREASING |
| **Trust Persistence** | Trust a domain once — it stays trusted even after extension restarts (backed by `chrome.storage.local`) |
| **Explainable Risk Breakdown** | Popup shows each factor's exact contribution (+N score) |
| **Research Mode** | Full raw-data JSON export: headers, DNA hash, projection, history, tracker graph |
| **Tracker Graph** | D3 force-graph visualization of all tracker connections you've encountered |
| **Ad Blocking** | `declarativeNetRequest` rules with per-site blocked-ad statistics |
| **ML Classification** | Random Forest model classifies unknown domains in <1ms |

---

## Risk Engine Architecture

### The Four-Component Formula

```
FinalRiskScore =
  0.40 × BehavioralScore    (trackers + fingerprinting + excess cookies)
  0.30 × StaticScore        (HTTP headers + HTTPS + TLD + cookie flags)
  0.20 × ReputationScore    (tracker density + behavioral DNA cluster match)
  0.10 × UserHistoryScore   (30-day rolling average for this domain)
```

Even sites with zero JavaScript trackers get scored via `StaticScore` — visiting `http://` sites or sites missing `Content-Security-Policy` scores immediately.

### The Six Engines

| Engine | File | Role |
|--------|------|------|
| **Tracker Detector** | `src/detectors/TrackerDetector.js` | O(1) blocklist + ML classification |
| **Anomaly Detector** | `src/detectors/AnomalyDetector.js` | Isolation Forest behavioral deviation |
| **Fingerprint Detector** | `src/detectors/FingerprintDetector.js` | Canvas/WebGL/Audio API heuristics |
| **Static Intelligence** | `src/risk/StaticIntelligenceEngine.js` | Header audit via `onHeadersReceived` |
| **Behavioral DNA** | `src/risk/BehavioralDNA.js` | Session hash + cosine cluster match |
| **Threat Projection** | `src/risk/ThreatProjectionEngine.js` | EMA trend + 30-day projection |

---

## Behavioral DNA System

Every site session generates a **Behavioral Signature** from 14 browser APIs:

```
Canvas.toDataURL, WebGL.getParameter, AudioContext.createOscillator,
document.fonts, navigator.getBattery, RTCPeerConnection,
fetch(), XMLHttpRequest, WebSocket, localStorage.setItem,
clipboard.read, navigator.deviceMemory, navigator.connection,
navigator.hardwareConcurrency
```

This signature is:
1. **Hashed** (FNV-1a → 8-char hex) → shown in popup DNA pill
2. **Clustered** — cosine similarity vs 4 pre-seeded centroids:
   - `clean_site` (low risk baseline)
   - `tracker_analytics` (moderate)
   - `heavy_fingerprinter` (high)
   - `data_exfiltrator` (critical)
3. **Stored** in IndexedDB `behavioralFingerprints` store per domain

---

## Threat Projection

```
Projection = EMA(lastN_scores, α=0.3) + ClusterBonus × 0.5
Trend = firstHalfAvg vs secondHalfAvg → INCREASING | STABLE | DECREASING
Confidence = LOW (<2 visits) | MEDIUM (2–4) | HIGH (5+)
```

Visible in popup as a chip: `↑ Proj 68/100 in 30d · Confidence: MEDIUM`

---

## Machine Learning Pipeline

### Training Data (~20,000 domains)

| Source | Category |
|--------|---------|
| EasyList | Advertising |
| EasyPrivacy | Analytics / Tracking |
| Disconnect.me | Classified by category |
| DuckDuckGo Tracker Radar | Real-world prevalence |
| Tranco Top-10k | Benign baseline |

### 13-Dimensional Feature Vector

Each domain is represented by:
`domainEntropy, domainLength, subdomainCount, tokenCount, digitRatio,
specialCharRatio, pathDepth, queryParams, hasTrackingParams,
isThirdParty, tldType, resourceType, hasSubdomain`

### Model
- **Algorithm**: Random Forest (200 trees, max_depth=15, class_weight=balanced)
- **Validation**: 5-fold stratified cross-validation + OOB error
- **Inference**: Quantized to minimal JSON → loads in <50ms, predicts in <1ms

Run ML pipeline:
```bash
pip install -r ml/requirements.txt
python ml/run_all.py
# Outputs: src/models/tracker_classifier.json
```

---

## Installation & Setup

### Direct Git Install & Multi-Laptop Deployment (No Build Needed)

Since all core security and risk engines run entirely locally on raw files, you can deploy the extension to any laptop or browser directly from this repository without compiling or running build scripts.

#### 1. Clone the repository
```bash
git clone https://github.com/Sujith1911/Previsee-X.git
```

#### 2. Load the Unpacked Extension

If you encounter any manifest loading issues while selecting `src/` (or if you prefer a clean production-ready build), use the pre-built **`dist/`** directory. It contains all updated, synchronized, and validated production files.

* **Chrome / Edge / Brave / Opera / Chromium**:
  1. Open the extensions page (`chrome://extensions`, `edge://extensions`, or `brave://extensions`).
  2. Enable **Developer Mode** (via the toggle switch).
  3. Click the **Load Unpacked** button.
  4. Select the **`dist/` folder** (or `src/` if preferred) inside the cloned repository directory.
* **Firefox**:
  1. Navigate to `about:debugging`.
  2. Click **This Firefox** on the left menu.
  3. Click **Load Temporary Add-on...** and select `manifest.json` inside the **`dist/` folder** (or `src/` if preferred).

---

### 📱 iOS & macOS Safari Deployment

Safari on Apple devices (iOS, iPadOS, and macOS) uses a native App Store wrapper for extensions. You can convert and run PRIVISEE-X locally on your iPhone, iPad, or Mac:

#### 1. Requirements
* A Mac computer with **Xcode** (free on the Mac App Store) installed.
* An Apple Developer account (a free personal developer account is sufficient for local debugging).

#### 2. Convert the Extension
Open the Terminal on your Mac and run the Safari converter tool pointing to the `dist/` folder:
```bash
xcrun safari-web-extension-converter /path/to/Previsee-X/dist
```
This tool will parse the Chrome manifest and generate an Xcode project configured for Safari.

#### 3. Build & Run in Xcode
1. Xcode will open the converted project automatically.
2. Select your signing team in **Signing & Capabilities** (select your personal account).
3. Connect your iPhone or iPad via USB, or select your Mac as the active run destination.
4. Click the **Play (Run)** button to compile and install the extension app on your target device.

#### 4. Enable in Safari Settings
* **On iOS/iPadOS**: Go to **Settings** → **Safari** → **Extensions**. Toggle **PRIVISEE-X** to **ON**, and set permission to *Always Allow* for all websites.
* **On macOS**: Open Safari, go to **Safari Settings (Preferences)** → **Extensions**, check the box next to **PRIVISEE-X**, and allow it for websites.

---

### 🔄 Updating & Tracking Code Changes

#### How to update the extension:
Whenever a new update is pushed to the repository, pull the latest changes on your laptops:
```bash
git pull origin main
```
Then, simply click the **Reload** (circular arrow) icon on the **PRIVISEE-X** card in your browser's extension manager. The updates will apply instantly!

#### How to track recent updates:
If you or your friends want to see what was changed in the latest code pushes:
1. **View Git Commit History**: Run this command to inspect recent updates directly from the CLI:
   ```bash
   git log --oneline -n 5
   ```
   Or visit the [GitHub Commit History](https://github.com/Sujith1911/Previsee-X/commits/main).
2. **Read the Changelog**: Major updates, fixed bugs, and newly introduced features are documented in [CHANGELOG.md](file:///d:/Privisee-x/CHANGELOG.md).

---

## Using the Extension

### Popup

| Element | Description |
|---------|------------|
| **Score circle** | Overall risk 0–100 with colour-coded glow |
| **Score bars** | Behavioral / Static / Reputation sub-scores |
| **Trust Site** | Marks domain as trusted — score = 0, persists forever |
| **Risk Breakdown** | Factor list with +N contribution of each signal |
| **Projection chip** | 30-day predicted risk + trend direction |
| **DNA hash pill** | 8-char behavioral session fingerprint |
| **Research Mode toggle** | Enables raw data panel in dashboard |

### Dashboard Tabs

| Tab | Content |
|-----|---------|
| 🌐 Sites | All visited domains with risk, trackers, ads, cookies |
| 🍪 Cookies | Per-cookie details with expiry, Secure, HttpOnly, SameSite flags |
| 🕵️ Trackers | Tracker cross-reference: category, hits, sites |
| 🚫 Blocked Ads | Ad blocking stats per domain |
| 🕸️ Tracker Graph | D3 force-directed tracker network visualization |
| 🔬 Research | Full raw data export (JSON download) for the current tab |

### Settings (`settings.html`)

- **Risk weight sliders** — tune Behavioral / Cookie / Fingerprint / Anomaly weights
- **Feature toggles** — Static Intelligence, Threat Projection, Research Mode, Graph, ML
- **Trusted Domains** — view all trusted domains, remove individual trust or clear all
- **Data Export/Import** — full JSON backup and restore
- **Retention** — configure how many days of history to keep

---

## File Structure

```
Privisee-x/
├── ml/                              # Machine Learning Pipeline
│   ├── build_dataset.py             # Fetch & label training data
│   ├── train_random_forest.py       # Train RF classifier
│   ├── train_isolation_forest.py    # Train anomaly detector
│   ├── convert_to_tfjs.py           # Export to browser-compatible JSON
│   └── requirements.txt
│
├── src/                             # Extension Source
│   ├── manifest.json                # MV3, v2.0.0
│   ├── background.js                # Service Worker — all engines inlined
│   ├── content.js                   # 14-signal DOM/API monitor
│   ├── popup.html / settings.html / dashboard.html
│   │
│   ├── risk/
│   │   ├── RiskEngine.js            # Legacy single-layer (deprecated)
│   │   ├── StaticIntelligenceEngine.js  # v2.0 header/TLS/cookie scoring
│   │   ├── BehavioralDNA.js         # v2.0 session hash + cluster match
│   │   └── ThreatProjectionEngine.js    # v2.0 EMA projection
│   │
│   ├── detectors/
│   │   ├── TrackerDetector.js       # Blocklist O(1) + ML fallback
│   │   ├── AnomalyDetector.js       # Isolation Forest
│   │   └── FingerprintDetector.js   # API heuristics
│   │
│   ├── storage/
│   │   └── StorageManager.js        # IndexedDB v7 (7 stores)
│   │
│   ├── ui/
│   │   ├── PopupController.js       # v2.0 popup logic
│   │   ├── DashboardController.js   # Dashboard tabs + Research tab
│   │   └── ResearchMode.js          # Raw data snapshot + JSON export
│   │
│   ├── graph/GraphEngine.js         # PageRank + community detection
│   ├── security/SecurityAuditEngine.js
│   └── explainability/ExplainabilityEngine.js
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROJECT_REPORT.md
│   └── TESTING.md
│
└── README.md
```

---

## Privacy Guarantee

- ✅ **Zero network requests** — all analysis is 100% local
- ✅ **No telemetry** — nothing is sent anywhere, ever
- ✅ **No external CDN scripts** — D3.js and Chart.js are bundled in `src/lib/`
- ✅ **IndexedDB only** — all history stored locally in the browser
- ✅ **Open source** — full source auditable at [github.com/Sujith1911/Previsee-X](https://github.com/Sujith1911/Previsee-X)

---

**PRIVISEE-X v2.0**  
*Defending Privacy with Intelligence.*

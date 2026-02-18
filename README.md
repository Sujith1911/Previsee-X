# PRIVISEE-X: The comprehensive Privacy Intelligence Engine

<div align="center">

![PRIVISEE-X Logo](https://via.placeholder.com/150)

**Enterprise-Grade, Client-Side Privacy Intelligence for the Modern Web**
*Zero Telemetry • Zero External Dependencies • <1ms Latency*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)]()
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20v2.1-blue.svg)]()

</div>

---

## 📚 Table of Contents

1.  [**Executive Summary**](#executive-summary)
2.  [**System Architecture**](#system-architecture)
    *   [The "Six-Engine" Design](#the-six-engine-design)
    *   [Event-Driven Core](#event-driven-core)
3.  [**Machine Learning Methodology**](#machine-learning-methodology)
    *   [Data Acquisition Strategy](#data-acquisition-strategy)
    *   [Feature Engineering](#feature-engineering)
    *   [Model Training Pipeline](#model-training-pipeline)
    *   [Inference Optimization](#inference-optimization)
4.  [**Advanced Intelligence Capabilities**](#advanced-intelligence-capabilities)
    *   [Graph Intelligence (PageRank & Communities)](#graph-intelligence-pagerank--communities)
    *   [Adaptive Risk Scoring](#adaptive-risk-scoring)
    *   [Security & Dark Pattern Auditing](#security--dark-pattern-auditing)
5.  [**Developer Guide**](#developer-guide)
    *   [Installation & Setup](#installation--setup)
    *   [Running Tests](#running-tests)
    *   [Building for Production](#building-for-production)
6.  [**File Structure & Organization**](#file-structure--organization)

---

## <a name="executive-summary"></a>1. Executive Summary

**PRIVISEE-X** represents a paradigm shift in browser privacy. Unlike traditional blockers that rely solely on static lists (which are reactive and easily bypassed), PRIVISEE-X employs a **proactive, behavioral AI approach**.

It runs a specialized **Random Forest** model directly in the browser's extension process to classify network requests in real-time. This is augmented by **Graph Algorithms** to detect tracker networks and **Statistical Anomaly Detection** to flag unusual site behavior. All processing happens locally on the user's device, ensuring absolute privacy.

---

## <a name="system-architecture"></a>2. System Architecture

The system is built on a **Modular V2.1 Architecture** designed for scalability, testability, and performance.

### <a name="the-six-engine-design"></a>The "Six-Engine" Design

We have decoupled the logic into six distinct "Engines," each inheriting from a standardized `EngineBase` class (`src/core/EngineBase.js`).

1.  **Tracker Detector** (`src/detectors/TrackerDetector.js`)
    *   **Role**: The first line of defense.
    *   **Logic**: Hybrid Approach.
        *   **Layer 1**: O(1) Lookup against a compressed Blocklist (EasyList subset).
        *   **Layer 2**: If unknown, extract 13 features and run ML Inference.
    *   **Output**: Classification (Benign, Advertising, Analytics, Fingerprinting).

2.  **Anomaly Detector** (`src/detectors/AnomalyDetector.js`)
    *   **Role**: Behavioral integrity monitor.
    *   **Logic**: Uses **Isolation Forest** principles. Maintains a rolling baseline of site behavior (e.g., average cookies set, request count).
    *   **Trigger**: Flags sites that deviate > 3 standard deviations from the user's personal baseline.

3.  **Fingerprint Detector** (`src/detectors/FingerprintDetector.js`)
    *   **Role**: Heuristic identification of device fingerprinting.
    *   **Logic**: Hooks into sensitive browser APIs via `content.js`:
        *   `HTMLCanvasElement.toDataURL`
        *   `AudioContext.createOscillator`
        *   `WebGLRenderingContext.getParameter`
    *   **Output**: Real-time alerts on suspicious API usage patterns.

4.  **Risk Engine** (`src/risk/RiskEngine.js`)
    *   **Role**: The central decision maker.
    *   **Logic**: Aggregates signals from all other engines using a weighted scoring formula:
        $$ Risk = \sum (w_i \cdot f_i) $$
        (Where $w$ = weights defined in `WeightManager` and $f$ = factors like tracker count, anomaly score).
    *   **Output**: A normalized Risk Score (0-100) and Label (LOW, HIGH, CRITICAL).

5.  **Graph Engine** (`src/graph/GraphEngine.js`)
    *   **Role**: Network analyst.
    *   **Logic**: Builds a directed graph $G(V, E)$ where $V$ are domains and $E$ are requests.
    *   **Algorithms**:
        *   **PageRank**: Identifies "Hub" trackers (central nodes).
        *   **Community Detection**: Uses Label Propagation to find clusters of colluding trackers.

6.  **Security Audit Engine** (`src/security/SecurityAuditEngine.js`)
    *   **Role**: Site security analyst.
    *   **Logic**:
        *   **Headers**: Checks `Content-Security-Policy`, `HSTS`, `X-Frame-Options`.
        *   **Dark Patterns**: Scans DOM text for manipulative distinctives (e.g., "Only 1 left!", "Confirmshaming").

### <a name="life-of-a-request"></a>Life of a Request: Step-by-Step

To understand the system deeply, let's trace a single network request:

1.  **Intercept**: Chrome triggers `chrome.webRequest.onBeforeRequest`.
2.  **Filter**: `TrackerDetector` checks the URL against the O(1) Blocklist.
    *   *Match?* $\to$ Block immediately.
3.  **Extract features**: If unknown, `FeatureUtils` calculates the 13-dim vector (Entropy, Token Count, etc.).
4.  **Inference**: The `ModelLoader` passes the vector to the Random Forest.
    *   *Latency Check*: If inference takes > 2ms, we fail-open to preserve UX.
5.  **Decision**:
    *   *Prediction*: "Advertising" (Confidence: 0.85).
    *   *Action*: Block request.
6.  **Event**: `TRACKER_DETECTED` event emitted on `EventBus`.
7.  **Reaction**:
    *   `RiskEngine`: Updates session risk score (+10 points).
    *   `GraphEngine`: Adds edge [Current Site] $\to$ [Ad Domain].
    *   `UI`: Updates popup counter badge.

### <a name="event-driven-core"></a>Event-Driven Core

To prevent "spaghetti code," modules never call each other directly. They communicate via a strictly typed **EventBus** (`src/core/EventBus.js`).

**Example Flow**:
1.  `TrackerDetector` emits `TRACKER_DETECTED`.
2.  `RiskEngine` hears it $\to$ Increases Risk Score.
3.  `GraphEngine` hears it $\to$ Adds Edge to Graph.
4.  `UIController` hears it $\to$ Updates Badge Text.

---

## <a name="machine-learning-methodology"></a>3. Machine Learning Methodology

Our AI isn't a black box. Here is exactly how we built it.

### <a name="data-acquisition-strategy"></a>Data Acquisition Strategy
We curated a diverse dataset of **~20,000 domains** via `ml/build_dataset.py` from five authority sources:

| Source | Category | Description |
| :--- | :--- | :--- |
| **EasyList** | Advertising | The gold standard for ad domains. |
| **EasyPrivacy** | Analytics | Focuses on trackers and data collectors. |
| **Disconnect.me** | Categorized | Provides high-confidence labels. |
| **DuckDuckGo Radar** | Prevalence | Real-world tracker prevalence data. |
| **Tranco Top-1M** | Benign | The top 10k sites assumed benign for baseline. |

### <a name="feature-engineering"></a>Feature Engineering
We do not look at content pixels. We analyze **metadata**.
We extract a **13-Dimensional Feature Vector** for every request (`src/utils/FeatureUtils.js`):

1.  **Entropy (`domainEntropy`)**: Randomness of the domain name (e.g., `cdn.network` vs `x8f7z.site`).
2.  **Lexical Features**:
    *   `domainLength`, `subdomainCount`, `tokenCount`.
    *   `digitRatio`, `specialCharRatio` (DGA detection).
3.  **URL Structure**:
    *   `pathDepth`, `queryParams`.
    *   `hasTrackingParams` (Presence of `utm_`, `fbclid`, etc.).
4.  **Context**:
    *   `isThirdParty` (Boolean).
    *   `tldType` (.com vs .xyz).
    *   `resourceType` (Script/Image/XHR).

### <a name="model-training-pipeline"></a>Model Training Pipeline
Executed via `ml/train_random_forest.py`:

*   **Algorithm**: Random Forest Classifier.
*   **Hyperparameters**:
    *   `n_estimators`: 200 trees.
    *   `max_depth`: 15 (Pruned for size).
    *   `class_weight`: "balanced" (To handle class imbalance).
*   **Validation**:
    *   5-Fold Stratified Cross-Validation.
    *   Out-of-Bag (OOB) Error estimation.

### <a name="inference-optimization"></a>Inference Optimization
Python's `scikit-learn` models are huge (pickle files). We wrote a custom exporter (`ml/convert_to_tfjs.py`) that:
1.  Extracts the tree structures.
2.  Quantizes thresholds to reduced precision.
3.  Exports a minimal JSON structure.
4.  **Result**: A model that loads in < 50ms and predicts in < 1ms in pure JS.

---

## <a name="advanced-intelligence-capabilities"></a>4. Advanced Intelligence Capabilities

### <a name="graph-intelligence-pagerank--communities"></a>Graph Intelligence (PageRank & Communities)
We don't just count trackers; we map them.
*   **Nodes**: Websites visited & Third-parties loaded.
*   **Edges**: Requests.
*   **Insight**: By running **PageRank** locally, we identify "Super Spreaders"—trackers that appear across your entire history, even if they aren't on blocklists.
*   **Community Detection**: Uses **Label Propagation** to group trackers into clusters (e.g., "The Google Cluster", "The Meta Cluster").

### <a name="adaptive-risk-scoring"></a>Adaptive Risk Scoring
Privacy is subjective. The **Risk Engine** allows for calibration.
*   The system learns from *your* behavior. If you visit high-tracker sites often, the anomaly baseline shifts.
*   Users can adjust weights manually via the Settings UI (High tolerance vs. Paranoid mode).

### <a name="security--dark-pattern-auditing"></a>Security & Dark Pattern Auditing
*   **Strict Mode**: Flags sites missing `HSTS` (HTTPS Strict Transport Security).
*   **Dark Patterns**: Analysis of text nodes to find "False Urgency" (e.g., "Offer expires in 5 minutes!") or "Confirmshaming" (e.g., "No, I like paying full price").

---

## <a name="developer-guide"></a>5. Developer Guide

### <a name="installation--setup"></a>Installation & Setup

**Prerequisites**: Node.js v14+ (for testing/scripts), Python 3.9+ (for ML).

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Sujith1911/Previsee-X.git
    cd Privisee-x
    ```

2.  **Load into Chrome**
    *   Navigate to `chrome://extensions`.
    *   Enable "Developer Mode".
    *   Click "Load Unpacked" -> Select the `src/` folder.

3.  **Run ML Training (Optional)**
    *   Only needed if you want to update the model.
    ```bash
    pip install -r ml/requirements.txt
    python ml/run_all.py
    ```
    *   This will generate `src/models/tracker_classifier.json`.

### <a name="running-tests"></a>Running Tests
We use a **custom zero-dependency test runner** (`tests/runner.js`) to ensure the extension has no bloating dev-dependencies.

```bash
# Run all unit tests
node tests/main.js
```

**What is tested?**
*   Risk Calculation logic.
*   Graph GraphRank/Community algorithms.
*   Feature Extraction consistency.

### <a name="building-for-production"></a>Building for Production
To package the extension for the Web Store:

```bash
node scripts/build.js
```
*   Validates `manifest.json`.
*   Zips `src/` into `dist/privisee-x-v2.1.0.zip`.

---

## <a name="file-structure--organization"></a>6. File Structure & Organization

```
Privisee-x/
├── ml/                         # 🧠 Machine Learning Pipeline
│   ├── build_dataset.py        # Fetches & cleans training data
│   ├── train_random_forest.py  # Trains the classifier
│   ├── convert_to_tfjs.py      # Optimizes model for JS
│   └── requirements.txt        # Python dependencies
│
├── src/                        # 🧩 Extension Source Code
│   ├── background.js           # Central Service Worker (Orchestrator)
│   ├── content.js              # DOM & API Interface
│   ├── manifest.json           # V3 Configuration
│   │
│   ├── core/                   # 🏗️ Core Infrastructure
│   │   ├── EngineBase.js       # Abstract Base Class
│   │   ├── EventBus.js         # Pub/Sub System
│   │   └── Logger.js           # Structured Logging
│   │
│   ├── detectors/              # 🕵️‍♀️ Detection Engines
│   │   ├── TrackerDetector.js  # ML + Blocklist
│   │   ├── AnomalyDetector.js  # Isolation Forest
│   │   └── FingerprintDetector.js # API Heuristics
│   │
│   ├── risk/                   # ⚖️ Risk Scoring
│   ├── graph/                  # 🕸️ Graph Algorithms
│   ├── security/               # 🔒 Security Audit
│   ├── explainability/         # 🗣️ XAI (Explainable AI)
│   ├── models/                 # 🤖 Model Loader & JSON Asset
│   └── ui/                     # 🎨 Dashboard & Popup Logic
│
├── tests/                      # 🧪 Test Suite
│   ├── runner.js               # Custom Test Runner
│   ├── unit/                   # Unit Tests
│   └── main.js                 # Test Entry Point
│
├── docs/                       # 📄 Documentation
│   ├── THESIS.md               # Research Paper / Thesis
│   ├── THREAT_MODEL.md         # Security Analysis
│   └── PROJECT_REPORT.md       # General Report
│
└── README.md                   # This file
```

---

<div align="center">
<b>PRIVISEE-X v2.1</b><br>
<i>Defending Privacy with Intelligence.</i>
</div>

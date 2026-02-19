# PRIVISEE-X: Privacy Intelligence Engine

**Enterprise-Grade, Client-Side Privacy Intelligence for the Modern Web**
*Zero Telemetry | Zero External Dependencies | <1ms Latency*

[License: MIT](https://opensource.org/licenses/MIT) | [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) | [Architecture: Modular v2.1](https://github.com/Sujith1911/Previsee-X)

---

## Table of Contents

1.  [Executive Summary](#executive-summary)
2.  [System Architecture](#system-architecture)
    *   [The "Six-Engine" Design](#the-six-engine-design)
    *   [Event-Driven Core](#event-driven-core)
3.  [Machine Learning Methodology](#machine-learning-methodology)
    *   [Data Acquisition Strategy](#data-acquisition-strategy)
    *   [Feature Engineering](#feature-engineering)
    *   [Model Training Pipeline](#model-training-pipeline)
    *   [Inference Optimization](#inference-optimization)
4.  [Advanced Intelligence Capabilities](#advanced-intelligence-capabilities)
    *   [Graph Intelligence (PageRank & Communities)](#graph-intelligence-pagerank--communities)
    *   [Adaptive Risk Scoring](#adaptive-risk-scoring)
    *   [Security & Dark Pattern Auditing](#security--dark-pattern-auditing)
5.  [Developer Guide](#developer-guide)
    *   [Installation & Setup](#installation--setup)
    *   [Running Tests](#running-tests)
    *   [Building for Production](#building-for-production)
6.  [File Structure & Organization](#file-structure--organization)

---

## 1. Executive Summary

**PRIVISEE-X** represents a significant advancement in browser privacy technology. Unlike traditional blocking solutions that rely solely on static filter lists—which are reactive and often circumvented—PRIVISEE-X employs a **proactive, behavioral AI approach**.

The system utilizes a specialized **Random Forest** model running directly within the browser's extension process to classify network requests in real-time. This capability is augmented by **Graph Algorithms** for detecting sophisticated tracker networks and **Statistical Anomaly Detection** for identifying irregular site behaviors. All data processing occurs locally on the user's device, ensuring complete data sovereignty and privacy.

---

## 2. System Architecture

The system is built upon a **Modular V2.1 Architecture**, engineered for scalability, testability, and high performance.

### The "Six-Engine" Design

Logic is decoupled into six distinct "Engines," each inheriting from a standardized `EngineBase` class (`src/core/EngineBase.js`).

1.  **Tracker Detector** (`src/detectors/TrackerDetector.js`)
    *   **Role**: Primary defense mechanism.
    *   **Logic**: Hybrid Approach.
        *   **Layer 1**: O(1) Lookup against a compressed Blocklist (EasyList subset).
        *   **Layer 2**: Feature extraction (13 dimensions) and ML Inference for unknown domains.
    *   **Output**: Classification (Benign, Advertising, Analytics, Fingerprinting).

2.  **Anomaly Detector** (`src/detectors/AnomalyDetector.js`)
    *   **Role**: Behavioral integrity monitor.
    *   **Logic**: Utilizes **Isolation Forest** principles. Maintains a rolling baseline of site behavior (e.g., cookie volume, request frequency).
    *   **Trigger**: Flags sites deviating more than 3 standard deviations from the user's personal baseline.

3.  **Fingerprint Detector** (`src/detectors/FingerprintDetector.js`)
    *   **Role**: Heuristic identification of device fingerprinting attempts.
    *   **Logic**: Monitors sensitive browser APIs via `content.js`:
        *   `HTMLCanvasElement.toDataURL`
        *   `AudioContext.createOscillator`
        *   `WebGLRenderingContext.getParameter`
    *   **Output**: Real-time alerts regarding suspicious API usage patterns.

4.  **Risk Engine** (`src/risk/RiskEngine.js`)
    *   **Role**: Central decision engine.
    *   **Logic**: Aggregates signals from all other engines using a weighted scoring formula:
        `Risk = Sum(weight_i * factor_i)`
        (Where `weight` represents configurable importance and `factor` represents detected threats like tracker count or anomaly score).
    *   **Output**: Normalized Risk Score (0-100) and Label (LOW, HIGH, CRITICAL).

5.  **Graph Engine** (`src/graph/GraphEngine.js`)
    *   **Role**: Network analysis.
    *   **Logic**: Constructs a directed graph where nodes are domains and edges are network requests.
    *   **Algorithms**:
        *   **PageRank**: Identifies "Hub" trackers (central nodes in the tracking network).
        *   **Community Detection**: Uses Label Propagation to identify clusters of colluding trackers.

6.  **Security Audit Engine** (`src/security/SecurityAuditEngine.js`)
    *   **Role**: Site security analysis.
    *   **Logic**:
        *   **Headers**: Validates `Content-Security-Policy`, `HSTS`, `X-Frame-Options`.
        *   **Dark Patterns**: Scans DOM text for manipulative UI patterns (e.g., false urgency, confirm-shaming).

### Life of a Request: Step-by-Step

To illustrate the system operation, consider the lifecycle of a single network request:

1.  **Intercept**: Chrome triggers `chrome.webRequest.onBeforeRequest`.
2.  **Filter**: `TrackerDetector` checks the URL against the O(1) Blocklist.
    *   *Match?* Block immediately.
3.  **Extract features**: If unknown, `FeatureUtils` calculates the 13-dimensional feature vector (Entropy, Token Count, etc.).
4.  **Inference**: The `ModelLoader` executes the Random Forest model.
    *   *Latency Check*: If inference exceeds 2ms, the system fails-open to preserve User Experience.
5.  **Decision**:
    *   *Prediction*: "Advertising" (Confidence: 0.85).
    *   *Action*: Block request.
6.  **Event**: `TRACKER_DETECTED` event is emitted on the `EventBus`.
7.  **Reaction**:
    *   `RiskEngine`: Updates session risk score (+10 points).
    *   `GraphEngine`: Adds edge [Current Site] -> [Ad Domain].
    *   `UIController`: Updates the extension popup counter.

### Event-Driven Core

To maintain modularity and prevent tight coupling, modules communicate exclusively via a strictly typed **EventBus** (`src/core/EventBus.js`).

**Example Flow**:
1.  `TrackerDetector` emits `TRACKER_DETECTED`.
2.  `RiskEngine` receives event -> Increases Risk Score.
3.  `GraphEngine` receives event -> Adds Edge to Graph.
4.  `UIController` receives event -> Updates Badge Text.

---

## 3. Machine Learning Methodology

The AI architecture is transparent and documented.

### Data Acquisition Strategy
We curated a diverse dataset of approximately **20,000 domains** via `ml/build_dataset.py` from five authoritative sources:

| Source | Category | Description |
| :--- | :--- | :--- |
| **EasyList** | Advertising | Standard list for ad domains. |
| **EasyPrivacy** | Analytics | Focuses on trackers and data collectors. |
| **Disconnect.me** | Categorized | High-confidence labeled data. |
| **DuckDuckGo Radar** | Prevalence | Real-world tracker prevalence data. |
| **Tranco Top-1M** | Benign | Top 10k sites assumed benign for baseline. |

### Feature Engineering
The system analyzes **metadata**, not content pixels. We extract a **13-Dimensional Feature Vector** for every request (`src/utils/FeatureUtils.js`):

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

### Model Training Pipeline
Executed via `ml/train_random_forest.py`:

*   **Algorithm**: Random Forest Classifier.
*   **Hyperparameters**:
    *   `n_estimators`: 200 trees.
    *   `max_depth`: 15 (Pruned for efficiency).
    *   `class_weight`: "balanced" (Addressing class imbalance).
*   **Validation**:
    *   5-Fold Stratified Cross-Validation.
    *   Out-of-Bag (OOB) Error estimation.

### Inference Optimization
Standard `scikit-learn` models are too large for browser extensions. We developed a custom exporter (`ml/convert_to_tfjs.py`) that:
1.  Extracts the tree structures.
2.  Quantizes thresholds to reduced precision.
3.  Exports a minimal JSON structure.
4.  **Result**: A model that loads in under 50ms and predicts in under 1ms using pure JavaScript.

---

## 4. Advanced Intelligence Capabilities

### Graph Intelligence (PageRank & Communities)
The system maps trackers rather than simply counting them.
*   **Nodes**: Websites visited & Third-parties loaded.
*   **Edges**: Requests.
*   **Insight**: By running **PageRank** locally, we identify "Super Spreaders"—trackers that appear across the user's history, even if not present on static blocklists.
*   **Community Detection**: Uses **Label Propagation** to group trackers into clusters (e.g., "The Google Cluster", "The Meta Cluster").

### Adaptive Risk Scoring
Privacy is subjective, and the **Risk Engine** allows for calibration.
*   The system learns from user behavior. Frequent visits to high-tracker sites result in a shift of the anomaly baseline.
*   Users can adjust weights manually via the Settings UI (High tolerance vs. Paranoid mode).

### Security & Dark Pattern Auditing
*   **Strict Mode**: Flags sites missing `HSTS` (HTTPS Strict Transport Security).
*   **Dark Patterns**: Analysis of text nodes to find "False Urgency" (e.g., "Offer expires in 5 minutes!") or "Confirm-shaming" (e.g., "No, I like paying full price").

---

## 5. Developer Guide

### Installation & Setup

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
    *   Required only if updating the model.
    ```bash
    pip install -r ml/requirements.txt
    python ml/run_all.py
    ```
    *   This generates `src/models/tracker_classifier.json`.

### Running Tests
We use a **custom zero-dependency test runner** (`tests/runner.js`) to ensure the extension remains lightweight.

```bash
# Run all unit tests
node scripts/test_runner.js
```

**Test Coverage**:
*   Risk Calculation logic.
*   Graph GraphRank/Community algorithms.
*   Feature Extraction consistency.

### Building for Production
To package the extension for the Chrome Web Store:

```bash
node scripts/build.js
```
*   Validates `manifest.json`.
*   Zips `src/` into `dist/privisee-x-v2.1.0.zip`.

---

## 6. File Structure & Organization

```
Privisee-x/
├── ml/                         # Machine Learning Pipeline
│   ├── build_dataset.py        # Fetches & cleans training data
│   ├── train_random_forest.py  # Trains the classifier
│   ├── convert_to_tfjs.py      # Optimizes model for JS
│   └── requirements.txt        # Python dependencies
│
├── src/                        # Extension Source Code
│   ├── background.js           # Central Service Worker (Orchestrator)
│   ├── content.js              # DOM & API Interface
│   ├── manifest.json           # V3 Configuration
│   │
│   ├── core/                   # Core Infrastructure
│   │   ├── EngineBase.js       # Abstract Base Class
│   │   ├── EventBus.js         # Pub/Sub System
│   │   └── Logger.js           # Structured Logging
│   │
│   ├── detectors/              # Detection Engines
│   │   ├── TrackerDetector.js  # ML + Blocklist
│   │   ├── AnomalyDetector.js  # Isolation Forest
│   │   ├── FingerprintDetector.js # API Heuristics
│   │
│   ├── risk/                   # Risk Scoring
│   ├── graph/                  # Graph Algorithms
│   ├── security/               # Security Audit
│   ├── explainability/         # XAI (Explainable AI)
│   ├── models/                 # Model Loader & JSON Asset
│   └── ui/                     # Dashboard & Popup Logic
│
├── tests/                      # Test Suite
│   ├── runner.js               # Custom Test Runner
│   ├── unit/                   # Unit Tests
│   └── main.js                 # Test Entry Point
│
├── docs/                       # Documentation
│   ├── THESIS.md               # Research Paper / Thesis
│   ├── THREAT_MODEL.md         # Security Analysis
│   └── PROJECT_REPORT.md       # General Report
│
└── README.md                   # This file
```

---

**PRIVISEE-X v2.1**
*Defending Privacy with Intelligence.*

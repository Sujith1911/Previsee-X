# PRIVISEE-X v2.1: Production-Grade Privacy Intelligence System

<div align="center">

**Enterprise-Grade Privacy Intelligence for the Consumer Browser**
*Powered by Zero-Dependency Behavioral AI*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)]()
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20v2.1-blue.svg)]()
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()

</div>

---

## 🎯 Overview

PRIVISEE-X is a next-generation browser extension that shifts privacy protection from **reactive blocklists** to **proactive behavioral intelligence**.

Refactored in v2.1 to a modular, event-driven architecture, it operates with **Zero External API Calls** and **Zero Telemetry**, ensuring that user data never leaves the device.

### Key Capabilities
- 🧠 **Hybrid ML Core**: Random Forest + Isolation Forest running client-side (<1ms latency).
- 🕸️ **Graph Intelligence**: PageRank analysis and **Community Detection** of third-party tracker networks.
- 🛡️ **Adaptive Risk Scoring**: Learnable, weighted privacy scores (0-100).
- 🔍 **Security & Dark Pattern Auditing**: Real-time analysis of CSP, HSTS, and manipulative UI text.
- 🧪 **Enterprise Reliability**: Full unit testing suite and CI/CD pipelines.

---

## 🏗️ Architecture: The "Six-Engine" Design

The system is built on a clean, decoupled architecture (`src/core`, `src/detectors`, etc.) orchestrated by a central **EventBus**.

### 1. Detection Engines
*   **Tracker Detector**: Hybrid engine using O(1) blocklists + Random Forest ML for unknown domains.
*   **Anomaly Detector**: Statistical engine (Isolation Forest) monitoring browsing behavior deviations (e.g., cookie spikes).
*   **Fingerprint Detector**: Heuristic engine hooking sensitive APIs (Canvas, Audio, WebGL) to detect fingerprinting attempts.

### 2. Intelligence Engines
*   **Risk Engine**: Aggregates signals into a normalized risk score. Supports dynamic weight adjustments via `WeightManager`.
*   **Graph Engine**: Builds a directed graph of third-party connections. Uses **PageRank** to find hubs and **Label Propagation** for community detection.
*   **Security Audit Engine**: Detects missing security headers and **Dark Patterns** (e.g., "Only 1 left!").
*   **Explainability Engine**: Deconstructs risk scores into human-readable factors (SHAP-like contribution analysis).

### 3. Foundation
*   **Storage Manager**: IndexedDB wrapper with LRU caching and auto-cleanup.
*   **Model Loader**: Abstracted inference engine ensuring performance budgets (<3% CPU).

---

## 🛠️ Testing & DevOps

We enforce enterprise-grade quality standards with a custom zero-dependency test infrastructure.

### Testing
*   **Runner**: Custom lightweight runner (`tests/runner.js`) ensuring stability without heavy node_modules.
*   **Unit Tests**: Covering `RiskEngine` logic and `GraphEngine` algorithms.
*   **Run Tests**:
    ```bash
    node tests/main.js
    ```

### CI/CD
*   **GitHub Actions**: Automated workflow (`.github/workflows/ci.yml`) runs tests on every push/PR.
*   **Build Scripts**: Package the extension for Chrome/Edge/Firefox via `node scripts/build.js`.

---

## 🤖 ML Methodology

The AI models were trained using a custom-built pipeline (`ml/`) on real-world data (EasyList, Tranco Top-1M).

### 1. The Datasets
~20,000 labeled samples from multiple public privacy lists.

### 2. Feature Engineering
We extract a **13-dimensional feature vector** from every request (Entropy, Token counts, Tracking params).

### 3. Model Training
*   **Random Forest**: 200 Decision Trees.
*   **Optimization**: Custom quantized JSON format for efficient JS inference.

---

## 🚀 Installation

### Development Build
1.  Clone the repository:
    ```bash
    git clone https://github.com/Sujith1911/Previsee-X.git
    cd Privisee-x
    ```
2.  Open Chrome and go to `chrome://extensions/`.
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the `src/` directory.

### ML Pipeline (Optional)
To retrain the models:
```bash
pip install -r ml/requirements.txt
python ml/run_all.py
```

---

## 📁 Project Structure

```
src/
├── core/           # Base classes, EventBus, Logger
├── detectors/      # Logic engines (Tracker, Anomaly, Fingerprint)
├── risk/           # Risk scoring logic
├── graph/          # Network analysis & Community Detection
├── explainability/ # XAI logic
├── security/       # Security headers & Dark Pattern audit
├── storage/        # IndexedDB wrapper
├── models/         # ML models & loader
├── ui/             # Dashboard & Popup controllers
├── background.js   # Central Orchestrator
└── ...
tests/              # Unit & Integration tests
scripts/            # Build & Packaging tools
docs/               # Threat Model & API references
```

---

## 📜 License
MIT License - See [LICENSE](LICENSE) for details.

---

<div align="center">
<b>Built for Privacy. Powered by AI.</b>
</div>

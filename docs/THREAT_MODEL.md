# PRIVISEE-X Threat Model (STRIDE)

## 1. System Overview
Private, client-side browser extension for tracking detection. Zero external communication.

## 2. STRIDE Analysis

| Threat Category | Potential Vulnerability | Mitigation in PRIVISEE-X |
|----------------|-------------------------|--------------------------|
| **S**poofing | Malicious site mimicking a trusted entity to bypass checks. | **Graph Engine**: Checks analyzing previous connection history. **Anomaly Detector**: Flags unusual behavior even if domain looks valid. |
| **T**ampering | Modifying local ML models or blocklists. | **Checksum Validation**: `ModelLoader` verifies SHA-256 of JSON models. **Extension Signing**: Chrome Web Store signature. |
| **R**epudiation | Extension actions (blocking) cannot be logged. | **Local Logging**: `Logger.js` records all blocking decisions to IndexedDB (RiskHistory). |
| **I**nformation Disclosure | Leaking user history via telemetry. | **Architecture**: Zero-telemetry design. No `fetch()` to external analytics servers allowed in code. |
| **D**enial of Service | Malicious site launching 10k requests to hang extension. | **Performance Budget**: `ModelLoader` limits inference time. **StorageManager**: LRU caching prevents DB bloating. |
| **E**levation of Privilege | Tracker exploiting extension permissions. | **Manifest V3**: No remote code execution. `SecurityAuditEngine`: Detects and warns about weak/missing CSP on sites. |

## 3. Trust Boundary
- **Trusted**: The Extension Background context (`src/background.js`), Local Storage (IndexedDB).
- **Untrusted**: The DOM (`content.js`), Network Requests (analyzed by `TrackerDetector`), External websites.

## 4. Security Critical Components
- `ModelLoader.js`: Must ensure models are not corrupted.
- `SecurityAuditEngine.js`: Must accurately report site insecurity.

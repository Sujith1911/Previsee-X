# PRIVISEE-X Threat Model

## Executive Summary

PRIVISEE-X is a privacy-focused browser extension designed to detect and analyze web tracking. This document outlines potential security threats, attack vectors, mitigations, and trust boundaries.

## Trust Boundaries

### What PRIVISEE-X Trusts

1. **Chrome Extension Platform**: Assumes Chrome's extension sandbox is secure
2. **IndexedDB**: Trusts local storage isolation
3. **Chrome's Web Request API**: Trusts API provides accurate request data
4. **User's Browser**: Assumes no malware in browser process

### What PRIVISEE-X Does NOT Trust

1. **Visited Websites**: All websites are potential adversaries
2. **Third-Party Scripts**: Assumes hostile tracking intent
3. **Network Traffic**: All requests inspected with suspicion
4. **External APIs**: No external data sent (by design)

---

## Threat Categories

### 1. Privacy Threats

#### T1.1: Data Exfiltration by Extension

**Description**: Malicious version of extension sends user data to external servers.

**Likelihood**: Low (open-source, auditable)

**Impact**: Critical (privacy violation)

**Mitigations**:
- ✅ Zero external API calls (enforced by code review)
- ✅ No `fetch()` or `XMLHttpRequest` to external domains
- ✅ Content Security Policy blocks external requests
- ✅ Open-source for third-party audit
- ✅ No analytics or telemetry

**Verification**:
```bash
# Search for external API calls
grep -r "fetch\|XMLHttpRequest\|\.send\(" src/
# Should return zero network calls to external domains
```

#### T1.2: User Profiling by Tracker Networks

**Description**: Trackers create persistent user profile across sites.

**Likelihood**: High (this is the threat being defended against)

**Impact**: High (privacy erosion)

**Mitigations**:
- ✅ Cross-site tracker correlation detection
- ✅ Fingerprinting attempt monitoring
- ✅ Cookie analysis (1st vs 3rd party)
- ✅ User receives alerts and explanations

---

### 2. Security Threats

#### T2.1: Malicious Website XSS Against Extension

**Description**: Hostile website attempts to exploit extension via XSS.

**Likelihood**: Medium

**Impact**: Critical (could compromise extension)

**Mitigations**:
- ✅ Content scripts run in isolated world (Chrome sandbox)
- ✅ No `eval()` or `innerHTML` with untrusted data
- ✅ Strict Content Security Policy
- ✅ Message validation in background worker
- ✅ Domain allowlisting for sensitive operations

**CSP**:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'"
}
```

#### T2.2: Extension Dependency Compromise

**Description**: Malicious code injected through compromised dependencies (e.g., npm packages).

**Likelihood**: Low

**Impact**: Critical

**Mitigations**:
- ✅ Minimal dependencies (Chart.js, D3.js only for UI)
- ✅ No build-time dependencies in production code
- ✅ Dependencies loaded from CDN with SRI (Subresource Integrity)
- ⚠️ Manual code review of all dependencies recommended

**SRI Hashes**:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
        integrity="sha384-..." crossorigin="anonymous"></script>
```

#### T2.3: Privilege Escalation

**Description**: Attacker exploits extension permissions to perform unauthorized actions.

**Likelihood**: Low

**Impact**: High

**Mitigations**:
- ✅ Minimal permissions requested (storage, tabs, webRequest, cookies)
- ✅ No `activeTab` permission (requires user click)
- ✅ No dangerous permissions (downloads, nativeMessaging, debugger)
- ✅ User consent required for sensitive operations (data export/clear)

---

### 3. Data Integrity Threats

#### T3.1: Tracker Blocklist Poisoning

**Description**: Attacker modifies blocklist to evade detection or create false positives.

**Likelihood**: Low (local storage only)

**Impact**: Medium (reduced detection accuracy)

**Mitigations**:
- ✅ Blocklist embedded in extension code (not user-modifiable)
- ✅ Hybrid detection (blocklist + ML) provides redundancy
- ✅ Future: Blocklist integrity verification (cryptographic hash)

#### T3.2: ML Model Adversarial Attacks

**Description**: Attacker crafts tracker domains to evade ML classifier.

**Likelihood**: Medium

**Impact**: Medium (some trackers may evade detection)

**Mitigations**:
- ✅ Hybrid approach (blocklist catches known trackers)
- ✅ Anomaly detection as fallback
- ✅ Regular model retraining with new adversarial examples
- ⚠️ Consider ensemble methods for robustness

#### T3.3: IndexedDB Corruption

**Description**: Database becomes corrupted, causing data loss or crashes.

**Likelihood**: Low

**Impact**: Medium (loss of tracking history)

**Mitigations**:
- ✅ Transaction-based writes for atomicity
- ✅ Error handling and graceful degradation
- ✅ Export functionality for user backups
- ✅ Automatic cleanup prevents unbounded growth

---

### 4. Performance/DoS Threats

#### T4.1: Resource Exhaustion

**Description**: Extension consumes excessive CPU/memory, degrading browser performance.

**Likelihood**: Low

**Impact**: High (user uninstalls extension)

**Mitigations**:
- ✅ Performance targets: CPU <3%, Memory <100MB
- ✅ Request throttling (max 10 risk calculations/second)
- ✅ Lazy loading for dashboard
- ✅ LRU cache to limit memory growth
- ✅ Automatic data cleanup (7-day retention)

#### T4.2: Storage DoS

**Description**: Malicious site triggers excessive storage writes.

**Likelihood**: Low

**Impact**: Medium (storage quota exceeded)

**Mitigations**:
- ✅ Storage quota monitoring
- ✅ Batch writes to minimize transactions
- ✅ Automatic cleanup of old data
- ✅ Configurable retention period

---

### 5. Social Engineering Threats

#### T5.1: Fake Extension

**Description**: Attacker publishes fake "PRIVISEE-X" extension with malicious code.

**Likelihood**: Medium

**Impact**: Critical (user installs malware)

**Mitigations**:
- ✅ Publish only on official Chrome Web Store
- ✅ Verify publisher identity
- ✅ Documentation includes official extension ID
- ✅ Open-source repo for verification
- ⚠️ User education in README

#### T5.2: Phishing for Data Export

**Description**: Attacker tricks user into exporting and sharing privacy data.

**Likelihood**: Low

**Impact**: High (privacy violation)

**Mitigations**:
- ✅ Clear warnings on export functionality
- ✅ File includes timestamp and metadata (user can verify)
- ⚠️ Consider encryption for exported data (future enhancement)

---

## Attack Scenarios

### Scenario 1: Hostile Tracker Evasion

**Attacker Goal**: Evade detection by PRIVISEE-X

**Attack Steps**:
1. Analyze blocklist and ML model
2. Register new domain not in blocklist
3. Use obfuscated domain name to fool ML
4. Avoid known fingerprinting patterns

**Impact**: Tracker goes undetected

**Defenses**:
- Hybrid detection (blocklist + ML + anomaly detection)
- Statistical anomaly detection catches unusual patterns
- Regular model updates with new adversarial examples
- Community-driven blocklist updates

**Residual Risk**: Medium (some evasion possible)

### Scenario 2: Extension Compromise via XSS

**Attacker Goal**: Exploit extension to steal user data

**Attack Steps**:
1. Find XSS vulnerability in content script
2. Inject malicious script into web page context
3. Attempt to access extension APIs

**Impact**: Data exfiltration or privilege escalation

**Defenses**:
- Content scripts in isolated world (cannot access page JS)
- No `eval()` or dangerous DOM manipulation
- Message validation in background worker
- CSP blocks inline scripts

**Residual Risk**: Low (Chrome's sandbox is robust)

### Scenario 3: Supply Chain Attack

**Attacker Goal**: Inject malicious code via dependency

**Attack Steps**:
1. Compromise Chart.js or D3.js CDN
2. Serve malicious version to users
3. Exfiltrate data or perform actions

**Impact**: Critical (widespread compromise)

**Defenses**:
- Subresource Integrity (SRI) hashes verify CDN content
- Minimal dependencies reduce attack surface
- CDN compromise would be detected industry-wide

**Residual Risk**: Very Low (SRI prevents execution)

---

## Cryptographic Considerations

### Current: No Cryptography Used

PRIVISEE-X currently does NOT use cryptography because:
- All processing is local (no data transmission)
- IndexedDB is already isolated by Chrome
- No sensitive user credentials stored

### Future Enhancements

**Consider encryption for**:
1. **Exported Data**: Encrypt export files with user password
2. **Federated Learning**: Differential privacy with Laplace noise (if implemented)
3. **Blocklist Integrity**: SHA-256 hashes to verify blocklist authenticity

---

## Privacy Guarantees

### Formal Privacy Properties

1. **Zero Data Exfiltration**: No data leaves user's browser
   - **Verification**: Audit network traffic with Chrome DevTools
   
2. **Local-Only Processing**: All ML inference runs client-side
   - **Verification**: Inspect TensorFlow.js execution (no server calls)

3. **No Cross-Site Tracking by Extension**: Extension does not track user behavior
   - **Verification**: IndexedDB only stores domain-level aggregates

4. **User Data Ownership**: User can export all data and delete at will
   - **Verification**: Test export/clear functionality

### Differential Privacy (Optional Federated Learning)

If federated learning is enabled (opt-in):
- **Epsilon**: ε = 0.1 (strong privacy)
- **Mechanism**: Laplace noise added to gradients
- **Guarantee**: Individual contributions cannot be distinguished

---

## Compliance

### GDPR Considerations

- **Data Controller**: User is the data controller (extension is a tool)
- **Data Processing**: All processing is local, no third parties involved
- **Right to Erasure**: Clear all data functionality
- **Data Portability**: Export functionality

### Chrome Web Store Policies

- ✅ No obfuscated code
- ✅ Single purpose (privacy analysis)
- ✅ Minimal permissions
- ✅ Clear privacy policy
- ✅ No undisclosed data collection

---

## Security Checklist

- [ ] Code audit for external API calls (verify zero)
- [ ] Dependency audit (Chart.js, D3.js)
- [ ] SRI hashes for CDN resources
- [ ] Input validation for all message handlers
- [ ] CSP correctly configured
- [ ] Permission minimization
- [ ] Error handling prevents info leakage
- [ ] Performance monitoring (no DoS)
- [ ] Storage quota monitoring
- [ ] User warnings for sensitive actions

---

## Incident Response

### If Vulnerability Discovered

1. **Assess severity** (CVSS scoring)
2. **Develop patch** immediately
3. **Issue security advisory** on GitHub
4. **Push emergency update** to Chrome Web Store
5. **Notify users** via extension update notes
6. **Post-mortem** and process improvement

### User Reporting

Users can report security issues to:
- GitHub Issues (for non-critical bugs)
- Security email: [security@privisee-x.org](mailto:security@privisee-x.org) (for vulnerabilities)

---

## Conclusion

PRIVISEE-X adopts a **defense-in-depth** approach with:
- Minimal attack surface (local-only, minimal dependencies)
- Chrome's robust extension sandbox
- Open-source transparency
- Zero data exfiltration by design

**Residual Risks**:
- Chrome platform vulnerabilities (outside our control)
- Sophisticated tracker evasion (ongoing arms race)
- User social engineering (mitigated by education)

**Overall Risk Level**: **Low**

The extension's design prioritizes user privacy and security, with no external dependencies that could compromise user data.

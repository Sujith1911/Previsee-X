# PRIVISEE-X Testing Guide

## Overview

This guide covers manual and automated testing procedures for PRIVISEE-X.

## Prerequisites

- Chrome browser (version 110+)
- Extension loaded in developer mode
- (Optional) Python 3.8+ for ML model testing

## Manual Testing

### Installation Testing

1. **Load Extension**
   ```
   1. Open chrome://extensions/
   2. Enable "Developer mode"
   3. Click "Load unpacked"
   4. Select privisee-x/src/ directory
   5. Verify extension loads without errors
   ```

2. **Check Permissions**
   - Verify requested permissions are displayed
   - Confirm no unexpected permissions

3. **Icon Display**
   - Extension icon should appear in toolbar
   - Click icon to verify popup opens

### Functional Testing

#### Tracker Detection

1. Visit tracker-heavy sites:
   - https://www.cnn.com
   - https://www.forbes.com
   - https://www.weather.com

2. Open extension popup
3. Verify:
   - [ ] Risk score displays (>50 for heavy tracking)
   - [ ] Tracker count shows (>10)
   - [ ] Cookie count displays

4. Open Dashboard
5. Verify:
   - [ ] Site appears in sites list
   - [ ] Trackers listed with categories
   - [ ] Risk level color-coded

#### Fingerprinting Detection

1. Visit fingerprinting test site:
   - https://browserleaks.com/canvas
   - https://amiunique.org/

2. Perform fingerprint tests on the sites

3. Check Dashboard:
   - [ ] Finger printing attempts recorded
   - [ ] Canvas/WebGL/Audio counts >0

#### Risk Calculation

1. Visit low-risk site (e.g., https://example.com)
2. Verify risk score <30

3. Visit high-risk site (e.g., tracking-heavy news site)
4. Verify risk score >60

5. Compare explanations:
   - [ ] Low-risk has minimal concerns
   - [ ] High-risk lists specific issues

#### Graph Visualization

1. Visit 5-10 different websites
2. Open Dashboard → Scroll to Network Graph
3. Verify:
   - [ ] Graph renders with D3.js
   - [ ] Nodes are visible (blue=sites, red=trackers)
   - [ ] Edges connect sites to trackers
   - [ ] Can drag nodes
   - [ ] Can zoom/pan

4. Hover over tracker node:
   - [ ] Hub trackers highlighted in orange

#### Settings Panel

1. Open Settings from Dashboard
2. Test risk weight sliders:
   - [ ] Sliders update values in real-time
   - [ ] Can reset to defaults
   - [ ] Saving persists across page reload

3. Test feature toggles:
   - [ ] Can disable tracker detection
   - [ ] Can disable fingerprinting
   - [ ] Changes persist

4. Test data management:
   - [ ] Export creates JSON file
   - [ ] Clear all data removes everything
   - [ ] Import restores previously exported data

### Performance Testing

1. **CPU Usage**
   - Open Chrome Task Manager (Shift+Esc)
   - Browse 10 websites
   - Monitor PRIVISEE-X CPU usage
   - [ ] Should be <3% during active browsing
   - [ ] Should be <1% when idle

2. **Memory Usage**
   - Check extension memory in Task Manager
   - [ ] Should be <100MB
   - [ ] No memory leaks after extended use

3. **Response Time**
   - Click extension popup
   - [ ] Should open in <200ms
   - Dashboard should load in <500ms

### Privacy Testing

1. **Network Activity**
   - Open Chrome DevTools → Network tab
   - Browse websites with extension active
   - [ ] Verify ZERO external requests from extension
   - [ ] All processing is local

2. **Data Inspection**
   - Open Chrome DevTools → Application → IndexedDB
   - Inspect `privisee-db`
   - [ ] Only visited site data stored
   - [ ] No user identifiers or personal data

## Automated Testing

### Unit Tests

Run in browser console:

```javascript
// Load test suite
<script src="../tests/unit_tests.js"></script>

// Tests run automatically
// Check console for results
```

Expected output:
```
🧪 Running PRIVISEE-X Test Suite

✅ StorageEngine: Initialize database
✅ StorageEngine: Save and retrieve site
✅ TrackerDetector: Detect known tracker
...
✅ BehavioralAnalyzer: Detect cross-site correlation

============================================================
Results: 18/18 passed
✅ All tests passed!
```

### ML Model Testing

```bash
cd ml

# Test Isolation Forest
python train_isolation_forest.py

# Test model evaluation
python evaluate_models.py

# Test TensorFlow.js conversion
python convert_to_tfjs.py
```

Expected: All scripts complete without errors

## Integration Testing

### End-to-End Workflow

**Test Case**: Complete user journey

1. Install extension
2. Visit 5 different websites
3. Open popup and check risk scores
4. Open dashboard and verify all data displays
5. Adjust settings and verify changes apply
6. Export data to JSON
7. Clear all data
8. Import previously exported data
9. Verify data restored correctly

**Success Criteria**: All steps complete without errors

### Cross-Browser Testing

Currently supported: Chrome only (Manifest V3)

Future: Test on Edge (Chromium-based)

## Performance Benchmarks

Run performance tests on a standard machine:

| Metric | Target | How to Test |
|--------|--------|-------------|
| CPU (active) | <3% | Task Manager during browsing |
| CPU (idle) | <1% | Task Manager when inactive |
| Memory | <100MB | Task Manager |
| Popup load | <200ms | DevTools Performance tab |
| Dashboard load | <500ms | DevTools Performance tab |
| Risk calculation | <10ms | Console timing |
| Graph render | <100ms | DevTools Performance tab |

## Regression Testing

Before each release, verify:

- [ ] All unit tests pass
- [ ] No console errors on clean install
- [ ] Tracker detection works on 10 test sites
- [ ] Dashboard renders correctly
- [ ] Settings persist across browser restart
- [ ] Export/import functionality works
- [ ] Performance targets met

## Bug Reporting

### Test Site Issues

If tracker detection fails on a site:

1. Open DevTools Console
2. Look for errors
3. Check Network tab for requests
4. Report issue with:
   - Site URL
   - Expected trackers
   - Actual detection results
   - Console errors

### Extension Issues

Report bugs via GitHub Issues with:
- Extension version
- Chrome version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/error logs

## Test Data

### Sample Sites for Testing

**Low Risk**:
- example.com
- wikipedia.org
- github.com

**Moderate Risk**:
- reddit.com
- youtube.com
- amazon.com

**High Risk**:
- cnn.com
- forbes.com
- dailymail.co.uk

### Mock Data

For testing without real browsing:

```javascript
// Inject test site data
chrome.runtime.sendMessage({
  type: 'TEST_DATA',
  sites: [
    {
      domain: 'test-high-risk.com',
      riskScore: 85,
      trackerCount: 25,
      cookieCount: 50
    }
  ]
});
```

## Continuous Testing

### Pre-Commit Checklist

- [ ] Code passes linting (if configured)
- [ ] No console.error in code
- [ ] Unit tests pass
- [ ] Manual smoke test

### Pre-Release Checklist

- [ ] All automated tests pass
- [ ] Manual regression testing complete
- [ ] Performance benchmarks met
- [ ] Security audit complete (see THREAT_MODEL.md)
- [ ] Documentation updated
- [ ] Version number incremented in manifest.json

## Known Limitations

1. **ML Model Accuracy**: Depends on training data quality
2. **Fingerprint Detection**: Some advanced techniques may be missed
3. **Consent Analyzer**: Only detects common dark patterns
4. **Performance**: May vary on low-end devices

## Future Testing

- [ ] Automated browser testing (Puppeteer/Playwright)
- [ ] Continuous integration (GitHub Actions)
- [ ] A/B testing for UI changes
- [ ] Beta user feedback collection
- [ ] Accessibility testing (screen readers, keyboard navigation)

---

## Quick Test Command Reference

```bash
# Install dependencies (for ML testing)
cd ml && pip install -r requirements.txt

# Run model training
python train_random_forest.py
python train_isolation_forest.py

# Evaluate models
python evaluate_models.py

# Convert to TensorFlow.js
python convert_to_tfjs.py

# Load extension in Chrome
# chrome://extensions/ → Load unpacked → select src/

# Open dashboard
# chrome-extension://<extension-id>/dashboard.html

# Check storage
# DevTools → Application → IndexedDB → privisee-db
```

---

**For questions or issues, see [CONTRIBUTING.md](../CONTRIBUTING.md)**

/**
 * PRIVISEE-X Content Script
 * Fingerprinting Detection via API Wrapping
 *
 * Monitors: Canvas, WebGL, AudioContext, Fonts, Battery, WebRTC
 * Reports to background.js via chrome.runtime.sendMessage every 2s max.
 */

(function() {
  'use strict';

  // Counters for this page session
  const counts = { canvas: 0, webgl: 0, audio: 0, fonts: 0 };
  let lastReport = 0;
  let reportTimer = null;

  // ── Report to Background ──────────────────────────────────────────────────────
  function scheduleReport() {
    if (reportTimer) return; // Already scheduled
    reportTimer = setTimeout(() => {
      reportTimer = null;
      sendReport();
    }, 500); // Batch for 500ms
  }

  function sendReport() {
    const now = Date.now();
    if (now - lastReport < 1500) return; // Max once per 1.5s
    lastReport = now;

    const hasActivity = counts.canvas > 0 || counts.webgl > 0 || counts.audio > 0 || counts.fonts > 0;
    if (!hasActivity) return;

    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'FINGERPRINT_DETECTED',
          data: {
            canvas: counts.canvas,
            webgl:  counts.webgl,
            audio:  counts.audio,
            fonts:  counts.fonts,
            url: window.location.href,
            timestamp: now
          }
        }, () => { if (chrome.runtime.lastError) {} });
      }
    } catch (e) {}
  }

  // ── Canvas ────────────────────────────────────────────────────────────────────
  const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    if (this.width > 0 && this.width <= 500) { // Small canvases are fingerprinting suspects
      counts.canvas++;
      scheduleReport();
    }
    return _toDataURL.apply(this, args);
  };

  const _toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(...args) {
    if (this.width > 0 && this.width <= 500) {
      counts.canvas++;
      scheduleReport();
    }
    return _toBlob.apply(this, args);
  };

  const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    counts.canvas++;
    scheduleReport();
    return _getImageData.apply(this, args);
  };

  // ── WebGL ─────────────────────────────────────────────────────────────────────
  try {
    const _glGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      // VENDOR, RENDERER, UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL
      if (param === 0x1F00 || param === 0x1F01 || param === 0x9245 || param === 0x9246) {
        counts.webgl++;
        scheduleReport();
      }
      return _glGetParam.apply(this, arguments);
    };
  } catch {}

  // ── AudioContext ──────────────────────────────────────────────────────────────
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const _createOscillator = AudioCtx.prototype.createOscillator;
      AudioCtx.prototype.createOscillator = function() {
        counts.audio++;
        scheduleReport();
        return _createOscillator.apply(this, arguments);
      };

      const _createAnalyser = AudioCtx.prototype.createAnalyser;
      AudioCtx.prototype.createAnalyser = function() {
        counts.audio++;
        scheduleReport();
        return _createAnalyser.apply(this, arguments);
      };
    }
  } catch {}

  // ── Font Enumeration ──────────────────────────────────────────────────────────
  try {
    if (document.fonts && document.fonts.check) {
      const _check = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(...args) {
        counts.fonts++;
        if (counts.fonts % 5 === 0) scheduleReport(); // Batch font calls
        return _check(...args);
      };
    }
  } catch {}

  // ── Battery API ───────────────────────────────────────────────────────────────
  try {
    if (navigator.getBattery) {
      const _getBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = function() {
        counts.canvas++; // Track as generic fingerprint signal
        scheduleReport();
        return _getBattery();
      };
    }
  } catch {}

  // ── WebRTC IP Leak ────────────────────────────────────────────────────────────
  try {
    if (window.RTCPeerConnection) {
      const _RTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        counts.webgl++; // Track as generic fingerprint signal
        scheduleReport();
        return new _RTC(...args);
      };
      window.RTCPeerConnection.prototype = _RTC.prototype;
    }
  } catch {}

  // ── Initial Page Load Report ──────────────────────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(sendReport, 3000); // Late report to catch lazy loaders
  });

})();

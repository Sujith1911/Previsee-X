/**
 * PRIVISEE-X v3.0 Content Script
 * Extended Behavioral Monitoring
 *
 * Monitors: Canvas, WebGL, AudioContext, Fonts, Battery, WebRTC,
 *           fetch(), XMLHttpRequest, localStorage, sessionStorage,
 *           clipboard API, WebSocket, navigator device fingerprint APIs
 *
 * All signals batch-reported to background.js via chrome.runtime.sendMessage.
 */

(function() {
  'use strict';

  // Counters for this page session
  const counts = {
    canvas: 0, webgl: 0, audio: 0, fonts: 0,
    webrtc: 0, battery: 0,
    localStorage: 0, sessionStorage: 0, clipboard: 0,
    fetch: 0, xhr: 0, websocket: 0,
    deviceMemory: 0, hardwareConcurrency: 0, connection: 0
  };

  let lastReport = 0;
  let reportTimer = null;

  // ── Report to Background ───────────────────────────────────────────────────
  function scheduleReport() {
    if (reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      sendReport();
    }, 500);
  }

  function sendReport() {
    const now = Date.now();
    if (now - lastReport < 1500) return;
    lastReport = now;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return;

    try {
      if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'FINGERPRINT_DETECTED',
          data: { ...counts, url: window.location.href, timestamp: now }
        }, () => { if (chrome.runtime.lastError) {} });
      }
    } catch (e) {}
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  try {
    const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      if (this.width > 0 && this.width <= 500) { counts.canvas++; scheduleReport(); }
      return _toDataURL.apply(this, args);
    };

    const _toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(...args) {
      if (this.width > 0 && this.width <= 500) { counts.canvas++; scheduleReport(); }
      return _toBlob.apply(this, args);
    };

    const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      counts.canvas++; scheduleReport();
      return _getImageData.apply(this, args);
    };
  } catch {}

  // ── WebGL ──────────────────────────────────────────────────────────────────
  try {
    const _glGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 0x1F00 || param === 0x1F01 || param === 0x9245 || param === 0x9246) {
        counts.webgl++; scheduleReport();
      }
      return _glGetParam.apply(this, arguments);
    };
  } catch {}

  // ── AudioContext ───────────────────────────────────────────────────────────
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const _createOscillator = AudioCtx.prototype.createOscillator;
      AudioCtx.prototype.createOscillator = function() {
        counts.audio++; scheduleReport();
        return _createOscillator.apply(this, arguments);
      };
      const _createAnalyser = AudioCtx.prototype.createAnalyser;
      AudioCtx.prototype.createAnalyser = function() {
        counts.audio++; scheduleReport();
        return _createAnalyser.apply(this, arguments);
      };
    }
  } catch {}

  // ── Font Enumeration ───────────────────────────────────────────────────────
  try {
    if (document.fonts && document.fonts.check) {
      const _check = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(...args) {
        counts.fonts++;
        if (counts.fonts % 5 === 0) scheduleReport();
        return _check(...args);
      };
    }
  } catch {}

  // ── Battery API ────────────────────────────────────────────────────────────
  try {
    if (navigator.getBattery) {
      const _getBattery = navigator.getBattery.bind(navigator);
      navigator.getBattery = function() {
        counts.battery++; scheduleReport();
        return _getBattery();
      };
    }
  } catch {}

  // ── WebRTC IP Leak ─────────────────────────────────────────────────────────
  try {
    if (window.RTCPeerConnection) {
      const _RTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function(...args) {
        counts.webrtc++; scheduleReport();
        return new _RTC(...args);
      };
      window.RTCPeerConnection.prototype = _RTC.prototype;
    }
  } catch {}

  // ── fetch() ────────────────────────────────────────────────────────────────
  try {
    const _fetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      try {
        const u = new URL(typeof url === 'string' ? url : url.url, location.href);
        if (u.hostname !== location.hostname) { counts.fetch++; scheduleReport(); }
      } catch {}
      return _fetch.apply(this, args);
    };
  } catch {}

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  try {
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      try {
        const u = new URL(url, location.href);
        if (u.hostname !== location.hostname) { counts.xhr++; scheduleReport(); }
      } catch {}
      return _open.apply(this, [method, url, ...rest]);
    };
  } catch {}

  // ── WebSocket ──────────────────────────────────────────────────────────────
  try {
    const _WS = window.WebSocket;
    window.WebSocket = function(...args) {
      counts.websocket++; scheduleReport();
      return new _WS(...args);
    };
    window.WebSocket.prototype = _WS.prototype;
  } catch {}

  // ── localStorage abuse ─────────────────────────────────────────────────────
  try {
    const _setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === window.localStorage) { counts.localStorage++; if (counts.localStorage % 3 === 0) scheduleReport(); }
      else if (this === window.sessionStorage) { counts.sessionStorage++; }
      return _setItem.apply(this, [key, value]);
    };
  } catch {}

  // ── Clipboard API ──────────────────────────────────────────────────────────
  try {
    if (navigator.clipboard) {
      const _readText = navigator.clipboard.readText?.bind(navigator.clipboard);
      if (_readText) {
        navigator.clipboard.readText = function() {
          counts.clipboard++; scheduleReport();
          return _readText();
        };
      }
      const _read = navigator.clipboard.read?.bind(navigator.clipboard);
      if (_read) {
        navigator.clipboard.read = function() {
          counts.clipboard++; scheduleReport();
          return _read();
        };
      }
    }
    // document.execCommand clipboard fallback
    const _execCmd = document.execCommand;
    document.execCommand = function(cmd, ...args) {
      if (cmd === 'copy' || cmd === 'cut' || cmd === 'paste') {
        counts.clipboard++; scheduleReport();
      }
      return _execCmd.apply(this, [cmd, ...args]);
    };
  } catch {}

  // ── Navigator device fingerprint APIs ─────────────────────────────────────
  try {
    if (navigator.deviceMemory !== undefined) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: function() { counts.deviceMemory++; scheduleReport(); return 8; }
      });
    }
  } catch {}

  try {
    if (navigator.connection !== undefined) {
      const _conn = Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection');
      if (_conn && _conn.get) {
        Object.defineProperty(Navigator.prototype, 'connection', {
          get: function() { counts.connection++; return _conn.get.call(this); }
        });
      }
    }
  } catch {}

  // ── Initial Page Load Report ───────────────────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(sendReport, 3000); // Late report to catch lazy loaders
  });

  // Final report on page unload
  window.addEventListener('pagehide', sendReport);
  window.addEventListener('beforeunload', sendReport);

})();

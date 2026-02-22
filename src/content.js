/**
 * PRIVISEE-X v4.0 Content Script
 * Extended Behavioral Monitoring + Overlay Warning Injection
 *
 * Monitors: Canvas, WebGL, AudioContext, Fonts, Battery, WebRTC,
 *           fetch(), XMLHttpRequest, localStorage, sessionStorage,
 *           clipboard API, WebSocket, navigator device fingerprint APIs
 *
 * Overlay: Injects full-page security warning overlay when triggered by background.
 * Cert Warning: Injects certificate modal when triggered by background.
 *
 * All signals batch-reported to background.js via chrome.runtime.sendMessage.
 */

(function() {
  'use strict';

  // Prevent double-injection
  if (window.__PRIVISEE_X_INJECTED__) return;
  window.__PRIVISEE_X_INJECTED__ = true;

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
  let overlayInjected = false;
  let certWarningInjected = false;

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

  // ── Overlay Warning Injection ──────────────────────────────────────────────
  function injectOverlay({ riskScore, riskLevel, certWarning, domain }) {
    if (overlayInjected) return;
    overlayInjected = true;

    const color = riskScore >= 75 ? '#ef4444' : '#f97316';
    const reasons = [];
    if (certWarning?.isInvalid) {
      for (const r of (certWarning.reasons || [])) reasons.push(r);
    }
    if (riskScore > 70) reasons.push(`High privacy risk detected (score: ${riskScore}/100)`);

    const overlay = document.createElement('div');
    overlay.id = '__privisee_overlay__';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.92);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      backdrop-filter:blur(4px);
    `;

    overlay.innerHTML = `
      <div style="background:#0d0f18;border:1px solid ${color}40;border-radius:16px;padding:32px;max-width:440px;width:90%;text-align:center;box-shadow:0 0 60px ${color}20;">
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:${color};text-transform:uppercase;margin-bottom:8px;">PRIVISEE-X WARNING</div>
        <div style="font-size:20px;font-weight:800;color:#e2e8f0;margin-bottom:6px;">${domain}</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:16px;">This site may be unsafe</div>
        
        <div style="background:#1e2235;border-radius:10px;padding:12px 16px;text-align:left;margin-bottom:16px;">
          ${reasons.map(r => `
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;font-size:12px;color:#cbd5e1;">
              <span style="color:${color};flex-shrink:0;">•</span>${r}
            </div>`).join('')}
          ${!reasons.length ? `<div style="font-size:12px;color:#94a3b8;">Risk score ${riskScore}/100 — ${riskLevel}</div>` : ''}
        </div>
        
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="__px_leave__" style="background:${color};color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;">Leave Site</button>
          <button id="__px_proceed__" style="background:#1e2235;color:#94a3b8;border:1px solid #334155;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;">Proceed Anyway</button>
          <button id="__px_trust__" style="background:#10b98118;color:#10b981;border:1px solid #10b98130;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;">Trust Site</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlay);

    document.getElementById('__px_leave__')?.addEventListener('click', () => {
      window.history.back();
    });
    document.getElementById('__px_proceed__')?.addEventListener('click', () => {
      overlay.remove();
      try { chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY', trust: false }); } catch {}
    });
    document.getElementById('__px_trust__')?.addEventListener('click', () => {
      overlay.remove();
      try { chrome.runtime.sendMessage({ type: 'DISMISS_OVERLAY', trust: true }); } catch {}
    });
  }

  // ── Certificate Warning Modal ──────────────────────────────────────────────
  function injectCertWarning({ certWarning, domain }) {
    if (certWarningInjected || !certWarning?.hasWarning) return;
    certWarningInjected = true;

    const severity = certWarning.severity;
    const color = severity === 'CRITICAL' ? '#ef4444' : '#f59e0b';

    const modal = document.createElement('div');
    modal.id = '__privisee_cert_modal__';
    modal.style.cssText = `
      position:fixed;bottom:20px;right:20px;width:340px;
      background:#0d0f18;border:1px solid ${color}50;border-radius:12px;
      padding:16px;z-index:2147483646;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
    `;

    const issueRows = (certWarning.issues || []).map(issue => `
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;margin-bottom:4px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
        ${issue.label}
      </div>`).join('');

    modal.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:18px;">🔒</span>
        <span style="font-size:12px;font-weight:700;color:${color};">Security Warning — ${domain}</span>
        <button id="__px_cert_close__" style="margin-left:auto;background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">This site uses:</div>
      ${issueRows}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">
        <span style="font-size:10px;color:${color};font-weight:700;">Risk Level: ${severity}</span>
        <div style="display:flex;gap:6px;">
          <button id="__px_cert_proceed__" style="background:#1e2235;color:#94a3b8;border:1px solid #334155;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:10px;">Proceed</button>
          <button id="__px_cert_trust__" style="background:#10b98118;color:#10b981;border:1px solid #10b98130;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:10px;">Trust Site</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(modal);

    const dismiss = (trust) => {
      modal.remove();
      try { chrome.runtime.sendMessage({ type: 'DISMISS_CERT_WARNING', trust }); } catch {}
    };

    document.getElementById('__px_cert_close__')?.addEventListener('click', () => dismiss(false));
    document.getElementById('__px_cert_proceed__')?.addEventListener('click', () => dismiss(false));
    document.getElementById('__px_cert_trust__')?.addEventListener('click', () => dismiss(true));
  }

  // ── Listen for messages from background ───────────────────────────────────
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || !message.type) return;
      if (message.type === 'SHOW_OVERLAY_WARNING') {
        // Small delay to let page render first
        setTimeout(() => injectOverlay(message), 800);
      } else if (message.type === 'SHOW_CERT_WARNING') {
        setTimeout(() => injectCertWarning(message), 1200);
      }
    });
  } catch {}

  // ── Initial Page Load Report ───────────────────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(sendReport, 3000);
  });

  // Final report on page unload
  window.addEventListener('pagehide', sendReport);
  window.addEventListener('beforeunload', sendReport);

})();

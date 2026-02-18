/**
 * PRIVISEE-X Content Script
 * Fingerprinting Detection via API Wrapping
 * 
 * Detects:
 * - Canvas fingerprinting
 * - WebGL fingerprinting
 * - Audio fingerprinting
 * - Font enumeration
 * - Battery API
 * - Device memory/CPU
 */

(function() {
  'use strict';

  const fingerprintData = {
    canvas: 0,
    webgl: 0,
    audio: 0,
    fonts: 0,
    battery: false,
    deviceMemory: false,
    hardwareConcurrency: false,
    webRTC: false
  };

  // Wrap Canvas API
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;

  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    // Detect potential fingerprinting
    if (this.width * this.height < 100000) { // Suspicious small canvas
      fingerprintData.canvas++;
      reportFingerprinting('canvas');
    }
    return originalToDataURL.apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function(...args) {
    if (this.width * this.height < 100000) {
      fingerprintData.canvas++;
      reportFingerprinting('canvas');
    }
    return originalToBlob.apply(this, args);
  };

  // Wrap WebGL API
  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // Detect renderer/vendor queries (fingerprinting indicators)
    if (parameter === 0x1F00 || parameter === 0x1F01 || // VENDOR, RENDERER
        parameter === 0x9245 || parameter === 0x9246) { // UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL
      fingerprintData.webgl++;
      reportFingerprinting('webgl');
    }
    return originalGetParameter.apply(this, arguments);
  };

  // Wrap AudioContext
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    const originalCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      fingerprintData.audio++;
      if (fingerprintData.audio > 1) { // Multiple calls suggest fingerprinting
        reportFingerprinting('audio');
      }
      return originalCreateOscillator.apply(this, arguments);
    };
  }

  // Monitor font enumeration
  if (document.fonts && document.fonts.check) {
    const originalCheck = document.fonts.check;
    document.fonts.check = function(...args) {
      fingerprintData.fonts++;
      if (fingerprintData.fonts > 20) { // Many font checks
        reportFingerprinting('fonts');
      }
      return originalCheck.apply(this, args);
    };
  }

  // Monitor Battery API
  if (navigator.getBattery) {
    const originalGetBattery = navigator.getBattery;
    navigator.getBattery = function() {
      fingerprintData.battery = true;
      reportFingerprinting('battery');
      return originalGetBattery.apply(this, arguments);
    };
  }

  // Monitor Device Memory
  if ('deviceMemory' in navigator) {
    Object.defineProperty(navigator, 'deviceMemory', {
      get() {
        fingerprintData.deviceMemory = true;
        reportFingerprinting('deviceMemory');
        return navigator.__deviceMemory || 8;
      },
      set(value) {
        navigator.__deviceMemory = value;
      }
    });
  }

  // Monitor Hardware Concurrency
  if ('hardwareConcurrency' in navigator) {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency');
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get() {
        fingerprintData.hardwareConcurrency = true;
        reportFingerprinting('hardwareConcurrency');
        return original.get.call(this);
      }
    });
  }

  // Monitor WebRTC
  if (RTCPeerConnection) {
    const originalRTC = RTCPeerConnection;
    window.RTCPeerConnection = function(...args) {
      fingerprintData.webRTC = true;
      reportFingerprinting('webRTC');
      return new originalRTC(...args);
    };
  }

  // Throttled reporting (max once per second)
  let lastReport = 0;
  function reportFingerprinting(type) {
    const now = Date.now();
    if (now - lastReport < 1000) return; // Throttle
    
    lastReport = now;

    chrome.runtime.sendMessage({
      type: 'FINGERPRINT_DETECTED',
      data: {
        ...fingerprintData,
        url: window.location.href,
        timestamp: now
      }
    });
  }

  // Send initial report after page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (Object.values(fingerprintData).some(v => v > 0 || v === true)) {
        reportFingerprinting('summary');
      }
    }, 2000);
  });

})();

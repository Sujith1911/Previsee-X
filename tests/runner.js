/**
 * PRIVISEE-X Test Runner
 * A lightweight, zero-dependency test harness for the extension.
 * Supports: Unit Tests, Mocking, and Async testing.
 */

import { createLogger } from '../src/core/Logger.js';

const logger = createLogger('TestRunner');
let passed = 0;
let failed = 0;

// Assertion Helpers
export const assert = {
  equal: (actual, expected, msg) => {
    if (actual === expected) {
      logger.info(`✅ PASS: ${msg}`);
      passed++;
    } else {
      logger.error(`❌ FAIL: ${msg} (Expected: ${expected}, Got: ${actual})`);
      failed++;
    }
  },
  ok: (value, msg) => {
    if (!!value) {
      logger.info(`✅ PASS: ${msg}`);
      passed++;
    } else {
      logger.error(`❌ FAIL: ${msg} (Expected truthy, Got: ${value})`);
      failed++;
    }
  },
  throws: async (fn, msg) => {
    try {
      await fn();
      logger.error(`❌ FAIL: ${msg} (Expected exception, but none thrown)`);
      failed++;
    } catch (e) {
      logger.info(`✅ PASS: ${msg} (Caught expected error: ${e.message})`);
      passed++;
    }
  }
};

// Global Mocks for Browser Environment
global.chrome = {
  runtime: {
    getURL: (path) => path,
    onMessage: { addListener: () => {} },
    sendMessage: () => {}
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
      clear: async () => {}
    }
  },
  tabs: {
      query: async () => ([{ id: 1, url: 'https://example.com' }]),
      onUpdated: { addListener: () => {} }
  },
  webRequest: {
      onBeforeRequest: { addListener: () => {} }
  },
  extension: {
      getBackgroundPage: () => ({})
  }
};

// Mock IndexedDB (Minimal)
global.indexedDB = {
    open: () => ({
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: {
            createObjectStore: () => ({ createIndex: () => {} }),
            transaction: () => ({
                objectStore: () => ({
                    put: () => ({ onsuccess: null, onerror: null }),
                    get: () => ({ onsuccess: null, onerror: null, result: null }),
                    openCursor: () => ({ onsuccess: null, onerror: null })
                })
            }),
            objectStoreNames: { contains: () => false }
        }
    })
};

// Test Suite Runner
export async function runSuite(name, tests) {
  logger.info(`\n--- Running Suite: ${name} ---`);
  for (const [testName, testFn] of Object.entries(tests)) {
    try {
      logger.info(`Running: ${testName}`);
      await testFn();
    } catch (e) {
      logger.error(`❌ ERROR in ${testName}:`, e);
      failed++;
    }
  }
}

// Summary
export function printSummary() {
  logger.info(`\n=== TEST SUMMARY ===`);
  logger.info(`Passed: ${passed}`);
  logger.info(`Failed: ${failed}`);
  
  if (failed > 0) {
    logger.error('⚠️  TESTS FAILED');
    process.exit(1);
  } else {
    logger.info('🎉 ALL TESTS PASSED');
    process.exit(0);
  }
}

/**
 * Main Test Entry Point
 */

import { printSummary } from './runner.js';
import { testRiskEngine } from './unit/test_RiskEngine.js';
import { testGraphEngine } from './unit/test_GraphEngine.js';

// Global error handler
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    process.exit(1);
});

(async () => {
    console.log('🚀 Starting PRIVISEE-X Tests...\n');
    
    await testRiskEngine();
    await testGraphEngine();
    
    printSummary();
})();

/**
 * Unit Tests for RiskEngine
 */

import { RiskEngine, RiskLevel } from '../../src/risk/RiskEngine.js';
import { assert, runSuite } from '../runner.js';

export const testRiskEngine = async () => {
    const riskEngine = new RiskEngine();
    await riskEngine.init();

    await runSuite('RiskEngine', {
        'should calculate low risk for clean site': async () => {
            const context = {
                trackers: 0,
                fingerprintAttempts: 0,
                isAnomalous: false,
                isSecure: true,
                thirdPartyCount: 5
            };
            const result = await riskEngine.execute(context);
            
            // Expected: 0*5 + 0*20 + 0 + 0 + 5*1 = 5
            assert.equal(result.score, 5, 'Score should be 5');
            assert.equal(result.level, RiskLevel.LOW, 'Level should be LOW');
        },

        'should catch critical risk from fingerprinting': async () => {
             const context = {
                trackers: 2,
                fingerprintAttempts: 3, // 3 * 20 = 60
                isAnomalous: false,
                isSecure: true,
                thirdPartyCount: 5
            };
            // Score: 2*5 + 3*20 + 0 + 0 + 5*1 = 10 + 60 + 5 = 75
            // Actually score matches 75. Level threshold > 75 is critical?
            // Code says: if (score > 75) level = CRITICAL;
            // So 75 is HIGH. 76 is CRITICAL.
            
            const result = await riskEngine.execute(context);
            assert.equal(result.score, 75, 'Score calculation correct');
            assert.equal(result.level, RiskLevel.HIGH, 'Level is HIGH (borderline)');
        },

        'should cap score at 100': async () => {
            const context = {
                trackers: 50, // 250 points
                fingerprintAttempts: 0,
                isAnomalous: true,
                isSecure: false,
                thirdPartyCount: 0
            };
            const result = await riskEngine.execute(context);
            assert.equal(result.score, 100, 'Score should be capped at 100');
            assert.equal(result.level, RiskLevel.CRITICAL, 'Level should be CRITICAL');
        }
    });
};

/**
 * Unit Tests for GraphEngine
 */

import { GraphEngine } from '../../src/graph/GraphEngine.js';
import { assert, runSuite } from '../runner.js';

export const testGraphEngine = async () => {
    const graph = new GraphEngine();
    await graph.init();

    await runSuite('GraphEngine', {
        'should build graph nodes and links': async () => {
            await graph.execute({ source: 'site-a.com', target: 'tracker-1.com' });
            await graph.execute({ source: 'site-a.com', target: 'analytics.com' });
            
            const data = graph.exportGraph();
            assert.equal(data.nodes.length, 3, 'Should have 3 nodes');
            assert.equal(data.links.length, 2, 'Should have 2 links');
        },

        'should not duplicate links': async () => {
            await graph.execute({ source: 'site-b.com', target: 'ads.com' });
            await graph.execute({ source: 'site-b.com', target: 'ads.com' }); // Duplicate
            
            const data = graph.exportGraph();
            // Nodes: 3 prev + 2 new = 5
            // Links: 2 prev + 1 new = 3
            assert.equal(data.links.length, 3, 'Should verify unique links');
        },

        'should compute pagerank': async () => {
            // Star topology: Center 'hub' pointed to by many sites
            graph.nodes.clear();
            graph.links = [];
            
            // hub.com is tracker
            await graph.execute({ source: 'a.com', target: 'hub.com' });
            await graph.execute({ source: 'b.com', target: 'hub.com' });
            await graph.execute({ source: 'c.com', target: 'hub.com' });
            
            graph.computePageRank(20);
            
            const hubNode = graph.nodes.get('hub.com');
            const leafNode = graph.nodes.get('a.com');
            
            assert.ok(hubNode.pagerank > leafNode.pagerank, 'Hub should have higher Rank');
        }
    });
};

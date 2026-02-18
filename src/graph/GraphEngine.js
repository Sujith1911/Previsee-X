/**
 * PRIVISEE-X v2.0
 * Graph: GraphEngine
 * 
 * Builds a directed graph of third-party connections.
 * Calculates centrality metrics (PageRank) to identify tracker hubs.
 * Supports exporting graph to JSON for D3 visualization.
 */

import { EngineBase } from '../core/EngineBase.js';

export class GraphEngine extends EngineBase {
  constructor() {
    super('GraphEngine');
    this.nodes = new Map(); // id -> { id, type, weight }
    this.links = [];        // { source, target }
  }

  /**
   * Add a connection observed during browsing
   * @param {string} source - Visiting domain
   * @param {string} target - Third-party domain
   */
  async execute({ source, target }) {
    if (!source || !target) return;

    // Add Nodes
    if (!this.nodes.has(source)) this.nodes.set(source, { id: source, type: 'site', weight: 1 });
    if (!this.nodes.has(target)) this.nodes.set(target, { id: target, type: 'tracker', weight: 1 });

    // Add Link (if unique)
    const linkExists = this.links.some(l => l.source === source && l.target === target);
    if (!linkExists) {
      this.links.push({ source, target });
      // Update tracker weight (simple degree centrality)
      this.nodes.get(target).weight++;
    }

    // Periodic Re-calculation of metrics (PageRank) could happen here
    // or be triggered separately.
  }

  /**
   * Calculate simplified PageRank
   */
  computePageRank(iterations = 20, damping = 0.85) {
    const nodes = Array.from(this.nodes.values());
    const N = nodes.length;
    if (N === 0) return;

    const ranks = {};
    nodes.forEach(n => ranks[n.id] = 1 / N);

    for (let i = 0; i < iterations; i++) {
        const newRanks = {};
        nodes.forEach(node => {
            let rankSum = 0;
            // Find incoming links (reverse graph needed for efficiency, doing O(E) scan here for simplicity)
            this.links.forEach(link => {
                if (link.target === node.id) {
                    const sourceOutDegree = this.links.filter(l => l.source === link.source).length;
                    rankSum += ranks[link.source] / sourceOutDegree;
                }
            });
            newRanks[node.id] = (1 - damping) / N + damping * rankSum;
        });
        Object.assign(ranks, newRanks);
    }
    
    // Update node weights
    nodes.forEach(n => {
        n.pagerank = ranks[n.id];
        this.nodes.set(n.id, n);
    });
  }

  /**
   * Export graph data for UI
   */
  exportGraph() {
    return {
      nodes: Array.from(this.nodes.values()),
      links: this.links
    };
  }
}

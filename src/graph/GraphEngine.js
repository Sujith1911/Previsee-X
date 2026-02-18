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
   * Community Detection (Label Propagation)
   * Identifies clusters of trackers that often appear together
   */
  detectCommunities(iterations = 5) {
      const nodes = Array.from(this.nodes.values());
      // Initialize labels with own ID
      nodes.forEach(n => n.community = n.id);
      
      for (let i = 0; i < iterations; i++) {
          // Shuffle processing order
          const shuffled = [...nodes].sort(() => Math.random() - 0.5);
          
          shuffled.forEach(node => {
              const neighborLabels = {};
              
              // Find neighbors (In + Out edges)
              // NOTE: This implementation scans link list; optimized graph would use adjacency list
              this.links.forEach(link => {
                  let neighborId = null;
                  if (link.source === node.id) neighborId = link.target;
                  if (link.target === node.id) neighborId = link.source;
                  
                  if (neighborId) {
                      const neighbor = this.nodes.get(neighborId);
                      if (neighbor) {
                          const label = neighbor.community;
                          neighborLabels[label] = (neighborLabels[label] || 0) + 1;
                      }
                  }
              });
              
              // Adopt most frequent label
              let bestLabel = node.community;
              let maxCount = -1;
              for (const [label, count] of Object.entries(neighborLabels)) {
                  if (count > maxCount) {
                      maxCount = count;
                      bestLabel = label;
                  }
              }
              // If tie or no neighbors, keep current
              if (maxCount > 0) node.community = bestLabel;
          });
      }
      
      // Update state
      nodes.forEach(n => this.nodes.set(n.id, n));
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

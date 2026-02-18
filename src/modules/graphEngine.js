/**
 * PRIVISEE-X Graph Engine  
 * Domain Co-occurrence Graph with Centrality Analysis
 * 
 * Features:
 * - Graph construction from site-tracker relationships
 * - PageRank centrality calculation
 * - Hub identification
 * - Community detection
 * - D3.js-compatible output format
 */

class GraphEngine {
  constructor() {
    this.graph = null;
    this.pageRanks = null;
  }

  /**
   * Build co-occurrence graph from all site data
   * @param {Array} allSites - Array of site data objects
   * @returns {object} Graph with nodes and edges
   */
  buildGraph(allSites) {
    const graph = {
      nodes: new Map(),
      edges: []
    };

    for (const site of allSites) {
      // Add site node
      if (!graph.nodes.has(site.domain)) {
        graph.nodes.set(site.domain, {
          id: site.domain,
          type: 'site',
          riskScore: site.riskScore || 0,
          degree: 0,
          inDegree: 0,
          outDegree: 0
        });
      }

      // Add tracker nodes and edges
      if (site.trackers) {
        for (const [trackerDomain, info] of site.trackers) {
          // Add tracker node
          if (!graph.nodes.has(trackerDomain)) {
            graph.nodes.set(trackerDomain, {
              id: trackerDomain,
              type: 'tracker',
              category: info.category || 'unknown',
              degree: 0,
              inDegree: 0,
              outDegree: 0,
              sites: []
            });
          }

          // Track which sites use this tracker
          graph.nodes.get(trackerDomain).sites.push(site.domain);

          // Add edge
          graph.edges.push({
            source: site.domain,
            target: trackerDomain,
            weight: 1,
            category: info.category
          });

          // Update degrees
          graph.nodes.get(site.domain).outDegree++;
          graph.nodes.get(site.domain).degree++;
          graph.nodes.get(trackerDomain).inDegree++;
          graph.nodes.get(trackerDomain).degree++;
        }
      }
    }

    this.graph = graph;
    return this.getD3Format();
  }

  /**
   * Calculate PageRank for nodes
   * @param {number} iterations - Number of iterations
   * @param {number} dampingFactor - Damping factor (typically 0.85)
   * @returns {Map} Domain -> PageRank score
   */
  calculatePageRank(iterations = 20, dampingFactor = 0.85) {
    if (!this.graph) return new Map();

    const N = this.graph.nodes.size;
    const ranks = new Map();

    // Initialize ranks
    for (const node of this.graph.nodes.keys()) {
      ranks.set(node, 1.0 / N);
    }

    // Iterate
    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map();

      for (const [node] of this.graph.nodes) {
        let sum = 0;

        // Sum contributions from incoming edges
        for (const edge of this.graph.edges) {
          if (edge.target === node) {
            const sourceRank = ranks.get(edge.source);
            const sourceOutDegree = this.graph.nodes.get(edge.source).outDegree;
            if (sourceOutDegree > 0) {
              sum += sourceRank / sourceOutDegree;
            }
          }
        }

        newRanks.set(node, (1 - dampingFactor) / N + dampingFactor * sum);
      }

      // Update ranks
      ranks.clear();
      for (const [k, v] of newRanks) {
        ranks.set(k, v);
      }
    }

    this.pageRanks = ranks;
    return ranks;
  }

  /**
   * Identify top tracking hubs
   * @param {number} topN - Number of top hubs to return
   * @returns {Array} Top trackers by PageRank
   */
  identifyHubs(topN = 10) {
    if (!this.pageRanks) {
      this.calculatePageRank();
    }

    if (!this.graph) return [];

    return Array.from(this.pageRanks.entries())
      .filter(([domain]) => {
        const node = this.graph.nodes.get(domain);
        return node && node.type === 'tracker';
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([domain, rank]) => ({
        domain,
        rank,
        degree: this.graph.nodes.get(domain).degree,
        sites: this.graph.nodes.get(domain).sites?.length || 0,
        category: this.graph.nodes.get(domain).category
      }));
  }

  /**
   * Get graph in D3.js-compatible format
   * @returns {object} Format for D3 force simulation
   */
  getD3Format() {
    if (!this.graph) return { nodes: [], links: [] };

    const nodes = Array.from(this.graph.nodes.values()).map(node => ({
      ...node,
      id: node.id
    }));

    const links = this.graph.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      category: edge.category
    }));

    return { nodes, links };
  }

  /**
   * Get statistics about the graph
   */
  getStats() {
    if (!this.graph) return null;

    const trackerNodes = Array.from(this.graph.nodes.values())
      .filter(n => n.type === 'tracker');

    const siteNodes = Array.from(this.graph.nodes.values())
      .filter(n => n.type === 'site');

    return {
      totalNodes: this.graph.nodes.size,
      totalEdges: this.graph.edges.length,
      trackerCount: trackerNodes.length,
      siteCount: siteNodes.length,
      avgTrackerDegree: trackerNodes.length > 0
        ? trackerNodes.reduce((sum, n) => sum + n.degree, 0) / trackerNodes.length
        : 0,
      avgSiteTrackers: siteNodes.length > 0
        ? this.graph.edges.length / siteNodes.length
        : 0
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GraphEngine;
}

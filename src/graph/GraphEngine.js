/**
 * PRIVISEE-X v2.0
 * Graph: GraphEngine
 * 
 * Builds a directed graph of third-party connections.
 * Calculates centrality metrics (PageRank) to identify tracker hubs.
 * Supports community detection and JSON export for D3 visualization.
 * 
 * Performance fixes:
 * - O(1) link deduplication via Set (was O(n) Array.some)
 * - Reverse adjacency map for O(N·iterations) PageRank (was O(N·E·iterations))
 * - Memory caps: 10,000 nodes, 50,000 links
 */

import { EngineBase } from '../core/EngineBase.js';

const MAX_NODES = 10_000;
const MAX_LINKS = 50_000;

export class GraphEngine extends EngineBase {
  constructor() {
    super('GraphEngine');
    this.nodes   = new Map(); // id -> { id, type, weight, pagerank, community }
    this.links   = [];        // [{ source, target }]
    this._linkSet = new Set(); // "source::target" -> O(1) dedup check
  }

  async init() {
    await super.init();
    this.logger.info('GraphEngine initialized');
  }

  /**
   * Add a connection observed during browsing
   * @param {string} source - Visiting domain
   * @param {string} target - Third-party domain
   */
  async execute({ source, target }) {
    if (!source || !target || source === target) return;

    // Add Nodes
    if (!this.nodes.has(source)) {
      // Memory cap: evict lowest-weight node if at limit
      if (this.nodes.size >= MAX_NODES) this._evictLowestWeightNode();
      this.nodes.set(source, { id: source, type: 'site', weight: 1, pagerank: 0, community: source });
    }
    if (!this.nodes.has(target)) {
      if (this.nodes.size >= MAX_NODES) this._evictLowestWeightNode();
      this.nodes.set(target, { id: target, type: 'tracker', weight: 1, pagerank: 0, community: target });
    }

    // Add Link — O(1) dedup via Set
    const linkKey = `${source}::${target}`;
    if (!this._linkSet.has(linkKey)) {
      // Memory cap: evict oldest link if at limit
      if (this.links.length >= MAX_LINKS) {
        const evicted = this.links.shift();
        this._linkSet.delete(`${evicted.source}::${evicted.target}`);
      }

      this._linkSet.add(linkKey);
      this.links.push({ source, target });

      // Update tracker weight (degree centrality)
      const targetNode = this.nodes.get(target);
      if (targetNode) {
        targetNode.weight++;
        this.nodes.set(target, targetNode);
      }
    }
  }

  /**
   * Evict the node with lowest weight (fewest connections)
   */
  _evictLowestWeightNode() {
    let minWeight = Infinity;
    let minId     = null;
    for (const [id, node] of this.nodes) {
      if (node.weight < minWeight) {
        minWeight = node.weight;
        minId     = id;
      }
    }
    if (minId) {
      this.nodes.delete(minId);
      this.logger.debug(`Evicted low-weight node: ${minId}`);
    }
  }

  /**
   * Calculate PageRank using pre-built reverse adjacency map.
   * Complexity: O(N + E) per iteration vs previous O(N·E) per iteration.
   * @param {number} iterations
   * @param {number} damping
   */
  computePageRank(iterations = 20, damping = 0.85) {
    const nodes = Array.from(this.nodes.values());
    const N = nodes.length;
    if (N === 0) return;

    // Pre-build reverse adjacency map and out-degree map — O(E)
    const reverseAdj = new Map(); // nodeId -> [sourceIds that link to nodeId]
    const outDegree  = new Map(); // nodeId -> count of outgoing links

    nodes.forEach(n => { reverseAdj.set(n.id, []); outDegree.set(n.id, 0); });

    for (const link of this.links) {
      if (reverseAdj.has(link.target)) {
        reverseAdj.get(link.target).push(link.source);
      }
      outDegree.set(link.source, (outDegree.get(link.source) || 0) + 1);
    }

    // Initialize ranks
    const ranks = new Map();
    nodes.forEach(n => ranks.set(n.id, 1 / N));

    // Iterate — O(N + E) per iteration
    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map();
      for (const node of nodes) {
        let rankSum = 0;
        for (const srcId of (reverseAdj.get(node.id) || [])) {
          const srcOut = outDegree.get(srcId) || 1;
          rankSum += (ranks.get(srcId) || 0) / srcOut;
        }
        newRanks.set(node.id, (1 - damping) / N + damping * rankSum);
      }
      for (const [id, rank] of newRanks) ranks.set(id, rank);
    }

    // Write back to nodes
    nodes.forEach(n => {
      n.pagerank = parseFloat((ranks.get(n.id) || 0).toFixed(6));
      this.nodes.set(n.id, n);
    });

    this.logger.info(`PageRank computed for ${N} nodes over ${iterations} iterations`);
  }

  /**
   * Community Detection (Label Propagation)
   * Identifies clusters of trackers that often appear together.
   */
  detectCommunities(iterations = 5) {
    const nodes = Array.from(this.nodes.values());
    nodes.forEach(n => (n.community = n.id));

    // Build adjacency list for O(1) neighbor lookup
    const adjList = new Map();
    nodes.forEach(n => adjList.set(n.id, new Set()));
    for (const link of this.links) {
      adjList.get(link.source)?.add(link.target);
      adjList.get(link.target)?.add(link.source);
    }

    for (let i = 0; i < iterations; i++) {
      // Shuffle processing order to avoid bias
      const shuffled = [...nodes].sort(() => Math.random() - 0.5);

      for (const node of shuffled) {
        const neighborLabels = {};
        for (const neighborId of (adjList.get(node.id) || [])) {
          const neighbor = this.nodes.get(neighborId);
          if (neighbor) {
            const label = neighbor.community;
            neighborLabels[label] = (neighborLabels[label] || 0) + 1;
          }
        }

        let bestLabel = node.community;
        let maxCount  = -1;
        for (const [label, count] of Object.entries(neighborLabels)) {
          if (count > maxCount) { maxCount = count; bestLabel = label; }
        }
        if (maxCount > 0) node.community = bestLabel;
      }
    }

    nodes.forEach(n => this.nodes.set(n.id, n));
    this.logger.info(`Community detection complete for ${nodes.length} nodes`);
  }

  /**
   * Export graph data for UI (D3/canvas rendering)
   */
  exportGraph() {
    return {
      nodes: Array.from(this.nodes.values()),
      links: this.links
    };
  }

  /**
   * Export graph as a serialized JSON string with metadata
   * @returns {string} JSON string
   */
  exportGraphJSON() {
    const graph = this.exportGraph();
    return JSON.stringify({
      version:    '2.0',
      exportedAt: new Date().toISOString(),
      nodeCount:  graph.nodes.length,
      linkCount:  graph.links.length,
      nodes:      graph.nodes,
      links:      graph.links
    });
  }
}

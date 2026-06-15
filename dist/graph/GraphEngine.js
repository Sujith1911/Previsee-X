/**
 * PRIVISEE-X v5.0 — GraphEngine
 * Advanced Graph Centrality (PageRank, Betweenness Centrality) 
 * and Ecosystem Clustering (Louvain-style Label Propagation).
 * Supports nodes of types: Website, Tracker, Ad Network, CDN, Cookie, Certificate, Organization.
 */

import { EngineBase } from '../core/EngineBase.js';

const MAX_NODES = 1000; // Calibrated for browser UI fluidity (<500ms render target)
const MAX_LINKS = 5000;

// Deterministic mapping of tracking domains to parent organizations/ecosystems
const ECOSYSTEM_MAP = {
  'doubleclick.net': 'Google Ecosystem',
  'google-analytics.com': 'Google Ecosystem',
  'googletagmanager.com': 'Google Ecosystem',
  'googlesyndication.com': 'Google Ecosystem',
  'googleads.g.doubleclick.net': 'Google Ecosystem',
  'googleadservices.com': 'Google Ecosystem',
  'adservice.google.com': 'Google Ecosystem',
  'facebook.com': 'Meta Ecosystem',
  'facebook.net': 'Meta Ecosystem',
  'connect.facebook.net': 'Meta Ecosystem',
  'an.facebook.com': 'Meta Ecosystem',
  'graph.facebook.com': 'Meta Ecosystem',
  'clarity.ms': 'Microsoft Ecosystem',
  'bat.bing.com': 'Microsoft Ecosystem',
  'amazon-adsystem.com': 'Amazon Advertising',
  'aax-us-east.amazon-adsystem.com': 'Amazon Advertising',
  'criteo.com': 'Criteo Ad-Network',
  'criteo.net': 'Criteo Ad-Network',
  'outbrain.com': 'Outbrain Content-Recommendation',
  'taboola.com': 'Taboola Content-Recommendation'
};

export class GraphEngine extends EngineBase {
  constructor() {
    super('GraphEngine');
    this.nodes = new Map(); // id -> { id, type, weight, pagerank, betweenness, community, organization }
    this.links = [];        // [{ source, target }]
    this._linkSet = new Set();
  }

  async init() {
    await super.init();
    this.logger.info('Graph Engine ready');
  }

  /**
   * Add a connection node and edge to the graph
   * @param {object} connection - { source, target, sourceType, targetType }
   */
  async execute({ source, target, sourceType = 'Website', targetType = 'Tracker' }) {
    if (!source || !target || source === target) return;

    // Add source node
    if (!this.nodes.has(source)) {
      if (this.nodes.size >= MAX_NODES) this._evictLowestWeightNode();
      this.nodes.set(source, {
        id: source,
        type: sourceType,
        weight: 1,
        pagerank: 0,
        betweenness: 0,
        community: source,
        organization: 'Independent Site'
      });
    }

    // Add target node
    if (!this.nodes.has(target)) {
      if (this.nodes.size >= MAX_NODES) this._evictLowestWeightNode();
      
      // Resolve organization if target is a tracker
      let organization = 'Unknown Tracker';
      if (targetType === 'Tracker') {
        const root = this.getRootDomain(target);
        organization = ECOSYSTEM_MAP[target] || ECOSYSTEM_MAP[root] || 'Independent Tracker';
      }

      this.nodes.set(target, {
        id: target,
        type: targetType,
        weight: 1,
        pagerank: 0,
        betweenness: 0,
        community: organization !== 'Independent Tracker' && organization !== 'Unknown Tracker' ? organization : target,
        organization
      });
    }

    // Add link
    const linkKey = `${source}::${target}`;
    if (!this._linkSet.has(linkKey)) {
      if (this.links.length >= MAX_LINKS) {
        const evicted = this.links.shift();
        this._linkSet.delete(`${evicted.source}::${evicted.target}`);
      }

      this._linkSet.add(linkKey);
      this.links.push({ source, target });

      // Update node weights (degree counts)
      const srcNode = this.nodes.get(source);
      if (srcNode) srcNode.weight++;
      const tgtNode = this.nodes.get(target);
      if (tgtNode) tgtNode.weight++;
    }
  }

  /**
   * Calculate Betweenness Centrality using Brandes' Algorithm (O(V*E))
   * Measures node influence as a bridge/broker.
   */
  computeBetweennessCentrality() {
    const nodeIds = Array.from(this.nodes.keys());
    const N = nodeIds.length;
    if (N === 0) return;

    // Initialize betweenness map
    const CB = {};
    nodeIds.forEach(id => { CB[id] = 0; });

    // Build adjacency lists
    const adj = {};
    nodeIds.forEach(id => { adj[id] = []; });
    for (const link of this.links) {
      if (adj[link.source] && adj[link.target]) {
        adj[link.source].push(link.target);
        adj[link.target].push(link.source); // Treat as undirected for centrality paths
      }
    }

    for (const s of nodeIds) {
      const S = []; // Stack
      const P = {}; // Predecessors list
      const sigma = {}; // Path counts
      const d = {}; // Distances
      
      nodeIds.forEach(w => {
        P[w] = [];
        sigma[w] = 0;
        d[w] = -1;
      });

      sigma[s] = 1;
      d[s] = 0;

      const Q = [s]; // Queue

      while (Q.length > 0) {
        const v = Q.shift();
        S.push(v);

        for (const w of adj[v]) {
          // Node w found for the first time
          if (d[w] < 0) {
            Q.push(w);
            d[w] = d[v] + 1;
          }
          // Shortest path to w via v
          if (d[w] === d[v] + 1) {
            sigma[w] += sigma[v];
            P[w].push(v);
          }
        }
      }

      const delta = {};
      nodeIds.forEach(w => { delta[w] = 0; });

      // Accumulation (S returns nodes in order of non-increasing distance from s)
      while (S.length > 0) {
        const w = S.pop();
        for (const v of P[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== s) {
          CB[w] += delta[w];
        }
      }
    }

    // Normalize (divide by (N-1)*(N-2) for undirected graph)
    const normFactor = N > 2 ? (N - 1) * (N - 2) : 1;
    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        node.betweenness = parseFloat((CB[id] / normFactor).toFixed(6));
        this.nodes.set(id, node);
      }
    }

    this.logger.info(`Betweenness Centrality computed for ${N} nodes`);
  }

  /**
   * Calculate PageRank Centrality
   */
  computePageRank(iterations = 15, damping = 0.85) {
    const nodeIds = Array.from(this.nodes.keys());
    const N = nodeIds.length;
    if (N === 0) return;

    const ranks = {};
    nodeIds.forEach(id => { ranks[id] = 1 / N; });

    // Outgoing counts
    const outDegree = {};
    nodeIds.forEach(id => { outDegree[id] = 0; });

    // Incoming adjacency
    const incoming = {};
    nodeIds.forEach(id => { incoming[id] = []; });

    for (const link of this.links) {
      if (incoming[link.target]) incoming[link.target].push(link.source);
      outDegree[link.source] = (outDegree[link.source] || 0) + 1;
    }

    for (let i = 0; i < iterations; i++) {
      const nextRanks = {};
      let danglingSum = 0;

      // Handle dangling nodes (nodes with 0 out-degree)
      nodeIds.forEach(id => {
        if (outDegree[id] === 0) danglingSum += ranks[id];
      });

      for (const id of nodeIds) {
        let incomingSum = 0;
        for (const parent of incoming[id]) {
          incomingSum += ranks[parent] / outDegree[parent];
        }
        // PageRank formula with dangling nodes redistribution
        nextRanks[id] = (1 - damping) / N + damping * (incomingSum + danglingSum / N);
      }
      
      // Update ranks
      nodeIds.forEach(id => { ranks[id] = nextRanks[id]; });
    }

    // Save back to nodes
    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        node.pagerank = parseFloat(ranks[id].toFixed(6));
        this.nodes.set(id, node);
      }
    }

    this.logger.info(`PageRank computed for ${N} nodes`);
  }

  /**
   * Ecosystem and Community Detection (Louvain-style modular label propagation)
   */
  detectCommunities(iterations = 4) {
    const nodeIds = Array.from(this.nodes.keys());
    
    // First pass: Seed known deterministic organization categories
    for (const id of nodeIds) {
      const node = this.nodes.get(id);
      if (node) {
        if (node.organization && node.organization !== 'Independent Tracker' && node.organization !== 'Unknown Tracker') {
          node.community = node.organization;
        } else {
          node.community = node.id; // self seed
        }
        this.nodes.set(id, node);
      }
    }

    // Build adjacency map
    const adj = {};
    nodeIds.forEach(id => { adj[id] = new Set(); });
    for (const link of this.links) {
      adj[link.source]?.add(link.target);
      adj[link.target]?.add(link.source);
    }

    // Iterate label propagation for unknown/independent nodes
    for (let i = 0; i < iterations; i++) {
      const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);
      
      for (const id of shuffled) {
        const node = this.nodes.get(id);
        if (!node) continue;
        
        // Skip updating nodes that have established ecosystem locks
        if (node.organization && node.organization !== 'Independent Tracker' && node.organization !== 'Unknown Tracker' && node.organization !== 'Independent Site') {
          continue;
        }

        const counts = {};
        for (const neighborId of adj[id]) {
          const neighbor = this.nodes.get(neighborId);
          if (neighbor) {
            counts[neighbor.community] = (counts[neighbor.community] || 0) + 1;
          }
        }

        let bestCommunity = node.community;
        let maxCount = -1;
        for (const [comm, count] of Object.entries(counts)) {
          if (count > maxCount) {
            maxCount = count;
            bestCommunity = comm;
          }
        }

        if (maxCount > 0) {
          node.community = bestCommunity;
          this.nodes.set(id, node);
        }
      }
    }

    this.logger.info(`Ecosystem communities detected for ${nodeIds.length} nodes`);
  }

  detectEcosystemCommunities(iterations = 4) {
    return this.detectCommunities(iterations);
  }

  /**
   * Helper: extract root domain
   */
  getRootDomain(domain) {
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    return parts.slice(-2).join('.');
  }

  _evictLowestWeightNode() {
    let minWeight = Infinity;
    let minId = null;
    for (const [id, node] of this.nodes) {
      if (node.weight < minWeight) {
        minWeight = node.weight;
        minId = id;
      }
    }
    if (minId) this.nodes.delete(minId);
  }

  exportGraph() {
    return {
      nodes: Array.from(this.nodes.values()),
      links: this.links
    };
  }
}

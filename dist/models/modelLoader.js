/**
 * PRIVISEE-X v2.0
 * Models: Inference Engine Abstraction
 * 
 * Handles loading, validation, and execution of ML models.
 * Supports the custom Random Forest JSON format.
 * Uses actual loaded tree count for vote normalization (not metadata n_estimators).
 */

import { createLogger } from '../core/Logger.js';

export class ModelLoader {
  constructor() {
    this.logger = createLogger('ModelLoader');
    this.models = new Map();
  }

  /**
   * Load and validate a model
   */
  async loadModel(modelId, path) {
    try {
      this.logger.info(`Loading model: ${modelId} from ${path}`);
      
      const response = await fetch(chrome.runtime.getURL(path));
      if (!response.ok) throw new Error(`Failed to fetch model: ${response.statusText}`);
      
      const modelData = await response.json();
      
      // Basic validation
      if (!this.validateModelStructure(modelData)) {
        throw new Error(`Invalid model structure for ${modelId}`);
      }

      // Store actual tree count (may differ from n_estimators if truncated)
      modelData._loadedTreeCount = modelData.trees.length;

      this.models.set(modelId, modelData);
      this.logger.info(
        `Model ${modelId} loaded: ${modelData._loadedTreeCount}/${modelData.n_estimators} trees, ` +
        `${modelData.n_features} features, classes: [${modelData.classes.join(', ')}]`
      );
      return true;
    } catch (error) {
      this.logger.warn(`Failed to load model ${modelId} (ML disabled):`, error.message);
      return false;
    }
  }

  /**
   * Validate JSON structure of Random Forest model
   */
  validateModelStructure(model) {
    return (
      model &&
      Array.isArray(model.trees) &&
      model.trees.length > 0 &&
      Array.isArray(model.classes) &&
      typeof model.n_features === 'number'
    );
  }

  /**
   * Execute inference (Tracker Classifier)
   * @param {string} modelId
   * @param {number[]} vector - must be exactly model.n_features long
   * @returns {{ category, confidence, probabilities } | null}
   */
  predict(modelId, vector) {
    const model = this.models.get(modelId);
    if (!model) {
      this.logger.warn(`Model ${modelId} not loaded`);
      return null;
    }

    // Guard: feature dimension must match model expectation
    if (vector.length !== model.n_features) {
      throw new Error(
        `Feature vector dimension mismatch: expected ${model.n_features}, got ${vector.length}`
      );
    }

    const t0 = performance.now();
    
    // Vote across all loaded trees
    const votes = new Array(model.classes.length).fill(0);
    
    for (const tree of model.trees) {
      const classIdx = this.traverseTree(tree, vector);
      votes[classIdx]++;
    }

    // Normalize by ACTUAL loaded tree count (not metadata n_estimators)
    const totalVotes = model._loadedTreeCount; // Audit fix: was model.n_estimators
    const probabilities = votes.map(v => v / totalVotes);
    
    // Get best class
    const maxProb = Math.max(...probabilities);
    const classIndex = probabilities.indexOf(maxProb);
    
    const duration = performance.now() - t0;
    if (duration > 5) {
      this.logger.warn(`Slow inference for ${modelId}: ${duration.toFixed(2)}ms`);
    }

    return {
      category: model.classes[classIndex],
      confidence: maxProb,
      probabilities
    };
  }

  /**
   * Optimized tree traversal with depth guard
   */
  traverseTree(tree, features) {
    let nodeId = 0; 
    let depth = 0;
    const maxDepth = 50; // Generous cap to prevent infinite loops

    while (depth < maxDepth) {
      const leftChild = tree.children_left[nodeId];
      const rightChild = tree.children_right[nodeId];

      // Leaf node
      if (leftChild === -1 && rightChild === -1) {
        const values = tree.values[nodeId];
        if (Array.isArray(values)) {
          let maxVal = -1;
          let maxIdx = 0;
          for (let i = 0; i < values.length; i++) {
            if (values[i] > maxVal) {
              maxVal = values[i];
              maxIdx = i;
            }
          }
          return maxIdx;
        }
        return 0;
      }

      // Internal node
      const featureVal = features[tree.features[nodeId]];
      if (featureVal === undefined || featureVal === null) {
        this.logger.warn(`Undefined feature at index ${tree.features[nodeId]}`);
        return 0;
      }

      if (featureVal <= tree.thresholds[nodeId]) {
        nodeId = leftChild;
      } else {
        nodeId = rightChild;
      }
      depth++;
    }

    this.logger.warn(`Tree traversal hit maxDepth (${maxDepth}) — returning class 0`);
    return 0;
  }
}

export const modelLoader = new ModelLoader();

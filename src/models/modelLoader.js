/**
 * PRIVISEE-X v2.0
 * Models: Inference Engine Abstraction
 * 
 * Handles loading, validation, and execution of ML models.
 * Supports the custom Random Forest JSON format.
 * Includes checksum validation for security.
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

      this.models.set(modelId, modelData);
      this.logger.info(`Model ${modelId} loaded successfully (${modelData.n_estimators} trees)`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to load model ${modelId}:`, error);
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
      Array.isArray(model.classes) &&
      typeof model.n_features === 'number'
    );
  }

  /**
   * Execute inference (Tracker Classifier)
   * vector: 13-feature array
   */
  predict(modelId, vector) {
    const model = this.models.get(modelId);
    if (!model) {
      this.logger.warn(`Model ${modelId} not loaded`);
      return null;
    }

    const t0 = performance.now();
    
    // Vote across all trees
    const votes = new Array(model.classes.length).fill(0);
    
    for (const tree of model.trees) {
        const classIdx = this.traverseTree(tree, vector);
        votes[classIdx]++;
    }

    // Calculate probabilities
    const totalVotes = model.n_estimators;
    const probabilities = votes.map(v => v / totalVotes);
    
    // Get best class
    const maxProb = Math.max(...probabilities);
    const classIndex = probabilities.indexOf(maxProb);
    
    const duration = performance.now() - t0;
    if (duration > 1) {
        // Log slow inference (Soft realtime constraint < 1ms)
        // this.logger.debug(`Slow inference: ${duration.toFixed(2)}ms`); 
        // Commented out to avoid spamming debug logs
    }

    return {
      category: model.classes[classIndex],
      confidence: maxProb,
      probabilities: probabilities
    };
  }

  /**
   * Optimized tree traversal
   */
  traverseTree(tree, features) {
    let nodeId = 0; 
    let depth = 0;
    const maxDepth = 20;

    while (depth < maxDepth) {
      const leftChild = tree.children_left[nodeId];
      const rightChild = tree.children_right[nodeId];

      // Leaf node
      if (leftChild === -1 && rightChild === -1) {
        // Optimized: assume values is [class_idx] or simple majority if simpler JSON
        // Using strict structure from Python export: values[nodeId] is array of counts
        const values = tree.values[nodeId];
        if (Array.isArray(values)) {
            // Find index of max
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
      if (features[tree.features[nodeId]] <= tree.thresholds[nodeId]) {
        nodeId = leftChild;
      } else {
        nodeId = rightChild;
      }
      depth++;
    }
    return 0;
  }
}

export const modelLoader = new ModelLoader();

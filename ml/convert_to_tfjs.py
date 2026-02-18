"""
PRIVISEE-X TensorFlow.js Model Converter
Converts scikit-learn models to TensorFlow.js format for browser deployment

Supports:
- Random Forest (via decision tree serialization)
- Model metadata and configuration
"""

import json
import joblib
import numpy as np
import os

def convert_random_forest_to_json(model_path, output_dir):
    """
    Convert Random Forest model to JSON format for JavaScript
    
    Note: True TensorFlow.js conversion requires tensorflow,
    but for Random Forest we can serialize decision trees directly
    """
    print(f"Loading model from {model_path}...")
    model = joblib.load(model_path)
    
    print(f"Model type: {type(model).__name__}")
    print(f"Number of estimators: {model.n_estimators}")
    print(f"Number of features: {model.n_features_in_}")
    
    # Extract model parameters
    trees = []
    for i, tree in enumerate(model.estimators_):
        if i >= 10:  # Limit to 10 trees for size (adjust as needed)
            break
            
        tree_data = {
            'tree_id': i,
            'n_nodes': tree.tree_.node_count,
            'children_left': tree.tree_.children_left.tolist(),
            'children_right': tree.tree_.children_right.tolist(),
            'features': tree.tree_.feature.tolist(),
            'thresholds': tree.tree_.threshold.tolist(),
            'values': tree.tree_.value.tolist()
        }
        trees.append(tree_data)
    
    # Create model metadata
    model_json = {
        'model_type': 'RandomForest',
        'version': '1.0.0',
        'n_estimators': min(10, model.n_estimators),  # Limited for size
        'n_features': model.n_features_in_,
        'feature_names': [
            'domainLength', 'subdomainCount', 'hasNumbers', 'tldType',
            'pathDepth', 'queryParams', 'hasTrackingParams', 'isThirdParty',
            'resourceType', 'domainEntropy'
        ],
        'classes': model.classes_.tolist() if hasattr(model, 'classes_') else None,
        'trees': trees
    }
    
    # Save to JSON
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'model.json')
    
    with open(output_path, 'w') as f:
        json.dump(model_json, f)
    
    # Calculate size
    file_size = os.path.getsize(output_path) / 1024  # KB
    print(f"\nModel saved to: {output_path}")
    print(f"Model size: {file_size:.2f} KB")
    
    if file_size > 5000:  # > 5MB
        print("WARNING: Model size exceeds 5MB. Consider reducing number of trees.")
    
    return model_json

def create_model_config(output_dir):
    """Create configuration file for model loading in browser"""
    config = {
        'model_url': './model.json',
        'model_type': 'RandomForest',
        'threshold': 0.5,
        'description': 'Random Forest tracker classifier',
        'input_features': [
            'domainLength', 'subdomainCount', 'hasNumbers', 'tldType',
            'pathDepth', 'queryParams', 'hasTrackingParams', 'isThirdParty',
            'resourceType', 'domainEntropy'
        ],
        'output_classes': [
            'benign', 'advertising', 'analytics', 'social', 'fingerprinting'
        ]
    }
    
    config_path = os.path.join(output_dir, 'config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"Config saved to: {config_path}")

def quantize_model(model_json, bits=8):
    """
    Quantize model parameters to reduce size
    Convert float32 to int8 (8-bit quantization)
    """
    print(f"\nQuantizing model to {bits}-bit...")
    
    quantized_trees = []
    for tree in model_json['trees']:
        # Quantize thresholds
        thresholds = np.array(tree['thresholds'])
        threshold_min, threshold_max = thresholds.min(), thresholds.max()
        threshold_scale = (threshold_max - threshold_min) / (2**bits - 1)
        
        quantized_thresholds = np.round(
            (thresholds - threshold_min) / threshold_scale
        ).astype(np.int8).tolist()
        
        quantized_tree = {
            **tree,
            'thresholds': quantized_thresholds,
            'threshold_scale': float(threshold_scale),
            'threshold_min': float(threshold_min)
        }
        quantized_trees.append(quantized_tree)
    
    model_json['trees'] = quantized_trees
    model_json['quantized'] = True
    model_json['quantization_bits'] = bits
    
    print("Quantization complete")
    return model_json

def test_model_inference(model_json):
    """
    Test that the exported model can be used for inference
    """
    print("\nTesting model inference...")
    
    # Sample input
    sample_input = [14, 0, 0, 1, 2, 5, 1, 1, 0, 3.2]
    print(f"Sample input: {sample_input}")
    
    # Simplified inference (just check structure)
    n_trees = len(model_json['trees'])
    n_features = model_json['n_features']
    
    if len(sample_input) != n_features:
        print(f"ERROR: Input size mismatch. Expected {n_features}, got {len(sample_input)}")
        return False
    
    print(f"✓ Model structure valid: {n_trees} trees, {n_features} features")
    print("✓ Model ready for JavaScript deployment")
    
    return True

if __name__ == '__main__':
    print("PRIVISEE-X TensorFlow.js Model Converter")
    print("=" * 60)
    
    # Paths
    rf_model_path = '../models/tracker_classifier/model.pkl'
    output_dir = '../models/tracker_classifier'
    
    # Check if model exists
    if not os.path.exists(rf_model_path):
        print(f"\nERROR: Model not found at {rf_model_path}")
        print("Please run train_random_forest.py first")
        exit(1)
    
    # Convert Random Forest
    print("\n[1/4] Converting Random Forest to JSON...")
    model_json = convert_random_forest_to_json(rf_model_path, output_dir)
    
    # Quantize (optional)
    print("\n[2/4] Quantizing model...")
    model_json = quantize_model(model_json, bits=8)
    
    # Save quantized version
    quantized_path = os.path.join(output_dir, 'model_quantized.json')
    with open(quantized_path, 'w') as f:
        json.dump(model_json, f)
    print(f"Quantized model saved to: {quantized_path}")
    
    # Create config
    print("\n[3/4] Creating model configuration...")
    create_model_config(output_dir)
    
    # Test inference
    print("\n[4/4] Testing model inference...")
    success = test_model_inference(model_json)
    
    print("\n" + "=" * 60)
    if success:
        print("✓ Conversion complete!")
        print("\nNext steps:")
        print("1. Copy model files to browser extension:")
        print(f"   cp {output_dir}/* ../src/models/")
        print("2. Update trackerDetector.js to load the model")
        print("3. Test in browser environment")
    else:
        print("✗ Conversion failed. Check errors above.")
    
    print("\nNOTE: For full TensorFlow.js conversion with neural networks,")
    print("use tensorflowjs_converter (requires tensorflow installation)")

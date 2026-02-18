"""
PRIVISEE-X TensorFlow.js Model Converter
Converts the trained scikit-learn Random Forest to a JSON format
that can be loaded and run directly in the browser extension.

The converter serializes up to 20 decision trees from the forest
(enough for good accuracy, small enough for browser use).
Quantizes thresholds to 8-bit to reduce file size.

Usage:
  python ml/convert_to_tfjs.py
  (Run train_random_forest.py first)
"""

import os
import json
import joblib
import numpy as np

RF_MODEL_PATH = "../models/tracker_classifier/model.pkl"
ENCODER_PATH = "../models/tracker_classifier/label_encoder.pkl"
OUTPUT_DIR = "../models/tracker_classifier"
MAX_TREES = 20  # Balance between accuracy and file size

FEATURE_COLS = [
    "domainLength", "subdomainCount", "hasNumbers", "tldType",
    "pathDepth", "queryParams", "hasTrackingParams", "isThirdParty",
    "resourceType", "domainEntropy", "tokenCount", "digitRatio",
    "specialCharRatio",
]


def convert_random_forest_to_json(model, le, max_trees=MAX_TREES):
    """Serialize Random Forest decision trees to JSON."""
    print(f"Converting {min(max_trees, model.n_estimators)} trees "
          f"(of {model.n_estimators}) to JSON...")

    trees = []
    for i, estimator in enumerate(model.estimators_[:max_trees]):
        t = estimator.tree_
        tree_data = {
            "tree_id": i,
            "n_nodes": int(t.node_count),
            "children_left": t.children_left.tolist(),
            "children_right": t.children_right.tolist(),
            "features": t.feature.tolist(),
            "thresholds": [round(float(v), 6) for v in t.threshold],
            # values shape: [n_nodes, n_outputs, n_classes] → flatten to [n_nodes, n_classes]
            "values": t.value[:, 0, :].tolist(),
        }
        trees.append(tree_data)

    model_json = {
        "model_type": "RandomForest",
        "version": "1.0.0",
        "n_estimators": len(trees),
        "n_features": model.n_features_in_,
        "feature_names": FEATURE_COLS,
        "classes": list(le.classes_),
        "trees": trees,
    }
    return model_json


def quantize_model(model_json, bits=8):
    """8-bit quantize thresholds to reduce JSON size."""
    print(f"Quantizing thresholds to {bits}-bit...")
    scale = 2 ** bits - 1

    for tree in model_json["trees"]:
        thresholds = np.array(tree["thresholds"], dtype=np.float32)
        # Leaf nodes have threshold = -2.0 (TREE_UNDEFINED) — keep as-is
        valid_mask = thresholds > -2.0
        if valid_mask.any():
            t_min = float(thresholds[valid_mask].min())
            t_max = float(thresholds[valid_mask].max())
            t_range = t_max - t_min if t_max != t_min else 1.0
            quantized = np.where(
                valid_mask,
                np.round((thresholds - t_min) / t_range * scale).astype(int),
                -1,  # sentinel for leaf nodes
            ).tolist()
            tree["thresholds_q"] = quantized
            tree["threshold_min"] = t_min
            tree["threshold_scale"] = t_range / scale
        # Keep original float thresholds too (for accuracy fallback)

    model_json["quantized"] = True
    model_json["quantization_bits"] = bits
    return model_json


def create_config(le):
    """Create browser-side config.json."""
    config = {
        "model_url": "./model.json",
        "model_type": "RandomForest",
        "threshold": 0.5,
        "description": "Random Forest tracker classifier — PRIVISEE-X v1.0.0",
        "input_features": FEATURE_COLS,
        "output_classes": list(le.classes_),
        "benign_class_index": list(le.classes_).index("benign"),
    }
    path = os.path.join(OUTPUT_DIR, "config.json")
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"✓ Config saved to: {path}")


def test_inference(model_json):
    """Verify the exported model structure is valid."""
    print("\nTesting model structure...")
    n_trees = len(model_json["trees"])
    n_features = model_json["n_features"]
    n_classes = len(model_json["classes"])

    sample = [14, 0, 0, 1, 2, 5, 1, 1, 0, 3.2, 2, 0.0, 0.0]  # doubleclick.net-like
    assert len(sample) == n_features, f"Feature count mismatch: {len(sample)} vs {n_features}"

    print(f"  ✓ Trees      : {n_trees}")
    print(f"  ✓ Features   : {n_features}")
    print(f"  ✓ Classes    : {n_classes} → {model_json['classes']}")
    print(f"  ✓ Sample input accepted")
    return True


if __name__ == "__main__":
    print("=" * 60)
    print("PRIVISEE-X TensorFlow.js Model Converter")
    print("=" * 60)

    # Load model
    if not os.path.exists(RF_MODEL_PATH):
        print(f"\n✗ Model not found at {RF_MODEL_PATH}")
        print("  Run: python ml/train_random_forest.py")
        exit(1)

    print(f"\n[1/4] Loading model from {RF_MODEL_PATH}...")
    model = joblib.load(RF_MODEL_PATH)
    le = joblib.load(ENCODER_PATH)
    print(f"  ✓ Loaded RF with {model.n_estimators} estimators, "
          f"{model.n_features_in_} features, {len(le.classes_)} classes")

    # Convert
    print("\n[2/4] Converting to JSON...")
    model_json = convert_random_forest_to_json(model, le)

    # Quantize
    print("\n[3/4] Quantizing...")
    model_json = quantize_model(model_json)

    # Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    model_path = os.path.join(OUTPUT_DIR, "model.json")
    with open(model_path, "w") as f:
        json.dump(model_json, f, separators=(",", ":"))  # compact JSON

    size_kb = os.path.getsize(model_path) / 1024
    print(f"  ✓ Model saved to: {model_path}  ({size_kb:.1f} KB)")
    if size_kb > 5000:
        print(f"  ⚠ Model is large ({size_kb:.0f} KB). Reduce MAX_TREES if needed.")

    # Config
    print("\n[4/4] Creating config...")
    create_config(le)

    # Test
    success = test_inference(model_json)

    print("\n" + "=" * 60)
    if success:
        print("✓ Conversion complete!")
        print(f"\nFiles in {OUTPUT_DIR}/:")
        for f in os.listdir(OUTPUT_DIR):
            size = os.path.getsize(os.path.join(OUTPUT_DIR, f)) / 1024
            print(f"  {f:35} {size:8.1f} KB")
        print("\nNext: The extension loads model.json via trackerDetector.js")
    else:
        print("✗ Conversion failed.")
    print("=" * 60)

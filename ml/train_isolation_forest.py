"""
PRIVISEE-X Isolation Forest Anomaly Detector Training
Statistical anomaly detection for unusual tracking patterns.

Refined for production use with:
- Realistic synthetic session data generation
- Behavior-based features (tracker counts, cookie counts, etc.)
- Model export for client-side use

Features:
  - trackerCount
  - cookieCount
  - thirdPartyDomains
  - fingerprintingAttempts
  - requestFrequency (requests/min)
  - httpsRatio
"""

import os
import json
import joblib
import numpy as np
import matplotlib.pyplot as plt
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

MODEL_DIR = "../models/anomaly_detector"
MODEL_OUTPUT = os.path.join(MODEL_DIR, "isolation_forest.pkl")
SCALER_OUTPUT = os.path.join(MODEL_DIR, "scaler.pkl")
STATS_OUTPUT = os.path.join(MODEL_DIR, "baseline_stats.json")
CONFIG_OUTPUT = os.path.join(MODEL_DIR, "config.json")


def generate_synthetic_data(n_normal=5000, n_anomalies=500):
    """
    Generate synthetic session data representing site visits.
    """
    np.random.seed(42)

    # Normal traffic (Poisson distributions)
    # Most sites have few trackers, few cookies, etc.
    normal = np.column_stack([
        np.random.poisson(3, n_normal),        # trackerCount
        np.random.poisson(8, n_normal),        # cookieCount
        np.random.poisson(5, n_normal),        # thirdPartyDomains
        np.random.poisson(0.1, n_normal),      # fingerprintingAttempts (rare)
        np.random.gamma(2, 2, n_normal),       # requestFrequency
        np.random.beta(8, 2, n_normal),        # httpsRatio (mostly 1.0)
    ])

    # Anomalies (Heavy tracking / Malicious sites)
    # High trackers, high cookies, fingerprinting, HTTP only
    anomalies = np.column_stack([
        np.random.poisson(25, n_anomalies),    # trackerCount
        np.random.poisson(40, n_anomalies),    # cookieCount
        np.random.poisson(20, n_anomalies),    # thirdPartyDomains
        np.random.poisson(3, n_anomalies),     # fingerprintingAttempts
        np.random.gamma(10, 2, n_anomalies),   # requestFrequency
        np.random.beta(2, 5, n_anomalies),     # httpsRatio (often lower)
    ])

    X = np.vstack([normal, anomalies])
    y = np.hstack([np.zeros(n_normal), np.ones(n_anomalies)])  # 0=Normal, 1=Anomaly
    
    # Ensure non-negative counts
    X = np.maximum(X, 0)
    
    return X, y


def train_model(X, y, contamination=0.1):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print(f"Training Isolation Forest (n={len(X_train)}, contamination={contamination})...")
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train_scaled)

    # Evaluate
    # IF predicts -1 for anomalies, 1 for normal
    train_pred = (model.predict(X_train_scaled) == -1).astype(int)
    test_pred = (model.predict(X_test_scaled) == -1).astype(int)

    print("\nTest Set Classification Report:")
    print(classification_report(y_test, test_pred, target_names=["Normal", "Anomaly"]))

    # Calculate anomaly threshold from scores
    # score_samples returns negative scores for anomalies
    test_scores = model.score_samples(X_test_scaled)
    threshold = np.percentile(test_scores, 100 * contamination)
    print(f"Anomaly Score Threshold: {threshold:.4f}")

    return model, scaler, threshold


def save_artifacts(model, scaler, X_normal, threshold):
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    joblib.dump(model, MODEL_OUTPUT)
    joblib.dump(scaler, SCALER_OUTPUT)

    # Compute baseline stats for z-score fallback in JS
    stats = {
        "features": [
            "trackerCount", "cookieCount", "thirdPartyDomains", 
            "fingerprintCount", "requestFreq", "httpsRatio"
        ],
        "mean": X_normal.mean(axis=0).tolist(),
        "std": X_normal.std(axis=0).tolist(),
        "min": X_normal.min(axis=0).tolist(),
        "max": X_normal.max(axis=0).tolist(),
        "threshold_if": float(threshold)
    }

    with open(STATS_OUTPUT, "w") as f:
        json.dump(stats, f, indent=2)

    # Config for JS
    config = {
        "method": "hybrid",
        "description": "Z-score baseline + IF thresholding",
        "features": stats["features"],
        "baseline": stats,
        "z_score_threshold": 3.0
    }
    with open(CONFIG_OUTPUT, "w") as f:
        json.dump(config, f, indent=2)

    print(f"\n✓ Artifacts saved to {MODEL_DIR}/")


if __name__ == "__main__":
    print("="*60)
    print("PRIVISEE-X Anomaly Detector Training")
    print("="*60)

    X, y = generate_synthetic_data()
    print(f"Dataset: {len(X)} samples (Normal: {len(X[y==0])}, Anomaly: {len(X[y==1])})")

    model, scaler, threshold = train_model(X, y)
    
    save_artifacts(model, scaler, X[y==0], threshold)
    
    print("\nTraining complete!")
    print("="*60)

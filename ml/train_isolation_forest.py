"""
PRIVISEE-X Isolation Forest Anomaly Detector Training
Statistical anomaly detection for unusual tracking patterns

Features:
- Synthetic anomaly generation
- Feature engineering from site metrics
- Isolation Forest implementation
- Contamination factor tuning
- Model export for JavaScript
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, precision_recall_curve
import joblib
import json
import matplotlib.pyplot as plt

# Configuration
MODEL_OUTPUT = '../models/anomaly_detector/isolation_forest.pkl'
SCALER_OUTPUT = '../models/anomaly_detector/scaler.pkl'
STATS_OUTPUT = '../models/anomaly_detector/baseline_stats.json'

def generate_synthetic_data(n_normal=1000, n_anomalies=100):
    """
    Generate synthetic site visit data
    Normal sites: Typical tracking patterns
    Anomalies: Unusual/excessive tracking
    """
    np.random.seed(42)
    
    # Normal sites (realistic tracking)
    normal_trackers = np.random.poisson(5, n_normal)  # Mean: 5 trackers
    normal_cookies = np.random.poisson(10, n_normal)  # Mean: 10 cookies
    normal_third_party = np.random.poisson(8, n_normal)  # Mean: 8 third-party
    normal_fingerprint = np.random.poisson(2, n_normal)  # Mean: 2 fingerprint attempts
    
    normal_data = np.column_stack([
        normal_trackers,
        normal_cookies,
        normal_third_party,
        normal_fingerprint
    ])
    
    # Anomalous sites (excessive tracking)
    anomaly_trackers = np.random.poisson(25, n_anomalies)  # Mean: 25 trackers
    anomaly_cookies = np.random.poisson(50, n_anomalies)  # Mean: 50 cookies
    anomaly_third_party = np.random.poisson(30, n_anomalies)  # Mean: 30 third-party
    anomaly_fingerprint = np.random.poisson(15, n_anomalies)  # Mean: 15 fingerprint attempts
    
    anomaly_data = np.column_stack([
        anomaly_trackers,
        anomaly_cookies,
        anomaly_third_party,
        anomaly_fingerprint
    ])
    
    # Combine
    X = np.vstack([normal_data, anomaly_data])
    y = np.hstack([np.zeros(n_normal), np.ones(n_anomalies)])  # 0=normal, 1=anomaly
    
    return X, y

def train_isolation_forest(X, y, contamination=0.1):
    """
    Train Isolation Forest model
    
    Args:
        X: Feature matrix
        y: Labels (0=normal, 1=anomaly) - only used for evaluation
        contamination: Expected proportion of anomalies
    """
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Standardize features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train Isolation Forest
    print(f"Training Isolation Forest (contamination={contamination})...")
    model = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        max_samples='auto',
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train_scaled)
    
    # Predict (-1 for anomalies, 1 for normal)
    train_pred = model.predict(X_train_scaled)
    test_pred = model.predict(X_test_scaled)
    
    # Convert to binary (1 for anomaly, 0 for normal)
    train_pred_binary = (train_pred == -1).astype(int)
    test_pred_binary = (test_pred == -1).astype(int)
    
    # Evaluation
    print("\n=== Training Set ===")
    print(classification_report(y_train, train_pred_binary, 
                                target_names=['Normal', 'Anomaly']))
    
    print("\n=== Test Set ===")
    print(classification_report(y_test, test_pred_binary,
                                target_names=['Normal', 'Anomaly']))
    
    # Anomaly scores
    train_scores = model.score_samples(X_train_scaled)
    test_scores = model.score_samples(X_test_scaled)
    
    print(f"\nAnomaly Score Range (train): [{train_scores.min():.4f}, {train_scores.max():.4f}]")
    print(f"Anomaly Score Range (test): [{test_scores.min():.4f}, {test_scores.max():.4f}]")
    
    # Determine threshold (using test set)
    threshold = np.percentile(test_scores, contamination * 100)
    print(f"Anomaly Threshold (at {contamination*100}% contamination): {threshold:.4f}")
    
    return model, scaler, threshold

def calculate_baseline_stats(X):
    """
    Calculate baseline statistics for normalization
    Used in JavaScript implementation
    """
    stats = {
        'features': ['trackerCount', 'cookieCount', 'thirdPartyCount', 'fingerprintCount'],
        'mean': X.mean(axis=0).tolist(),
        'std': X.std(axis=0).tolist(),
        'min': X.min(axis=0).tolist(),
        'max': X.max(axis=0).tolist(),
        'median': np.median(X, axis=0).tolist()
    }
    
    return stats

def save_models(model, scaler, stats):
    """Save model, scaler, and statistics"""
    import os
    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
    
    # Save sklearn model
    joblib.dump(model, MODEL_OUTPUT)
    joblib.dump(scaler, SCALER_OUTPUT)
    
    # Save statistics for JS implementation
    with open(STATS_OUTPUT, 'w') as f:
        json.dump(stats, f, indent=2)
    
    print(f"\nModel saved to: {MODEL_OUTPUT}")
    print(f"Scaler saved to: {SCALER_OUTPUT}")
    print(f"Stats saved to: {STATS_OUTPUT}")

def visualize_anomalies(X, y, model, scaler):
    """Visualize anomaly detection results"""
    X_scaled = scaler.transform(X)
    scores = model.score_samples(X_scaled)
    predictions = model.predict(X_scaled)
    
    # Plot anomaly scores
    plt.figure(figsize=(12, 5))
    
    plt.subplot(1, 2, 1)
    plt.scatter(range(len(scores)), scores, 
                c=y, cmap='coolwarm', alpha=0.6, s=20)
    plt.xlabel('Sample Index')
    plt.ylabel('Anomaly Score')
    plt.title('Anomaly Scores (Red=Anomaly, Blue=Normal)')
    plt.colorbar(label='True Label')
    
    plt.subplot(1, 2, 2)
    plt.hist([scores[y==0], scores[y==1]], 
             bins=30, label=['Normal', 'Anomaly'], alpha=0.7)
    plt.xlabel('Anomaly Score')
    plt.ylabel('Frequency')
    plt.title('Anomaly Score Distribution')
    plt.legend()
    
    plt.tight_layout()
    plt.savefig('../models/anomaly_detector/anomaly_visualization.png', dpi=150)
    print("\nVisualization saved to: ../models/anomaly_detector/anomaly_visualization.png")

def export_for_javascript(stats, threshold):
    """
    Export model parameters for JavaScript implementation
    
    Since Isolation Forest is complex to implement in JS,
    we use a simplified z-score based approach with learned thresholds
    """
    js_config = {
        'method': 'z-score',
        'description': 'Statistical anomaly detection using z-scores',
        'threshold': 2.5,  # Standard deviations
        'baseline': stats,
        'isolationForestThreshold': float(threshold),
        'features': stats['features']
    }
    
    output_path = '../models/anomaly_detector/config.json'
    with open(output_path, 'w') as f:
        json.dump(js_config, f, indent=2)
    
    print(f"JavaScript config saved to: {output_path}")

if __name__ == '__main__':
    print("PRIVISEE-X Isolation Forest Anomaly Detector Training")
    print("=" * 60)
    
    # Generate synthetic data
    print("\nGenerating synthetic training data...")
    X, y = generate_synthetic_data(n_normal=1000, n_anomalies=100)
    print(f"Generated {len(X)} samples:")
    print(f"  - Normal sites: {(y == 0).sum()}")
    print(f"  - Anomalous sites: {(y == 1).sum()}")
    
    # Calculate baseline stats
    print("\nCalculating baseline statistics...")
    stats = calculate_baseline_stats(X[y == 0])  # Only normal sites
    print(f"Feature means: {stats['mean']}")
    print(f"Feature stds: {stats['std']}")
    
    # Train model
    model, scaler, threshold = train_isolation_forest(X, y, contamination=0.1)
    
    # Save models
    save_models(model, scaler, stats)
    
    # Export for JavaScript
    export_for_javascript(stats, threshold)
    
    # Visualize (optional)
    try:
        visualize_anomalies(X, y, model, scaler)
    except Exception as e:
        print(f"\nWarning: Visualization failed: {e}")
    
    print("\n" + "=" * 60)
    print("Training complete!")
    print("\nNOTE: This is a demonstration model trained on synthetic data.")
    print("For production use:")
    print("1. Collect real site visit data (tracker counts, cookies, etc.)")
    print("2. Label anomalous cases or use unsupervised approach")
    print("3. Retrain with production data")
    print("4. The JavaScript implementation uses simplified z-score method")

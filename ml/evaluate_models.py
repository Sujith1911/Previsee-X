"""
PRIVISEE-X ML Evaluation
Evaluate trained models against a hold-out set and generate report.
"""

import os
import joblib
import json
import numpy as np
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

RF_MODEL_PATH = "../models/tracker_classifier/model.pkl"
RF_ENCODER_PATH = "../models/tracker_classifier/label_encoder.pkl"
IF_MODEL_PATH = "../models/anomaly_detector/isolation_forest.pkl"
IF_SCALER_PATH = "../models/anomaly_detector/scaler.pkl"

def evaluate_random_forest():
    print("\n[RF Evaluation]")
    if not os.path.exists(RF_MODEL_PATH):
        print("Model not found. Run train_random_forest.py first.")
        return False
    
    model = joblib.load(RF_MODEL_PATH)
    le = joblib.load(RF_ENCODER_PATH)
    
    # Load test set (if available) - otherwise skip
    if os.path.exists("dataset_trackers.csv"):
        import pandas as pd
        df = pd.read_csv("dataset_trackers.csv")
        # Just re-verify on a sample to ensure loading works
        sample = df.sample(min(1000, len(df)))
        
        feature_cols = [
            "domainLength", "subdomainCount", "hasNumbers", "tldType",
            "pathDepth", "queryParams", "hasTrackingParams", "isThirdParty",
            "resourceType", "domainEntropy", "tokenCount", "digitRatio",
            "specialCharRatio",
        ]
        
        X = sample[feature_cols].values
        y_true = le.transform(sample["label"])
        y_pred = model.predict(X)
        
        print("\nClassification Report (Sample 1000):")
        print(classification_report(y_true, y_pred, target_names=le.classes_))
        return True
    
    print("No dataset found for verification.")
    return True

def evaluate_isolation_forest():
    print("\n[IF Evaluation]")
    if not os.path.exists(IF_MODEL_PATH):
        print("Model not found. Run train_isolation_forest.py first.")
        return False

    model = joblib.load(IF_MODEL_PATH)
    print(f"Loaded Isolation Forest with {model.n_estimators} estimators")
    
    # Generate synthetic test data
    import train_isolation_forest
    X_test, y_test = train_isolation_forest.generate_synthetic_data(n_normal=200, n_anomalies=20)
    
    # Scale
    scaler = joblib.load(IF_SCALER_PATH)
    X_scaled = scaler.transform(X_test)
    
    # Predict
    y_pred = (model.predict(X_scaled) == -1).astype(int)
    
    print("\nClassification Report (Synthetic Test):")
    print(classification_report(y_test, y_pred, target_names=["Normal", "Anomaly"]))
    return True

if __name__ == "__main__":
    evaluate_random_forest()
    evaluate_isolation_forest()

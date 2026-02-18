"""
PRIVISEE-X Random Forest Tracker Classifier Training
Production-grade ML pipeline for tracker detection

Features:
- Feature engineering from domain/URL patterns
- Random Forest with 100 estimators
- Cross-validation
- Model export to TensorFlow.js
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import json

# Dataset format
DATASET_PATH = 'dataset_trackers.json'
MODEL_OUTPUT = '../models/tracker_classifier/model.pkl'

def load_dataset():
    """Load and parse dataset"""
    with open(DATASET_PATH, 'r') as f:
        data = json.load(f)
    
    domains = data['domains']
    
    # Extract features and labels
    X = []
    y = []
    
    for entry in domains:
        features = [
            entry['features']['domainLength'],
            entry['features']['subdomainCount'],
            entry['features']['hasNumbers'],
            entry['features']['tldType'],
            entry['features']['pathDepth'],
            entry['features']['queryParams'],
            entry['features']['hasTrackingParams'],
            entry['features']['isThirdParty'],
            entry['features']['resourceType'],
            entry['features']['domainEntropy']
        ]
        X.append(features)
        y.append(entry['label'])
    
    return np.array(X), np.array(y)

def train_model(X, y):
    """Train Random Forest classifier"""
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Initialize model
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    
    # Train
    print("Training Random Forest...")
    model.fit(X_train, y_train)
    
    # Evaluate
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)
    
    print(f"Train Accuracy: {train_score:.4f}")
    print(f"Test Accuracy: {test_score:.4f}")
    
    # Cross-validation
    cv_scores = cross_val_score(model, X_train, y_train, cv=5)
    print(f"Cross-Validation Accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    
    # Detailed metrics
    y_pred = model.predict(X_test)
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))
    
    # Feature importance
    feature_names = [
        'domainLength', 'subdomainCount', 'hasNumbers', 'tldType',
        'pathDepth', 'queryParams', 'hasTrackingParams', 'isThirdParty',
        'resourceType', 'domainEntropy'
    ]
    
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    print("\nFeature Importances:")
    for i in range(len(feature_names)):
        print(f"{i+1}. {feature_names[indices[i]]}: {importances[indices[i]]:.4f}")
    
    return model

def save_model(model):
    """Save model to disk"""
    joblib.dump(model, MODEL_OUTPUT)
    print(f"\nModel saved to {MODEL_OUTPUT}")

def export_for_tfjs(model):
    """Export model parameters for TensorFlow.js conversion"""
    # This would require tensorflow conversion
    # For now, save as pickle for conversion script
    pass

def create_sample_dataset():
    """Create sample dataset if none exists"""
    sample_data = {
        "domains": [
            {
                "domain": "doubleclick.net",
                "label": "advertising",
                "features": {
                    "domainLength": 14,
                    "subdomainCount": 0,
                    "hasNumbers": 0,
                    "tldType": 1,
                    "pathDepth": 2,
                    "queryParams": 5,
                    "hasTrackingParams": 1,
                    "isThirdParty": 1,
                    "resourceType": 0,
                    "domainEntropy": 3.2
                }
            },
            {
                "domain": "google-analytics.com",
                "label": "analytics",
                "features": {
                    "domainLength": 20,
                    "subdomainCount": 0,
                    "hasNumbers": 0,
                    "tldType": 0,
                    "pathDepth": 1,
                    "queryParams": 3,
                    "hasTrackingParams": 1,
                    "isThirdParty": 1,
                    "resourceType": 0,
                    "domainEntropy": 3.8
                }
            },
            # Add more samples...
        ]
    }
    
    with open(DATASET_PATH, 'w') as f:
        json.dump(sample_data, f, indent=2)
    
    print(f"Sample dataset created at {DATASET_PATH}")
    print("NOTE: Add more labeled examples for production use (require 10,000+ samples)")

if __name__ == '__main__':
    import os
    
    # Create sample dataset if needed
    if not os.path.exists(DATASET_PATH):
        print("No dataset found. Creating sample...")
        create_sample_dataset()
        print("\nTo train a production model:")
        print("1. Collect 10,000+ labeled tracker domains")
        print("2. Run feature extraction on each domain")
        print("3. Save to dataset_trackers.json")
        print("4. Re-run this script")
    else:
        # Load dataset
        print("Loading dataset...")
        X, y = load_dataset()
        print(f"Loaded {len(X)} samples with {X.shape[1]} features")
        print(f"Class distribution: {np.bincount(y)}")
        
        # Train model
        model = train_model(X, y)
        
        # Save model
        save_model(model)
        
        print("\nTraining complete!")
        print("Next steps:")
        print("1. Run ml/convert_to_tfjs.py to convert model")
        print("2. Place converted model in models/tracker_classifier/")

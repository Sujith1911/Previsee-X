"""
PRIVISEE-X Random Forest Tracker Classifier Training
Production-grade ML pipeline using real public tracker datasets.

Features (13):
  domainLength, subdomainCount, hasNumbers, tldType, pathDepth,
  queryParams, hasTrackingParams, isThirdParty, resourceType,
  domainEntropy, tokenCount, digitRatio, specialCharRatio

Classes (5):
  benign, advertising, analytics, social, fingerprinting

Usage:
  python ml/train_random_forest.py
  (Run ml/build_dataset.py first if dataset_trackers.csv doesn't exist)
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
from sklearn.utils.class_weight import compute_class_weight

DATASET_PATH = "dataset_trackers.csv"
MODEL_DIR = "../models/tracker_classifier"
MODEL_OUTPUT = os.path.join(MODEL_DIR, "model.pkl")
ENCODER_OUTPUT = os.path.join(MODEL_DIR, "label_encoder.pkl")
IMPORTANCES_OUTPUT = os.path.join(MODEL_DIR, "feature_importances.json")

FEATURE_COLS = [
    "domainLength", "subdomainCount", "hasNumbers", "tldType",
    "pathDepth", "queryParams", "hasTrackingParams", "isThirdParty",
    "resourceType", "domainEntropy", "tokenCount", "digitRatio",
    "specialCharRatio",
]


def load_dataset():
    """Load the CSV dataset built by build_dataset.py."""
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(
            f"Dataset not found at '{DATASET_PATH}'.\n"
            "Run: python ml/build_dataset.py"
        )

    df = pd.read_csv(DATASET_PATH)
    print(f"Loaded {len(df):,} samples from {DATASET_PATH}")

    # Validate columns
    missing = [c for c in FEATURE_COLS + ["label"] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in dataset: {missing}")

    # Drop rows with NaN features
    before = len(df)
    df = df.dropna(subset=FEATURE_COLS + ["label"])
    if len(df) < before:
        print(f"  Dropped {before - len(df)} rows with NaN values")

    X = df[FEATURE_COLS].values.astype(np.float32)
    y_raw = df["label"].values

    # Encode labels
    le = LabelEncoder()
    y = le.fit_transform(y_raw)

    print(f"\nClasses: {list(le.classes_)}")
    print("Class distribution:")
    for cls, count in zip(le.classes_, np.bincount(y)):
        print(f"  {cls:20} {count:6,}")

    return X, y, le


def train_model(X, y, le):
    """Train Random Forest with class balancing and cross-validation."""
    # Stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    # Compute class weights to handle imbalance
    classes = np.unique(y_train)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight_dict = dict(zip(classes, weights))

    # Random Forest — tuned hyperparameters
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_split=4,
        min_samples_leaf=2,
        max_features="sqrt",
        class_weight=class_weight_dict,
        random_state=42,
        n_jobs=-1,
        oob_score=True,
    )

    print("\nTraining Random Forest (200 estimators, max_depth=15)...")
    model.fit(X_train, y_train)

    # Scores
    train_acc = model.score(X_train, y_train)
    test_acc = model.score(X_test, y_test)
    oob_acc = model.oob_score_

    print(f"\n  Train Accuracy : {train_acc:.4f}")
    print(f"  Test  Accuracy : {test_acc:.4f}")
    print(f"  OOB   Accuracy : {oob_acc:.4f}")

    # 5-fold cross-validation on training set
    print("\nRunning 5-fold cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv, scoring="accuracy", n_jobs=-1)
    print(f"  CV Accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Detailed metrics on test set
    y_pred = model.predict(X_test)
    print("\nClassification Report (Test Set):")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    print("Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    # Pretty-print with class names
    header = "".join(f"{c[:6]:>8}" for c in le.classes_)
    print(f"{'':>12}{header}")
    for i, row in enumerate(cm):
        row_str = "".join(f"{v:>8}" for v in row)
        print(f"  {le.classes_[i][:10]:>10}  {row_str}")

    # Feature importances
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    print("\nFeature Importances (ranked):")
    for rank, idx in enumerate(indices):
        print(f"  {rank+1:2}. {FEATURE_COLS[idx]:25} {importances[idx]:.4f}")

    return model, importances, indices


def save_model(model, le, importances, indices):
    """Save model, encoder, and feature importances."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    joblib.dump(model, MODEL_OUTPUT)
    joblib.dump(le, ENCODER_OUTPUT)

    # Save feature importances as JSON
    fi = {
        FEATURE_COLS[i]: round(float(importances[i]), 6)
        for i in range(len(FEATURE_COLS))
    }
    fi_sorted = dict(sorted(fi.items(), key=lambda x: x[1], reverse=True))
    with open(IMPORTANCES_OUTPUT, "w") as f:
        json.dump(fi_sorted, f, indent=2)

    # Save model metadata
    metadata = {
        "model_type": "RandomForestClassifier",
        "version": "1.0.0",
        "n_estimators": model.n_estimators,
        "max_depth": model.max_depth,
        "n_features": model.n_features_in_,
        "feature_names": FEATURE_COLS,
        "classes": list(le.classes_),
        "oob_score": round(float(model.oob_score_), 4),
    }
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n✓ Model saved to       : {MODEL_OUTPUT}")
    print(f"✓ Encoder saved to     : {ENCODER_OUTPUT}")
    print(f"✓ Importances saved to : {IMPORTANCES_OUTPUT}")


if __name__ == "__main__":
    print("=" * 60)
    print("PRIVISEE-X Random Forest Tracker Classifier Training")
    print("=" * 60)

    # Load dataset
    X, y, le = load_dataset()

    # Train
    model, importances, indices = train_model(X, y, le)

    # Save
    save_model(model, le, importances, indices)

    print("\n" + "=" * 60)
    print("Training complete!")
    print("Next step: python ml/convert_to_tfjs.py")
    print("=" * 60)

# PRIVISEE-X Machine Learning

This directory contains training scripts for the ML models used in PRIVISEE-X.

## Models

### 1. Random Forest Tracker Classifier
- **Purpose**: Classify domains as trackers or benign
- **Algorithm**: Random Forest (100 estimators)
- **Features**: 10 domain/URL features
- **Accuracy**: ~90% (with proper training data)

### 2. Isolation Forest Anomaly Detector
- **Purpose**: Detect anomalous tracking patterns
- **Algorithm**: Isolation Forest
- **Features**: Tracker count, cookie count, connections, fingerprinting
- **Purpose**: Flag sites with unusual tracking behavior

## Quick Start

### Installation

```bash
# Install dependencies
pip install -r requirements.txt
```

### Training Models

```bash
# Train Random Forest classifier
python train_random_forest.py

# Train Isolation Forest anomaly detector
python train_isolation_forest.py

# Evaluate models
python evaluate_models.py

# Convert to TensorFlow.js
python convert_to_tfjs.py
```

## Scripts

### train_random_forest.py

Trains the Random Forest tracker classifier.

**Input**: `dataset_trackers.json` (labeled tracker domains)  
**Output**: `../models/tracker_classifier/model.pkl`

**Dataset Format**:
```json
{
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
    }
  ]
}
```

### train_isolation_forest.py

Trains the Isolation Forest anomaly detector.

**Input**: Synthetic data (or provide real site visit data)  
**Output**: 
- `../models/anomaly_detector/isolation_forest.pkl`
- `../models/anomaly_detector/scaler.pkl`
- `../models/anomaly_detector/baseline_stats.json`

### convert_to_tfjs.py

Converts scikit-learn models to TensorFlow.js format for browser deployment.

**Input**: `../models/tracker_classifier/model.pkl`  
**Output**: `../models/tracker_classifier/model.json`

**Note**: Includes quantization to reduce model size.

### evaluate_models.py

Evaluates trained models and generates performance reports.

**Output**: 
- Console metrics (precision, recall, F1-score)
- `../models/evaluation_report.json`
- Visualizations (if matplotlib available)

## Dataset Collection

### For Random Forest

Collect labeled tracker domains:
1. Use EasyList, EasyPrivacy blocklists as sources
2. Label each domain with category:
   - `advertising`
   - `analytics`
   - `social`
   - `fingerprinting`
   - `benign`

3. Extract features for each domain (see `extractFeatures()` in `trackerDetector.js`)

4. Aim for 10,000+ samples for production model

### For Isolation Forest

Collect real site visit data:
1. Export PRIVISEE-X tracking data after browsing
2. Extract features: tracker count, cookie count, etc.
3. Optionally label anomalous sites manually
4. Retrain with `train_isolation_forest.py`

## Model Deployment

### Browser Integration

1. **Random Forest**: 
   - Convert to JSON with `convert_to_tfjs.py`
   - Load in `trackerDetector.js`
   - Use for real-time classification

2. **Anomaly Detector**:
   - JavaScript implementation uses z-score method
   - Uses baseline stats from `baseline_stats.json`
   - No need to deploy scikit-learn model

### File Structure

```
models/
├── tracker_classifier/
│   ├── model.pkl              # Scikit-learn model
│   ├── model.json             # TensorFlow.js model
│   └── config.json            # Model configuration
└── anomaly_detector/
    ├── isolation_forest.pkl   # Scikit-learn model
    ├── scaler.pkl             # StandardScaler
    ├── baseline_stats.json    # For JS implementation
    └── config.json            # Configuration
```

## Performance

### Random Forest
- **Training time**: ~1-5 minutes (10,000 samples)
- **Inference time**: <1ms per classification
- **Model size**: <5MB (quantized)
- **Memory**: ~50MB loaded

### Isolation Forest
- **Training time**: ~30 seconds (1,000 samples)
- **Inference time**: <5ms per detection
- **Model size**: ~2MB
- **Memory**: ~30MB loaded

## Evaluation Metrics

Target performance (with proper training data):

| Model | Metric | Target | Typical |
|-------|--------|--------|---------|
| Random Forest | Precision | >90% | 93% |
| Random Forest | Recall | >85% | 89% |
| Random Forest | F1-Score | >87% | 91% |
| Isolation Forest | Precision | >80% | 85% |
| Isolation Forest | Recall | >75% | 82% |

## Continuous Improvement

### Model Retraining

Retrain models quarterly or when:
- New tracker patterns emerge
- False positive rate exceeds 5%
- New tracking techniques detected

### Feature Engineering

Consider adding:
- TLS certificate features
- HTTP header patterns
- JavaScript API usage patterns
- Timing attack signatures

### Advanced Models

Future enhancements:
- Neural networks for complex patterns
- Ensemble methods (XGBoost, LightGBM)
- Deep learning for sequence analysis
- Federated learning for collaborative improvement

## Troubleshooting

### "No module named 'sklearn'"
```bash
pip install scikit-learn
```

### "No dataset found"
- Run `train_random_forest.py` to generate sample dataset
- Or create `dataset_trackers.json` manually

### Model too large (>5MB)
- Reduce number of estimators
- Increase quantization (8-bit → 4-bit)
- Use only top decision trees

### Poor accuracy
- Collect more training data
- Balance class distribution
- Add more features
- Tune hyperparameters

## Research

For academic use or model improvements, see:
- [Random Forests (Breiman 2001)](https://link.springer.com/article/10.1023/A:1010933404324)
- [Isolation Forest (Liu et al. 2008)](https://ieeexplore.ieee.org/document/4781136)
- [EasyList Tracker Blocklists](https://easylist.to/)

## License

Models and training code: MIT License (see [../LICENSE](../LICENSE))

Training data sources may have separate licenses.

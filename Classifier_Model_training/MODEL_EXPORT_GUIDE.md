# Model Export & Testing Guide

## Overview
This guide explains how to export your trained DistilBERT model to portable formats and test it.

## Scripts

### 1. `export_model.py` - Export Trained Model
**Purpose:** Converts the trained PyTorch model to portable formats (HDF5 and TensorFlow)

**Usage:**
```bash
python export_model.py
```

**What it does:**
- Loads the trained model from `bert_finetuned/` directory
- Converts PyTorch model to TensorFlow format
- Saves model in multiple formats:
  - **distilbert_model.h5** - HDF5 format (portable, can be loaded in other frameworks)
  - **distilbert_tf_model/** - TensorFlow SavedModel format
  - **tokenizer/** - Tokenizer files for text preprocessing
  - **model_config.json** - Model configuration metadata

**Output Directory:** `model_export/`

---

### 2. `test_model.py` - Load & Test Exported Model
**Purpose:** Loads the exported model and runs inference tests

**Usage:**
```bash
python test_model.py
```

**What it does:**
- Loads the model from `model_export/` directory
- Tests on sample job descriptions
- Evaluates on actual dataset (first 100 samples)
- Displays:
  - Individual predictions with confidence scores
  - Accuracy, Precision, Recall, F1 Score
  - Confusion matrix
  - Model information

---

## Workflow

### Step 1: Export the Model
```bash
python export_model.py
```
This creates the `model_export/` directory with all portable files.

### Step 2: Test the Model
```bash
python test_model.py
```
This verifies the exported model works correctly.

---

## Using the Exported Model

### Load in Python (TensorFlow)
```python
import tensorflow as tf
from transformers import DistilBertTokenizerFast

# Load model
model = tf.keras.models.load_model('model_export/distilbert_model.h5')

# Load tokenizer
tokenizer = DistilBertTokenizerFast.from_pretrained('model_export/tokenizer')

# Inference
text = "Python developer with 5+ years experience"
inputs = tokenizer(text, return_tensors="tf", max_length=128, truncation=True, padding=True)
outputs = model(inputs, training=False)
logits = outputs.logits
prediction = tf.argmax(logits, axis=-1).numpy()[0]
```

### Load in Python (Alternative: SavedModel format)
```python
import tensorflow as tf

model = tf.saved_model.load('model_export/distilbert_tf_model')
```

---

## Model Details

- **Architecture:** DistilBERT (smaller, faster BERT variant)
- **Task:** Binary text classification (Tech vs Non-Tech job descriptions)
- **Input:** Text sequences (max 128 tokens)
- **Output:** Logits for 2 classes
- **Portable Formats:** HDF5, TensorFlow SavedModel
- **Weights:** Already converted from PyTorch

---

## Files Generated

```
model_export/
├── distilbert_model.h5           # HDF5 format (ready for deployment)
├── distilbert_tf_model/          # TensorFlow SavedModel format
│   ├── assets/
│   ├── saved_model.pb
│   └── variables/
├── tokenizer/                    # Text tokenizer
│   ├── tokenizer.json
│   ├── tokenizer_config.json
│   └── special_tokens_map.json
└── model_config.json             # Configuration metadata
```

---

## Requirements

```
tensorflow>=2.10
transformers>=4.30
scikit-learn
pandas
numpy
```

Install with:
```bash
pip install tensorflow transformers scikit-learn pandas numpy
```

---

## Notes

- The **.h5 format** is fully portable and can be loaded in any framework that supports HDF5
- The **tokenizer must be used consistently** for preprocessing text
- The model expects text preprocessed by the DistilBertTokenizerFast
- For production deployment, use the HDF5 format for maximum compatibility


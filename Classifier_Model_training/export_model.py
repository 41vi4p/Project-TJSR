"""
Export the trained DistilBERT model to portable HDF5 (.h5) format
"""
import os
import torch
import numpy as np
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    TFDistilBertForSequenceClassification,
)

# =========================
# CONFIG
# =========================
LOAD_DIR = "bert_finetuned"
EXPORT_DIR = "model_export"
MODEL_NAME = "distilbert-base-uncased"

os.makedirs(EXPORT_DIR, exist_ok=True)

print("🔄 Loading trained PyTorch model...")
# Load the trained PyTorch model
model_pt = DistilBertForSequenceClassification.from_pretrained(LOAD_DIR)
tokenizer = DistilBertTokenizerFast.from_pretrained(LOAD_DIR)

print("✅ PyTorch model loaded successfully!")

# Convert to TensorFlow
print("\n🔄 Converting to TensorFlow format...")
model_tf = TFDistilBertForSequenceClassification.from_pretrained(
    LOAD_DIR, from_pt=True
)
print("✅ TensorFlow conversion complete!")

# Get model config
config = model_pt.config
config_dict = {
    "model_type": config.model_type,
    "num_labels": config.num_labels,
    "hidden_size": config.hidden_size,
    "vocab_size": config.vocab_size,
    "max_position_embeddings": config.max_position_embeddings,
}

print("\n📝 Model Configuration:")
for key, value in config_dict.items():
    print(f"   {key}: {value}")

# Save the TensorFlow model in SavedModel format
print("\n💾 Saving TensorFlow model...")
tf_saved_model_path = os.path.join(EXPORT_DIR, "distilbert_tf_model")
model_tf.save_pretrained(tf_saved_model_path)
print(f"✅ Saved to: {tf_saved_model_path}")

# Save model in HDF5 format
print("\n💾 Saving model as HDF5...")
h5_path = os.path.join(EXPORT_DIR, "distilbert_model.h5")
model_tf.save(h5_path, save_format='h5')
print(f"✅ Saved to: {h5_path}")

# Save tokenizer
print("\n💾 Saving tokenizer...")
tokenizer_path = os.path.join(EXPORT_DIR, "tokenizer")
tokenizer.save_pretrained(tokenizer_path)
print(f"✅ Saved to: {tokenizer_path}")

# Save config as JSON for reference
import json
config_path = os.path.join(EXPORT_DIR, "model_config.json")
with open(config_path, 'w') as f:
    json.dump(config_dict, f, indent=2)
print(f"✅ Saved config to: {config_path}")

print("\n" + "="*60)
print("🎉 Export complete!")
print("="*60)
print(f"\nExported files in '{EXPORT_DIR}/' directory:")
print(f"  - distilbert_model.h5          (HDF5 model format)")
print(f"  - distilbert_tf_model/         (TensorFlow SavedModel format)")
print(f"  - tokenizer/                   (Tokenizer files)")
print(f"  - model_config.json            (Model configuration)")
print("\nYou can use 'test_model.py' to load and test the exported model.")

"""
Export the trained DistilBERT model to HDF5 (.h5) format
"""
import os
import json
import torch
import h5py
import numpy as np
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
)

# =========================
# CONFIG
# =========================
LOAD_DIR = "bert_finetuned"
EXPORT_DIR = "model_export"
MODEL_NAME = "distilbert-base-uncased"
MAX_LEN = 128

os.makedirs(EXPORT_DIR, exist_ok=True)

print("🔄 Loading trained PyTorch model...")
# Load the trained PyTorch model
model = DistilBertForSequenceClassification.from_pretrained(LOAD_DIR)
tokenizer = DistilBertTokenizerFast.from_pretrained(LOAD_DIR)
model.eval()
print("✅ PyTorch model loaded successfully!")

# ===========================
# EXPORT TO H5 (HDF5) FORMAT
# ===========================
print("\n🔄 Exporting model to H5 format...")

h5_path = os.path.join(EXPORT_DIR, "distilbert_model.h5")

# Create HDF5 file and save model weights
with h5py.File(h5_path, 'w') as h5file:
    # Save config
    config = model.config
    config_group = h5file.create_group("config")
    config_group.attrs["model_type"] = config.model_type
    config_group.attrs["num_labels"] = config.num_labels
    config_group.attrs["hidden_size"] = config.hidden_size
    config_group.attrs["vocab_size"] = config.vocab_size
    config_group.attrs["max_position_embeddings"] = config.max_position_embeddings
    config_group.attrs["max_len"] = MAX_LEN

    # Save all model weights
    weights_group = h5file.create_group("weights")
    for name, param in model.named_parameters():
        # Convert to numpy and store
        data = param.detach().cpu().numpy()
        weights_group.create_dataset(name, data=data)

    # Save model structure info
    h5file.attrs["model_class"] = "DistilBertForSequenceClassification"
    h5file.attrs["framework"] = "PyTorch"

print(f"✅ H5 model saved: {h5_path}")

# Save tokenizer
print("\n🔄 Saving tokenizer...")
tokenizer_path = os.path.join(EXPORT_DIR, "tokenizer")
tokenizer.save_pretrained(tokenizer_path)
print(f"✅ Tokenizer saved: {tokenizer_path}")

# Save config as JSON for reference
config = model.config
config_dict = {
    "model_type": config.model_type,
    "num_labels": config.num_labels,
    "hidden_size": config.hidden_size,
    "vocab_size": config.vocab_size,
    "max_position_embeddings": config.max_position_embeddings,
    "max_len": MAX_LEN,
}

config_path = os.path.join(EXPORT_DIR, "model_config.json")
with open(config_path, 'w') as f:
    json.dump(config_dict, f, indent=2)
print(f"✅ Config saved: {config_path}")

# Save PyTorch model as backup
print("\n🔄 Saving PyTorch model backup...")
model_path = os.path.join(EXPORT_DIR, "distilbert_model_pytorch")
model.save_pretrained(model_path)
print(f"✅ PyTorch model saved: {model_path}")

print("\n" + "="*60)
print("✨ Model export complete!")
print("="*60)
print(f"\nExported files in '{EXPORT_DIR}/' directory:")
print(f"  ├─ distilbert_model.h5        (✨ H5/HDF5 format - PRIMARY)")
print(f"  ├─ distilbert_model_pytorch/  (PyTorch backup)")
print(f"  ├─ tokenizer/                 (Text tokenizer)")
print(f"  └─ model_config.json          (Configuration)")

print("\n📌 Load H5 Model:")
print("  import h5py")
print(f"  with h5py.File('{h5_path}', 'r') as h5f:")
print("      weights = dict(h5f['weights'])")
print("      config = dict(h5f['config'].attrs)")

print("\n🔄 Load PyTorch Model (backup):")
print("  from transformers import DistilBertForSequenceClassification, DistilBertTokenizerFast")
print(f"  model = DistilBertForSequenceClassification.from_pretrained('{model_path}')")
print(f"  tokenizer = DistilBertTokenizerFast.from_pretrained('{tokenizer_path}')")

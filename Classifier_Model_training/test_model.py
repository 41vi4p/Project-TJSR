"""
Load and test the exported DistilBERT model (HDF5 format)
"""
import os
import json
import numpy as np
import pandas as pd
import torch
import h5py
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
)

# =========================
# CONFIG
# =========================
EXPORT_DIR = "model_export"
DATA_PATH = "job_dataset_advanced.csv"
MAX_LEN = 128
BATCH_SIZE = 32

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")

# =========================
# LOAD MODEL & TOKENIZER
# =========================
print("🔄 Loading model and tokenizer...\n")

# Load tokenizer
tokenizer_path = os.path.join(EXPORT_DIR, "tokenizer")
tokenizer = DistilBertTokenizerFast.from_pretrained(tokenizer_path)
print(f"✅ Tokenizer loaded from: {tokenizer_path}")

# Load config
config_path = os.path.join(EXPORT_DIR, "model_config.json")
with open(config_path, 'r') as f:
    config = json.load(f)
print(f"✅ Config loaded from: {config_path}")
print(f"   Model type: {config['model_type']}, Num labels: {config['num_labels']}")

# Load PyTorch model from checkpoint
print(f"\n🔄 Loading model from PyTorch checkpoint...")
pytorch_model_path = os.path.join(EXPORT_DIR, "distilbert_model_pytorch")
model = DistilBertForSequenceClassification.from_pretrained(pytorch_model_path)
model.to(device)
model.eval()
print("✅ PyTorch model loaded successfully!")

# Alternatively, load from HDF5 (if needed for reference)
h5_path = os.path.join(EXPORT_DIR, "distilbert_model.h5")
if os.path.exists(h5_path):
    print(f"\n📌 H5 file available at: {h5_path}")
    print("   (Contains model weights in HDF5 format for portability)")

# =========================
# TEST WITH SAMPLE TEXT
# =========================
print("\n" + "="*60)
print("📝 Testing with sample job descriptions")
print("="*60)

sample_texts = [
    "Python developer needed. Experience with Flask and Django required. 5+ years experience.",
    "Sales manager position. Must have excellent communication skills. No technical background needed.",
    "Data scientist role. Machine learning, Python, SQL expertise required. PhD preferred.",
    "Customer service representative. Phone and email support. Entry level position available.",
]

def predict_batch(texts, batch_size=BATCH_SIZE):
    """Run predictions on a batch of texts"""
    all_probs = []

    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i+batch_size]

            # Tokenize
            encodings = tokenizer(
                batch_texts,
                truncation=True,
                padding=True,
                max_length=MAX_LEN,
                return_tensors="pt"
            )

            # Move to device
            input_ids = encodings["input_ids"].to(device)
            attention_mask = encodings["attention_mask"].to(device)

            # Predict
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits
            probs = torch.nn.functional.softmax(logits, dim=-1).cpu().numpy()
            all_probs.extend(probs)

    return np.array(all_probs)

print("\nRunning inference on sample texts:\n")
probs = predict_batch(sample_texts)

class_names = ["Not Tech", "Tech"]  # Assuming binary classification
for i, text in enumerate(sample_texts):
    pred_label = np.argmax(probs[i])
    confidence = probs[i][pred_label] * 100
    print(f"Text {i+1}: '{text[:50]}...'")
    print(f"   Prediction: {class_names[pred_label]} (Confidence: {confidence:.1f}%)")
    print(f"   Class 0 prob: {probs[i][0]*100:.2f}%  |  Class 1 prob: {probs[i][1]*100:.2f}%")
    print()

# =========================
# EVALUATE ON TEST DATA
# =========================
print("="*60)
print("📊 Evaluating on actual test dataset")
print("="*60)

try:
    # Load dataset
    df = pd.read_csv(DATA_PATH)
    df = df.drop_duplicates(subset=["job_description"])
    df = df.dropna(subset=["job_description", "label"])
    df["label"] = df["label"].astype(int)

    # Use first 100 samples for quick evaluation
    df_eval = df.head(100).copy()
    texts = df_eval["job_description"].astype(str).tolist()
    labels = df_eval["label"].values

    print(f"\nEvaluating on {len(texts)} samples from dataset...")

    # Get predictions
    probs = predict_batch(texts)
    preds = np.argmax(probs, axis=1)

    # Calculate metrics
    accuracy = (preds == labels).mean()

    # Precision, Recall, F1
    from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

    precision = precision_score(labels, preds, zero_division=0)
    recall = recall_score(labels, preds, zero_division=0)
    f1 = f1_score(labels, preds, zero_division=0)
    cm = confusion_matrix(labels, preds)

    print(f"\n✅ Evaluation Results:")
    print(f"   Accuracy:  {accuracy*100:.2f}%")
    print(f"   Precision: {precision*100:.2f}%")
    print(f"   Recall:    {recall*100:.2f}%")
    print(f"   F1 Score:  {f1*100:.2f}%")
    print(f"\n   Confusion Matrix:")
    print(f"   {cm[0, 0]:>6} {cm[0, 1]:>6}    (True Negatives | False Positives)")
    print(f"   {cm[1, 0]:>6} {cm[1, 1]:>6}    (False Negatives | True Positives)")

except Exception as e:
    print(f"\n⚠️  Could not evaluate on dataset: {e}")

# =========================
# MODEL INSPECTION
# =========================
print("\n" + "="*60)
print("🔍 Model Information")
print("="*60)
print(f"\nModel Summary:")
print(f"  - Type: DistilBertForSequenceClassification (PyTorch)")
print(f"  - Model: {type(model).__name__}")
print(f"  - Device: {device}")

# Count parameters
total_params = sum(p.numel() for p in model.parameters())
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"  - Total parameters: {total_params:,}")
print(f"  - Trainable parameters: {trainable_params:,}")

print("\n" + "="*60)
print("✨ Model testing completed successfully!")
print("="*60)

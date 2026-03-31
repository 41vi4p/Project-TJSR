import os
import json
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    get_linear_schedule_with_warmup,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# =========================
# CONFIG
# =========================
DATA_PATH  = "job_dataset_advanced.csv"
SAVE_DIR   = "bert_finetuned"
EXPORT_DIR = "model_export"
MODEL_NAME = "distilbert-base-uncased"

MAX_LEN     = 128    # full length for better understanding of long job descriptions
BATCH_SIZE  = 32
EPOCHS      = 20     # more epochs, early stopping will halt when val loss rises
LR          = 2e-5
SEED        = 42
MAX_SAMPLES = 8_000  # cap total rows → keeps training under 5 min on GPU
PATIENCE    = 20     # stop if val loss doesn't improve for 20 consecutive epochs

# =========================
# SETUP
# =========================
torch.manual_seed(SEED)
np.random.seed(SEED)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Device:", device)

# =========================
# LOAD DATA
# =========================
df = pd.read_csv(DATA_PATH)
print(f"\nOriginal rows : {len(df):,}")

df = df.drop_duplicates(subset=["job_description"])
df = df.dropna(subset=["job_description", "label"])
df["label"] = df["label"].astype(int)

# Cap size for speed
if len(df) > MAX_SAMPLES:
    df = df.sample(MAX_SAMPLES, random_state=SEED).reset_index(drop=True)

df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)
print(f"After cleaning : {len(df):,}")
print(df["label"].value_counts())

# =========================
# SPLIT
# =========================
X = df["job_description"].astype(str).tolist()
y = df["label"].tolist()

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=SEED
)
X_train, X_val, y_train, y_val = train_test_split(
    X_train, y_train, test_size=0.1, stratify=y_train, random_state=SEED
)
print(f"\nTrain: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")

# =========================
# TOKENIZER
# =========================
tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_NAME)

# =========================
# DATASET
# =========================
class JobDataset(Dataset):
    def __init__(self, texts, labels):
        self.encodings = tokenizer(
            texts,
            truncation=True,
            padding=True,
            max_length=MAX_LEN,
        )
        self.labels = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

train_ds = JobDataset(X_train, y_train)
val_ds   = JobDataset(X_val,   y_val)
test_ds  = JobDataset(X_test,  y_test)

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0)
test_loader  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

# =========================
# MODEL
# =========================
model = DistilBertForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)
model.to(device)

optimizer    = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
total_steps  = len(train_loader) * EPOCHS
scheduler    = get_linear_schedule_with_warmup(
    optimizer,
    num_warmup_steps=int(0.1 * total_steps),
    num_training_steps=total_steps,
)

# =========================
# TRAIN / EVAL FUNCTION
# =========================
def run_epoch(loader, train=True):
    model.train() if train else model.eval()

    total_loss   = 0.0
    preds_all    = []
    labels_all   = []

    for batch in loader:
        input_ids      = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        labels         = batch["labels"].to(device)

        if train:
            optimizer.zero_grad()

        with torch.set_grad_enabled(train):
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            loss   = outputs.loss
            logits = outputs.logits

        if train:
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

        total_loss += loss.item()
        preds = torch.argmax(logits, dim=1).cpu().numpy()
        preds_all.extend(preds)
        labels_all.extend(labels.cpu().numpy())

    avg_loss  = total_loss / len(loader)
    acc       = accuracy_score(labels_all, preds_all)
    precision = precision_score(labels_all, preds_all, zero_division=0)
    recall    = recall_score(labels_all, preds_all, zero_division=0)
    f1        = f1_score(labels_all, preds_all, zero_division=0)
    return avg_loss, acc, precision, recall, f1

# =========================
# TRAIN LOOP
# =========================
print("\n🚀 Training started…\n")
print(f"{'Epoch':<7}{'Split':<8}{'Loss':>8}{'Acc':>9}{'Prec':>9}{'Recall':>9}{'F1':>9}")
print("─" * 60)

best_val_loss  = float("inf")
patience_count = 0

# Store metrics for plotting
training_metrics = []

for epoch in range(EPOCHS):
    tr_loss, tr_acc, tr_prec, tr_rec, tr_f1 = run_epoch(train_loader, train=True)
    vl_loss, vl_acc, vl_prec, vl_rec, vl_f1 = run_epoch(val_loader,   train=False)

    print(f"{epoch+1}/{EPOCHS}    {'Train':<8}"
          f"{tr_loss:>8.4f}{tr_acc*100:>8.2f}%{tr_prec*100:>8.2f}%{tr_rec*100:>8.2f}%{tr_f1*100:>8.2f}%")
    print(f"         {'Val':<8}"
          f"{vl_loss:>8.4f}{vl_acc*100:>8.2f}%{vl_prec*100:>8.2f}%{vl_rec*100:>8.2f}%{vl_f1*100:>8.2f}%")
    print()

    # Store metrics for plotting
    training_metrics.append({
        "epoch": epoch + 1,
        "train_loss": float(tr_loss),
        "val_loss": float(vl_loss),
        "train_acc": float(tr_acc),
        "val_acc": float(vl_acc),
        "train_prec": float(tr_prec),
        "val_prec": float(vl_prec),
        "train_recall": float(tr_rec),
        "val_recall": float(vl_rec),
        "train_f1": float(tr_f1),
        "val_f1": float(vl_f1),
    })

    if vl_loss < best_val_loss:
        best_val_loss  = vl_loss
        patience_count = 0
        os.makedirs(SAVE_DIR, exist_ok=True)
        model.save_pretrained(SAVE_DIR)
        tokenizer.save_pretrained(SAVE_DIR)
        print(f"   ✅ Best model saved  (val_loss={vl_loss:.4f})\n")
    else:
        patience_count += 1
        print(f"   ⏸  No improvement ({patience_count}/{PATIENCE})\n")
        if patience_count >= PATIENCE:
            print(f"   🛑 Early stopping triggered at epoch {epoch+1}\n")
            break

# =========================
# FINAL TEST EVALUATION
# =========================
print("─" * 60)
print("📊 Test set evaluation (best checkpoint):")
from transformers import DistilBertForSequenceClassification as DBC
model = DBC.from_pretrained(SAVE_DIR)
model.to(device)

ts_loss, ts_acc, ts_prec, ts_rec, ts_f1 = run_epoch(test_loader, train=False)
print(f"   Loss      : {ts_loss:.4f}")
print(f"   Accuracy  : {ts_acc*100:.2f}%")
print(f"   Precision : {ts_prec*100:.2f}%")
print(f"   Recall    : {ts_rec*100:.2f}%")
print(f"   F1 Score  : {ts_f1*100:.2f}%")
print("\n🎉 Training completed!")

# =========================
# SAVE TRAINING METRICS
# =========================
print("\n💾 Saving training metrics...")
metrics_path = "training_metrics.json"
with open(metrics_path, 'w') as f:
    json.dump(training_metrics, f, indent=2)
print(f"✅ Metrics saved to: {metrics_path}")
print("   (Use: python plot_training.py to visualize)")

# =========================
# EXPORT MODEL TO PORTABLE FORMATS
# =========================
print("\n" + "="*60)
print("📦 Exporting model...")
print("="*60)

os.makedirs(EXPORT_DIR, exist_ok=True)

# Load tokenizer from saved checkpoint
tokenizer = DistilBertTokenizerFast.from_pretrained(SAVE_DIR)
print("✅ Tokenizer loaded")

# Save tokenizer
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
}
config_path = os.path.join(EXPORT_DIR, "model_config.json")
with open(config_path, 'w') as f:
    json.dump(config_dict, f, indent=2)
print(f"✅ Config saved: {config_path}")

print("\n" + "="*60)
print("✨ Model exported successfully!")
print("="*60)
print(f"\nExported files in '{EXPORT_DIR}/' directory:")
print(f"  ├─ tokenizer/                 (Text tokenizer)")
print(f"  └─ model_config.json          (Configuration)")
print(f"\n📝 Note: PyTorch model is saved in '{SAVE_DIR}/'")
print(f"   To export to H5/ONNX formats, run in a properly configured environment:")
print(f"   pip install tensorflow onnx onnxruntime")
print(f"   python export_model.py")
print(f"\nYou can still use the PyTorch model for inference with:")
print(f"   from transformers import DistilBertForSequenceClassification")
print(f"   model = DistilBertForSequenceClassification.from_pretrained('{SAVE_DIR}')")

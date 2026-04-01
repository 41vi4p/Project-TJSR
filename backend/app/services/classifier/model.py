"""Load and manage the DistilBERT classifier model."""

import torch
from transformers import DistilBertForSequenceClassification, DistilBertTokenizerFast
import logging
import os

logger = logging.getLogger(__name__)

_model = None
_tokenizer = None
_device = None

MODEL_DIR = os.environ.get("ML_MODEL_DIR", "/app/ml_model")
TOKENIZER_DIR = os.environ.get("ML_TOKENIZER_DIR", "/app/ml_tokenizer")
MAX_LEN = 128


def load_model():
    """Load the DistilBERT model and tokenizer."""
    global _model, _tokenizer, _device

    if _model is not None:
        return _model, _tokenizer, _device

    # Determine device
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Loading classifier model on {_device}")

    # Try multiple paths for model
    model_paths = [MODEL_DIR, "./ml_model", "../Classifier_Model_training/bert_finetuned"]
    tokenizer_paths = [TOKENIZER_DIR, "./ml_tokenizer", "../Classifier_Model_training/model_export/tokenizer"]

    model_path = None
    for p in model_paths:
        if os.path.exists(p):
            model_path = p
            break

    tokenizer_path = None
    for p in tokenizer_paths:
        if os.path.exists(p):
            tokenizer_path = p
            break

    if not model_path:
        logger.error(f"Model not found in any of: {model_paths}")
        return None, None, None

    if not tokenizer_path:
        # Tokenizer might be in the model directory
        tokenizer_path = model_path

    try:
        _model = DistilBertForSequenceClassification.from_pretrained(model_path)
        _model.to(_device)
        _model.eval()

        _tokenizer = DistilBertTokenizerFast.from_pretrained(tokenizer_path)

        logger.info(f"Model loaded from {model_path}, tokenizer from {tokenizer_path}")
        return _model, _tokenizer, _device

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        _model = None
        _tokenizer = None
        return None, None, None


def predict(texts: list[str]) -> list[dict]:
    """Run inference on a list of texts.

    Returns list of dicts with keys: is_tech (bool), confidence (float), label (int)
    """
    model, tokenizer, device = load_model()

    if model is None or tokenizer is None:
        logger.warning("Model not loaded, returning default predictions")
        return [{"is_tech": None, "confidence": 0.0, "label": -1} for _ in texts]

    results = []
    batch_size = 32

    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]

            encodings = tokenizer(
                batch_texts,
                truncation=True,
                padding=True,
                max_length=MAX_LEN,
                return_tensors="pt",
            )

            input_ids = encodings["input_ids"].to(device)
            attention_mask = encodings["attention_mask"].to(device)

            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            probs = torch.softmax(outputs.logits, dim=-1).cpu().numpy()

            for prob in probs:
                label = int(prob.argmax())
                confidence = float(prob.max())
                results.append({
                    "is_tech": label == 1,
                    "confidence": round(confidence, 4),
                    "label": label,
                })

    return results

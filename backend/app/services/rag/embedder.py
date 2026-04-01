"""Sentence-transformers embedding generation."""

import logging
from app.config import get_settings

logger = logging.getLogger(__name__)

_model = None


def get_embedding_model():
    global _model
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer
        settings = get_settings()
        _model = SentenceTransformer(settings.embedding_model)
        logger.info(f"Loaded embedding model: {settings.embedding_model}")
    except Exception as e:
        logger.error(f"Failed to load embedding model: {e}")
        _model = None
    return _model


def embed_text(text: str) -> list[float] | None:
    """Generate embedding for a single text."""
    model = get_embedding_model()
    if model is None:
        return None
    try:
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return None


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts."""
    model = get_embedding_model()
    if model is None:
        return [[] for _ in texts]
    try:
        embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
        return [e.tolist() for e in embeddings]
    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        return [[] for _ in texts]


def build_job_text(title: str, company: str, location: str = "",
                   description: str = "", skills: list[str] = None) -> str:
    """Build a rich text representation of a job for embedding."""
    skills = skills or []
    parts = [
        f"Job Title: {title}",
        f"Company: {company}",
    ]
    if location:
        parts.append(f"Location: {location}")
    if skills:
        parts.append(f"Required Skills: {', '.join(skills)}")
    if description:
        # Truncate description to 1000 chars for embedding
        parts.append(f"Description: {description[:1000]}")
    return "\n".join(parts)

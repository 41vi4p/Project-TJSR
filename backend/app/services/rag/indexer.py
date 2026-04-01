"""Qdrant upsert/delete operations for job and resume embeddings."""

import uuid
import logging
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
)
from app.config import get_settings
from app.services.rag.embedder import embed_text, build_job_text

logger = logging.getLogger(__name__)

JOB_COLLECTION = "job_embeddings"
RESUME_COLLECTION = "resume_embeddings"
VECTOR_SIZE = 384  # all-MiniLM-L6-v2


def get_qdrant_client() -> QdrantClient | None:
    try:
        settings = get_settings()
        return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port, timeout=10)
    except Exception as e:
        logger.error(f"Could not connect to Qdrant: {e}")
        return None


def ensure_collections():
    """Create Qdrant collections if they don't exist."""
    client = get_qdrant_client()
    if not client:
        return

    for name in [JOB_COLLECTION, RESUME_COLLECTION]:
        try:
            client.get_collection(name)
        except Exception:
            client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info(f"Created Qdrant collection: {name}")

    client.close()


def index_job(job_id: str) -> dict:
    """Generate embedding for a job and upsert to Qdrant."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.job import Job

    settings = get_settings()
    from sqlalchemy import create_engine
    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job:
            return {"error": "Job not found"}

        text = build_job_text(
            title=job.title,
            company=job.company,
            location=job.location or "",
            description=job.description or "",
            skills=job.skills or [],
        )

        embedding = embed_text(text)
        if not embedding:
            return {"error": "Embedding failed"}

        client = get_qdrant_client()
        if not client:
            return {"error": "Qdrant unavailable"}

        ensure_collections()

        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, job_id))

        client.upsert(
            collection_name=JOB_COLLECTION,
            points=[PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "job_id": job_id,
                    "title": job.title,
                    "company": job.company,
                    "skills": job.skills or [],
                    "is_tech": job.is_tech,
                    "date_scraped": job.date_scraped.isoformat() if job.date_scraped else None,
                }
            )],
        )
        client.close()

        # Update job with embedding id
        job.embedding_id = point_id
        session.commit()

        logger.info(f"Indexed job {job_id} in Qdrant (point: {point_id})")
        return {"status": "indexed", "point_id": point_id}


def index_resume_section(user_id: str, section: str, content: str) -> dict:
    """Store a resume section as a vector in Qdrant."""
    embedding = embed_text(content)
    if not embedding:
        return {"error": "Embedding failed"}

    client = get_qdrant_client()
    if not client:
        return {"error": "Qdrant unavailable"}

    ensure_collections()

    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{section}"))

    client.upsert(
        collection_name=RESUME_COLLECTION,
        points=[PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                "user_id": user_id,
                "section": section,
                "content": content[:2000],
            }
        )],
    )
    client.close()

    return {"status": "indexed", "point_id": point_id}


def delete_job_embedding(job_id: str):
    """Remove a job's embedding from Qdrant."""
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, job_id))
    client = get_qdrant_client()
    if client:
        client.delete(collection_name=JOB_COLLECTION, points_selector=[point_id])
        client.close()

"""Qdrant similarity search for RAG retrieval."""

import logging
from qdrant_client.models import Filter, FieldCondition, MatchValue
from app.services.rag.embedder import embed_text
from app.services.rag.indexer import get_qdrant_client, JOB_COLLECTION, RESUME_COLLECTION

logger = logging.getLogger(__name__)


async def search_similar_jobs(
    query: str,
    limit: int = 10,
    is_tech_only: bool = False,
) -> list[dict]:
    """Search for semantically similar jobs."""
    embedding = embed_text(query)
    if not embedding:
        return []

    client = get_qdrant_client()
    if not client:
        return []

    try:
        search_filter = None
        if is_tech_only:
            search_filter = Filter(
                must=[FieldCondition(key="is_tech", match=MatchValue(value=True))]
            )

        results = client.search(
            collection_name=JOB_COLLECTION,
            query_vector=embedding,
            limit=limit,
            query_filter=search_filter,
            with_payload=True,
        )

        return [
            {
                "job_id": r.payload.get("job_id"),
                "title": r.payload.get("title"),
                "company": r.payload.get("company"),
                "score": round(r.score, 4),
            }
            for r in results
            if r.payload.get("job_id")
        ]
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []
    finally:
        client.close()


async def search_resume_sections(
    query: str,
    user_id: str,
    limit: int = 5,
) -> list[dict]:
    """Search user's resume sections."""
    embedding = embed_text(query)
    if not embedding:
        return []

    client = get_qdrant_client()
    if not client:
        return []

    try:
        results = client.search(
            collection_name=RESUME_COLLECTION,
            query_vector=embedding,
            limit=limit,
            query_filter=Filter(
                must=[FieldCondition(key="user_id", match=MatchValue(value=user_id))]
            ),
            with_payload=True,
        )

        return [
            {
                "section": r.payload.get("section"),
                "content": r.payload.get("content"),
                "score": round(r.score, 4),
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"Resume section search failed: {e}")
        return []
    finally:
        client.close()


async def get_context_for_query(query: str, user_id: str | None = None, limit: int = 5) -> str:
    """Build a context string from the most relevant job documents."""
    results = await search_similar_jobs(query, limit=limit)

    if not results:
        return "No relevant job information found."

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.config import get_settings

    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    context_parts = []
    with Session(engine) as session:
        for r in results:
            job = session.execute(
                select(Job).where(Job.id == r["job_id"])
            ).scalar_one_or_none()

            if job:
                context_parts.append(
                    f"Job: {job.title} at {job.company}\n"
                    f"Location: {job.location or 'N/A'}\n"
                    f"Skills: {', '.join(job.skills or [])}\n"
                    f"Type: {job.job_type or 'N/A'}\n"
                    f"Salary: {job.salary or 'N/A'}\n"
                    f"Apply: {job.apply_link or 'N/A'}\n"
                    f"Description: {(job.description or '')[:300]}...\n"
                )

    return "\n---\n".join(context_parts)

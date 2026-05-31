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


async def get_context_for_query(query: str, user_id: str | None = None, limit: int = 8) -> str:
    """
    Build context for the AI from the most relevant jobs.
    Strategy: Qdrant semantic search first; fall back to recent DB jobs if Qdrant empty.
    """
    from sqlalchemy import create_engine, select, desc, or_
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.config import get_settings
    from datetime import datetime, timezone, timedelta

    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    # Try Qdrant semantic search
    qdrant_results = await search_similar_jobs(query, limit=limit)
    job_ids_ordered = [r["job_id"] for r in qdrant_results]

    with Session(engine) as session:
        jobs: list[Job] = []

        if job_ids_ordered:
            # Fetch jobs in Qdrant relevance order
            job_map = {
                j.id: j for j in session.execute(
                    select(Job).where(Job.id.in_(job_ids_ordered))
                ).scalars().all()
            }
            jobs = [job_map[jid] for jid in job_ids_ordered if jid in job_map]

        # Fallback: keyword search in DB + recent jobs
        if not jobs:
            keywords = [w for w in query.lower().split() if len(w) > 3]
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            q = select(Job).where(Job.is_active == True, Job.date_scraped >= cutoff)
            if keywords:
                q = q.where(or_(
                    *[Job.title.ilike(f"%{kw}%") for kw in keywords[:3]],
                    *[Job.description.ilike(f"%{kw}%") for kw in keywords[:2]],
                ))
            q = q.order_by(desc(Job.date_scraped)).limit(limit)
            jobs = list(session.execute(q).scalars().all())

        if not jobs:
            return "No relevant job listings found in the database. The scraper may not have run yet."

        now = datetime.now(timezone.utc)
        parts = []
        for job in jobs:
            age_days = (now - job.date_scraped.replace(tzinfo=timezone.utc)).days if job.date_scraped else "?"
            parts.append(
                f"[Job #{len(parts)+1}]\n"
                f"Title: {job.title}\n"
                f"Company: {job.company}\n"
                f"Location: {job.location or 'Not specified'}\n"
                f"Type: {job.job_type or 'Not specified'}\n"
                f"Salary: {job.salary or 'Not specified'}\n"
                f"Skills: {', '.join((job.skills or [])[:15]) or 'Not listed'}\n"
                f"Posted: {age_days} day(s) ago\n"
                f"Apply: {job.apply_link or 'N/A'}\n"
                f"Description: {(job.description or '')[:500]}\n"
            )

    return "\n---\n".join(parts)

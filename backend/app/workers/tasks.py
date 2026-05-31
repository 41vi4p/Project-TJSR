from app.workers.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.workers.tasks.run_scraper")
def run_scraper(self, config_ids: list[str] | None = None, user_id: str | None = None):
    """Run the scraping pipeline for given configs or all enabled configs."""
    from app.services.scraper.manager import ScraperManager

    logger.info(f"Starting scraper task: config_ids={config_ids}, user_id={user_id}")
    manager = ScraperManager()
    result = manager.run(config_ids=config_ids, user_id=user_id, task=self)
    logger.info(f"Scraper task complete: {result}")
    return result


@celery_app.task(name="app.workers.tasks.classify_job")
def classify_job(job_id: str):
    """Classify a single job using the ML model."""
    from app.services.classifier.predictor import classify_job_by_id
    return classify_job_by_id(job_id)


@celery_app.task(name="app.workers.tasks.embed_job")
def embed_job(job_id: str):
    """Generate embedding for a job and store in Qdrant."""
    from app.services.rag.indexer import index_job
    return index_job(job_id)


@celery_app.task(name="app.workers.tasks.add_to_graph")
def add_to_graph(job_id: str):
    """Add job to Neo4j knowledge graph."""
    from app.services.graph.graph_builder import add_job_to_graph
    return add_job_to_graph(job_id)


@celery_app.task(name="app.workers.tasks.process_job_pipeline")
def process_job_pipeline(job_id: str):
    """Full pipeline: classify -> embed -> graph -> compute match scores."""
    # Run classification inline (fast, needed for match_score)
    try:
        from app.services.classifier.predictor import classify_job_by_id
        classify_job_by_id(job_id)
    except Exception as e:
        logger.warning(f"Classification failed for {job_id}: {e}")

    # Compute match scores against all users with resume skills
    try:
        _compute_match_scores(job_id)
    except Exception as e:
        logger.warning(f"Match score computation failed for {job_id}: {e}")

    # Queue embedding and graph (non-critical, fire-and-forget)
    try:
        embed_job.delay(job_id)
    except Exception:
        try:
            from app.services.rag.indexer import index_job
            index_job(job_id)
        except Exception as e:
            logger.warning(f"Embedding failed for {job_id}: {e}")

    try:
        add_to_graph.delay(job_id)
    except Exception:
        pass  # Graph is non-critical


def _compute_match_scores(job_id: str):
    """
    Compute per-user match scores for a job. Notifies users whose score >= threshold.
    """
    from sqlalchemy import create_engine, select, text
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.models.user import User
    from app.config import get_settings

    ALERT_THRESHOLD = 40  # notify if ≥40% skill overlap

    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job or not job.skills:
            return

        job_skills_lower = {s.lower() for s in (job.skills or [])}

        rows = session.execute(
            text("SELECT id, resume_skills FROM users WHERE resume_skills IS NOT NULL AND jsonb_array_length(resume_skills) > 0")
        ).fetchall()

        if not rows:
            return

        max_score = 0
        for (user_id, user_skills) in rows:
            if not user_skills:
                continue
            user_skills_lower = {s.lower() for s in user_skills}
            matched = len(job_skills_lower & user_skills_lower)
            if not matched:
                continue
            score = round(matched / max(len(job_skills_lower), 1) * 100)
            max_score = max(max_score, score)

            # Alert user if score meets threshold
            if score >= ALERT_THRESHOLD:
                try:
                    import asyncio
                    from app.services.telegram.notifications import (
                        send_job_match_notification, create_db_notification
                    )
                    # In-app notification (async → run in new loop)
                    asyncio.get_event_loop().run_until_complete(
                        create_db_notification(
                            user_id=user_id,
                            type="success",
                            title="New Job Match",
                            message=f"{job.title} at {job.company} — {score}% skill match",
                        )
                    )
                    # Telegram push (sync)
                    send_job_match_notification(user_id=user_id, job_id=job_id)
                except Exception as e:
                    logger.warning(f"Alert failed for user {user_id} job {job_id}: {e}")

        if max_score > 0:
            job.match_score = max_score
            session.commit()
            logger.info(f"Job {job_id} match_score={max_score}")


@celery_app.task(name="app.workers.tasks.scrape_all_sources")
def scrape_all_sources():
    """Scheduled task: scrape all enabled sources + archive stale jobs. Runs every 6h via Beat."""
    from app.services.scraper.manager import ScraperManager
    from sqlalchemy import create_engine, text
    from app.config import get_settings

    logger.info("Beat: starting scheduled scrape_all_sources")
    manager = ScraperManager()
    result = manager.run()
    logger.info(f"Beat: scrape_all_sources complete: {result}")

    # Archive jobs older than 30 days
    try:
        settings = get_settings()
        engine = create_engine(settings.sync_database_url)
        with engine.connect() as conn:
            archived = conn.execute(text(
                "UPDATE jobs SET is_active = FALSE "
                "WHERE is_active = TRUE AND date_scraped < NOW() - INTERVAL '30 days'"
            ))
            conn.commit()
            logger.info(f"Beat: archived {archived.rowcount} stale jobs")
    except Exception as e:
        logger.warning(f"Beat: job archival failed: {e}")

    return result


@celery_app.task(name="app.workers.tasks.send_daily_digest")
def send_daily_digest():
    """Send daily job digest to all subscribed Telegram users."""
    from app.services.telegram.notifications import send_all_digests
    return send_all_digests()

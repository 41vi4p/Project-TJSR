"""High-level prediction interface for classifying jobs."""

import logging
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.job import Job
from app.services.classifier.model import predict

logger = logging.getLogger(__name__)


def classify_job_by_id(job_id: str) -> dict:
    """Classify a single job by its database ID."""
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job:
            logger.warning(f"Job {job_id} not found for classification")
            return {"error": "Job not found"}

        if not job.description:
            logger.warning(f"Job {job_id} has no description")
            return {"error": "No description"}

        results = predict([job.description])
        if results:
            result = results[0]
            job.is_tech = result["is_tech"]
            job.confidence_score = result["confidence"]
            session.commit()

            logger.info(
                f"Classified job {job_id}: is_tech={result['is_tech']}, "
                f"confidence={result['confidence']}"
            )
            return result

    return {"error": "Classification failed"}


def classify_batch(descriptions: list[str]) -> list[dict]:
    """Classify a batch of job descriptions."""
    return predict(descriptions)

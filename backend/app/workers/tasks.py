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

    logger.info(f"Classifying job: {job_id}")
    result = classify_job_by_id(job_id)
    return result


@celery_app.task(name="app.workers.tasks.embed_job")
def embed_job(job_id: str):
    """Generate embedding for a job and store in Qdrant."""
    from app.services.rag.indexer import index_job

    logger.info(f"Embedding job: {job_id}")
    result = index_job(job_id)
    return result


@celery_app.task(name="app.workers.tasks.add_to_graph")
def add_to_graph(job_id: str):
    """Add job to Neo4j knowledge graph."""
    from app.services.graph.graph_builder import add_job_to_graph

    logger.info(f"Adding job to graph: {job_id}")
    result = add_job_to_graph(job_id)
    return result


@celery_app.task(name="app.workers.tasks.process_job_pipeline")
def process_job_pipeline(job_id: str):
    """Full pipeline: classify -> embed -> graph -> notify."""
    classify_job.delay(job_id)
    embed_job.delay(job_id)
    add_to_graph.delay(job_id)


@celery_app.task(name="app.workers.tasks.send_daily_digest")
def send_daily_digest():
    """Send daily job digest to all subscribed Telegram users."""
    from app.services.telegram.notifications import send_all_digests

    logger.info("Sending daily digest")
    result = send_all_digests()
    return result

"""Scraper Manager: orchestrates multi-engine scraping pipeline."""

import json
import logging
from datetime import datetime, timezone
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import Base
from app.models.scraper_config import ScraperConfig
from app.models.job import Job
from app.models.log import SystemLog
from app.services.scraper.base import RawContent
from app.services.scraper.bs4_scraper import BS4Scraper
from app.services.scraper.selenium_scraper import SeleniumScraper
from app.services.scraper.scrapling_scraper import ScraplingEngine
from app.services.scraper.crawl4ai_scraper import Crawl4AIScraper
from app.services.scraper.newspaper_scraper import NewspaperScraper
from app.services.scraper.phenom_scraper import PhenomScraper
from app.services.scraper.google_careers_scraper import GoogleCareersScraper
from app.services.scraper.nlp_extractor import extract_jobs_from_content

logger = logging.getLogger(__name__)


class ScraperManager:
    """Orchestrates the scraping pipeline across multiple engines."""

    ENGINE_MAP = {
        "bs4": BS4Scraper,
        "selenium": SeleniumScraper,
        "scrapling": ScraplingEngine,
        "crawl4ai": Crawl4AIScraper,
        "newspaper": NewspaperScraper,
        "phenom": PhenomScraper,
        "google_careers": GoogleCareersScraper,
    }

    # Order to try engines when auto-selecting
    ENGINE_PRIORITY = ["bs4", "scrapling", "crawl4ai", "selenium", "newspaper"]

    def __init__(self):
        self.engines = {}
        settings = get_settings()
        self.sync_engine = create_engine(settings.sync_database_url)

    def _get_engine(self, name: str):
        if name not in self.engines:
            engine_class = self.ENGINE_MAP.get(name)
            if engine_class:
                self.engines[name] = engine_class()
        return self.engines.get(name)

    def run(self, config_ids: list[str] | None = None, user_id: str | None = None, task=None) -> dict:
        """Run scraping for given configs or all enabled ones."""
        result = {
            "jobs_found": 0,
            "sources_completed": 0,
            "sources_total": 0,
            "errors": [],
        }

        with Session(self.sync_engine) as session:
            query = select(ScraperConfig).where(ScraperConfig.enabled == True)
            if config_ids:
                query = query.where(ScraperConfig.id.in_(config_ids))
            if user_id:
                query = query.where(ScraperConfig.user_id == user_id)

            configs = list(session.execute(query).scalars())
            result["sources_total"] = len(configs)

            if not configs:
                logger.info("No scraper configs found to run")
                return result

            for i, config in enumerate(configs):
                try:
                    self._update_progress(config.user_id, {
                        "progress": int((i / len(configs)) * 100),
                        "jobs_found": result["jobs_found"],
                        "sources_completed": i,
                        "sources_total": len(configs),
                        "current_source": config.source_name or config.source_url,
                    })

                    jobs = self._scrape_source(config, session)
                    result["jobs_found"] += len(jobs)
                    result["sources_completed"] += 1

                    # Update config status
                    config.last_run_at = datetime.now(timezone.utc)
                    config.last_status = "success"

                    # Log success
                    log = SystemLog(
                        user_id=config.user_id,
                        source="Scraper",
                        level="success",
                        message=f"Found {len(jobs)} jobs from {config.source_name or config.source_url}",
                    )
                    session.add(log)

                except Exception as e:
                    error_msg = f"Error scraping {config.source_url}: {str(e)}"
                    logger.error(error_msg)
                    result["errors"].append(error_msg)
                    config.last_status = "failed"

                    log = SystemLog(
                        user_id=config.user_id,
                        source="Scraper",
                        level="error",
                        message=error_msg,
                    )
                    session.add(log)

                session.commit()

            # Final progress update
            if configs:
                self._update_progress(configs[0].user_id, {
                    "progress": 100,
                    "jobs_found": result["jobs_found"],
                    "sources_completed": result["sources_completed"],
                    "sources_total": result["sources_total"],
                    "current_source": None,
                })

        return result

    def _scrape_source(self, config: ScraperConfig, session: Session) -> list[Job]:
        """Scrape a single source and return created jobs."""
        raw_contents = self._fetch_content(config)
        jobs_created = []

        for content in raw_contents:
            extracted = extract_jobs_from_content(
                text=content.text,
                url=content.url,
                html=content.html,
                metadata=content.metadata,
            )

            for job_data in extracted:
                if not job_data.title:
                    continue

                # Check for duplicate by title + company
                existing = session.execute(
                    select(Job).where(
                        Job.title == job_data.title,
                        Job.company == job_data.company,
                    )
                ).scalar_one_or_none()

                if existing:
                    continue

                job = Job(
                    title=job_data.title,
                    company=job_data.company or config.source_name or "Unknown",
                    location=job_data.location,
                    description=job_data.description,
                    skills=job_data.skills,
                    job_type=job_data.job_type,
                    salary=job_data.salary,
                    apply_link=job_data.apply_link or config.source_url,
                    source_url=content.url or config.source_url,
                    source_name=config.source_name or config.source_type,
                    raw_content=content.text[:10000],
                )
                session.add(job)
                jobs_created.append(job)

        session.flush()

        # Trigger async processing for each job
        from app.workers.tasks import process_job_pipeline
        for job in jobs_created:
            try:
                process_job_pipeline.delay(job.id)
            except Exception as e:
                logger.warning(f"Could not queue job processing for {job.id}: {e}")

        return jobs_created

    def _fetch_content(self, config: ScraperConfig) -> list[RawContent]:
        """Fetch content using the appropriate engine(s)."""
        engine_name = config.scraper_engine
        extra_config = config.config_json or {}

        if engine_name != "auto":
            engine = self._get_engine(engine_name)
            if engine:
                return engine.scrape(config.source_url, extra_config)
            logger.warning(f"Engine {engine_name} not found, falling back to auto")

        # Auto mode: try engines in priority order
        for name in self.ENGINE_PRIORITY:
            engine = self._get_engine(name)
            if not engine:
                continue
            try:
                results = engine.scrape(config.source_url, extra_config)
                if results:
                    logger.info(f"Auto-selected engine: {name} for {config.source_url}")
                    return results
            except Exception as e:
                logger.warning(f"Engine {name} failed for {config.source_url}: {e}")
                continue

        logger.error(f"All engines failed for {config.source_url}")
        return []

    def _update_progress(self, user_id: str, data: dict):
        """Update scraper progress in Redis for WebSocket consumers."""
        try:
            import redis
            settings = get_settings()
            r = redis.from_url(settings.redis_url)
            r.set(f"scraper:status:{user_id}", json.dumps(data), ex=3600)
            r.publish(f"scraper:events:{user_id}", json.dumps(data))
            r.close()
        except Exception as e:
            logger.warning(f"Could not update progress: {e}")

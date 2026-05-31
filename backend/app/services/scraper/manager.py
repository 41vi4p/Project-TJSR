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
from app.services.scraper.playwright_scraper import PlaywrightScraper
from app.services.scraper.rss_scraper import RSSFeedScraper
from app.services.scraper.sitemap_scraper import SitemapScraper
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
        "playwright": PlaywrightScraper,
        "rss": RSSFeedScraper,
        "sitemap": SitemapScraper,
    }

    # Order to try engines when auto-selecting
    ENGINE_PRIORITY = ["bs4", "scrapling", "playwright", "crawl4ai", "selenium", "newspaper"]

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

    def ingest_aggregators(self, providers: list[str] | None = None, limit_per: int = 100) -> dict:
        """
        Pull jobs from public aggregator APIs (RemoteOK, Arbeitnow, The Muse, Adzuna)
        and save them — no source URL needed. Returns a result summary.
        """
        from app.services.scraper.job_aggregator import fetch_all

        result = {"jobs_found": 0, "sources_completed": 0, "sources_total": 0, "errors": []}
        try:
            raw_jobs = fetch_all(providers=providers, limit_per=limit_per)
        except Exception as e:
            result["errors"].append(f"Aggregator fetch failed: {e}")
            return result

        result["sources_total"] = len(set(j["source_name"] for j in raw_jobs)) or 0
        jobs_created = []

        with Session(self.sync_engine) as session:
            from sqlalchemy import text as sql_text
            for jd in raw_jobs:
                if not jd.get("title"):
                    continue
                apply_link = jd.get("apply_link") or ""

                # Dedup by apply_link, then fuzzy title+company
                existing = None
                if apply_link:
                    existing = session.execute(
                        select(Job).where(Job.apply_link == apply_link)
                    ).scalar_one_or_none()
                if not existing:
                    dup = session.execute(sql_text(
                        "SELECT id FROM jobs WHERE similarity(lower(title), :t) > 0.8 "
                        "AND similarity(lower(company), :c) > 0.7 LIMIT 1"
                    ), {"t": jd["title"].lower(), "c": jd["company"].lower()}).fetchone()
                    existing = dup
                if existing:
                    continue

                job = Job(
                    title=jd["title"],
                    company=jd["company"],
                    location=jd["location"],
                    description=jd["description"],
                    skills=jd["skills"],
                    job_type=jd["job_type"],
                    salary=jd["salary"],
                    apply_link=apply_link,
                    source_url=apply_link,
                    source_name=jd["source_name"],
                    date_posted=jd.get("date_posted") or datetime.now(timezone.utc),
                )
                session.add(job)
                jobs_created.append(job)

            session.flush()
            result["jobs_found"] = len(jobs_created)

            # Queue processing pipeline for each new job
            from app.workers.tasks import process_job_pipeline
            for job in jobs_created:
                try:
                    process_job_pipeline.delay(job.id)
                except Exception:
                    try:
                        process_job_pipeline(job.id)  # inline fallback
                    except Exception as e:
                        logger.warning(f"Pipeline failed for {job.id}: {e}")

            session.commit()
            result["sources_completed"] = result["sources_total"]

        logger.info(f"Aggregator ingest: {result['jobs_found']} new jobs")
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

                # Check for duplicate by apply_link first, then title+company
                apply_link = job_data.apply_link or config.source_url
                if apply_link and apply_link != config.source_url:
                    existing = session.execute(
                        select(Job).where(Job.apply_link == apply_link)
                    ).scalar_one_or_none()
                else:
                    # Fuzzy dedup: pg_trgm similarity on normalized title+company
                    from sqlalchemy import text as sql_text
                    norm_title   = job_data.title.lower().strip()
                    norm_company = (job_data.company or config.source_name or "").lower().strip()
                    dup = session.execute(sql_text(
                        "SELECT id FROM jobs WHERE "
                        "similarity(lower(title), :t) > 0.8 AND "
                        "similarity(lower(company), :c) > 0.7 "
                        "LIMIT 1"
                    ), {"t": norm_title, "c": norm_company}).fetchone()
                    existing = dup

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
                    apply_link=apply_link,
                    source_url=content.url or config.source_url,
                    source_name=config.source_name or config.source_type,
                    raw_content=content.text[:10000],
                    date_posted=self._parse_date(job_data.date_posted) or datetime.now(timezone.utc),
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
        """Fetch content using the appropriate engine(s) with retry/backoff."""
        import time

        engine_name  = config.scraper_engine
        extra_config = config.config_json or {}
        max_retries  = 3
        backoff      = 2  # seconds, doubles each retry

        def _try(name: str) -> list[RawContent]:
            engine = self._get_engine(name)
            if not engine:
                return []
            last_err = None
            delay = backoff
            for attempt in range(1, max_retries + 1):
                try:
                    results = engine.scrape(config.source_url, extra_config)
                    if results:
                        return results
                    return []  # empty but not an error — don't retry
                except Exception as e:
                    last_err = e
                    if attempt < max_retries:
                        logger.warning(f"[{name}] attempt {attempt} failed for {config.source_url}: {e} — retrying in {delay}s")
                        time.sleep(delay)
                        delay *= 2
            logger.error(f"[{name}] all {max_retries} attempts failed for {config.source_url}: {last_err}")
            return []

        if engine_name != "auto":
            results = _try(engine_name)
            if results or engine_name not in ("bs4", "scrapling"):
                return results
            logger.warning(f"Engine {engine_name} returned nothing, falling back to auto")

        # Auto mode: try engines in priority order
        for name in self.ENGINE_PRIORITY:
            if engine_name != "auto" and name == engine_name:
                continue  # already tried
            results = _try(name)
            if results:
                logger.info(f"Auto-selected engine: {name} for {config.source_url}")
                return results

        logger.error(f"All engines failed for {config.source_url}")
        return []

    @staticmethod
    def _parse_date(date_str: str) -> "datetime | None":
        """Parse ISO 8601 date string from JSON-LD datePosted."""
        if not date_str:
            return None
        from datetime import datetime, timezone
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(date_str[:19], fmt[:len(date_str[:19])])
                return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
            except ValueError:
                continue
        return None

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

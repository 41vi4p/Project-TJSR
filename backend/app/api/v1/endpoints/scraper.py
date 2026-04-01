from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.scraper_config import ScraperConfig
from app.models.log import SystemLog
from app.schemas.scraper import (
    ScraperConfigCreate, ScraperConfigUpdate, ScraperConfigResponse,
    ScraperRunRequest, ScraperStatus,
    ScraperTestRequest, ScraperTestResult, ExtractedJobResult,
)
import redis as redis_lib
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/configs", response_model=list[ScraperConfigResponse])
async def list_scraper_configs(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user's scraper configurations."""
    result = await db.execute(
        select(ScraperConfig)
        .where(ScraperConfig.user_id == user.id)
        .order_by(ScraperConfig.created_at.desc())
    )
    configs = result.scalars().all()
    return [ScraperConfigResponse.model_validate(c) for c in configs]


@router.post("/configs", response_model=ScraperConfigResponse)
async def create_scraper_config(
    data: ScraperConfigCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new scraper data source."""
    config = ScraperConfig(
        user_id=user.id,
        source_type=data.source_type,
        source_url=data.source_url,
        source_name=data.source_name,
        scraper_engine=data.scraper_engine,
        schedule_cron=data.schedule_cron,
        config_json=data.config_json,
    )
    db.add(config)

    # Log the event
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message=f"Added scraper source: {data.source_name or data.source_url}",
    )
    db.add(log)

    await db.commit()
    await db.refresh(config)
    return ScraperConfigResponse.model_validate(config)


@router.put("/configs/{config_id}", response_model=ScraperConfigResponse)
async def update_scraper_config(
    config_id: str,
    data: ScraperConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a scraper config."""
    result = await db.execute(
        select(ScraperConfig).where(
            ScraperConfig.id == config_id, ScraperConfig.user_id == user.id
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    await db.commit()
    await db.refresh(config)
    return ScraperConfigResponse.model_validate(config)


@router.delete("/configs/{config_id}")
async def delete_scraper_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a scraper config."""
    result = await db.execute(
        select(ScraperConfig).where(
            ScraperConfig.id == config_id, ScraperConfig.user_id == user.id
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    await db.delete(config)
    await db.commit()
    return {"message": "Config deleted"}


@router.post("/run")
async def run_scraper(
    data: ScraperRunRequest = ScraperRunRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger a scraping run."""
    from app.workers.tasks import run_scraper as run_scraper_task

    task = run_scraper_task.delay(
        config_ids=data.config_ids,
        user_id=user.id,
    )

    # Store task id in Redis for status tracking
    from app.config import get_settings
    settings = get_settings()
    r = redis_lib.from_url(settings.redis_url)
    r.set(f"scraper:task:{user.id}", task.id, ex=3600)
    r.close()

    # Log
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level="info",
        message="Scraper run started",
    )
    db.add(log)
    await db.commit()

    return {"task_id": task.id, "status": "started"}


@router.post("/stop")
async def stop_scraper(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stop a running scraper task."""
    from app.config import get_settings
    settings = get_settings()
    r = redis_lib.from_url(settings.redis_url)
    task_id = r.get(f"scraper:task:{user.id}")
    r.close()

    if not task_id:
        raise HTTPException(status_code=404, detail="No running scraper task")

    from app.workers.celery_app import celery_app
    celery_app.control.revoke(task_id.decode(), terminate=True)

    return {"message": "Scraper stopped"}


@router.get("/status", response_model=ScraperStatus)
async def scraper_status(
    user: User = Depends(get_current_user),
):
    """Get current scraper status."""
    from app.config import get_settings
    settings = get_settings()
    r = redis_lib.from_url(settings.redis_url)

    task_id = r.get(f"scraper:task:{user.id}")
    status_data = r.get(f"scraper:status:{user.id}")
    r.close()

    if not task_id:
        return ScraperStatus(is_running=False)

    status = ScraperStatus(is_running=True, current_task_id=task_id.decode())

    if status_data:
        data = json.loads(status_data)
        status.progress = data.get("progress", 0)
        status.jobs_found = data.get("jobs_found", 0)
        status.sources_completed = data.get("sources_completed", 0)
        status.sources_total = data.get("sources_total", 0)
        status.current_source = data.get("current_source")
        status.errors = data.get("errors", [])

    return status


@router.websocket("/ws")
async def scraper_websocket(websocket: WebSocket):
    """WebSocket for real-time scraper progress updates."""
    await websocket.accept()

    from app.config import get_settings
    settings = get_settings()

    try:
        # Get user token from query params
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Missing token")
            return

        from app.services.firebase_auth import verify_firebase_token
        claims = await verify_firebase_token(token)
        if not claims:
            await websocket.close(code=4001, reason="Invalid token")
            return

        user_uid = claims.get("uid")

        # Subscribe to Redis pub/sub for this user's scraper events
        r = redis_lib.from_url(settings.redis_url)
        pubsub = r.pubsub()
        pubsub.subscribe(f"scraper:events:{user_uid}")

        import asyncio
        while True:
            message = pubsub.get_message(timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"].decode())

            # Check if client sent anything (keepalive/close)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
            except asyncio.TimeoutError:
                pass

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        try:
            pubsub.unsubscribe()
            r.close()
        except Exception:
            pass


@router.post("/run/sync")
async def run_scraper_sync(
    data: ScraperRunRequest = ScraperRunRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Run the scraper synchronously (no Celery worker required).
    Saves jobs to the database and returns a full result summary.
    """
    import asyncio
    from functools import partial
    from app.services.scraper.manager import ScraperManager

    loop = asyncio.get_event_loop()
    manager = ScraperManager()

    try:
        result = await loop.run_in_executor(
            None,
            partial(manager.run, data.config_ids, user.id),
        )
    except Exception as e:
        logger.error(f"Sync scraper run failed: {e}")
        result = {"jobs_found": 0, "sources_completed": 0, "sources_total": 0, "errors": [str(e)]}

    level = "success" if result["jobs_found"] > 0 else ("error" if result["errors"] else "warning")
    log = SystemLog(
        user_id=user.id,
        source="Scraper",
        level=level,
        message=(
            f"Sync run: {result['jobs_found']} jobs from "
            f"{result['sources_completed']}/{result['sources_total']} sources"
            + (f" | Errors: {len(result['errors'])}" if result["errors"] else "")
        ),
    )
    db.add(log)
    await db.commit()

    return result


@router.post("/test", response_model=ScraperTestResult)
async def test_scrape(
    data: ScraperTestRequest,
    user: User = Depends(get_current_user),
):
    """Test-scrape a URL without saving to the database. Returns raw content + extracted jobs."""
    import time
    import asyncio
    from functools import partial
    from app.services.scraper.bs4_scraper import BS4Scraper
    from app.services.scraper.selenium_scraper import SeleniumScraper
    from app.services.scraper.scrapling_scraper import ScraplingEngine
    from app.services.scraper.crawl4ai_scraper import Crawl4AIScraper
    from app.services.scraper.newspaper_scraper import NewspaperScraper
    from app.services.scraper.phenom_scraper import PhenomScraper
    from app.services.scraper.google_careers_scraper import GoogleCareersScraper
    from app.services.scraper.nlp_extractor import extract_jobs_from_content

    ENGINE_MAP = {
        "bs4": BS4Scraper,
        "selenium": SeleniumScraper,
        "scrapling": ScraplingEngine,
        "crawl4ai": Crawl4AIScraper,
        "newspaper": NewspaperScraper,
        "phenom": PhenomScraper,
        "google_careers": GoogleCareersScraper,
    }
    ENGINE_PRIORITY = ["bs4", "scrapling", "crawl4ai", "selenium", "newspaper"]

    errors: list[str] = []
    raw_contents = []
    engine_used = data.engine
    config = data.config_json or {}
    start = time.time()
    loop = asyncio.get_event_loop()

    def _get_instance(name: str):
        try:
            return ENGINE_MAP[name]()
        except Exception as e:
            errors.append(f"Could not instantiate engine '{name}': {e}")
            return None

    async def _try_engine(name: str) -> list:
        inst = _get_instance(name)
        if not inst:
            return []
        try:
            return await loop.run_in_executor(None, partial(inst.scrape, data.url, config))
        except Exception as e:
            errors.append(f"Engine '{name}' failed: {e}")
            return []

    if data.engine != "auto":
        raw_contents = await _try_engine(data.engine)
        if not raw_contents:
            engine_used = "auto (fallback)"

    if not raw_contents:
        for name in ENGINE_PRIORITY:
            if data.engine != "auto" and name == data.engine:
                continue  # Already tried
            result = await _try_engine(name)
            if result:
                raw_contents = result
                engine_used = name
                break

    elapsed = round(time.time() - start, 2)

    if not raw_contents:
        return ScraperTestResult(
            engine_used=engine_used,
            url=data.url,
            raw_text_preview="",
            raw_text_length=0,
            links_found=0,
            jobs_extracted=[],
            errors=errors or ["All engines returned no content"],
            elapsed_seconds=elapsed,
        )

    # Combine all raw content for display
    all_text = "\n\n---\n\n".join(c.text for c in raw_contents if c.text)
    all_links = [link for c in raw_contents for link in (c.links or [])]

    # Run NLP extraction on each content block
    jobs_extracted: list[ExtractedJobResult] = []
    for content in raw_contents:
        extracted = extract_jobs_from_content(
            text=content.text,
            url=content.url or data.url,
            html=content.html or "",
            metadata=content.metadata or {},
        )
        for job in extracted:
            jobs_extracted.append(ExtractedJobResult(
                title=job.title,
                company=job.company,
                location=job.location,
                description=job.description[:500],
                skills=job.skills,
                job_type=job.job_type,
                salary=job.salary,
                apply_link=job.apply_link,
            ))

    return ScraperTestResult(
        engine_used=engine_used,
        url=data.url,
        raw_text_preview=all_text[:3000],
        raw_text_length=len(all_text),
        links_found=len(set(all_links)),
        jobs_extracted=jobs_extracted,
        errors=errors,
        elapsed_seconds=elapsed,
    )

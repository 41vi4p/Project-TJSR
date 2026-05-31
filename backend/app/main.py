from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.services.firebase_auth import init_firebase
from app.api.v1.router import api_router
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(f"Starting {settings.app_name}")

    # Initialize Firebase
    init_firebase()

    # ── Blocking Startup Tasks (Database Schema) ──────────────────────
    try:
        from app.models.database import engine
        from app.models import Base
        from sqlalchemy import text

        async with engine.begin() as conn:
            # 1. Create base tables
            await conn.run_sync(Base.metadata.create_all)

            # 2. Apply additive columns and extensions
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            for _sql in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_skills JSONB",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR",
                "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS match_score   INTEGER DEFAULT 0",
                "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS raw_content   TEXT",
                "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS date_posted   TIMESTAMPTZ",
                "ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT TRUE",
                "ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS email_list JSONB DEFAULT '[]'::jsonb",
            ]:
                try:
                    await conn.execute(text(_sql))
                except Exception:
                    pass
        logger.info("Database schema verified and ready.")
    except Exception as e:
        logger.error(f"Critical startup migration failed: {e}")

    # ── Non-blocking Background Tasks (Indexes & Qdrant) ──────────────
    async def run_remaining_tasks():
        try:
            from app.models.database import engine
            from sqlalchemy import text
            async with engine.begin() as conn:
                for _sql in [
                    "CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops)",
                    "CREATE INDEX IF NOT EXISTS idx_jobs_skills_gin ON jobs USING gin (skills)",
                ]:
                    try:
                        await conn.execute(text(_sql))
                    except Exception:
                        pass

            from app.services.rag.indexer import ensure_collections
            import asyncio
            await asyncio.get_event_loop().run_in_executor(None, ensure_collections)
            logger.info("Background indexing services ready")

            # Reclassify jobs where is_tech is NULL (new improved classifier)
            await asyncio.get_event_loop().run_in_executor(None, _reclassify_unclassified)
        except Exception as e:
            logger.warning(f"Background task warning: {e}")

    import asyncio
    asyncio.create_task(run_remaining_tasks())

    yield

    # Cleanup
    from app.models.database import engine
    await engine.dispose()
    logger.info("Application shutdown complete")


def _reclassify_unclassified():
    """Reclassify jobs where is_tech is NULL using the improved keyword+ML classifier."""
    try:
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.job import Job
        from app.services.classifier.predictor import classify_job_by_id
        from app.config import get_settings
        settings = get_settings()
        engine = create_engine(settings.sync_database_url)
        with Session(engine) as session:
            jobs = session.execute(
                select(Job.id).where(Job.is_tech == None).limit(500)  # noqa: E711
            ).scalars().all()
        logger.info(f"Reclassifying {len(jobs)} unclassified jobs")
        for job_id in jobs:
            try:
                classify_job_by_id(job_id)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Reclassification failed: {e}")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Backend API for TJSR - Tracker for Job Search and Reporting",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting
    try:
        from slowapi import Limiter, _rate_limit_exceeded_handler
        from slowapi.util import get_remote_address
        from slowapi.errors import RateLimitExceeded
        limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    except ImportError:
        pass  # slowapi optional — install with: pip install slowapi

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()

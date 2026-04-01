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

    # Create database tables (for development - use Alembic in production)
    from app.models.database import engine
    from app.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables created")

    # Ensure Qdrant collections exist
    try:
        from app.services.rag.indexer import ensure_collections
        import asyncio
        await asyncio.get_event_loop().run_in_executor(None, ensure_collections)
        logger.info("Qdrant collections ready")
    except Exception as e:
        logger.warning(f"Qdrant collection init failed (non-fatal): {e}")

    yield

    # Cleanup
    from app.models.database import engine
    await engine.dispose()
    logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Backend API for TJSR - Tracker for Job Search and Reporting",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API router
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()

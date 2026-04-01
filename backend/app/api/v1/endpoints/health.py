from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.database import get_db

router = APIRouter()


@router.get("")
async def health_check(db: AsyncSession = Depends(get_db)):
    services = {}

    # PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        services["postgres"] = "healthy"
    except Exception as e:
        services["postgres"] = f"unhealthy: {e}"

    # Redis
    try:
        import redis as redis_lib
        from app.config import get_settings
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        r.ping()
        services["redis"] = "healthy"
        r.close()
    except Exception as e:
        services["redis"] = f"unhealthy: {e}"

    # Neo4j
    try:
        from app.config import get_settings
        settings = get_settings()
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
        driver.verify_connectivity()
        services["neo4j"] = "healthy"
        driver.close()
    except Exception as e:
        services["neo4j"] = f"unhealthy: {e}"

    # Qdrant
    try:
        from qdrant_client import QdrantClient
        from app.config import get_settings
        settings = get_settings()
        client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port, timeout=5)
        client.get_collections()
        services["qdrant"] = "healthy"
        client.close()
    except Exception as e:
        services["qdrant"] = f"unhealthy: {e}"

    # Ollama
    try:
        import httpx
        from app.config import get_settings
        settings = get_settings()
        resp = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=5)
        if resp.status_code == 200:
            services["ollama"] = "healthy"
        else:
            services["ollama"] = f"unhealthy: status {resp.status_code}"
    except Exception as e:
        services["ollama"] = f"unhealthy: {e}"

    all_healthy = all(v == "healthy" for v in services.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services,
    }

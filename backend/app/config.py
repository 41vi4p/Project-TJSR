from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "TJSR Backend"
    debug: bool = True

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://tjsr:tjsr_secret@localhost:5432/tjsr_db"
    sync_database_url: str = "postgresql://tjsr:tjsr_secret@localhost:5432/tjsr_db"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "tjsr_secret"

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:latest"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Embedding
    embedding_model: str = "all-MiniLM-L6-v2"

    # Firebase
    firebase_service_account_key: str = "../firebase-service-account.json"
    firebase_project_id: str = ""

    # Telegram
    telegram_bot_token: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Backend
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

from pydantic import BaseModel
from datetime import datetime


class ScraperConfigCreate(BaseModel):
    source_type: str  # career_page, social_media, custom_url
    source_url: str
    source_name: str | None = None
    scraper_engine: str = "auto"
    schedule_cron: str | None = None
    config_json: dict | None = None


class ScraperConfigUpdate(BaseModel):
    source_name: str | None = None
    enabled: bool | None = None
    scraper_engine: str | None = None
    schedule_cron: str | None = None
    config_json: dict | None = None


class ScraperConfigResponse(BaseModel):
    id: str
    source_type: str
    source_url: str
    source_name: str | None = None
    enabled: bool
    schedule_cron: str | None = None
    last_run_at: datetime | None = None
    last_status: str | None = None
    scraper_engine: str
    config_json: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScraperRunRequest(BaseModel):
    config_ids: list[str] | None = None  # None = run all enabled


class ScraperStatus(BaseModel):
    is_running: bool
    current_task_id: str | None = None
    progress: int = 0  # 0-100
    jobs_found: int = 0
    sources_completed: int = 0
    sources_total: int = 0
    current_source: str | None = None
    errors: list[str] = []


class ScraperTestRequest(BaseModel):
    url: str
    engine: str = "auto"
    config_json: dict | None = None


class ExtractedJobResult(BaseModel):
    title: str
    company: str
    location: str
    description: str
    skills: list[str]
    job_type: str
    salary: str
    apply_link: str


class ScraperTestResult(BaseModel):
    engine_used: str
    url: str
    raw_text_preview: str  # First 2000 chars of raw text
    raw_text_length: int
    links_found: int
    jobs_extracted: list[ExtractedJobResult]
    errors: list[str]
    elapsed_seconds: float

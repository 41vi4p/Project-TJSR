from pydantic import BaseModel
from datetime import datetime


class JobBase(BaseModel):
    title: str
    company: str
    location: str | None = None
    description: str | None = None
    skills: list[str] = []
    job_type: str | None = None
    salary: str | None = None
    apply_link: str | None = None


class JobCreate(JobBase):
    source_url: str | None = None
    source_name: str | None = None


class JobResponse(JobBase):
    id: str
    source_url: str | None = None
    source_name: str | None = None
    is_tech: bool | None = None
    confidence_score: float | None = None
    match_score: int = 0
    date_posted: datetime | None = None
    date_scraped: datetime
    created_at: datetime

    model_config = {"from_attributes": True}

    # Alias matchScore for frontend compatibility
    @property
    def matchScore(self) -> int:
        return self.match_score


class JobFilter(BaseModel):
    search: str | None = None
    location: str | None = None
    job_type: str | None = None
    is_tech: bool | None = None
    min_confidence: float | None = None
    skills: list[str] | None = None
    sort_by: str = "date_scraped"
    sort_order: str = "desc"
    page: int = 1
    page_size: int = 20


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

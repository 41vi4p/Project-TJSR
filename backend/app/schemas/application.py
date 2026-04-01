from pydantic import BaseModel
from datetime import datetime


class ApplicationCreate(BaseModel):
    job_id: str
    status: str = "applied"
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class ApplicationResponse(BaseModel):
    id: str
    user_id: str
    job_id: str
    status: str
    applied_date: datetime
    notes: str | None = None
    updated_at: datetime
    job: "JobBrief | None" = None

    model_config = {"from_attributes": True}


class JobBrief(BaseModel):
    id: str
    title: str
    company: str
    location: str | None = None

    model_config = {"from_attributes": True}


class ApplicationStats(BaseModel):
    total: int
    applied: int
    under_review: int
    interview_scheduled: int
    rejected: int
    offer: int
    accepted: int
    response_rate: float

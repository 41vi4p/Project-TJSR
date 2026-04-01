from pydantic import BaseModel
from datetime import datetime


class DashboardStats(BaseModel):
    total_jobs: int
    jobs_today: int
    matched_jobs: int
    applications_sent: int
    total_jobs_change: float = 0
    jobs_today_change: float = 0
    matched_jobs_change: float = 0
    applications_change: float = 0


class ActivityItem(BaseModel):
    id: str
    type: str  # applied, matched, analyzed, interview, scraped
    message: str
    timestamp: datetime
    metadata: dict = {}

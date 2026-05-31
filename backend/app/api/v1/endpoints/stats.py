from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.job import Job
from app.models.application import Application
from app.models.log import SystemLog
from app.schemas.stats import DashboardStats, ActivityItem

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get aggregated dashboard statistics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    # Total jobs
    total_jobs_result = await db.execute(select(func.count()).select_from(Job))
    total_jobs = total_jobs_result.scalar()

    # Jobs today
    jobs_today_result = await db.execute(
        select(func.count()).select_from(Job).where(Job.date_scraped >= today_start)
    )
    jobs_today = jobs_today_result.scalar()

    # Jobs yesterday (for change calculation)
    jobs_yesterday_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.date_scraped >= yesterday_start, Job.date_scraped < today_start)
        )
    )
    jobs_yesterday = jobs_yesterday_result.scalar()

    # Matched jobs — jobs with match_score > 0 (set by _compute_match_scores for this user's resume)
    # Also count jobs where user's resume skills overlap (fallback if match_score not yet computed)
    matched_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.match_score > 0, Job.is_active == True)
        )
    )
    matched_jobs = matched_result.scalar()

    # Matched jobs this week vs last week for change %
    matched_this_week_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.match_score > 0, Job.is_active == True, Job.date_scraped >= week_ago)
        )
    )
    matched_this_week = matched_this_week_result.scalar()

    matched_last_week_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.match_score > 0, Job.is_active == True,
                 Job.date_scraped >= two_weeks_ago, Job.date_scraped < week_ago)
        )
    )
    matched_last_week = matched_last_week_result.scalar()

    # Change calculations (this week vs last week)
    this_week_result = await db.execute(
        select(func.count()).select_from(Job).where(Job.date_scraped >= week_ago)
    )
    this_week = this_week_result.scalar()

    last_week_result = await db.execute(
        select(func.count()).select_from(Job).where(
            and_(Job.date_scraped >= two_weeks_ago, Job.date_scraped < week_ago)
        )
    )
    last_week = last_week_result.scalar()

    def _pct_change(current: int, previous: int) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(max(-100, min(100, ((current - previous) / previous) * 100)), 1)

    total_change   = _pct_change(this_week, last_week)
    today_change   = _pct_change(jobs_today, jobs_yesterday)
    matched_change = _pct_change(matched_this_week, matched_last_week)

    return DashboardStats(
        total_jobs=total_jobs,
        jobs_today=jobs_today,
        matched_jobs=matched_jobs,
        applications_sent=0,
        total_jobs_change=total_change,
        jobs_today_change=today_change,
        matched_jobs_change=matched_change,
        applications_change=0,
    )


@router.get("/activity", response_model=list[ActivityItem])
async def recent_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get recent activity feed."""
    activities = []

    # Recent applications
    apps_result = await db.execute(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.applied_date.desc())
        .limit(limit)
    )
    for app in apps_result.scalars():
        activities.append(ActivityItem(
            id=app.id,
            type="applied",
            message=f"Applied to job",
            timestamp=app.applied_date,
            metadata={"job_id": app.job_id, "status": app.status},
        ))

    # Recent logs
    logs_result = await db.execute(
        select(SystemLog)
        .where(SystemLog.user_id == user.id)
        .order_by(SystemLog.created_at.desc())
        .limit(limit)
    )
    for log in logs_result.scalars():
        activities.append(ActivityItem(
            id=log.id,
            type=log.level,
            message=log.message,
            timestamp=log.created_at,
            metadata={"source": log.source},
        ))

    # Sort by timestamp and limit
    activities.sort(key=lambda x: x.timestamp, reverse=True)
    return activities[:limit]

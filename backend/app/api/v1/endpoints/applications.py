from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.application import Application
from app.models.job import Job
from app.schemas.application import (
    ApplicationCreate, ApplicationUpdate, ApplicationResponse, ApplicationStats
)

router = APIRouter()


@router.get("", response_model=list[ApplicationResponse])
async def list_applications(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List user's applications."""
    query = select(Application).where(Application.user_id == user.id).options(
        selectinload(Application.job)
    )
    if status:
        query = query.where(Application.status == status)
    query = query.order_by(Application.applied_date.desc())

    result = await db.execute(query)
    apps = result.scalars().all()
    return [ApplicationResponse.model_validate(a) for a in apps]


@router.post("", response_model=ApplicationResponse)
async def create_application(
    data: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new application tracking entry."""
    # Verify job exists
    job = await db.execute(select(Job).where(Job.id == data.job_id))
    if not job.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    # Check for duplicate
    existing = await db.execute(
        select(Application).where(
            Application.user_id == user.id,
            Application.job_id == data.job_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already applied to this job")

    app = Application(
        user_id=user.id,
        job_id=data.job_id,
        status=data.status,
        notes=data.notes,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app, attribute_names=["job"])
    return ApplicationResponse.model_validate(app)


@router.put("/{app_id}", response_model=ApplicationResponse)
async def update_application(
    app_id: str,
    data: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update application status or notes."""
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user.id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if data.status is not None:
        app.status = data.status
    if data.notes is not None:
        app.notes = data.notes

    await db.commit()
    await db.refresh(app)
    return ApplicationResponse.model_validate(app)


@router.delete("/{app_id}")
async def delete_application(
    app_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete an application."""
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user.id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    await db.delete(app)
    await db.commit()
    return {"message": "Application deleted"}


@router.get("/stats", response_model=ApplicationStats)
async def get_application_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get aggregated application stats."""
    result = await db.execute(
        select(Application.status, func.count()).where(
            Application.user_id == user.id
        ).group_by(Application.status)
    )
    status_counts = dict(result.all())

    total = sum(status_counts.values())
    responded = sum(
        status_counts.get(s, 0)
        for s in ["under_review", "interview_scheduled", "offer", "accepted", "rejected"]
    )

    return ApplicationStats(
        total=total,
        applied=status_counts.get("applied", 0),
        under_review=status_counts.get("under_review", 0),
        interview_scheduled=status_counts.get("interview_scheduled", 0),
        rejected=status_counts.get("rejected", 0),
        offer=status_counts.get("offer", 0),
        accepted=status_counts.get("accepted", 0),
        response_rate=round(responded / total * 100, 1) if total > 0 else 0,
    )

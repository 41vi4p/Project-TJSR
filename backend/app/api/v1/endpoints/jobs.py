from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, asc
from app.models.database import get_db
from app.dependencies import get_current_user, get_optional_user
from app.models.user import User
from app.models.job import Job
from app.schemas.job import JobCreate, JobResponse, JobListResponse

router = APIRouter()


@router.get("", response_model=JobListResponse)
async def list_jobs(
    search: str | None = Query(None),
    location: str | None = Query(None),
    job_type: str | None = Query(None),
    is_tech: bool | None = Query(None),
    min_confidence: float | None = Query(None),
    skills: str | None = Query(None),  # comma-separated
    sort_by: str = Query("date_scraped"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """List jobs with filtering and pagination."""
    query = select(Job)

    # Apply filters
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Job.title.ilike(search_pattern),
                Job.company.ilike(search_pattern),
                Job.description.ilike(search_pattern),
            )
        )

    if location:
        query = query.where(Job.location.ilike(f"%{location}%"))

    if job_type:
        query = query.where(Job.job_type == job_type)

    if is_tech is not None:
        query = query.where(Job.is_tech == is_tech)

    if min_confidence is not None:
        query = query.where(Job.confidence_score >= min_confidence)

    if skills:
        skill_list = [s.strip() for s in skills.split(",")]
        for skill in skill_list:
            query = query.where(Job.skills.op("@>")(f'["{skill}"]'))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Sorting
    sort_col = getattr(Job, sort_by, Job.date_scraped)
    if sort_order == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        jobs=[JobResponse.model_validate(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single job by ID."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse.model_validate(job)


@router.post("", response_model=JobResponse)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually create a job entry."""
    job = Job(
        title=job_data.title,
        company=job_data.company,
        location=job_data.location,
        description=job_data.description,
        skills=job_data.skills,
        job_type=job_data.job_type,
        salary=job_data.salary,
        apply_link=job_data.apply_link,
        source_url=job_data.source_url,
        source_name=job_data.source_name or "manual",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Trigger async processing pipeline
    from app.workers.tasks import process_job_pipeline
    process_job_pipeline.delay(job.id)

    return JobResponse.model_validate(job)


@router.get("/search/semantic")
async def semantic_search(
    q: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search jobs using semantic similarity via Qdrant."""
    from app.services.rag.retriever import search_similar_jobs

    results = await search_similar_jobs(q, limit=limit)
    if not results:
        return {"jobs": [], "total": 0}

    job_ids = [r["job_id"] for r in results]
    result = await db.execute(select(Job).where(Job.id.in_(job_ids)))
    jobs = result.scalars().all()
    jobs_map = {j.id: j for j in jobs}

    response_jobs = []
    for r in results:
        job = jobs_map.get(r["job_id"])
        if job:
            job_resp = JobResponse.model_validate(job)
            response_jobs.append({"job": job_resp, "relevance_score": r["score"]})

    return {"jobs": response_jobs, "total": len(response_jobs)}

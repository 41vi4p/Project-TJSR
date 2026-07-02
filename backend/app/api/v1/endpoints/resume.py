import json
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.models.user import User
from app.dependencies import get_current_user
from app.services.resume.skill_extractor import parse_resume, generate_embedding
from app.services.firebase_auth import upload_file_to_storage

router = APIRouter()

_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
_ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Upload a resume (PDF / DOCX / TXT).
    Extracts skills using keyword matching and stores them on the user.
    Returns the extracted skill list.
    """
    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        if file.content_type != "application/octet-stream":
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Upload PDF, DOCX, or TXT.",
            )

    data = await file.read()
    if len(data) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5 MB.")

    filename = file.filename or "resume.pdf"
    _text, skills = parse_resume(filename, data)

    # Upload to Firebase Storage
    resume_url = upload_file_to_storage(
        user_id=user.firebase_uid,
        filename=filename,
        content=data,
        content_type=file.content_type or "application/pdf",
    )

    if not skills:
        return {
            "skills": [],
            "resume_url": resume_url or None,
            "message": "No recognisable tech skills found in the resume. "
                       "Make sure the file contains readable text.",
        }

    try:
        await db.execute(
            sql_text(
                "UPDATE users SET resume_skills = CAST(:skills AS JSONB) "
                "WHERE firebase_uid = :uid"
            ),
            {"skills": json.dumps(skills), "uid": user.firebase_uid},
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Resume skills could not be saved. "
                   "Please restart the backend server to apply pending migrations.",
        ) from e

    # Generate embedding + compute matches in background (non-blocking)
    import asyncio
    from functools import partial
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        partial(_run_matching_pipeline, user.firebase_uid, _text, skills),
    )

    return {
        "skills": skills,
        "resume_url": resume_url or None,
        "count": len(skills),
        "message": f"Extracted {len(skills)} skills from your resume.",
    }


def _run_matching_pipeline(uid: str, text: str, skills: list[str]) -> None:
    """Sync wrapper: generate embedding and compute matched jobs (runs in executor)."""
    try:
        from app.services.resume.skill_extractor import generate_embedding
        from app.services.firebase_sync import compute_and_store_matched_jobs, get_firestore
        from datetime import datetime, timezone

        embedding = generate_embedding(text)

        db = get_firestore()
        if embedding and db:
            db.collection("users").document(uid).set({
                "resume_text":       text[:5000],
                "resume_embedding":  embedding,
                "resume_updated_at": datetime.now(timezone.utc),
            }, merge=True)

        compute_and_store_matched_jobs(uid, text, skills, embedding)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"_run_matching_pipeline failed for {uid}: {exc}")


@router.get("/skills")
async def get_resume_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the skills extracted from the user's most-recently uploaded resume."""
    try:
        row = await db.execute(
            sql_text("SELECT resume_skills FROM users WHERE firebase_uid = :uid"),
            {"uid": user.firebase_uid},
        )
        result = row.fetchone()
        skills = (result[0] or []) if result else []
    except Exception:
        skills = getattr(user, "resume_skills", None) or []
    return {"skills": skills, "count": len(skills)}


@router.get("/recommendations")
async def get_job_recommendations(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return jobs ranked by hybrid keyword + semantic similarity to user's resume."""
    from sqlalchemy import select, desc
    from app.models.job import Job
    from datetime import datetime, timezone, timedelta

    # Fetch user's skills
    row = await db.execute(
        sql_text("SELECT resume_skills FROM users WHERE firebase_uid = :uid"),
        {"uid": user.firebase_uid},
    )
    result = row.fetchone()
    skills: list[str] = (result[0] or []) if result else []

    if not skills:
        return {"jobs": [], "skills": [], "message": "Upload a resume first to get recommendations."}

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    jobs_result = await db.execute(
        select(Job).where(Job.is_tech == True, Job.date_scraped >= cutoff)
        .order_by(desc(Job.date_scraped)).limit(500)
    )
    jobs = jobs_result.scalars().all()

    user_skills_lower = {s.lower() for s in skills}

    # Keyword overlap scores
    keyword_scores: dict[str, float] = {}
    for job in jobs:
        job_skills = [s.lower() for s in (job.skills or [])]
        matched = [s for s in job_skills if s in user_skills_lower]
        if matched:
            keyword_scores[job.id] = len(matched) / max(len(job_skills), 1)

    # Semantic scores via Qdrant (embed resume skills as query)
    semantic_scores: dict[str, float] = {}
    try:
        from app.services.rag.embedder import embed_text
        from app.services.rag.indexer import get_qdrant_client, JOB_COLLECTION
        resume_query = "Skills: " + ", ".join(skills[:30])
        embedding = embed_text(resume_query)
        if embedding:
            client = get_qdrant_client()
            if client:
                results = client.search(
                    collection_name=JOB_COLLECTION,
                    query_vector=embedding,
                    limit=200,
                    with_payload=True,
                )
                for r in results:
                    semantic_scores[r.payload.get("job_id", "")] = r.score
                client.close()
    except Exception:
        pass  # Qdrant unavailable — fall back to keyword only

    # Blend: 60% keyword + 40% semantic
    scored = []
    for job in jobs:
        kw  = keyword_scores.get(job.id, 0.0)
        sem = semantic_scores.get(job.id, 0.0)
        if kw == 0 and sem < 0.5:
            continue
        blended = round((kw * 0.6 + sem * 0.4) * 100)
        job_skills_lower = [s.lower() for s in (job.skills or [])]
        matched = [s for s in job_skills_lower if s in user_skills_lower]
        missing = [s for s in job_skills_lower if s not in user_skills_lower]
        scored.append({
            "id": job.id,
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "salary": job.salary,
            "job_type": job.job_type,
            "skills": job.skills,
            "apply_link": job.apply_link,
            "date_scraped": job.date_scraped.isoformat() if job.date_scraped else None,
            "match_score": blended,
            "matched_skills": matched,
            "missing_skills": missing[:5],
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return {"jobs": scored[:limit], "skills": skills, "total": len(scored)}


@router.post("/recompute-matches")
async def recompute_match_scores(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Recompute match_score for all jobs based on the current user's resume skills.
    Call this after uploading a resume to refresh recommendations.
    """
    import asyncio
    from functools import partial
    from app.workers.tasks import _compute_match_scores
    from app.models.job import Job

    row = await db.execute(
        sql_text("SELECT resume_skills FROM users WHERE firebase_uid = :uid"),
        {"uid": user.firebase_uid},
    )
    result = row.fetchone()
    skills: list[str] = (result[0] or []) if result else []

    if not skills:
        return {"message": "No resume skills found. Upload a resume first.", "updated": 0}

    # Get all job IDs with skills
    jobs_result = await db.execute(
        sql_text("SELECT id FROM jobs WHERE skills IS NOT NULL AND jsonb_array_length(skills) > 0")
    )
    job_ids = [r[0] for r in jobs_result.fetchall()]

    # Run in executor to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(_bulk_score_jobs, job_ids, skills))

    return {"message": f"Recomputed match scores for {len(job_ids)} jobs.", "updated": len(job_ids)}


def _bulk_score_jobs(job_ids: list[str], user_skills: list[str]):
    """Update match_score for all jobs based on user skills (sync, runs in executor)."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.config import get_settings

    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    user_skills_lower = {s.lower() for s in user_skills}

    with Session(engine) as session:
        jobs = session.execute(select(Job).where(Job.id.in_(job_ids))).scalars().all()
        for job in jobs:
            job_skills_lower = {s.lower() for s in (job.skills or [])}
            matched = len(job_skills_lower & user_skills_lower)
            if matched:
                job.match_score = round(matched / max(len(job_skills_lower), 1) * 100)
        session.commit()


@router.get("/status")
async def get_resume_status(user: User = Depends(get_current_user)):
    """Check the current processing status of the resume queue entry for this user."""
    try:
        from app.services.firebase_sync import get_firestore
        db = get_firestore()
        if not db:
            return {"status": "unknown", "message": "Firestore unavailable"}
        doc = db.collection("resume_queue").document(user.firebase_uid).get()
        if not doc.exists:
            return {"status": "none", "message": "No resume queued"}
        d = doc.to_dict() or {}
        return {
            "status":       d.get("status", "unknown"),
            "skills_count": d.get("skills_count"),
            "queued_at":    d.get("queued_at"),
            "processed_at": d.get("processed_at"),
            "error":        d.get("error"),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@router.get("/matched-jobs")
async def get_matched_jobs(
    limit: int = 50,
    user: User = Depends(get_current_user),
):
    """Return the pre-computed matched jobs stored in Firestore users/{uid}.matched_jobs."""
    try:
        from app.services.firebase_sync import get_firestore
        db = get_firestore()
        if not db:
            raise HTTPException(status_code=503, detail="Firestore unavailable")
        doc = db.collection("users").document(user.firebase_uid).get()
        if not doc.exists:
            return {"jobs": [], "count": 0, "message": "Upload a resume first."}
        d = doc.to_dict() or {}
        jobs = d.get("matched_jobs") or []
        updated_at = d.get("matched_jobs_updated_at")
        return {
            "jobs":       jobs[:limit],
            "count":      len(jobs),
            "updated_at": updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at) if updated_at else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/recompute")
async def recompute_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-trigger matching pipeline using the stored resume embedding."""
    import asyncio
    from functools import partial

    # Load existing data from Firestore
    try:
        from app.services.firebase_sync import get_firestore
        fdb = get_firestore()
        doc = fdb.collection("users").document(user.firebase_uid).get() if fdb else None
        d = (doc.to_dict() or {}) if (doc and doc.exists) else {}
        embedding  = d.get("resume_embedding", [])
        text       = d.get("resume_text", "")
    except Exception:
        embedding, text = [], ""

    row = await db.execute(
        sql_text("SELECT resume_skills FROM users WHERE firebase_uid = :uid"),
        {"uid": user.firebase_uid},
    )
    result = row.fetchone()
    skills: list[str] = (result[0] or []) if result else []

    if not skills and not embedding:
        raise HTTPException(status_code=400, detail="No resume data found. Upload a resume first.")

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        partial(_run_matching_pipeline, user.firebase_uid, text, skills),
    )
    return {"message": "Matching started in background. Check /resume/matched-jobs in ~30 seconds."}


@router.delete("/skills")
async def clear_resume_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clear extracted resume skills for the current user."""
    await db.execute(
        sql_text("UPDATE users SET resume_skills = NULL WHERE firebase_uid = :uid"),
        {"uid": user.firebase_uid},
    )
    await db.commit()
    return {"message": "Resume skills cleared."}

"""
Firebase Firestore sync service.

The local backend is the sole writer to Firestore. After each job is scraped
and processed it is pushed here so the public Vercel frontend can read job
data and stats without touching the local backend directly.

Public collection layout
─────────────────────────
jobs/{jobId}               — one document per job
stats/dashboard            — aggregated dashboard counters
users/{firebaseUid}        — resume_skills + prefs (owner-only via security rules)
resume_queue/{firebaseUid} — upload queue written by public frontend, consumed here
"""

import json
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

_firestore_client = None


# ─── Client ──────────────────────────────────────────────────────────────────

def get_firestore():
    """Lazy-initialise and return the Firestore client (or None on failure)."""
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client

    try:
        from firebase_admin import firestore
        from app.services.firebase_auth import init_firebase
        init_firebase()
        _firestore_client = firestore.client()
        logger.info("Firestore client ready")
    except Exception as exc:
        logger.error(f"Firestore init failed: {exc}")
        _firestore_client = None

    return _firestore_client


# ─── Job sync ────────────────────────────────────────────────────────────────

def _job_to_doc(job) -> dict:
    """Serialise a SQLAlchemy Job into a Firestore-safe dict."""
    return {
        "id":               job.id,
        "title":            job.title,
        "company":          job.company,
        "location":         job.location or "",
        # Trim description — Firestore docs are capped at 1 MB
        "description":      (job.description or "")[:5_000],
        "skills":           job.skills or [],
        "job_type":         job.job_type or "",
        "salary":           job.salary or "",
        "apply_link":       job.apply_link or "",
        "source_url":       job.source_url or "",
        "source_name":      job.source_name or "",
        "is_tech":          job.is_tech,
        "is_active":        job.is_active,
        "confidence_score": job.confidence_score,
        "match_score":      job.match_score or 0,
        "date_posted":      job.date_posted,
        "date_scraped":     job.date_scraped,
        "created_at":       job.created_at,
    }


def sync_job(job_id: str) -> bool:
    """Push one job from PostgreSQL → Firestore `jobs/{jobId}`."""
    db = get_firestore()
    if not db:
        return False

    try:
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.job import Job
        from app.config import get_settings

        engine = create_engine(get_settings().sync_database_url)
        with Session(engine) as session:
            job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
            if not job:
                logger.warning(f"sync_job: {job_id} not found in PostgreSQL")
                return False
            doc = _job_to_doc(job)

        db.collection("jobs").document(job_id).set(doc)
        logger.debug(f"Synced job {job_id} → Firestore")
        return True

    except Exception as exc:
        logger.error(f"sync_job({job_id}) failed: {exc}")
        return False


def deactivate_job(job_id: str) -> bool:
    """Mark a job as inactive in Firestore (mirrors PostgreSQL is_active=False)."""
    db = get_firestore()
    if not db:
        return False
    try:
        db.collection("jobs").document(job_id).update({"is_active": False})
        return True
    except Exception as exc:
        logger.error(f"deactivate_job({job_id}) failed: {exc}")
        return False


def bulk_sync_jobs(batch_size: int = 500) -> dict:
    """
    One-time migration: push all active PostgreSQL jobs to Firestore.
    Call this manually once after deploying the new architecture.
    """
    db = get_firestore()
    if not db:
        return {"synced": 0, "errors": 0}

    try:
        from sqlalchemy import create_engine, select
        from sqlalchemy.orm import Session
        from app.models.job import Job
        from app.config import get_settings
        from google.cloud.firestore_v1 import WriteBatch

        engine = create_engine(get_settings().sync_database_url)
        synced = 0
        errors = 0
        offset = 0

        while True:
            with Session(engine) as session:
                jobs = session.execute(
                    select(Job).where(Job.is_active == True).offset(offset).limit(batch_size)
                ).scalars().all()
                if not jobs:
                    break
                docs = [(j.id, _job_to_doc(j)) for j in jobs]

            # Firestore batch writes (max 500 per batch)
            batch: WriteBatch = db.batch()
            for job_id, doc in docs:
                batch.set(db.collection("jobs").document(job_id), doc)
            try:
                batch.commit()
                synced += len(docs)
            except Exception as exc:
                logger.error(f"Batch commit failed at offset {offset}: {exc}")
                errors += len(docs)

            offset += batch_size
            logger.info(f"bulk_sync_jobs: {synced} synced so far …")

        logger.info(f"bulk_sync_jobs complete: {synced} synced, {errors} errors")
        return {"synced": synced, "errors": errors}

    except Exception as exc:
        logger.error(f"bulk_sync_jobs failed: {exc}")
        return {"synced": 0, "errors": -1}


# ─── Stats sync ──────────────────────────────────────────────────────────────

def sync_stats() -> bool:
    """
    Recompute dashboard stats from PostgreSQL and write to Firestore
    `stats/dashboard`. Also appends recent scraper log events as an
    activity feed (last 20 entries).
    """
    db = get_firestore()
    if not db:
        return False

    try:
        from sqlalchemy import create_engine, text
        from app.config import get_settings

        engine = create_engine(get_settings().sync_database_url)
        now = datetime.now(timezone.utc)
        today     = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        week_ago  = now - timedelta(days=7)
        two_weeks = now - timedelta(days=14)

        with engine.connect() as conn:
            def scalar(sql, params=None):
                return conn.execute(text(sql), params or {}).scalar() or 0

            total_jobs    = scalar("SELECT COUNT(*) FROM jobs WHERE is_active = TRUE")
            jobs_today    = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND date_scraped >= :d", {"d": today})
            jobs_yest     = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND date_scraped>=:y AND date_scraped<:t", {"y": yesterday, "t": today})
            matched       = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND match_score > 0")
            tech_jobs     = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND is_tech=TRUE")
            non_tech      = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND is_tech=FALSE")
            this_week     = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND date_scraped >= :w", {"w": week_ago})
            last_week     = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND date_scraped>=:tw AND date_scraped<:w", {"tw": two_weeks, "w": week_ago})
            match_week    = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND match_score>0 AND date_scraped>=:w", {"w": week_ago})
            match_prev    = scalar("SELECT COUNT(*) FROM jobs WHERE is_active=TRUE AND match_score>0 AND date_scraped>=:tw AND date_scraped<:w", {"tw": two_weeks, "w": week_ago})

            # Recent activity: last 20 scraper log entries (global, not per-user)
            rows = conn.execute(text(
                "SELECT id, source, level, message, created_at "
                "FROM system_logs ORDER BY created_at DESC LIMIT 20"
            )).fetchall()
            activity = [
                {
                    "id":        str(r[0]),
                    "source":    r[1],
                    "level":     r[2],
                    "message":   r[3],
                    "timestamp": r[4].isoformat() if r[4] else None,
                }
                for r in rows
            ]

        def _pct(cur, prev):
            if prev == 0:
                return 100.0 if cur > 0 else 0.0
            return round(max(-100.0, min(100.0, (cur - prev) / prev * 100)), 1)

        doc = {
            "total_jobs":          total_jobs,
            "jobs_today":          jobs_today,
            "matched_jobs":        matched,
            "tech_jobs":           tech_jobs,
            "non_tech_jobs":       non_tech,
            "total_jobs_change":   _pct(this_week, last_week),
            "jobs_today_change":   _pct(jobs_today, jobs_yest),
            "matched_jobs_change": _pct(match_week, match_prev),
            "recent_activity":     activity,
            "last_updated":        now,
        }

        db.collection("stats").document("dashboard").set(doc)
        logger.info(f"Synced stats → Firestore  total={total_jobs}  today={jobs_today}")
        return True

    except Exception as exc:
        logger.error(f"sync_stats failed: {exc}")
        return False


# ─── User skills sync ────────────────────────────────────────────────────────

def sync_user_skills(firebase_uid: str, skills: list[str]) -> bool:
    """Write extracted resume skills to Firestore `users/{uid}` (merge, not overwrite)."""
    db = get_firestore()
    if not db:
        return False

    try:
        db.collection("users").document(firebase_uid).set(
            {"resume_skills": skills, "skills_updated_at": datetime.now(timezone.utc)},
            merge=True,
        )
        logger.info(f"Synced {len(skills)} skills → Firestore users/{firebase_uid}")
        return True
    except Exception as exc:
        logger.error(f"sync_user_skills({firebase_uid}) failed: {exc}")
        return False


# ─── Resume queue processor ──────────────────────────────────────────────────

def process_pending_resumes() -> dict:
    """
    Consume the Firestore `resume_queue` collection.

    Public frontend flow:
      1. User uploads resume file to Firebase Storage (resumes/{uid}/filename)
      2. Frontend writes  resume_queue/{uid}  →  { status: "pending",
             storage_path: "resumes/{uid}/filename", content_type: "…" }
      3. This function runs every ~2 min (Celery beat), downloads each
         pending file, extracts skills, and writes results back to both
         PostgreSQL (users.resume_skills) and Firestore (users/{uid}).

    Recompute-only flow (no re-upload, just re-rank matches):
      Frontend writes  resume_queue/{uid}  →  { status: "pending", action: "recompute" }
      (no storage_path). This function reuses the resume_text/skills/embedding
      already stored on users/{uid} instead of re-downloading and re-parsing a file.
    """
    db = get_firestore()
    if not db:
        return {"processed": 0, "errors": []}

    processed = 0
    errors: list[str] = []

    try:
        pending_docs = list(
            db.collection("resume_queue").where("status", "==", "pending").stream()
        )
    except Exception as exc:
        logger.error(f"process_pending_resumes: could not query Firestore: {exc}")
        return {"processed": 0, "errors": [str(exc)]}

    for doc in pending_docs:
        uid  = doc.id
        data = doc.to_dict() or {}
        action = data.get("action", "upload")

        # Claim the document so a parallel worker won't double-process it
        doc.reference.update({"status": "processing"})

        if action == "recompute":
            try:
                user_doc = db.collection("users").document(uid).get()
                u = (user_doc.to_dict() or {}) if user_doc.exists else {}
                _text     = u.get("resume_text", "")
                skills    = u.get("resume_skills", []) or []
                embedding = u.get("resume_embedding", [])

                if not _text and not skills:
                    raise ValueError("No stored resume data to recompute from")

                if not embedding and _text:
                    from app.services.resume.skill_extractor import generate_embedding
                    embedding = generate_embedding(_text)
                    if embedding:
                        db.collection("users").document(uid).set(
                            {"resume_embedding": embedding}, merge=True
                        )

                compute_and_store_matched_jobs(uid, _text, skills, embedding)

                doc.reference.update({
                    "status":       "processed",
                    "skills_count": len(skills),
                    "processed_at": datetime.now(timezone.utc),
                })
                processed += 1
                logger.info(f"Matches recomputed for {uid}")
            except Exception as exc:
                msg = f"{uid}: {exc}"
                logger.error(f"process_pending_resumes (recompute) failed for {uid}: {exc}")
                doc.reference.update({"status": "failed", "error": str(exc)})
                errors.append(msg)
            continue

        storage_path = data.get("storage_path", "")
        content_type = data.get("content_type", "application/pdf")
        filename     = storage_path.split("/")[-1] if storage_path else "resume.pdf"

        try:
            from firebase_admin import storage as firebase_storage
            bucket  = firebase_storage.bucket()
            content = bucket.blob(storage_path).download_as_bytes()

            from app.services.resume.skill_extractor import parse_resume, generate_embedding
            _text, skills = parse_resume(filename, content)

            # Persist to PostgreSQL
            from sqlalchemy import create_engine, text as sql_text
            from app.config import get_settings
            engine = create_engine(get_settings().sync_database_url)
            with engine.connect() as conn:
                conn.execute(
                    sql_text(
                        "UPDATE users SET resume_skills = CAST(:s AS JSONB) "
                        "WHERE firebase_uid = :uid"
                    ),
                    {"s": json.dumps(skills), "uid": uid},
                )
                conn.commit()

            # Persist skills to Firestore
            sync_user_skills(uid, skills)

            # Generate embedding + store resume text in Firestore
            embedding = generate_embedding(_text)
            if embedding and db:
                db.collection("users").document(uid).set({
                    "resume_text":       _text[:5000],
                    "resume_embedding":  embedding,
                    "resume_updated_at": datetime.now(timezone.utc),
                }, merge=True)

            # Compute and store matched jobs (non-fatal if it fails)
            try:
                compute_and_store_matched_jobs(uid, _text, skills, embedding)
            except Exception as me:
                logger.warning(f"compute_and_store_matched_jobs failed for {uid}: {me}")

            doc.reference.update({
                "status":       "processed",
                "skills_count": len(skills),
                "processed_at": datetime.now(timezone.utc),
            })
            processed += 1
            logger.info(f"Resume processed for {uid}: {len(skills)} skills extracted")

        except Exception as exc:
            msg = f"{uid}: {exc}"
            logger.error(f"process_pending_resumes failed for {uid}: {exc}")
            doc.reference.update({"status": "failed", "error": str(exc)})
            errors.append(msg)

    return {"processed": processed, "errors": errors}


def compute_and_store_matched_jobs(
    uid: str,
    resume_text: str,
    user_skills: list[str],
    resume_embedding: list[float],
) -> None:
    """
    Batch-embed all active jobs, compute cosine + keyword similarity against
    the user's resume embedding, and write the top-50 matches to
    Firestore users/{uid}.matched_jobs so the frontend can read them directly.
    """
    import numpy as np
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session as SyncSession
    from app.models.job import Job
    from app.config import get_settings

    if not resume_embedding:
        logger.warning(f"compute_and_store_matched_jobs: no embedding for {uid}, skipping")
        return

    logger.info(f"Computing job matches for user {uid} …")

    settings = get_settings()
    pg_engine = create_engine(settings.sync_database_url)

    with SyncSession(pg_engine) as session:
        jobs = session.execute(
            select(Job).where(Job.is_active == True)
        ).scalars().all()

    if not jobs:
        logger.warning("compute_and_store_matched_jobs: no active jobs in DB")
        return

    resume_vec = np.array(resume_embedding, dtype=np.float32)
    user_skills_lower = {s.lower() for s in user_skills}

    # Build one text per job: title + company + skills + first 400 chars of description
    job_texts = []
    for job in jobs:
        skills_str = " ".join(job.skills or [])
        desc_snip  = (job.description or "")[:400]
        job_texts.append(f"{job.title}\n{job.company}\n{skills_str}\n{desc_snip}")

    # Batch encode (uses cached model from skill_extractor module)
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")
    job_vecs = model.encode(
        job_texts,
        normalize_embeddings=True,
        batch_size=64,
        show_progress_bar=False,
    )  # shape: (N, 384)

    # Cosine similarity (vectors already L2-normalised → dot product == cosine)
    cosine_scores = job_vecs @ resume_vec  # (N,)

    scored: list[dict] = []
    for i, job in enumerate(jobs):
        cos_s = float(cosine_scores[i])

        job_skills_lower = {s.lower() for s in (job.skills or [])}
        kw_s = (
            len(job_skills_lower & user_skills_lower) / len(job_skills_lower)
            if job_skills_lower else 0.0
        )

        # Blend: 60% semantic + 40% keyword overlap
        blend = cos_s * 0.6 + kw_s * 0.4
        if blend < 0.2:
            continue

        scored.append({
            "id":          job.id,
            "title":       job.title,
            "company":     job.company,
            "location":    job.location or "",
            "skills":      list(job.skills or [])[:20],
            "job_type":    job.job_type or "Full-time",
            "salary":      job.salary or "",
            "apply_link":  job.apply_link or "",
            "match_score": round(blend * 100),
            "description": (job.description or "")[:300],
            "date_posted":  job.date_posted.isoformat()  if job.date_posted  else None,
            "date_scraped": job.date_scraped.isoformat() if job.date_scraped else None,
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    top50 = scored[:50]
    logger.info(f"Matched {len(top50)} jobs for user {uid} (from {len(jobs)} total)")

    db = get_firestore()
    if db:
        db.collection("users").document(uid).set({
            "matched_jobs":            top50,
            "matched_jobs_count":      len(top50),
            "matched_jobs_updated_at": datetime.now(timezone.utc),
        }, merge=True)
        logger.info(f"Stored {len(top50)} matched jobs → Firestore users/{uid}")

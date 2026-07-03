"""
Company background-check queue consumer.

Mirrors firebase_sync.process_pending_resumes():
  frontend writes research_requests/{id} {status:"pending"} → Celery beat calls
  process_pending_research() → claim → collect → red-flag → synthesize (user's
  own Groq key) → company_reports/{slug} + per-request position_analysis.

Concurrency:
- consumer lock (Redis SET NX EX 600): beat fires every 60 s but a run can
  take minutes — overlapping ticks return immediately.
- company lock (Redis SET NX EX 900): two users researching the same company
  don't build the report twice; the loser is reset to "pending" and picks up
  the warm cache on the next tick.
- stale-claim recovery: a worker crash after the "processing" claim would
  strand the doc forever (task_acks_late=True); claims older than 15 min are
  reset to "pending" at the top of each run.
"""

import logging
from datetime import datetime, timezone, timedelta

from app.config import get_settings
from app.services.firebase_sync import get_firestore
from app.services.research.progress import StageReporter
from app.services.research.utils import slugify_company

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 30
STALE_CLAIM_MINUTES = 15

_CONSUMER_LOCK = "research:consumer:lock"
_COMPANY_LOCK = "research:company:{slug}"


def _redis():
    import redis
    return redis.Redis.from_url(get_settings().redis_url)


def _recover_stale_claims(db) -> int:
    """Reset requests stuck at 'processing' with an old claim back to 'pending'."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_CLAIM_MINUTES)
    recovered = 0
    try:
        stuck = db.collection("research_requests") \
                  .where("status", "==", "processing").stream()
        for doc in stuck:
            claimed_at = (doc.to_dict() or {}).get("claimed_at")
            if claimed_at and claimed_at < cutoff:
                doc.reference.update({"status": "pending"})
                recovered += 1
                logger.warning(f"recovered stale research claim {doc.id}")
    except Exception as exc:
        logger.warning(f"stale-claim recovery failed: {exc}")
    return recovered


def _fresh_report(db, slug: str) -> dict | None:
    """Return the cached company report if complete and unexpired."""
    try:
        snap = db.collection("company_reports").document(slug).get()
        if not snap.exists:
            return None
        report = snap.to_dict() or {}
        if report.get("status") != "complete":
            return None
        expires_at = report.get("expires_at")
        if expires_at and expires_at < datetime.now(timezone.utc):
            return None
        return report
    except Exception as exc:
        logger.warning(f"cache check failed for {slug}: {exc}")
        return None


def _get_user_groq_key(db, uid: str) -> str | None:
    try:
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            return None
        return ((snap.to_dict() or {}).get("api_keys") or {}).get("groq") or None
    except Exception as exc:
        logger.warning(f"groq key lookup failed for {uid}: {exc}")
        return None


def _build_company_report(db, r, company: str, slug: str, api_key: str,
                          settings, reporter: StageReporter) -> dict:
    """Collect → red-flag → synthesize → atomically .set() the shared report."""
    from app.services.research import redflags
    from app.services.research.collectors import run_all
    from app.services.research.synthesizer import synthesize_company_report

    reporter.start("collect")
    gathered = run_all(company, settings)
    registry = gathered["registry"]
    reporter.done("collect")

    reporter.start("red_flags")
    flags = redflags.evaluate(
        company,
        registry.sources,
        gathered["whois_meta"],
        official_site_found=gathered["official_domain"] is not None,
    )
    flags_fs = [f.to_firestore() for f in flags]
    reporter.done("red_flags")

    reporter.start("synthesize")
    synthesis = synthesize_company_report(company, registry.sources, flags_fs, api_key, settings)
    now = datetime.now(timezone.utc)
    report = {
        "schema_version": 1,
        "slug": slug,
        "company_name_canonical": synthesis["company_name_canonical"],
        "aliases": [company],
        "status": "complete",
        "generated_at": now,
        "expires_at": now + timedelta(days=CACHE_TTL_DAYS),
        "sections": synthesis["sections"],
        "red_flags": flags_fs,
        "review_links": gathered["review_links"],
        "internal_jobs_signal": gathered["internal_signal"],
        "sources": registry.to_firestore(),
    }

    # Merge aliases from a previous (expired) report so old inputs keep resolving.
    try:
        prev = db.collection("company_reports").document(slug).get()
        if prev.exists:
            old_aliases = (prev.to_dict() or {}).get("aliases", [])
            report["aliases"] = sorted({*old_aliases, company})
    except Exception:
        pass

    db.collection("company_reports").document(slug).set(report)
    reporter.done("synthesize")
    return report


def _process_one(db, doc, settings, rds) -> None:
    """Handle a single claimed request; raises nothing (writes failed status)."""
    from app.services.research.synthesizer import (
        GroqCallError, GroqKeyError, synthesize_position_analysis,
    )

    request_id = doc.id
    data = doc.to_dict() or {}
    uid = data.get("uid", "")
    company = (data.get("company_name") or "").strip()
    position = (data.get("position") or "").strip()
    jd_text = data.get("jd_text") or ""
    reporter = StageReporter(doc.reference)

    def fail(msg: str, stage: str | None = None):
        if stage:
            reporter.fail(stage)
        doc.reference.update({
            "status": "failed",
            "error": msg,
            "processed_at": datetime.now(timezone.utc),
        })

    # ── validate ──
    reporter.start("validate")
    if not company or not uid:
        fail("Invalid request: missing company name.", "validate")
        return
    if data.get("consent") is not True:
        fail("Consent is required to run a background check.", "validate")
        return
    api_key = _get_user_groq_key(db, uid)
    if not api_key:
        fail("Add your Groq API key in Settings → API Keys to run company research.", "validate")
        return
    slug = slugify_company(company)
    if not slug:
        fail("Could not understand that company name. Try the full official name.", "validate")
        return
    doc.reference.update({"company_slug": slug})
    reporter.done("validate")

    # ── cache check ──
    reporter.start("cache_check")
    report = _fresh_report(db, slug)
    reporter.done("cache_check")

    if report is not None:
        reporter.skip_to_done("collect", "red_flags", "synthesize")
        logger.info(f"cache hit for {slug} (request {request_id})")
    else:
        lock_key = _COMPANY_LOCK.format(slug=slug)
        if not rds.set(lock_key, request_id, nx=True, ex=900):
            # Another in-flight build; retry this request on a later tick.
            doc.reference.update({"status": "pending"})
            logger.info(f"company {slug} locked by another build; requeued {request_id}")
            return
        try:
            report = _build_company_report(db, doc, company, slug, api_key, settings, reporter)
        except GroqKeyError as exc:
            fail(str(exc), "synthesize")
            return
        except GroqCallError as exc:
            fail(str(exc), "synthesize")
            return
        except Exception as exc:
            logger.error(f"company report build failed for {slug}: {exc}")
            fail("Research failed while gathering company data. Try again later.", "synthesize")
            return
        finally:
            try:
                rds.delete(lock_key)
            except Exception:
                pass

    # ── position analysis (always personalized, always the requester's key) ──
    reporter.start("position_analysis")
    try:
        sections = synthesize_position_analysis(report, position, jd_text, api_key, settings)
    except (GroqKeyError, GroqCallError) as exc:
        fail(str(exc), "position_analysis")
        return
    except Exception as exc:
        logger.error(f"position analysis failed for {request_id}: {exc}")
        fail("Research failed while analysing the position. Try again later.", "position_analysis")
        return
    reporter.done("position_analysis")

    doc.reference.update({
        "status": "processed",
        "company_report_slug": slug,
        "position_analysis": {
            "role": position,
            "sections": sections,
            "generated_at": datetime.now(timezone.utc),
        },
        "processed_at": datetime.now(timezone.utc),
    })
    logger.info(f"research request {request_id} processed ({slug})")


def process_pending_research() -> dict:
    """Beat entrypoint. Consume pending research_requests docs."""
    db = get_firestore()
    if not db:
        return {"processed": 0, "errors": ["firestore unavailable"]}

    settings = get_settings()
    try:
        rds = _redis()
        if not rds.set(_CONSUMER_LOCK, str(datetime.now(timezone.utc)), nx=True, ex=600):
            return {"processed": 0, "errors": [], "skipped": "consumer lock held"}
    except Exception as exc:
        logger.error(f"redis unavailable, refusing to run without locks: {exc}")
        return {"processed": 0, "errors": [str(exc)]}

    processed, errors = 0, []
    try:
        _recover_stale_claims(db)

        pending = list(
            db.collection("research_requests").where("status", "==", "pending").stream()
        )
        for doc in pending:
            # Claim immediately so a parallel worker never double-processes.
            doc.reference.update({
                "status": "processing",
                "claimed_at": datetime.now(timezone.utc),
            })
            try:
                _process_one(db, doc, settings, rds)
                processed += 1
            except Exception as exc:  # _process_one shouldn't raise, but belt-and-braces
                logger.error(f"research processing crashed for {doc.id}: {exc}")
                errors.append(f"{doc.id}: {exc}")
                try:
                    doc.reference.update({
                        "status": "failed",
                        "error": "Unexpected error during research. Try again later.",
                    })
                except Exception:
                    pass
    finally:
        try:
            rds.delete(_CONSUMER_LOCK)
        except Exception:
            pass

    return {"processed": processed, "errors": errors}

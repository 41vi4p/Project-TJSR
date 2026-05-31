"""
Job Aggregator — discovers jobs from public job-board APIs without needing a source URL.

Free / no-key sources:
  - RemoteOK      (remoteok.com/api)
  - Arbeitnow     (arbeitnow.com/api/job-board-api)
  - The Muse      (themuse.com/api/public/jobs)

Optional (need API key in settings):
  - Adzuna        (adzuna_app_id / adzuna_app_key)

Each provider returns a normalized list of dicts ready to insert as Job rows.
"""

import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TJSRBot/1.0)"}
_TIMEOUT = 20


def _norm(title, company, location, description, skills, apply_link,
          salary="", job_type="", date_posted=None, source=""):
    return {
        "title": (title or "").strip()[:300],
        "company": (company or "Unknown").strip()[:200],
        "location": (location or "").strip()[:200],
        "description": (description or "")[:5000],
        "skills": skills or [],
        "salary": salary or "",
        "job_type": job_type or "",
        "apply_link": apply_link or "",
        "date_posted": date_posted,
        "source_name": source,
    }


def fetch_remoteok(limit: int = 100) -> list[dict]:
    """RemoteOK — remote tech jobs. No key required."""
    try:
        resp = requests.get("https://remoteok.com/api", headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        jobs = []
        for item in data:
            if not isinstance(item, dict) or not item.get("position"):
                continue  # first element is metadata/legal
            jobs.append(_norm(
                title=item.get("position"),
                company=item.get("company"),
                location=item.get("location") or "Remote",
                description=item.get("description", ""),
                skills=item.get("tags", []),
                apply_link=item.get("url") or item.get("apply_url"),
                salary=_salary_range(item.get("salary_min"), item.get("salary_max")),
                job_type="Full-time",
                date_posted=_parse_epoch(item.get("epoch")),
                source="RemoteOK",
            ))
            if len(jobs) >= limit:
                break
        logger.info(f"RemoteOK: fetched {len(jobs)} jobs")
        return jobs
    except Exception as e:
        logger.warning(f"RemoteOK fetch failed: {e}")
        return []


def fetch_arbeitnow(limit: int = 100) -> list[dict]:
    """Arbeitnow — EU/remote jobs. No key required."""
    try:
        resp = requests.get("https://www.arbeitnow.com/api/job-board-api",
                            headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json().get("data", [])
        jobs = []
        for item in data[:limit]:
            jobs.append(_norm(
                title=item.get("title"),
                company=item.get("company_name"),
                location=item.get("location") or ("Remote" if item.get("remote") else ""),
                description=item.get("description", ""),
                skills=item.get("tags", []),
                apply_link=item.get("url"),
                job_type=", ".join(item.get("job_types", [])) or "Full-time",
                date_posted=_parse_epoch(item.get("created_at")),
                source="Arbeitnow",
            ))
        logger.info(f"Arbeitnow: fetched {len(jobs)} jobs")
        return jobs
    except Exception as e:
        logger.warning(f"Arbeitnow fetch failed: {e}")
        return []


def fetch_themuse(limit: int = 100, pages: int = 3) -> list[dict]:
    """The Muse — broad job board. No key required (rate-limited)."""
    jobs = []
    try:
        for page in range(1, pages + 1):
            resp = requests.get(
                "https://www.themuse.com/api/public/jobs",
                params={"page": page, "category": "Software Engineering"},
                headers=_HEADERS, timeout=_TIMEOUT,
            )
            if not resp.ok:
                break
            for item in resp.json().get("results", []):
                locs = [l.get("name", "") for l in item.get("locations", [])]
                jobs.append(_norm(
                    title=item.get("name"),
                    company=(item.get("company") or {}).get("name"),
                    location=" | ".join(locs[:3]),
                    description=item.get("contents", ""),
                    skills=[],
                    apply_link=(item.get("refs") or {}).get("landing_page"),
                    job_type=item.get("type", ""),
                    date_posted=_parse_iso(item.get("publication_date")),
                    source="The Muse",
                ))
                if len(jobs) >= limit:
                    return jobs
        logger.info(f"The Muse: fetched {len(jobs)} jobs")
        return jobs
    except Exception as e:
        logger.warning(f"The Muse fetch failed: {e}")
        return jobs


def fetch_adzuna(limit: int = 50, country: str = "in") -> list[dict]:
    """Adzuna — requires adzuna_app_id + adzuna_app_key in settings (free tier)."""
    from app.config import get_settings
    settings = get_settings()
    app_id  = getattr(settings, "adzuna_app_id", "")
    app_key = getattr(settings, "adzuna_app_key", "")
    if not app_id or not app_key:
        return []
    try:
        resp = requests.get(
            f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
            params={
                "app_id": app_id, "app_key": app_key,
                "results_per_page": limit, "what": "software developer",
                "content-type": "application/json",
            },
            headers=_HEADERS, timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        jobs = []
        for item in resp.json().get("results", []):
            jobs.append(_norm(
                title=item.get("title"),
                company=(item.get("company") or {}).get("display_name"),
                location=(item.get("location") or {}).get("display_name"),
                description=item.get("description", ""),
                skills=[],
                apply_link=item.get("redirect_url"),
                salary=_salary_range(item.get("salary_min"), item.get("salary_max")),
                job_type=item.get("contract_time", ""),
                date_posted=_parse_iso(item.get("created")),
                source="Adzuna",
            ))
        logger.info(f"Adzuna: fetched {len(jobs)} jobs")
        return jobs
    except Exception as e:
        logger.warning(f"Adzuna fetch failed: {e}")
        return []


# ── Registry ──────────────────────────────────────────────────────────────────
PROVIDERS = {
    "remoteok": fetch_remoteok,
    "arbeitnow": fetch_arbeitnow,
    "themuse": fetch_themuse,
    "adzuna": fetch_adzuna,
}


def fetch_all(providers: list[str] | None = None, limit_per: int = 100) -> list[dict]:
    """Fetch from all (or specified) providers and return a combined job list."""
    names = providers or list(PROVIDERS.keys())
    all_jobs = []
    for name in names:
        fn = PROVIDERS.get(name)
        if fn:
            all_jobs.extend(fn(limit=limit_per))
    return all_jobs


# ── Helpers ─────────────────────────────────────────────────────────────────
def _salary_range(mn, mx) -> str:
    if mn and mx:
        return f"{int(mn):,}–{int(mx):,}"
    if mn:
        return f"{int(mn):,}+"
    return ""


def _parse_epoch(val):
    try:
        return datetime.fromtimestamp(int(val), tz=timezone.utc)
    except (TypeError, ValueError):
        return _parse_iso(val) if isinstance(val, str) else None


def _parse_iso(val):
    if not val or not isinstance(val, str):
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(val[:19], fmt[:len(val[:19])])
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        except ValueError:
            continue
    return None

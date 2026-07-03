"""Internal jobs collector — TJSR's own scraped job database is a first-party
signal for a company's real tech stack, active roles, and hiring volume."""

import logging
from collections import Counter

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.job import Job
from app.services.research.utils import SourceDoc

logger = logging.getLogger(__name__)


def collect(company: str) -> tuple[list[SourceDoc], dict]:
    """Returns (sources, internal_jobs_signal)."""
    empty_signal = {"active_postings": 0, "top_skills": [], "sample_titles": []}
    try:
        engine = create_engine(get_settings().sync_database_url)
        with Session(engine) as session:
            jobs = session.execute(
                select(Job.title, Job.skills, Job.location)
                .where(Job.company.ilike(f"%{company}%"), Job.is_active.is_(True))
                .limit(200)
            ).all()
    except Exception as exc:
        logger.warning(f"internal jobs query failed for {company!r}: {exc}")
        return [], empty_signal

    if not jobs:
        return [], empty_signal

    skill_counts: Counter[str] = Counter()
    titles: list[str] = []
    for title, skills, _location in jobs:
        if title:
            titles.append(title)
        for s in (skills or []):
            skill_counts[s] += 1

    top_skills = [s for s, _ in skill_counts.most_common(15)]
    sample_titles = list(dict.fromkeys(titles))[:10]
    signal = {
        "active_postings": len(jobs),
        "top_skills": top_skills,
        "sample_titles": sample_titles,
    }

    summary = (
        f"TJSR's own job database has {len(jobs)} active postings from this company. "
        f"Most-required skills: {', '.join(top_skills) or 'n/a'}. "
        f"Open roles include: {'; '.join(sample_titles) or 'n/a'}."
    )
    source = SourceDoc(
        url="internal://tjsr-jobs-db",
        title=f"{company} — active postings in TJSR job database",
        kind="internal_jobs",
        text=summary[:900],
    )
    return [source], signal

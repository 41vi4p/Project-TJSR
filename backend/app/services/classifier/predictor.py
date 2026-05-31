"""High-level prediction interface for classifying jobs."""

import re
import logging
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.job import Job
from app.services.classifier.model import predict

logger = logging.getLogger(__name__)

# ── Keyword-based fallback classifier ────────────────────────────────────────
# Strong tech signals in title/skills
_TECH_TITLE = re.compile(
    r"\b(software|developer|engineer|programmer|devops|sre|data\s+scientist|"
    r"data\s+engineer|data\s+analyst|machine\s+learning|ml\s+engineer|ai\s+engineer|"
    r"backend|frontend|full[\s-]?stack|cloud|platform|infrastructure|security\s+engineer|"
    r"cybersecurity|network\s+engineer|database\s+admin|dba|qa\s+engineer|"
    r"test\s+engineer|sdet|mobile\s+developer|android|ios\s+developer|"
    r"embedded|firmware|systems\s+engineer|site\s+reliability|"
    r"blockchain|web3|defi|smart\s+contract|game\s+developer|"
    r"computer\s+vision|nlp\s+engineer|research\s+scientist|"
    r"technical\s+lead|tech\s+lead|engineering\s+manager|"
    r"solution\s+architect|cloud\s+architect|it\s+admin|sysadmin|"
    r"scrum\s+master|agile\s+coach|product\s+manager)\b",
    re.IGNORECASE,
)

_TECH_SKILLS = {
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
    "react", "angular", "vue", "node.js", "django", "flask", "fastapi", "spring",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "linux",
    "sql", "postgresql", "mongodb", "redis", "kafka", "spark",
    "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
    "git", "ci/cd", "jenkins", "github actions", "graphql", "rest api",
}

_NON_TECH_TITLE = re.compile(
    r"\b(sales|marketing|hr|human\s+resources|recruiter|accountant|finance|"
    r"legal|lawyer|attorney|nurse|doctor|physician|teacher|professor|"
    r"driver|delivery|warehouse|logistics|supply\s+chain|operations\s+manager|"
    r"customer\s+service|customer\s+support|receptionist|admin\s+assistant|"
    r"content\s+writer|copywriter|graphic\s+designer|ux\s+designer|"
    r"social\s+media|brand\s+manager|event\s+manager|chef|cook|"
    r"business\s+analyst|financial\s+analyst|investment\s+banker)\b",
    re.IGNORECASE,
)


def _keyword_classify(title: str, skills: list[str], description: str) -> dict | None:
    """
    Fast keyword classifier. Returns result dict or None if uncertain.
    Only fires when ML model is unavailable or returns low confidence.
    """
    title_lower = (title or "").lower()
    skills_lower = {s.lower() for s in (skills or [])}
    desc_lower = (description or "")[:2000].lower()

    # Strong non-tech title → definitely not tech
    if _NON_TECH_TITLE.search(title_lower):
        return {"is_tech": False, "confidence": 0.92, "label": 0, "source": "keyword"}

    # Strong tech title → tech
    if _TECH_TITLE.search(title_lower):
        return {"is_tech": True, "confidence": 0.90, "label": 1, "source": "keyword"}

    # Tech skills overlap
    skill_overlap = len(skills_lower & _TECH_SKILLS)
    if skill_overlap >= 3:
        return {"is_tech": True, "confidence": min(0.95, 0.70 + skill_overlap * 0.05), "label": 1, "source": "keyword"}
    if skill_overlap >= 1:
        return {"is_tech": True, "confidence": 0.72, "label": 1, "source": "keyword"}

    # Description tech density
    tech_hits = sum(1 for kw in _TECH_SKILLS if kw in desc_lower)
    if tech_hits >= 5:
        return {"is_tech": True, "confidence": 0.78, "label": 1, "source": "keyword"}
    if tech_hits >= 2:
        return {"is_tech": True, "confidence": 0.65, "label": 1, "source": "keyword"}

    return None  # uncertain — let ML model decide


def classify_job_by_id(job_id: str) -> dict:
    """Classify a single job by its database ID."""
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job:
            return {"error": "Job not found"}

        title       = job.title or ""
        skills      = job.skills or []
        description = job.description or ""

        # Build rich input for ML model: title + skills + description
        ml_input = f"Title: {title}\nSkills: {', '.join(skills[:20])}\n{description[:1000]}"

        result = None

        # Try ML model first
        if description or title:
            try:
                ml_results = predict([ml_input])
                if ml_results and ml_results[0].get("confidence", 0) >= 0.65:
                    result = ml_results[0]
                    result["source"] = "ml"
            except Exception as e:
                logger.warning(f"ML classifier failed for {job_id}: {e}")

        # Fall back to keyword classifier
        if result is None or result.get("confidence", 0) < 0.65:
            kw = _keyword_classify(title, skills, description)
            if kw:
                result = kw
            elif result is None:
                # Last resort: default to tech if any skills present
                result = {
                    "is_tech": len(skills) > 0,
                    "confidence": 0.55,
                    "label": 1 if skills else 0,
                    "source": "default",
                }

        job.is_tech = result["is_tech"]
        job.confidence_score = result["confidence"]
        session.commit()

        logger.info(f"Classified {job_id} [{result.get('source','?')}]: is_tech={result['is_tech']} conf={result['confidence']:.2f}")
        return result


def classify_batch(descriptions: list[str]) -> list[dict]:
    """Classify a batch of job descriptions."""
    return predict(descriptions)

"""Create and update nodes/relationships in Neo4j from job data."""

import logging
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models.job import Job
from app.services.graph.neo4j_client import run_write, run_query

logger = logging.getLogger(__name__)

# Node colors for frontend visualization
NODE_COLORS = {
    "company":  "#8b5cf6",   # purple
    "job":      "#0ea5e9",   # cyan
    "skill":    "#10b981",   # green
    "location": "#f59e0b",   # amber
    "portal":   "#ef4444",   # red
}


def add_job_to_graph(job_id: str) -> dict:
    """Add a job and all its relationships to Neo4j."""
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job:
            return {"error": "Job not found"}

    try:
        # Merge Company node
        run_write(
            """
            MERGE (c:Company {name: $company})
            ON CREATE SET c.created_at = datetime()
            ON MATCH SET c.updated_at = datetime()
            """,
            {"company": job.company},
        )

        # Merge Job node
        run_write(
            """
            MERGE (j:Job {job_id: $job_id})
            ON CREATE SET
                j.title = $title,
                j.company = $company,
                j.location = $location,
                j.job_type = $job_type,
                j.salary = $salary,
                j.is_tech = $is_tech,
                j.created_at = datetime()
            ON MATCH SET
                j.title = $title,
                j.is_tech = $is_tech,
                j.updated_at = datetime()
            """,
            {
                "job_id": job_id,
                "title": job.title,
                "company": job.company,
                "location": job.location or "",
                "job_type": job.job_type or "",
                "salary": job.salary or "",
                "is_tech": job.is_tech,
            },
        )

        # Job POSTED_BY Company
        run_write(
            """
            MATCH (j:Job {job_id: $job_id})
            MATCH (c:Company {name: $company})
            MERGE (j)-[:POSTED_BY]->(c)
            """,
            {"job_id": job_id, "company": job.company},
        )

        # Location node and relationship
        if job.location:
            location = _normalize_location(job.location)
            run_write(
                """
                MERGE (l:Location {name: $location})
                WITH l
                MATCH (j:Job {job_id: $job_id})
                MERGE (j)-[:LOCATED_IN]->(l)
                """,
                {"location": location, "job_id": job_id},
            )
            run_write(
                """
                MATCH (c:Company {name: $company})
                MATCH (l:Location {name: $location})
                MERGE (c)-[:BASED_IN]->(l)
                """,
                {"company": job.company, "location": location},
            )

        # Skill nodes and relationships
        for skill in (job.skills or []):
            if skill:
                run_write(
                    """
                    MERGE (s:Skill {name: $skill})
                    WITH s
                    MATCH (j:Job {job_id: $job_id})
                    MERGE (j)-[:REQUIRES_SKILL]->(s)
                    WITH s
                    MATCH (c:Company {name: $company})
                    MERGE (c)-[:HIRES_FOR]->(s)
                    """,
                    {"skill": skill, "job_id": job_id, "company": job.company},
                )

        # Source portal
        if job.source_name:
            run_write(
                """
                MERGE (p:JobPortal {name: $portal})
                ON CREATE SET p.url = $url
                WITH p
                MATCH (j:Job {job_id: $job_id})
                MERGE (j)-[:FOUND_ON]->(p)
                """,
                {
                    "portal": job.source_name,
                    "url": job.source_url or "",
                    "job_id": job_id,
                },
            )

        # Update job's neo4j_node_id in PostgreSQL
        with Session(engine) as session:
            job_record = session.execute(
                select(Job).where(Job.id == job_id)
            ).scalar_one_or_none()
            if job_record:
                job_record.neo4j_node_id = job_id
                session.commit()

        logger.info(f"Added job {job_id} to graph: {job.title} @ {job.company}")
        return {"status": "added", "job_id": job_id}

    except Exception as e:
        logger.error(f"Failed to add job {job_id} to graph: {e}")
        return {"error": str(e)}


def _normalize_location(location: str) -> str:
    """Normalize location strings."""
    location = location.strip()
    if any(kw in location.lower() for kw in ["remote", "anywhere", "worldwide"]):
        return "Remote"
    if any(kw in location.lower() for kw in ["hybrid"]):
        return f"Hybrid ({location})"
    return location


def add_user_to_graph(user_id: str, firebase_uid: str, skills: list[str]):
    """Add a user node and their skills to the graph."""
    run_write(
        """
        MERGE (u:User {user_id: $user_id})
        ON CREATE SET u.firebase_uid = $firebase_uid, u.created_at = datetime()
        """,
        {"user_id": user_id, "firebase_uid": firebase_uid},
    )

    for skill in skills:
        run_write(
            """
            MERGE (s:Skill {name: $skill})
            WITH s
            MATCH (u:User {user_id: $user_id})
            MERGE (u)-[:HAS_SKILL]->(s)
            """,
            {"skill": skill, "user_id": user_id},
        )


def add_application_to_graph(user_id: str, job_id: str):
    """Record an application as a relationship in the graph."""
    run_write(
        """
        MATCH (u:User {user_id: $user_id})
        MATCH (j:Job {job_id: $job_id})
        MERGE (u)-[:APPLIED_TO]->(j)
        """,
        {"user_id": user_id, "job_id": job_id},
    )

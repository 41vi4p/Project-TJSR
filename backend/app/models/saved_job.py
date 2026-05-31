from sqlalchemy import Table, Column, String, ForeignKey
from app.models.database import Base

# Junction table for user saved jobs (many-to-many)
user_saved_jobs = Table(
    "user_saved_jobs",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id"), primary_key=True),
    Column("job_id", String, ForeignKey("jobs.id"), primary_key=True),
)

from pydantic import BaseModel
from datetime import datetime


class ChatMessage(BaseModel):
    role: str  # user, assistant
    content: str
    sources: list["ChatSource"] | None = None
    timestamp: datetime | None = None


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    message: str
    sources: list["ChatSource"] = []
    session_id: str


class ChatSource(BaseModel):
    job_id: str
    title: str
    company: str
    relevance_score: float

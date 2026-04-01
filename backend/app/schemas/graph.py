from pydantic import BaseModel


class GraphNode(BaseModel):
    id: str
    label: str
    type: str  # company, job, skill, location, portal
    properties: dict = {}
    color: str | None = None
    size: float = 1.0


class GraphEdge(BaseModel):
    source: str
    target: str
    label: str  # POSTED_BY, REQUIRES_SKILL, etc.
    properties: dict = {}


class GraphData(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    stats: dict = {}


class GraphFilter(BaseModel):
    node_types: list[str] | None = None
    company: str | None = None
    skill: str | None = None
    location: str | None = None
    limit: int = 500

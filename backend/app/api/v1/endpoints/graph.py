from fastapi import APIRouter, Depends, Query
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.graph import GraphData, GraphFilter

router = APIRouter()


@router.get("/data", response_model=GraphData)
async def get_graph_data(
    node_types: str | None = Query(None),  # comma-separated
    company: str | None = Query(None),
    skill: str | None = Query(None),
    location: str | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    user: User = Depends(get_current_user),
):
    """Get graph nodes and edges for visualization."""
    from app.services.graph.queries import get_full_graph

    filter_params = GraphFilter(
        node_types=node_types.split(",") if node_types else None,
        company=company,
        skill=skill,
        location=location,
        limit=limit,
    )

    data = await get_full_graph(filter_params)
    return data


@router.get("/company/{name}", response_model=GraphData)
async def get_company_graph(
    name: str,
    user: User = Depends(get_current_user),
):
    """Get the subgraph for a specific company."""
    from app.services.graph.queries import get_company_subgraph

    data = await get_company_subgraph(name)
    return data


@router.get("/skill/{name}", response_model=GraphData)
async def get_skill_graph(
    name: str,
    user: User = Depends(get_current_user),
):
    """Get the subgraph for a specific skill."""
    from app.services.graph.queries import get_skill_subgraph

    data = await get_skill_subgraph(name)
    return data


@router.get("/similar/{job_id}", response_model=GraphData)
async def get_similar_jobs(
    job_id: str,
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
):
    """Get similar jobs via embedding similarity."""
    from app.services.graph.queries import get_similar_jobs_graph

    data = await get_similar_jobs_graph(job_id, limit)
    return data

"""
Admin-only Firebase sync endpoints.
These are called from the local admin UI — never exposed to the public frontend.
"""

from fastapi import APIRouter, Depends, BackgroundTasks
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter()


@router.post("/sync/stats")
async def trigger_stats_sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Immediately push fresh stats to Firestore (runs in background)."""
    def _run():
        from app.services.firebase_sync import sync_stats
        sync_stats()

    background_tasks.add_task(_run)
    return {"status": "queued", "message": "Stats sync started in background"}


@router.post("/sync/graph")
async def trigger_graph_sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Immediately export Neo4j graph snapshot to Firestore (runs in background)."""
    def _run():
        from app.services.firebase_sync import sync_graph_snapshot
        sync_graph_snapshot()

    background_tasks.add_task(_run)
    return {"status": "queued", "message": "Graph sync started in background"}


@router.post("/sync/bulk-jobs")
async def trigger_bulk_jobs_sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """
    One-time migration: push ALL existing PostgreSQL jobs → Firestore.
    Run this once after deploying the new architecture.
    Warning: may take several minutes for large job tables.
    """
    def _run():
        from app.services.firebase_sync import bulk_sync_jobs
        result = bulk_sync_jobs()
        import logging
        logging.getLogger(__name__).info(f"Bulk sync complete: {result}")

    background_tasks.add_task(_run)
    return {
        "status": "queued",
        "message": "Bulk job sync started in background — check logs for progress",
    }

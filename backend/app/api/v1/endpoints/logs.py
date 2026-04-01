from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.log import SystemLog

router = APIRouter()


class LogResponse:
    pass


@router.get("")
async def list_logs(
    level: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get system logs with filtering."""
    query = select(SystemLog).order_by(desc(SystemLog.created_at))

    if level:
        query = query.where(SystemLog.level == level)
    if source:
        query = query.where(SystemLog.source.ilike(f"%{source}%"))

    # Show user's logs + system-wide logs (no user_id)
    from sqlalchemy import or_
    query = query.where(
        or_(SystemLog.user_id == user.id, SystemLog.user_id.is_(None))
    )

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "timestamp": log.created_at.isoformat(),
            "message": log.message,
            "type": log.level,
            "source": log.source,
            "metadata": log.metadata_json,
        }
        for log in logs
    ]

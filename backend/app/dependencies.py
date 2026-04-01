from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.database import get_db
from app.models.user import User
from app.services.firebase_auth import verify_firebase_token
import logging

logger = logging.getLogger(__name__)


async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract Firebase token from Authorization header, verify, and return/create user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.split("Bearer ")[1]
    claims = await verify_firebase_token(token)

    if not claims:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    firebase_uid = claims.get("uid")
    if not firebase_uid:
        raise HTTPException(status_code=401, detail="Invalid token claims")

    # Find or create user in PostgreSQL
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            firebase_uid=firebase_uid,
            email=claims.get("email", ""),
            display_name=claims.get("name", claims.get("email", "").split("@")[0]),
            photo_url=claims.get("picture"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info(f"Created new user: {user.email} ({user.firebase_uid})")

    return user


async def get_optional_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None instead of raising on failure."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        return await get_current_user(authorization=authorization, db=db)
    except HTTPException:
        return None

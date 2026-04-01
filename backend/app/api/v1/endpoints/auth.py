from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import AuthVerifyResponse, UserResponse

router = APIRouter()


@router.post("/verify", response_model=AuthVerifyResponse)
async def verify_token(
    user: User = Depends(get_current_user),
):
    """Verify Firebase token and sync user to PostgreSQL."""
    return AuthVerifyResponse(
        user=UserResponse.model_validate(user),
        message="Authenticated successfully",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return UserResponse.model_validate(user)

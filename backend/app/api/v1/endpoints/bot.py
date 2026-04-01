from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.bot_config import BotConfig
from app.schemas.bot import BotConfigUpdate, BotConfigResponse, BotConnectRequest, BotStatus
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/config", response_model=BotConfigResponse)
async def get_bot_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get user's bot configuration."""
    result = await db.execute(
        select(BotConfig).where(BotConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()

    if not config:
        # Create default config
        config = BotConfig(user_id=user.id)
        db.add(config)
        await db.commit()
        await db.refresh(config)

    return BotConfigResponse(
        id=config.id,
        user_id=config.user_id,
        daily_digest_enabled=config.daily_digest_enabled,
        digest_time=config.digest_time.strftime("%H:%M"),
        notification_prefs=config.notification_prefs,
        target_domains=config.target_domains if isinstance(config.target_domains, list) else [],
        telegram_connected=user.telegram_chat_id is not None,
        updated_at=config.updated_at.isoformat(),
    )


@router.put("/config", response_model=BotConfigResponse)
async def update_bot_config(
    data: BotConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update bot configuration."""
    result = await db.execute(
        select(BotConfig).where(BotConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()

    if not config:
        config = BotConfig(user_id=user.id)
        db.add(config)

    if data.daily_digest_enabled is not None:
        config.daily_digest_enabled = data.daily_digest_enabled
    if data.digest_time is not None:
        from datetime import time
        h, m = map(int, data.digest_time.split(":"))
        config.digest_time = time(h, m)
    if data.notification_prefs is not None:
        config.notification_prefs = data.notification_prefs
    if data.target_domains is not None:
        config.target_domains = data.target_domains

    await db.commit()
    await db.refresh(config)

    return BotConfigResponse(
        id=config.id,
        user_id=config.user_id,
        daily_digest_enabled=config.daily_digest_enabled,
        digest_time=config.digest_time.strftime("%H:%M"),
        notification_prefs=config.notification_prefs,
        target_domains=config.target_domains if isinstance(config.target_domains, list) else [],
        telegram_connected=user.telegram_chat_id is not None,
        updated_at=config.updated_at.isoformat(),
    )


@router.post("/connect")
async def connect_telegram(
    data: BotConnectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Link Telegram account using a link code."""
    import redis as redis_lib
    from app.config import get_settings
    settings = get_settings()

    r = redis_lib.from_url(settings.redis_url)
    chat_id = r.get(f"telegram:link:{data.link_code}")
    r.close()

    if not chat_id:
        raise HTTPException(status_code=400, detail="Invalid or expired link code")

    user.telegram_chat_id = int(chat_id)
    await db.commit()

    # Clean up the link code
    r = redis_lib.from_url(settings.redis_url)
    r.delete(f"telegram:link:{data.link_code}")
    r.close()

    return {"message": "Telegram account connected", "chat_id": int(chat_id)}


@router.post("/disconnect")
async def disconnect_telegram(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unlink Telegram account."""
    user.telegram_chat_id = None
    await db.commit()
    return {"message": "Telegram account disconnected"}


@router.get("/status", response_model=BotStatus)
async def bot_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get bot connection status."""
    from app.config import get_settings
    settings = get_settings()

    bot_username = None
    if settings.telegram_bot_token and settings.telegram_bot_token != "your_telegram_bot_token_here":
        try:
            import httpx
            resp = httpx.get(
                f"https://api.telegram.org/bot{settings.telegram_bot_token}/getMe",
                timeout=5,
            )
            if resp.status_code == 200:
                bot_username = resp.json().get("result", {}).get("username")
        except Exception:
            pass

    return BotStatus(
        connected=user.telegram_chat_id is not None,
        telegram_chat_id=user.telegram_chat_id,
        bot_username=bot_username,
        daily_digest_enabled=True,
    )

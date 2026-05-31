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
        email_list=config.email_list if isinstance(config.email_list, list) else [],
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
    if data.email_list is not None:
        config.email_list = data.email_list

    await db.commit()
    await db.refresh(config)

    return BotConfigResponse(
        id=config.id,
        user_id=config.user_id,
        daily_digest_enabled=config.daily_digest_enabled,
        digest_time=config.digest_time.strftime("%H:%M"),
        notification_prefs=config.notification_prefs,
        target_domains=config.target_domains if isinstance(config.target_domains, list) else [],
        email_list=config.email_list if isinstance(config.email_list, list) else [],
        telegram_connected=user.telegram_chat_id is not None,
        updated_at=config.updated_at.isoformat(),
    )


@router.post("/send-email-digest")
async def send_email_digest(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a job digest email to all addresses in the user's email list."""
    from sqlalchemy import select, desc
    from app.models.job import Job
    from app.config import get_settings
    from datetime import datetime, timezone, timedelta
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    result = await db.execute(select(BotConfig).where(BotConfig.user_id == user.id))
    config = result.scalar_one_or_none()
    email_list: list[str] = (config.email_list or []) if config else []

    if not email_list:
        return {"sent": 0, "message": "No email addresses in the list."}

    # Get top 10 recent tech jobs
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    jobs_result = await db.execute(
        select(Job)
        .where(Job.is_tech == True, Job.is_active == True, Job.date_scraped >= cutoff)
        .order_by(desc(Job.match_score), desc(Job.date_scraped))
        .limit(10)
    )
    jobs = jobs_result.scalars().all()

    if not jobs:
        return {"sent": 0, "message": "No new jobs in the last 24h to send."}

    settings = get_settings()
    smtp_host = getattr(settings, "smtp_host", "")
    smtp_port = int(getattr(settings, "smtp_port", 587))
    smtp_user = getattr(settings, "smtp_user", "")
    smtp_pass = getattr(settings, "smtp_pass", "")

    if not smtp_host or not smtp_user:
        # Return preview without sending if SMTP not configured
        return {
            "sent": 0,
            "preview": [{"title": j.title, "company": j.company, "location": j.location} for j in jobs[:5]],
            "message": "SMTP not configured. Set smtp_host, smtp_user, smtp_pass in .env to enable sending.",
        }

    # Build HTML email
    job_rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #eee'><b>{j.title}</b><br>"
        f"<span style='color:#666'>{j.company} • {j.location or 'Remote'}</span></td>"
        f"<td style='padding:8px;border-bottom:1px solid #eee'>"
        f"{'<a href=\"' + j.apply_link + '\">Apply</a>' if j.apply_link else 'N/A'}</td></tr>"
        for j in jobs
    )
    html = f"""<html><body style='font-family:sans-serif;max-width:600px;margin:auto'>
<h2 style='color:#1F2937'>🔔 TJSR Daily Job Digest</h2>
<p>Here are today's top job openings matching your profile:</p>
<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse'>
<tr style='background:#FACC15'><th style='padding:8px;text-align:left'>Job</th><th style='padding:8px;text-align:left'>Apply</th></tr>
{job_rows}
</table>
<p style='margin-top:20px;color:#666;font-size:12px'>
Sent by TJSR • <a href='{settings.frontend_url}/dashboard/jobs'>View all jobs</a>
</p></body></html>"""

    sent = 0
    errors = []
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            for addr in email_list:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = f"TJSR Daily Digest — {len(jobs)} new jobs"
                    msg["From"] = smtp_user
                    msg["To"] = addr
                    msg.attach(MIMEText(html, "html"))
                    server.sendmail(smtp_user, addr, msg.as_string())
                    sent += 1
                except Exception as e:
                    errors.append(f"{addr}: {e}")
    except Exception as e:
        return {"sent": 0, "errors": [str(e)], "message": "SMTP connection failed."}

    return {"sent": sent, "total": len(email_list), "errors": errors}


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

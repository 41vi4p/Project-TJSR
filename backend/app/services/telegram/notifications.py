"""Daily digest and match notification system for Telegram."""

import logging
import html
from datetime import datetime, timezone, timedelta
from app.config import get_settings
from app.services.telegram.keyboards import job_card_keyboard

logger = logging.getLogger(__name__)


def send_all_digests() -> dict:
    """Send daily digest to all subscribed users. Called by Celery Beat."""
    from sqlalchemy import create_engine, select, and_
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.models.bot_config import BotConfig
    settings = get_settings()

    if not settings.telegram_bot_token or settings.telegram_bot_token == "your_telegram_bot_token_here":
        logger.warning("Telegram bot token not configured, skipping digest")
        return {"sent": 0, "skipped": 1}

    import asyncio
    from telegram import Bot
    bot = Bot(token=settings.telegram_bot_token)

    engine = create_engine(settings.sync_database_url)
    sent = 0
    errors = 0

    with Session(engine) as session:
        subscribed = session.execute(
            select(User, BotConfig)
            .join(BotConfig, BotConfig.user_id == User.id)
            .where(
                and_(
                    BotConfig.daily_digest_enabled == True,
                    User.telegram_chat_id.isnot(None),
                )
            )
        ).all()

        for user, config in subscribed:
            try:
                jobs = _get_digest_jobs(user, config, session)
                if not jobs:
                    continue

                message = _build_digest_message(user, jobs)
                asyncio.get_event_loop().run_until_complete(
                    bot.send_message(
                        chat_id=user.telegram_chat_id,
                        text=message,
                        parse_mode="MarkdownV2",
                        disable_web_page_preview=True,
                    )
                )
                sent += 1
                logger.info(f"Digest sent to user {user.id} (chat {user.telegram_chat_id})")
            except Exception as e:
                logger.error(f"Failed to send digest to user {user.id}: {e}")
                errors += 1

    return {"sent": sent, "errors": errors}


def send_job_match_notification(user_id: str, job_id: str) -> bool:
    """Send immediate notification for a new job match."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.models.bot_config import BotConfig
    from app.models.job import Job
    settings = get_settings()

    if not settings.telegram_bot_token or settings.telegram_bot_token == "your_telegram_bot_token_here":
        return False

    engine = create_engine(settings.sync_database_url)

    with Session(engine) as session:
        user = session.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
        if not user or not user.telegram_chat_id:
            return False

        config = session.execute(
            select(BotConfig).where(BotConfig.user_id == user_id)
        ).scalar_one_or_none()

        if not config or not config.daily_digest_enabled:
            return False

        job = session.execute(select(Job).where(Job.id == job_id)).scalar_one_or_none()
        if not job:
            return False

    try:
        import asyncio
        from telegram import Bot
        bot = Bot(token=settings.telegram_bot_token)

        skills_str = ", ".join((job.skills or [])[:5])
        salary_str = job.salary or "Not specified"
        loc_str = job.location or "Remote"

        text = (
            f"🆕 *New Job Match\\!*\n\n"
            f"💼 *{_escape(job.title)}*\n"
            f"🏢 {_escape(job.company)}\n"
            f"📍 {_escape(loc_str)}\n"
            f"💰 {_escape(salary_str)}\n"
            f"🛠 {_escape(skills_str) if skills_str else 'N/A'}"
        )

        keyboard = job_card_keyboard(
            job_id=job.id,
            apply_link=job.apply_link or "",
            page=0,
            total=1,
        )

        asyncio.get_event_loop().run_until_complete(
            bot.send_message(
                chat_id=user.telegram_chat_id,
                text=text,
                parse_mode="MarkdownV2",
                reply_markup=keyboard,
            )
        )
        return True

    except Exception as e:
        logger.error(f"Failed to send match notification: {e}")
        return False


async def send_chatbot_message(user_id: str, question: str, response: str) -> bool:
    """Send a chatbot response notification to Telegram."""
    from sqlalchemy import select
    from app.models.database import get_db_context
    from app.models.user import User
    settings = get_settings()

    if not settings.telegram_bot_token or settings.telegram_bot_token == "your_telegram_bot_token_here":
        return False

    async with get_db_context() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        chat_id = user.telegram_chat_id if user and user.telegram_chat_id else settings.telegram_chat_id
        if not chat_id:
            return False

    try:
        from telegram import Bot
        bot = Bot(token=settings.telegram_bot_token)

        max_body = 3500
        safe_response = html.escape(response[:max_body] + ("..." if len(response) > max_body else ""))

        text = (
            f"🤖 <b>TJSR Assistant</b>\n\n"
            f"❓ <b>You asked:</b>\n<i>{html.escape(question)}</i>\n\n"
            f"✨ <b>Answer:</b>\n{safe_response}\n\n"
            f'📜 <i>Type <b>/history</b> in this chat to see previous Dashboard sessions.</i>\n'
            f'🔗 <a href="{settings.frontend_url}/dashboard">Launch Dashboard</a>'
        )

        await bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="HTML",
        )
        return True

    except Exception as e:
        logger.error(f"Failed to send chatbot notification: {e}")
        return False


async def create_db_notification(user_id: str, type: str, title: str, message: str):
    """Create a persistent in-app notification in the database."""
    from app.models.database import get_db_context
    from app.models.notification import Notification

    async with get_db_context() as session:
        notif = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
        )
        session.add(notif)
        await session.commit()
        logger.info(f"In-app notification created for user {user_id}: {title}")


def _get_digest_jobs(user, config, session) -> list:
    from sqlalchemy import select, desc, and_
    from app.models.job import Job
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    return session.execute(
        select(Job)
        .where(and_(Job.date_scraped >= yesterday, Job.is_tech == True))
        .order_by(desc(Job.match_score), desc(Job.date_scraped))
        .limit(5)
    ).scalars().all()


def _build_digest_message(user, jobs: list) -> str:
    name = user.display_name or "there"
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    lines = [
        f"🌅 *Good morning, {_escape(name)}\\!*",
        f"📅 {_escape(date_str)} — Daily Job Digest\n",
        f"Here are today's top {len(jobs)} job matches:\n",
    ]
    for i, job in enumerate(jobs, 1):
        skills = ", ".join((job.skills or [])[:3])
        lines.append(
            f"{i}\\. *{_escape(job.title)}* at {_escape(job.company)}\n"
            f"   📍 {_escape(job.location or 'Remote')} • {_escape(skills or 'N/A')}\n"
        )
    settings = get_settings()
    lines.append(f"\n[View all jobs →]({settings.frontend_url}/dashboard/jobs)")
    return "\n".join(lines)


def _escape(text: str) -> str:
    if not text:
        return ""
    special = r"\_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text

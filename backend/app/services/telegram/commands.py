"""Telegram bot command handlers."""

import logging
import secrets
from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from app.services.telegram.keyboards import (
    main_menu_keyboard, job_card_keyboard, settings_keyboard,
    confirm_keyboard, link_account_keyboard
)

logger = logging.getLogger(__name__)


def _get_user_from_db(telegram_chat_id: int):
    """Fetch user record from PostgreSQL by telegram_chat_id."""
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        result = session.execute(
            select(User).where(User.telegram_chat_id == telegram_chat_id)
        )
        user = result.scalar_one_or_none()
        if user:
            # Detach from session
            session.expunge(user)
        return user


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    chat_id = update.effective_chat.id
    user = _get_user_from_db(chat_id)

    if user:
        await update.message.reply_text(
            f"👋 Welcome back, *{user.display_name or 'there'}*!\n\n"
            f"I'm your TJSR Job Assistant. Use the menu below to explore jobs.\n\n"
            f"Commands:\n"
            f"/jobs — Browse latest job matches\n"
            f"/stats — View your job search stats\n"
            f"/search \\<query\\> — Search for specific jobs\n"
            f"/settings — Configure notifications\n"
            f"/help — Show help",
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=main_menu_keyboard(),
        )
    else:
        # Generate a one-time link code
        link_code = secrets.token_urlsafe(16)
        import redis as redis_lib
        from app.config import get_settings
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        r.set(f"telegram:link:{link_code}", str(chat_id), ex=3600)  # 1 hour
        r.close()

        link_url = f"{settings.frontend_url}/dashboard/settings?link_code={link_code}"

        await update.message.reply_text(
            "👋 Welcome to *TJSR Job Assistant*!\n\n"
            "To get personalised job alerts, you need to link your TJSR account.\n\n"
            "Tap the button below to connect your account:",
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=link_account_keyboard(link_url),
        )


async def jobs_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /jobs command — show latest job matches."""
    chat_id = update.effective_chat.id
    user = _get_user_from_db(chat_id)

    if not user:
        await update.message.reply_text("Please link your account first. Use /start")
        return

    jobs = _fetch_latest_jobs(limit=5)
    if not jobs:
        await update.message.reply_text("No jobs found right now. Try again later!")
        return

    # Store jobs in context for pagination
    context.user_data["jobs"] = jobs
    context.user_data["job_page"] = 0

    await _send_job_card(update, context, jobs, page=0)


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command."""
    chat_id = update.effective_chat.id
    user = _get_user_from_db(chat_id)

    if not user:
        await update.message.reply_text("Please link your account first. Use /start")
        return

    stats = _fetch_user_stats(user.id)

    text = (
        f"📊 *Your Job Search Stats*\n\n"
        f"🗂 Total Jobs Available: {stats['total_jobs']}\n"
        f"⚡ Jobs Today: {stats['jobs_today']}\n"
        f"🎯 Matched Jobs: {stats['matched_jobs']}\n"
        f"📨 Applications Sent: {stats['applications_sent']}\n\n"
        f"_Keep going! Your next opportunity is just around the corner\\._"
    )

    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2)


async def search_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /search <query> command."""
    chat_id = update.effective_chat.id
    user = _get_user_from_db(chat_id)

    if not user:
        await update.message.reply_text("Please link your account first. Use /start")
        return

    query = " ".join(context.args) if context.args else ""
    if not query:
        await update.message.reply_text("Usage: /search <keywords>\nExample: /search Python backend remote")
        return

    await update.message.reply_text(f"🔍 Searching for: *{query}*...", parse_mode=ParseMode.MARKDOWN_V2)

    jobs = _search_jobs(query, limit=5)
    if not jobs:
        await update.message.reply_text("No matching jobs found. Try different keywords.")
        return

    context.user_data["jobs"] = jobs
    context.user_data["job_page"] = 0

    await _send_job_card(update, context, jobs, page=0)


async def settings_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /settings command."""
    chat_id = update.effective_chat.id
    user = _get_user_from_db(chat_id)

    if not user:
        await update.message.reply_text("Please link your account first. Use /start")
        return

    bot_config = _fetch_bot_config(user.id)

    text = (
        "⚙️ *Bot Settings*\n\n"
        f"📬 Daily Digest: {'✅ Enabled' if bot_config.get('daily_digest_enabled') else '❌ Disabled'}\n"
        f"⏰ Digest Time: {bot_config.get('digest_time', '08:00')}\n"
        f"🔗 Account: {'✅ Connected' if user.telegram_chat_id else '❌ Not Connected'}"
    )

    await update.message.reply_text(
        text,
        parse_mode=ParseMode.MARKDOWN_V2,
        reply_markup=settings_keyboard(
            digest_enabled=bot_config.get("daily_digest_enabled", True),
            connected=True,
        ),
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    text = (
        "🤖 *TJSR Bot Commands*\n\n"
        "/start — Welcome & account linking\n"
        "/jobs — Browse latest job matches\n"
        "/stats — Your job search statistics\n"
        "/search \\<query\\> — Search for specific jobs\n"
        "/settings — Configure bot preferences\n"
        "/help — Show this help message\n\n"
        "💡 *Tips*\n"
        "• Use inline buttons to navigate job listings\n"
        "• Tap *Apply Now* to go directly to the job application\n"
        "• Enable daily digest to get morning job updates\n"
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2)


# ── Callback Query Handlers ────────────────────────────────────────────────────

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button presses."""
    query = update.callback_query
    await query.answer()

    data = query.data
    if not data:
        return

    if data.startswith("job:next:"):
        page = int(data.split(":")[-1]) + 1
        jobs = context.user_data.get("jobs", [])
        if page < len(jobs):
            context.user_data["job_page"] = page
            await _edit_job_card(query, context, jobs, page)

    elif data.startswith("job:prev:"):
        page = int(data.split(":")[-1]) - 1
        jobs = context.user_data.get("jobs", [])
        if page >= 0:
            context.user_data["job_page"] = page
            await _edit_job_card(query, context, jobs, page)

    elif data.startswith("job:save:"):
        job_id = data.split(":")[-1]
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"🔖 Job saved! View it at your TJSR dashboard.")

    elif data.startswith("job:details:"):
        job_id = data.split(":")[-1]
        from app.config import get_settings
        settings = get_settings()
        link = f"{settings.frontend_url}/dashboard/jobs?id={job_id}"
        await query.message.reply_text(f"🔗 View full details: {link}")

    elif data == "settings:toggle_digest":
        chat_id = query.message.chat_id
        user = _get_user_from_db(chat_id)
        if user:
            config = _fetch_bot_config(user.id)
            new_state = not config.get("daily_digest_enabled", True)
            _update_bot_config(user.id, {"daily_digest_enabled": new_state})
            label = "✅ Enabled" if new_state else "❌ Disabled"
            await query.edit_message_text(
                f"Daily digest is now {label}.",
                reply_markup=settings_keyboard(new_state, True),
            )

    elif data.startswith("confirm:disconnect"):
        chat_id = query.message.chat_id
        _disconnect_telegram(chat_id)
        await query.edit_message_text("✅ Telegram bot disconnected from your account.")

    elif data == "noop":
        pass  # Page counter button, do nothing


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle plain text messages from reply keyboard."""
    text = update.message.text
    if text == "🔍 Browse Jobs":
        await jobs_command(update, context)
    elif text == "📊 My Stats":
        await stats_command(update, context)
    elif text == "⚙️ Settings":
        await settings_command(update, context)
    elif text == "❓ Help":
        await help_command(update, context)


# ── Helper functions ────────────────────────────────────────────────────────────

def _format_job_card(job, page: int, total: int) -> str:
    skills = ", ".join((job.get("skills") or [])[:5])
    salary = job.get("salary") or "Not specified"
    location = job.get("location") or "Remote"
    job_type = job.get("job_type") or "Full-time"

    return (
        f"💼 *{_escape(job.get('title', 'Job'))}*\n"
        f"🏢 {_escape(job.get('company', 'Company'))}\n"
        f"📍 {_escape(location)} • {_escape(job_type)}\n"
        f"💰 {_escape(salary)}\n"
        f"🛠 {_escape(skills) if skills else 'N/A'}\n\n"
        f"_{page + 1} of {total}_"
    )


def _escape(text: str) -> str:
    """Escape special chars for MarkdownV2."""
    if not text:
        return ""
    special = r"\_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text


async def _send_job_card(update: Update, context: ContextTypes.DEFAULT_TYPE, jobs: list, page: int):
    job = jobs[page]
    text = _format_job_card(job, page, len(jobs))
    keyboard = job_card_keyboard(
        job_id=job.get("id", ""),
        apply_link=job.get("apply_link", ""),
        page=page,
        total=len(jobs),
    )
    await update.message.reply_text(text, parse_mode=ParseMode.MARKDOWN_V2, reply_markup=keyboard)


async def _edit_job_card(query, context, jobs: list, page: int):
    job = jobs[page]
    text = _format_job_card(job, page, len(jobs))
    keyboard = job_card_keyboard(
        job_id=job.get("id", ""),
        apply_link=job.get("apply_link", ""),
        page=page,
        total=len(jobs),
    )
    await query.edit_message_text(text, parse_mode=ParseMode.MARKDOWN_V2, reply_markup=keyboard)


def _fetch_latest_jobs(limit: int = 5) -> list[dict]:
    from sqlalchemy import create_engine, select, desc
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        jobs = session.execute(
            select(Job).order_by(desc(Job.date_scraped)).limit(limit)
        ).scalars().all()
        return [
            {
                "id": j.id, "title": j.title, "company": j.company,
                "location": j.location, "job_type": j.job_type,
                "salary": j.salary, "skills": j.skills, "apply_link": j.apply_link,
            }
            for j in jobs
        ]


def _search_jobs(query: str, limit: int = 5) -> list[dict]:
    from sqlalchemy import create_engine, select, or_, desc
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    pattern = f"%{query}%"
    with Session(engine) as session:
        jobs = session.execute(
            select(Job).where(
                or_(Job.title.ilike(pattern), Job.description.ilike(pattern))
            ).order_by(desc(Job.date_scraped)).limit(limit)
        ).scalars().all()
        return [
            {
                "id": j.id, "title": j.title, "company": j.company,
                "location": j.location, "job_type": j.job_type,
                "salary": j.salary, "skills": j.skills, "apply_link": j.apply_link,
            }
            for j in jobs
        ]


def _fetch_user_stats(user_id: str) -> dict:
    from sqlalchemy import create_engine, select, func, and_
    from sqlalchemy.orm import Session
    from app.models.job import Job
    from app.models.application import Application
    from app.config import get_settings
    from datetime import datetime, timezone
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    with Session(engine) as session:
        total = session.execute(select(func.count()).select_from(Job)).scalar()
        today_count = session.execute(
            select(func.count()).select_from(Job).where(Job.date_scraped >= today)
        ).scalar()
        matched = session.execute(
            select(func.count()).select_from(Job).where(
                and_(Job.is_tech == True, Job.confidence_score >= 0.7)
            )
        ).scalar()
        apps = session.execute(
            select(func.count()).select_from(Application).where(Application.user_id == user_id)
        ).scalar()
    return {"total_jobs": total, "jobs_today": today_count, "matched_jobs": matched, "applications_sent": apps}


def _fetch_bot_config(user_id: str) -> dict:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.bot_config import BotConfig
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        config = session.execute(
            select(BotConfig).where(BotConfig.user_id == user_id)
        ).scalar_one_or_none()
        if config:
            return {
                "daily_digest_enabled": config.daily_digest_enabled,
                "digest_time": config.digest_time.strftime("%H:%M") if config.digest_time else "08:00",
            }
    return {"daily_digest_enabled": True, "digest_time": "08:00"}


def _update_bot_config(user_id: str, updates: dict):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.bot_config import BotConfig
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        config = session.execute(
            select(BotConfig).where(BotConfig.user_id == user_id)
        ).scalar_one_or_none()
        if config:
            for k, v in updates.items():
                setattr(config, k, v)
            session.commit()


def _disconnect_telegram(chat_id: int):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.models.user import User
    from app.config import get_settings
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as session:
        user = session.execute(
            select(User).where(User.telegram_chat_id == chat_id)
        ).scalar_one_or_none()
        if user:
            user.telegram_chat_id = None
            session.commit()

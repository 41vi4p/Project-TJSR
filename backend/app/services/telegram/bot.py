"""Telegram bot application setup and polling."""

import logging
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, filters,
)
from app.config import get_settings
from app.services.telegram.commands import (
    start_command, jobs_command, stats_command,
    search_command, settings_command, help_command,
    button_callback, text_handler,
)

logger = logging.getLogger(__name__)


def build_application() -> Application | None:
    """Build and configure the Telegram bot application."""
    settings = get_settings()
    token = settings.telegram_bot_token

    if not token or token == "your_telegram_bot_token_here":
        logger.warning("Telegram bot token not set. Bot will not start.")
        return None

    app = Application.builder().token(token).build()

    # Register command handlers
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("jobs", jobs_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(CommandHandler("search", search_command))
    app.add_handler(CommandHandler("settings", settings_command))
    app.add_handler(CommandHandler("help", help_command))

    # Callback query handler (inline buttons)
    app.add_handler(CallbackQueryHandler(button_callback))

    # Plain text handler (reply keyboard buttons)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    logger.info("Telegram bot application configured")
    return app


def run_bot():
    """Run the bot in polling mode (for standalone use)."""
    app = build_application()
    if app:
        logger.info("Starting Telegram bot polling...")
        app.run_polling(allowed_updates=["message", "callback_query"])


async def setup_webhook(app: Application, webhook_url: str):
    """Set up webhook for production deployment."""
    await app.bot.set_webhook(
        url=webhook_url,
        allowed_updates=["message", "callback_query"],
        drop_pending_updates=True,
    )
    logger.info(f"Webhook set to {webhook_url}")

"""Inline and reply keyboard builders for the Telegram bot."""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    """Main persistent reply keyboard."""
    keyboard = [
        ["🔍 Browse Jobs", "📊 My Stats"],
        ["⚙️ Settings",   "❓ Help"],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=False)


def job_card_keyboard(job_id: str, apply_link: str, page: int = 0, total: int = 1) -> InlineKeyboardMarkup:
    """Inline keyboard for a job card."""
    buttons = []

    # Apply button (external link)
    if apply_link and apply_link.startswith("http"):
        buttons.append([InlineKeyboardButton("🚀 Apply Now", url=apply_link)])

    # Navigation row
    nav_row = []
    if page > 0:
        nav_row.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"job:prev:{page}"))
    nav_row.append(InlineKeyboardButton(f"{page + 1}/{total}", callback_data="noop"))
    if page < total - 1:
        nav_row.append(InlineKeyboardButton("Next ➡️", callback_data=f"job:next:{page}"))
    if nav_row:
        buttons.append(nav_row)

    # Action row
    buttons.append([
        InlineKeyboardButton("🔖 Save", callback_data=f"job:save:{job_id}"),
        InlineKeyboardButton("📋 Details", callback_data=f"job:details:{job_id}"),
    ])

    return InlineKeyboardMarkup(buttons)


def settings_keyboard(digest_enabled: bool, connected: bool) -> InlineKeyboardMarkup:
    """Inline keyboard for settings."""
    digest_label = "🔔 Digest: ON ✅" if digest_enabled else "🔕 Digest: OFF ❌"
    buttons = [
        [InlineKeyboardButton(digest_label, callback_data="settings:toggle_digest")],
        [InlineKeyboardButton("⏰ Change Digest Time", callback_data="settings:digest_time")],
        [InlineKeyboardButton("🎯 Set Target Domains", callback_data="settings:domains")],
    ]
    if connected:
        buttons.append([InlineKeyboardButton("🔓 Disconnect Bot", callback_data="settings:disconnect")])

    return InlineKeyboardMarkup(buttons)


def confirm_keyboard(action: str) -> InlineKeyboardMarkup:
    """Generic confirm/cancel keyboard."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Confirm", callback_data=f"confirm:{action}"),
            InlineKeyboardButton("❌ Cancel", callback_data="cancel"),
        ]
    ])


def link_account_keyboard(link_url: str) -> InlineKeyboardMarkup:
    """Keyboard to open the account linking URL."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🔗 Link My Account", url=link_url)],
    ])

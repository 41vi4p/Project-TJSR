from pydantic import BaseModel
from datetime import time


class BotConfigUpdate(BaseModel):
    daily_digest_enabled: bool | None = None
    digest_time: str | None = None  # HH:MM format
    notification_prefs: dict | None = None
    target_domains: list[str] | None = None


class BotConfigResponse(BaseModel):
    id: str
    user_id: str
    daily_digest_enabled: bool
    digest_time: str
    notification_prefs: dict | None = None
    target_domains: list[str] | None = None
    telegram_connected: bool = False
    updated_at: str

    model_config = {"from_attributes": True}


class BotConnectRequest(BaseModel):
    link_code: str


class BotStatus(BaseModel):
    connected: bool
    telegram_chat_id: int | None = None
    bot_username: str | None = None
    daily_digest_enabled: bool = False
    last_digest_sent: str | None = None

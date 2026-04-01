import uuid
from datetime import datetime, time, timezone
from sqlalchemy import String, Boolean, Time, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.database import Base


class BotConfig(Base):
    __tablename__ = "bot_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), unique=True, nullable=False)
    daily_digest_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    digest_time: Mapped[time] = mapped_column(Time, default=time(8, 0))
    notification_prefs: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    target_domains: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship(back_populates="bot_config")

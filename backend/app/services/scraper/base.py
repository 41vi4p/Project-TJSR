from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


@dataclass
class RawContent:
    url: str
    html: str = ""
    text: str = ""
    title: str = ""
    links: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    scraped_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    engine: str = ""


class BaseScraper(ABC):
    """Abstract base class for all scraper engines."""

    name: str = "base"

    @abstractmethod
    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        """Scrape a URL and return raw content."""
        pass

    def can_handle(self, url: str) -> bool:
        """Check if this scraper can handle the given URL."""
        return True

    def _log(self, message: str, level: str = "info"):
        getattr(logger, level)(f"[{self.name}] {message}")

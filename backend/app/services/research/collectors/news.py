"""Google News RSS collector — free, keyless, India-localised results."""

import logging
from urllib.parse import quote

import feedparser

from app.services.research.utils import SourceDoc

logger = logging.getLogger(__name__)

_FEED = "https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"
_MAX_ENTRIES = 10


def collect(company: str) -> list[SourceDoc]:
    url = _FEED.format(query=quote(f'"{company}"'))
    try:
        feed = feedparser.parse(url)
    except Exception as exc:
        logger.warning(f"news feed failed for {company!r}: {exc}")
        return []

    sources = []
    for entry in (feed.entries or [])[:_MAX_ENTRIES]:
        link = entry.get("link", "")
        title = entry.get("title", "")
        if not link or not title:
            continue
        summary = entry.get("summary", "")
        published = entry.get("published", "")
        sources.append(SourceDoc(
            url=link,
            title=title,
            kind="news",
            text=f"{published} — {summary}"[:900],
        ))
    return sources

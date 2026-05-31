"""RSS/Atom feed scraper — parses job feeds from LinkedIn, Indeed, company boards, etc."""

import logging
import requests
from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)


class RSSFeedScraper(BaseScraper):
    """Parses RSS/Atom feeds and converts entries to RawContent job blocks."""

    name = "rss"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Fetching feed {url}")
        try:
            import feedparser
        except ImportError:
            self._log("feedparser not installed", "warning")
            return []

        try:
            # feedparser can parse from URL directly but we fetch manually for timeout control
            resp = requests.get(url, timeout=20, headers={
                "User-Agent": "Mozilla/5.0 (compatible; TJSRBot/1.0)"
            })
            resp.raise_for_status()
            feed = feedparser.parse(resp.text)
        except Exception as e:
            self._log(f"Feed fetch failed: {e}", "error")
            return []

        if not feed.entries:
            self._log(f"No entries in feed {url}", "warning")
            return []

        results = []
        for entry in feed.entries:
            title   = entry.get("title", "")
            link    = entry.get("link", url)
            summary = entry.get("summary", "") or entry.get("description", "")
            # Strip HTML tags from summary
            try:
                from bs4 import BeautifulSoup
                summary = BeautifulSoup(summary, "lxml").get_text(separator="\n", strip=True)
            except Exception:
                pass

            # Build a text block the NLP extractor can parse
            text = f"{title}\n{summary}"
            if not title:
                continue

            results.append(RawContent(
                url=link,
                text=text,
                title=title,
                engine=self.name,
                metadata={"feed_url": url, "published": entry.get("published", "")},
            ))

        self._log(f"Parsed {len(results)} entries from {url}")
        return results

from app.services.scraper.base import BaseScraper, RawContent
import logging

logger = logging.getLogger(__name__)


class NewspaperScraper(BaseScraper):
    """newspaper3k-based scraper for article and news content extraction."""

    name = "newspaper"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping (newspaper3k) {url}")

        try:
            from newspaper import Article

            article = Article(url)
            article.download()
            article.parse()

            text = article.text or ""
            title = article.title or ""
            links = list(article.extractor.get_urls(article.html) if article.html else [])

            # Try NLP extraction for keywords
            try:
                article.nlp()
                keywords = article.keywords
                summary = article.summary
            except Exception:
                keywords = []
                summary = ""

            return [RawContent(
                url=url,
                html=article.html or "",
                text=text,
                title=title,
                links=links,
                engine=self.name,
                metadata={
                    "authors": article.authors,
                    "publish_date": str(article.publish_date) if article.publish_date else None,
                    "keywords": keywords,
                    "summary": summary,
                },
            )]

        except ImportError:
            self._log("newspaper3k not installed, falling back", "warning")
            return []
        except Exception as e:
            self._log(f"newspaper3k scrape failed for {url}: {e}", "error")
            return []

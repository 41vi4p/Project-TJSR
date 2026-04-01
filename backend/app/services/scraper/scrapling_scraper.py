from app.services.scraper.base import BaseScraper, RawContent
import logging

logger = logging.getLogger(__name__)


class ScraplingEngine(BaseScraper):
    """Scrapling-based scraper for sophisticated web extraction."""

    name = "scrapling"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping (Scrapling) {url}")
        config = config or {}

        try:
            from scrapling import Fetcher

            fetcher = Fetcher(auto_match=True)
            page = fetcher.get(url, timeout=30)

            if not page or not page.status == 200:
                self._log(f"Scrapling fetch failed for {url}", "error")
                return []

            text = page.get_all_text() if hasattr(page, 'get_all_text') else page.text
            html = page.html_content if hasattr(page, 'html_content') else str(page)

            # Try to find job listings
            job_blocks = []
            selectors = config.get("selectors", [
                ".job-listing", ".job-card", ".job-post",
                ".vacancy", ".opening", ".position",
            ])

            for selector in selectors:
                try:
                    elements = page.css(selector)
                    if elements and len(elements) >= 2:
                        for elem in elements:
                            elem_text = elem.get_all_text() if hasattr(elem, 'get_all_text') else elem.text
                            job_blocks.append(RawContent(
                                url=url,
                                html=str(elem),
                                text=elem_text,
                                engine=self.name,
                                metadata={"selector": selector},
                            ))
                        break
                except Exception:
                    continue

            if job_blocks:
                return job_blocks

            # Extract links
            links = []
            try:
                for link in page.css("a"):
                    href = link.attrib.get("href", "")
                    if href.startswith("http"):
                        links.append(href)
            except Exception:
                pass

            return [RawContent(
                url=url,
                html=html,
                text=text,
                links=links,
                engine=self.name,
            )]

        except ImportError:
            self._log("Scrapling not installed, falling back", "warning")
            return []
        except Exception as e:
            self._log(f"Scrapling scrape failed for {url}: {e}", "error")
            return []

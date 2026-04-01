import requests
from bs4 import BeautifulSoup
from app.services.scraper.base import BaseScraper, RawContent
import logging

logger = logging.getLogger(__name__)


class BS4Scraper(BaseScraper):
    """BeautifulSoup4 scraper for static HTML pages."""

    name = "bs4"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping {url}")
        config = config or {}

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
        except requests.RequestException as e:
            self._log(f"Request failed for {url}: {e}", "error")
            return []

        soup = BeautifulSoup(response.text, "lxml")

        # ── Priority 1: JSON-LD structured data — must run BEFORE script removal ──
        json_ld_contents = self._extract_json_ld(soup, url, response.text)
        if json_ld_contents:
            return json_ld_contents

        # Remove script and style elements for text extraction
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)

        # Extract links
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("http"):
                links.append(href)
            elif href.startswith("/"):
                from urllib.parse import urljoin
                links.append(urljoin(url, href))

        # ── Priority 2: CSS selector job block extraction ──
        job_contents = self._extract_job_blocks(soup, config)
        if job_contents:
            return job_contents

        # ── Priority 3: full page as one block ──
        return [RawContent(
            url=url,
            html=response.text,
            text=text,
            title=soup.title.string if soup.title else "",
            links=links,
            engine=self.name,
        )]

    def _extract_job_blocks(self, soup: BeautifulSoup, config: dict) -> list[RawContent]:
        """Try to extract individual job listing blocks from the page."""
        results = []

        # Common job listing selectors — includes Phenom People (NVIDIA, etc.)
        # and other common ATS platforms
        selectors = config.get("selectors", [
            # Phenom People (NVIDIA, Comcast, etc.)
            ".position-card", ".position-list-item", ".position-title",
            "[data-ph-id]", ".careers-item",
            # Workday
            "[data-automation-id='jobItem']", ".WKIP",
            # Greenhouse
            ".job-post", ".opening",
            # Lever
            ".posting", ".posting-title",
            # Generic
            ".job-listing", ".job-card", ".job-item", ".vacancy",
            "[data-job]", ".career-listing", ".position-item",
            "article.job", "li.job",
        ])

        for selector in selectors:
            blocks = soup.select(selector)
            if blocks and len(blocks) >= 2:  # Found multiple job blocks
                for block in blocks:
                    text = block.get_text(separator="\n", strip=True)
                    links = [a["href"] for a in block.find_all("a", href=True)]
                    results.append(RawContent(
                        url=links[0] if links else "",
                        html=str(block),
                        text=text,
                        links=links,
                        engine=self.name,
                        metadata={"selector": selector},
                    ))
                break

        return results

    def _extract_json_ld(self, soup: BeautifulSoup, page_url: str, page_html: str) -> list[RawContent]:
        """Extract JSON-LD JobPosting entries — works for any site that serves structured data."""
        import json
        found = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
            except (json.JSONDecodeError, TypeError):
                continue
            entries = []
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                entries = [data]
            elif isinstance(data, dict) and "@graph" in data:
                entries = [e for e in data["@graph"] if e.get("@type") == "JobPosting"]
            elif isinstance(data, list):
                entries = [e for e in data if isinstance(e, dict) and e.get("@type") == "JobPosting"]

            for entry in entries:
                title = entry.get("title") or entry.get("name") or ""
                if title:
                    found.append(RawContent(
                        url=entry.get("url") or page_url,
                        html=page_html,
                        text=json.dumps(entry),  # NLP extractor will parse this
                        title=title,
                        engine=self.name,
                        metadata={"json_ld": True, "json_ld_jobs": [entry]},
                    ))
        return found

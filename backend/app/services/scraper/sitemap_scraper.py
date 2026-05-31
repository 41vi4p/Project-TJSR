"""Sitemap-based URL discovery — finds job listing URLs from sitemap.xml / robots.txt."""

import logging
import re
import requests
from urllib.parse import urljoin, urlparse
from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)

# Patterns that suggest a URL is a job listing page
JOB_URL_PATTERNS = re.compile(
    r"/(job|jobs|career|careers|position|opening|vacancy|vacancies|role|roles|"
    r"apply|hiring|recruit|opportunity|opportunities)/",
    re.IGNORECASE,
)


class SitemapScraper(BaseScraper):
    """
    Discovers job URLs via sitemap.xml / robots.txt, then scrapes each with BS4.
    Use this as a first-pass discovery engine for large career sites.
    """

    name = "sitemap"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        config   = config or {}
        max_urls = int(config.get("max_urls", 50))
        base     = f"{urlparse(url).scheme}://{urlparse(url).netloc}"

        job_urls = self._discover_job_urls(base, url, max_urls)
        if not job_urls:
            self._log(f"No job URLs found via sitemap for {url}", "warning")
            return []

        self._log(f"Discovered {len(job_urls)} job URLs — scraping each with BS4")

        from app.services.scraper.bs4_scraper import BS4Scraper
        bs4 = BS4Scraper()
        results = []
        for job_url in job_urls[:max_urls]:
            try:
                contents = bs4.scrape(job_url, config)
                results.extend(contents)
            except Exception as e:
                self._log(f"BS4 failed for {job_url}: {e}", "warning")

        return results

    def _discover_job_urls(self, base: str, seed_url: str, limit: int) -> list[str]:
        """Try robots.txt → sitemap index → sitemap → filter job URLs."""
        sitemap_urls = self._find_sitemaps(base)
        if not sitemap_urls:
            # Fallback: try common sitemap paths
            for path in ["/sitemap.xml", "/sitemap_index.xml", "/careers/sitemap.xml"]:
                sitemap_urls.append(urljoin(base, path))

        job_urls: list[str] = []
        seen: set[str] = set()

        for sitemap_url in sitemap_urls[:5]:
            try:
                urls = self._parse_sitemap(sitemap_url)
                for u in urls:
                    if u not in seen and JOB_URL_PATTERNS.search(u):
                        seen.add(u)
                        job_urls.append(u)
                    if len(job_urls) >= limit:
                        return job_urls
            except Exception as e:
                self._log(f"Sitemap parse failed {sitemap_url}: {e}", "warning")

        return job_urls

    def _find_sitemaps(self, base: str) -> list[str]:
        """Parse robots.txt for Sitemap: directives."""
        try:
            resp = requests.get(urljoin(base, "/robots.txt"), timeout=10,
                                headers={"User-Agent": "TJSRBot/1.0"})
            if resp.ok:
                return re.findall(r"^Sitemap:\s*(.+)$", resp.text, re.MULTILINE | re.IGNORECASE)
        except Exception:
            pass
        return []

    def _parse_sitemap(self, url: str) -> list[str]:
        """Parse a sitemap XML and return all <loc> URLs, recursing into sitemap indexes."""
        resp = requests.get(url, timeout=15, headers={"User-Agent": "TJSRBot/1.0"})
        resp.raise_for_status()

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "lxml-xml")

        # Sitemap index — recurse
        if soup.find("sitemapindex"):
            urls = []
            for loc in soup.find_all("loc")[:10]:
                try:
                    urls.extend(self._parse_sitemap(loc.text.strip()))
                except Exception:
                    pass
            return urls

        return [loc.text.strip() for loc in soup.find_all("loc")]

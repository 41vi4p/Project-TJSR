"""
TalentBrew career portal scraper (Barclays, TMP Worldwide platform).

TalentBrew serves server-side-rendered HTML with 26 jobs per page, but
pagination requires JavaScript to maintain search session state, so we use
Selenium only for pagination URL collection, then switch to plain requests
for each job detail page which has full JSON-LD structured data.

Strategy
────────
Phase 1 — Selenium: load listing page, paginate via the "Next" button,
          collect every individual job URL from the data-job-id link elements.
Phase 2 — Requests+BS4: fetch each /job/{loc}/{slug}/{site}/{id} detail URL;
          extract the <script type="application/ld+json"> JobPosting block.
"""

import logging
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)

_DETAIL_DELAY = 0.4   # seconds between detail page requests
_PAGE_DELAY   = 2.5   # seconds to wait after clicking Next
_MAX_PAGES    = 100   # safety cap


class TalentBrewScraper(BaseScraper):
    """
    Scraper for TalentBrew career portals (Barclays, etc.).
    Phase 1 uses Selenium for JS-paginated listing; Phase 2 uses requests for JSON-LD detail pages.
    """

    name = "talentbrew"

    def can_handle(self, url: str) -> bool:
        return "talentbrew" in url or "jobs.barclays" in url

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        config = config or {}
        self._log(f"TalentBrew scraper starting: {url}")

        base_url = self._base(url)

        # ── Phase 1: collect all job URLs via Selenium pagination ─────────────
        job_urls = self._collect_job_urls(url, base_url, config)
        self._log(f"Collected {len(job_urls)} job URLs")

        if not job_urls:
            self._log("No job URLs found — cannot proceed", "warning")
            return []

        # ── Phase 2: fetch each detail page with requests → JSON-LD ──────────
        session = self._build_session()
        results: list[RawContent] = []

        for i, job_url in enumerate(job_urls):
            rc = self._fetch_job_detail(job_url, session, base_url)
            if rc:
                results.append(rc)
            if i > 0 and i % 20 == 0:
                self._log(f"Fetched {i}/{len(job_urls)} job pages …")
            time.sleep(_DETAIL_DELAY)

        self._log(f"TalentBrew complete: {len(results)}/{len(job_urls)} job pages fetched")
        return results

    # ── Phase 1: Selenium pagination ─────────────────────────────────────────

    def _collect_job_urls(self, listing_url: str, base_url: str, config: dict) -> list[str]:
        try:
            driver = self._get_driver()
        except Exception as exc:
            self._log(f"Selenium unavailable: {exc}", "error")
            return self._fallback_bs4_collect(listing_url, base_url)

        job_urls: list[str] = []
        max_pages = config.get("max_pages", _MAX_PAGES)

        try:
            driver.get(listing_url)
            time.sleep(3)  # initial render

            for page_num in range(1, max_pages + 1):
                new_urls = self._extract_job_links_selenium(driver, base_url)
                added = sum(1 for u in new_urls if u not in job_urls)
                job_urls.extend(u for u in new_urls if u not in job_urls)
                self._log(f"Page {page_num}: +{added} job URLs (total {len(job_urls)})")

                if not self._click_next(driver):
                    self._log("No more pages — pagination complete")
                    break

                time.sleep(_PAGE_DELAY)

        except Exception as exc:
            self._log(f"Selenium error: {exc}", "error")
        finally:
            try:
                driver.quit()
            except Exception:
                pass

        return job_urls

    def _extract_job_links_selenium(self, driver, base_url: str) -> list[str]:
        """Extract all job detail hrefs from the current listing page."""
        from selenium.webdriver.common.by import By

        urls: list[str] = []
        try:
            # TalentBrew job links have data-job-id and href=/job/{loc}/{slug}/{site}/{id}
            elements = driver.find_elements(By.CSS_SELECTOR, "a[data-job-id]")
            if not elements:
                # Fallback: any link matching /job/ pattern
                elements = driver.find_elements(By.CSS_SELECTOR, "a[href*='/job/']")
            for el in elements:
                href = el.get_attribute("href") or ""
                if href and "/job/" in href:
                    full = href if href.startswith("http") else urljoin(base_url, href)
                    urls.append(full)
        except Exception as exc:
            self._log(f"Link extraction error: {exc}", "warning")

        return list(dict.fromkeys(urls))  # dedupe, preserve order

    def _click_next(self, driver) -> bool:
        """Click the Next pagination button. Returns True if clicked."""
        from selenium.webdriver.common.by import By

        selectors = [
            "a.next:not(.disabled)",
            "a[rel='next']",
            "a[aria-label*='next' i]:not(.disabled)",
            ".pagination a.next",
            "nav.pagination a:last-child:not(.disabled)",
        ]

        for sel in selectors:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn and btn.is_displayed() and btn.is_enabled():
                    driver.execute_script("arguments[0].click();", btn)
                    return True
            except Exception:
                continue

        # Fallback: look for button/link with text "Next"
        try:
            from selenium.webdriver.common.by import By
            links = driver.find_elements(By.TAG_NAME, "a")
            for link in links:
                txt = (link.text or "").strip().lower()
                cls = " ".join(link.get_attribute("class") or "").lower()
                if txt == "next" and "disabled" not in cls and link.is_displayed():
                    driver.execute_script("arguments[0].click();", link)
                    return True
        except Exception:
            pass

        return False

    # ── Fallback: BS4 collection (single page only when Selenium fails) ───────

    def _fallback_bs4_collect(self, listing_url: str, base_url: str) -> list[str]:
        """Fallback: collect job URLs from the first page only via BS4."""
        self._log("Selenium unavailable — collecting page-1 only via BS4")
        try:
            session = self._build_session()
            r = session.get(listing_url, timeout=20)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "lxml")
            urls = []
            for a in soup.select("a[data-job-id], a[href*='/job/']"):
                href = a.get("href", "")
                if "/job/" in href:
                    full = href if href.startswith("http") else urljoin(base_url, href)
                    if full not in urls:
                        urls.append(full)
            self._log(f"BS4 fallback: found {len(urls)} job URLs on page 1")
            return urls
        except Exception as exc:
            self._log(f"BS4 fallback failed: {exc}", "error")
            return []

    # ── Phase 2: detail page fetching ─────────────────────────────────────────

    def _fetch_job_detail(self, url: str, session: requests.Session, base_url: str) -> RawContent | None:
        """Fetch a job detail page and extract JSON-LD JobPosting."""
        import json

        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
        except Exception as exc:
            self._log(f"Failed to fetch {url}: {exc}", "warning")
            return None

        soup = BeautifulSoup(resp.text, "lxml")

        # Extract JSON-LD JobPosting blocks
        json_ld_entries = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict) and data.get("@type") == "JobPosting":
                    # Ensure company name is set — TalentBrew sometimes omits it
                    if "hiringOrganization" not in data:
                        data["hiringOrganization"] = {"@type": "Organization", "name": "Barclays"}
                    elif isinstance(data["hiringOrganization"], dict):
                        if not data["hiringOrganization"].get("name"):
                            data["hiringOrganization"]["name"] = "Barclays"
                    # Ensure url is set
                    if not data.get("url"):
                        data["url"] = url
                    json_ld_entries.append(data)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("@type") == "JobPosting":
                            if not item.get("url"):
                                item["url"] = url
                            json_ld_entries.append(item)
            except (json.JSONDecodeError, TypeError):
                continue

        title = json_ld_entries[0].get("title", "") if json_ld_entries else ""

        # If no JSON-LD found, try scraping visible content as fallback
        if not json_ld_entries:
            return self._fallback_text_content(url, soup)

        # Build plain text for NLP skill extraction
        desc_html = json_ld_entries[0].get("description", "")
        desc_text = self._html_to_text(desc_html)

        plain_text = "\n".join(filter(None, [
            title,
            f"Company: Barclays",
            desc_text,
        ]))

        return RawContent(
            url=url,
            html=desc_html,
            text=plain_text[:10_000],
            title=title,
            engine=self.name,
            metadata={"json_ld_jobs": json_ld_entries},
        )

    def _fallback_text_content(self, url: str, soup: BeautifulSoup) -> RawContent | None:
        """Fallback when no JSON-LD found: extract visible text content."""
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        title_el = soup.select_one("h1, .job-title, [class*='position-title']")
        title = title_el.get_text(strip=True) if title_el else ""

        desc_el = soup.select_one(
            ".job-description, [class*='job-desc'], [class*='description'], "
            "[id*='description'], .tb-content, .job-details"
        )
        desc_text = desc_el.get_text(separator="\n", strip=True) if desc_el else ""
        full_text = soup.get_text(separator="\n", strip=True)

        if not title:
            return None

        return RawContent(
            url=url,
            html="",
            text=f"{title}\nCompany: Barclays\n{desc_text or full_text}"[:10_000],
            title=title,
            engine=self.name,
            metadata={},
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _html_to_text(html: str) -> str:
        if not html:
            return ""
        try:
            return BeautifulSoup(html, "lxml").get_text(separator="\n", strip=True)[:8_000]
        except Exception:
            import re
            return re.sub(r"<[^>]+>", " ", html).strip()[:8_000]

    @staticmethod
    def _build_session() -> requests.Session:
        s = requests.Session()
        s.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer":         "https://search.jobs.barclays/",
        })
        return s

    def _get_driver(self):
        """Build headless Chrome driver — identical to PhenomScraper._get_driver."""
        import os
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        chrome_bin = os.environ.get("CHROME_BIN")
        if chrome_bin and os.path.exists(chrome_bin):
            options.binary_location = chrome_bin

        try:
            return webdriver.Chrome(options=options)
        except Exception:
            try:
                from webdriver_manager.chrome import ChromeDriverManager
                from selenium.webdriver.chrome.service import Service as ChromeService
                return webdriver.Chrome(
                    service=ChromeService(ChromeDriverManager().install()),
                    options=options,
                )
            except Exception:
                from webdriver_manager.chrome import ChromeDriverManager
                from webdriver_manager.core.os_manager import ChromeType
                from selenium.webdriver.chrome.service import Service as ChromeService
                return webdriver.Chrome(
                    service=ChromeService(
                        ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install()
                    ),
                    options=options,
                )

    @staticmethod
    def _base(url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"

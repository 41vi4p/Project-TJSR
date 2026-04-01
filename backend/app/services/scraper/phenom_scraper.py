"""
Phenom People Career Site scraper (NVIDIA, Comcast, etc.)

Strategy:
  Phase 1 — Selenium: load the listing page, scroll through all sidebar pages,
             collect every individual job URL without clicking each card.
  Phase 2 — BS4: fetch each /careers/job/{id} URL individually; they serve
             JSON-LD JobPosting in the initial HTML so no JS execution needed.
"""

import logging
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)

# ── Selectors for the left sidebar job cards ──────────────────────────────────
# Phenom People renders job cards as <li> or <div> elements; the clickable link
# always leads to /careers/job/{id}.  We try multiple selectors in order.
CARD_LINK_SELECTORS = [
    "a[href*='/careers/job/']",
    "a[href*='/job/']",
    ".position-card a",
    ".position-list-item a",
    "[data-ph-id] a",
    ".careers-item a",
    "li[class*='position'] a",
]

# ── Selectors for the "Next page" button ─────────────────────────────────────
NEXT_PAGE_SELECTORS = [
    "button[aria-label='Next Page']",
    "button[aria-label='next page']",
    "button[data-ph-id*='next']",
    ".pagination button:last-child",
    "nav[aria-label*='pagination'] button:last-child",
    # Fallback: any button whose visible text is exactly ">"
]


class PhenomScraper(BaseScraper):
    """
    Scraper for Phenom People Career Sites (NVIDIA, etc.).
    Handles multi-page sidebar pagination and per-job JSON-LD extraction.
    """

    name = "phenom"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        config = config or {}
        self._log(f"Phenom scraper starting: {url}")

        base_url = self._base(url)

        # ── Phase 1: collect all job page URLs via Selenium ──────────────────
        job_urls = self._collect_job_urls(url, base_url, config)
        self._log(f"Collected {len(job_urls)} job URLs")

        if not job_urls:
            self._log("No job URLs found — falling back to full-page content", "warning")
            return self._fallback_full_page(url)

        # ── Phase 2: fetch each job page with BS4 → JSON-LD extraction ───────
        session = requests.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        })

        results: list[RawContent] = []
        for job_url in job_urls:
            content = self._fetch_job_page(job_url, session)
            if content:
                results.append(content)
            time.sleep(0.3)  # polite rate-limiting

        self._log(f"Fetched content for {len(results)}/{len(job_urls)} job pages")
        return results

    # ── Phase 1 helpers ───────────────────────────────────────────────────────

    def _collect_job_urls(self, listing_url: str, base_url: str, config: dict) -> list[str]:
        """Use Selenium to paginate through the sidebar and collect all job URLs."""
        try:
            driver = self._get_driver()
        except Exception as e:
            self._log(f"Selenium unavailable ({e}), cannot collect URLs", "error")
            return []

        job_urls: list[str] = []
        max_pages = config.get("max_pages", 50)  # safety cap

        try:
            driver.get(listing_url)
            self._wait_for_cards(driver, config)

            for page_num in range(max_pages):
                # Extract all job hrefs visible in the sidebar right now
                new_urls = self._extract_card_urls(driver, base_url)
                added = 0
                for u in new_urls:
                    if u not in job_urls:
                        job_urls.append(u)
                        added += 1
                self._log(f"Page {page_num + 1}: +{added} jobs (total {len(job_urls)})")

                # Try to click the next-page button
                if not self._click_next_page(driver):
                    self._log("No more pages")
                    break

                # Wait for sidebar to refresh
                time.sleep(2)
                self._wait_for_cards(driver, config)

        except Exception as e:
            self._log(f"Selenium pagination error: {e}", "error")
        finally:
            try:
                driver.quit()
            except Exception:
                pass

        return job_urls

    def _wait_for_cards(self, driver, config: dict, timeout: int = 20):
        """Wait until at least one job card link is present in the DOM."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        wait_time = config.get("wait_time", timeout)

        for selector in CARD_LINK_SELECTORS:
            try:
                WebDriverWait(driver, wait_time).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                return
            except Exception:
                continue

        # Fallback: just wait a flat number of seconds
        time.sleep(config.get("spa_settle_time", 5))

    def _extract_card_urls(self, driver, base_url: str) -> list[str]:
        """Extract all job URLs from card links visible in the current sidebar page."""
        from selenium.webdriver.common.by import By

        urls: list[str] = []
        for selector in CARD_LINK_SELECTORS:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    for elem in elements:
                        href = elem.get_attribute("href") or ""
                        if href and ("/job/" in href or "/careers/job/" in href):
                            full = href if href.startswith("http") else urljoin(base_url, href)
                            urls.append(full)
                    if urls:
                        return list(dict.fromkeys(urls))  # dedupe, preserve order
            except Exception:
                continue
        return urls

    def _click_next_page(self, driver) -> bool:
        """
        Click the 'Next Page' button. Returns True if clicked, False if not found
        (i.e., we're on the last page).
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        for selector in NEXT_PAGE_SELECTORS:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, selector)
                if btn and btn.is_enabled() and btn.is_displayed():
                    # Make sure it's not the "previous" button
                    label = (btn.get_attribute("aria-label") or "").lower()
                    if "prev" in label:
                        continue
                    driver.execute_script("arguments[0].click();", btn)
                    return True
            except Exception:
                continue

        # Fallback: look for any button with text ">" or "›" or "Next"
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                txt = (btn.text or "").strip()
                if txt in (">", "›", "→", "Next", "next"):
                    aria = (btn.get_attribute("aria-label") or "").lower()
                    if "prev" not in aria and btn.is_enabled() and btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        return True
        except Exception:
            pass

        return False

    def _get_driver(self):
        """Build a headless Chrome/Chromium driver with webdriver-manager fallback."""
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
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        chrome_bin = os.environ.get("CHROME_BIN")
        if chrome_bin and os.path.exists(chrome_bin):
            options.binary_location = chrome_bin

        try:
            driver = webdriver.Chrome(options=options)
        except Exception:
            try:
                from webdriver_manager.chrome import ChromeDriverManager
                from selenium.webdriver.chrome.service import Service as ChromeService
                service = ChromeService(ChromeDriverManager().install())
                driver = webdriver.Chrome(service=service, options=options)
            except Exception:
                from webdriver_manager.chrome import ChromeDriverManager
                from webdriver_manager.core.os_manager import ChromeType
                from selenium.webdriver.chrome.service import Service as ChromeService
                service = ChromeService(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
                driver = webdriver.Chrome(service=service, options=options)

        driver.set_page_load_timeout(60)
        return driver

    # ── Phase 2 helpers ───────────────────────────────────────────────────────

    def _fetch_job_page(self, url: str, session: requests.Session) -> RawContent | None:
        """Fetch an individual job page with BS4 and extract JSON-LD."""
        import json

        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            self._log(f"Failed to fetch {url}: {e}", "warning")
            return None

        soup = BeautifulSoup(resp.text, "lxml")

        # Extract JSON-LD JobPosting
        json_ld_entries = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict) and data.get("@type") == "JobPosting":
                    json_ld_entries.append(data)
                elif isinstance(data, list):
                    json_ld_entries.extend(e for e in data if isinstance(e, dict) and e.get("@type") == "JobPosting")
            except (json.JSONDecodeError, TypeError):
                continue

        title = ""
        if json_ld_entries:
            title = json_ld_entries[0].get("title") or json_ld_entries[0].get("name") or ""

        # Also grab visible text as fallback for NLP extractor
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)

        return RawContent(
            url=url,
            html=resp.text,
            text=text,
            title=title,
            engine=self.name,
            metadata={"json_ld_jobs": json_ld_entries} if json_ld_entries else {},
        )

    def _fallback_full_page(self, url: str) -> list[RawContent]:
        """If Selenium fails entirely, return BS4 content of the listing page."""
        try:
            session = requests.Session()
            session.headers["User-Agent"] = (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            for tag in soup(["script", "style"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            return [RawContent(url=url, html=resp.text, text=text, engine=self.name)]
        except Exception as e:
            self._log(f"Fallback fetch failed: {e}", "error")
            return []

    @staticmethod
    def _base(url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"

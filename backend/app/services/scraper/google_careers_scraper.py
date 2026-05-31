"""
Google Careers scraper.

Strategy:
  Phase 1 — Selenium: load jobs/results listing page, wait for job cards,
             extract all `a[href*="jobs/results/"]` links, paginate via
             ?page=N until no new jobs are found.
  Phase 2 — Selenium: for each job detail URL, render the page, wait for the
             full description to load, then extract structured text from the DOM.

Google's careers portal is a proprietary SPA with no JSON-LD and heavily
obfuscated class names, so both phases need JS execution.
"""

import logging
import time
from urllib.parse import urljoin, urlparse, urlencode, parse_qs, urlunparse

from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)

BASE = "https://www.google.com"
CAREERS_BASE = "https://www.google.com/about/careers/applications"

# Selectors used to wait for / extract job cards on the listing page.
# Google uses obfuscated class names so we rely on the stable href pattern.
CARD_LINK_SELECTOR = "a[href*='jobs/results/']"

# Selectors tried in order for the "Next page" button
NEXT_BTN_SELECTORS = [
    "button[aria-label='Next page']",
    "button[aria-label='next page']",
    "button[jsname='VqVxGc']",    # observed in some Google UIs
    "button[aria-label*='Next']",
]

# Selectors for the job detail page content
DETAIL_WAIT_SELECTORS = [
    "h1",                          # job title heading
    "[data-job-id]",
    ".aG5W3",                      # sometimes present
    "article",
]


class GoogleCareersScraper(BaseScraper):
    """
    Scraper for Google Careers (careers.google.com / google.com/about/careers).
    Handles multi-page listings and renders individual job detail pages.
    """

    name = "google_careers"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        config = config or {}
        self._log(f"Starting Google Careers scrape: {url}")

        # ── Phase 1: collect all job detail URLs via Selenium ─────────────────
        job_urls = self._collect_job_urls(url, config)
        self._log(f"Collected {len(job_urls)} job URLs")

        if not job_urls:
            self._log("No job URLs found — returning listing page content as fallback", "warning")
            return self._scrape_listing_fallback(url, config)

        # ── Phase 2: render each job detail page and extract content ──────────
        results: list[RawContent] = []
        max_jobs = config.get("max_jobs", 200)

        try:
            driver = self._get_driver()
        except Exception as e:
            self._log(f"Selenium unavailable for Phase 2 ({e}), skipping detail pages", "error")
            return results

        try:
            for i, job_url in enumerate(job_urls[:max_jobs]):
                self._log(f"Detail {i + 1}/{min(len(job_urls), max_jobs)}: {job_url}")
                content = self._scrape_detail_page(driver, job_url, config)
                if content:
                    results.append(content)
                time.sleep(config.get("detail_delay", 0.5))
        finally:
            try:
                driver.quit()
            except Exception:
                pass

        self._log(f"Phase 2 complete: {len(results)} job pages extracted")
        return results

    # ── Phase 1 ───────────────────────────────────────────────────────────────

    def _collect_job_urls(self, listing_url: str, config: dict) -> list[str]:
        """Paginate the listing page and collect all individual job URLs."""
        try:
            driver = self._get_driver()
        except Exception as e:
            self._log(f"Selenium unavailable for Phase 1: {e}", "error")
            return []

        job_urls: list[str] = []
        max_pages = config.get("max_pages", 20)
        wait_time = config.get("wait_time", 15)

        try:
            for page_num in range(1, max_pages + 1):
                page_url = self._build_page_url(listing_url, page_num)
                self._log(f"Loading page {page_num}: {page_url}")

                driver.get(page_url)
                loaded = self._wait_for_job_cards(driver, wait_time)

                if not loaded:
                    self._log(f"No job cards appeared on page {page_num} — stopping pagination")
                    break

                new_urls = self._extract_card_urls(driver)
                if not new_urls:
                    self._log(f"No job links on page {page_num} — stopping pagination")
                    break

                added = 0
                for u in new_urls:
                    if u not in job_urls:
                        job_urls.append(u)
                        added += 1

                self._log(f"Page {page_num}: +{added} jobs (total {len(job_urls)})")

                if added == 0:
                    # We got URLs but all were duplicates — last page
                    break

                # Check for next page button; if not present, stop
                if not self._has_next_page(driver):
                    self._log("No next-page button found — last page reached")
                    break

                time.sleep(1)

        except Exception as e:
            self._log(f"Pagination error: {e}", "error")
        finally:
            try:
                driver.quit()
            except Exception:
                pass

        return job_urls

    def _wait_for_job_cards(self, driver, timeout: int = 15) -> bool:
        """Wait until at least one job card link appears. Returns True if found."""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        try:
            WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, CARD_LINK_SELECTOR))
            )
            return True
        except Exception:
            # Fallback: wait and check manually
            time.sleep(5)
            try:
                cards = driver.find_elements(By.CSS_SELECTOR, CARD_LINK_SELECTOR)
                return len(cards) > 0
            except Exception:
                return False

    def _extract_card_urls(self, driver) -> list[str]:
        """Extract all job detail URLs from cards currently visible on the page."""
        from selenium.webdriver.common.by import By

        urls = []
        try:
            elems = driver.find_elements(By.CSS_SELECTOR, CARD_LINK_SELECTOR)
            for elem in elems:
                href = elem.get_attribute("href") or ""
                if not href:
                    href = elem.get_attribute("data-href") or ""
                if href and "jobs/results/" in href:
                    # Normalise to absolute URL
                    if href.startswith("http"):
                        full = href
                    elif href.startswith("/"):
                        full = BASE + href
                    else:
                        full = urljoin(CAREERS_BASE + "/", href)
                    # Strip trailing query params for dedup (keep clean URL)
                    urls.append(full.split("?")[0])
        except Exception as e:
            self._log(f"Error extracting card URLs: {e}", "warning")

        return list(dict.fromkeys(urls))  # dedupe, preserve order

    def _has_next_page(self, driver) -> bool:
        """Return True if a clickable 'Next page' button is present."""
        from selenium.webdriver.common.by import By

        for selector in NEXT_BTN_SELECTORS:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, selector)
                if btn.is_displayed() and btn.is_enabled():
                    disabled = btn.get_attribute("disabled") or btn.get_attribute("aria-disabled") or ""
                    if disabled.lower() not in ("true", "disabled"):
                        return True
            except Exception:
                continue

        # Fallback: look for any button containing "Next" or "›"
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                txt = (btn.text or "").strip()
                aria = (btn.get_attribute("aria-label") or "").lower()
                if txt in (">", "›", "→", "Next") or "next" in aria:
                    if "prev" not in aria and btn.is_displayed() and btn.is_enabled():
                        disabled = btn.get_attribute("disabled") or btn.get_attribute("aria-disabled") or ""
                        if disabled.lower() not in ("true", "disabled"):
                            return True
        except Exception:
            pass

        return False

    # ── Phase 2 ───────────────────────────────────────────────────────────────

    def _scrape_detail_page(self, driver, url: str, config: dict) -> RawContent | None:
        """
        Load a single job detail page with Selenium and extract all visible text.
        Returns a RawContent object with structured metadata extracted from DOM.
        """
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        wait_time = config.get("wait_time", 15)

        try:
            driver.get(url)

            # Wait for the page to load meaningful content
            loaded = False
            for selector in DETAIL_WAIT_SELECTORS:
                try:
                    WebDriverWait(driver, wait_time).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                    )
                    loaded = True
                    break
                except Exception:
                    continue

            if not loaded:
                time.sleep(5)  # last resort flat wait

            # Extra wait for SPA to finish rendering description text
            time.sleep(config.get("spa_settle_time", 2))

            # ── Extract structured fields directly from DOM ────────────────
            title = self._extract_title(driver)
            location = self._extract_location(driver)
            description = self._extract_description(driver)
            job_type = self._extract_job_type(driver)
            minimum_qualifications = self._extract_section(driver, "Minimum qualifications")
            preferred_qualifications = self._extract_section(driver, "Preferred qualifications")
            responsibilities = self._extract_section(driver, "Responsibilities") or self._extract_section(driver, "About the job")

            # Build rich text for NLP extraction
            parts = []
            if title:
                parts.append(f"Job Title: {title}")
            parts.append("Company: Google")
            if location:
                parts.append(f"Location: {location}")
            if job_type:
                parts.append(f"Job Type: {job_type}")
            if description:
                parts.append(f"\nAbout the job:\n{description}")
            if responsibilities:
                parts.append(f"\nResponsibilities:\n{responsibilities}")
            if minimum_qualifications:
                parts.append(f"\nMinimum qualifications:\n{minimum_qualifications}")
            if preferred_qualifications:
                parts.append(f"\nPreferred qualifications:\n{preferred_qualifications}")

            text = "\n".join(parts)

            if not title and not text.strip():
                self._log(f"Empty detail page: {url}", "warning")
                return None

            # Build metadata for NLP extractor
            metadata = {
                "company": "Google",
                "source_name": "Google Careers",
            }

            # If we have enough structured data, build a synthetic JSON-LD entry
            # so the NLP extractor uses Priority 1 path
            if title:
                json_ld_entry = {
                    "@type": "JobPosting",
                    "title": title,
                    "hiringOrganization": {"@type": "Organization", "name": "Google"},
                    "jobLocation": self._build_location_json_ld(location),
                    "description": description or text,
                    "employmentType": self._map_job_type(job_type),
                    "url": url,
                }
                metadata["json_ld_jobs"] = [json_ld_entry]

            return RawContent(
                url=url,
                html="",          # don't store raw HTML for memory efficiency
                text=text,
                title=title,
                engine=self.name,
                metadata=metadata,
            )

        except Exception as e:
            self._log(f"Failed to scrape detail page {url}: {e}", "error")
            return None

    def _extract_title(self, driver) -> str:
        from selenium.webdriver.common.by import By
        # Try h1 first, then h2, then any prominent heading
        for selector in ["h1", "h2", "[class*='title']", "[class*='heading']"]:
            try:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elems:
                    txt = (elem.text or "").strip()
                    if 3 < len(txt) < 200 and not txt.startswith("http"):
                        return txt
            except Exception:
                continue
        return ""

    def _extract_location(self, driver) -> str:
        from selenium.webdriver.common.by import By
        # Google renders location in a span/div near the title
        location_keywords = ["location", "Hyderabad", "Bengaluru", "Pune", "Mumbai",
                              "India", "Gurugram", "Remote", "hybrid"]
        selectors = [
            "[class*='location']",
            "[class*='Location']",
            "[itemprop='addressLocality']",
            "span[class*='loca']",
        ]
        for selector in selectors:
            try:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elems:
                    txt = (elem.text or "").strip()
                    if txt and len(txt) < 200:
                        return txt
            except Exception:
                continue

        # Fallback: scan visible text blocks for location keywords
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text
            for line in body_text.split("\n"):
                line = line.strip()
                if any(kw.lower() in line.lower() for kw in location_keywords):
                    if len(line) < 150:
                        return line
        except Exception:
            pass

        return ""

    def _extract_description(self, driver) -> str:
        from selenium.webdriver.common.by import By
        for selector in [
            "[class*='description']",
            "[class*='Description']",
            "article",
            "main",
            "[role='main']",
        ]:
            try:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                for elem in elems:
                    txt = (elem.text or "").strip()
                    if len(txt) > 200:
                        return txt[:5000]
            except Exception:
                continue
        return ""

    def _extract_section(self, driver, section_name: str) -> str:
        """Extract a named section (e.g. 'Responsibilities') from the page."""
        from selenium.webdriver.common.by import By
        try:
            body = driver.find_element(By.TAG_NAME, "body").text
            lines = body.split("\n")
            for i, line in enumerate(lines):
                if section_name.lower() in line.lower() and len(line) < 100:
                    # Collect following lines until next section header
                    section_lines = []
                    for j in range(i + 1, min(i + 50, len(lines))):
                        next_line = lines[j].strip()
                        # Stop at next section (short line followed by content)
                        if (len(next_line) < 80 and next_line.endswith(":") and j > i + 2):
                            break
                        if next_line:
                            section_lines.append(next_line)
                    return "\n".join(section_lines[:30])
        except Exception:
            pass
        return ""

    def _extract_job_type(self, driver) -> str:
        from selenium.webdriver.common.by import By
        try:
            body = driver.find_element(By.TAG_NAME, "body").text.lower()
            if "full-time" in body or "full time" in body:
                return "Full-time"
            if "part-time" in body or "part time" in body:
                return "Part-time"
            if "internship" in body or "intern" in body:
                return "Internship"
            if "contract" in body:
                return "Contract"
        except Exception:
            pass
        return "Full-time"

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _build_page_url(base_url: str, page: int) -> str:
        """Inject/replace the `page` query parameter in a URL."""
        if page == 1:
            return base_url
        parsed = urlparse(base_url)
        params = parse_qs(parsed.query)
        params["page"] = [str(page)]
        # Flatten list values back to strings
        flat = {k: v[0] if isinstance(v, list) and len(v) == 1 else v for k, v in params.items()}
        new_query = urlencode(flat)
        return urlunparse(parsed._replace(query=new_query))

    @staticmethod
    def _build_location_json_ld(location: str) -> list[dict]:
        if not location:
            return []
        return [{"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": location}}]

    @staticmethod
    def _map_job_type(raw: str) -> str:
        mapping = {
            "Full-time": "FULL_TIME",
            "Part-time": "PART_TIME",
            "Internship": "INTERN",
            "Contract": "CONTRACTOR",
        }
        return mapping.get(raw, "FULL_TIME")

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
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        options.add_argument(
            "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
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
        # Mask navigator.webdriver to reduce bot detection
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
        )
        return driver

    def _scrape_listing_fallback(self, url: str, config: dict) -> list[RawContent]:
        """Last resort: return rendered text of the listing page itself."""
        try:
            driver = self._get_driver()
            driver.get(url)
            self._wait_for_job_cards(driver, config.get("wait_time", 15))
            time.sleep(2)
            text = driver.find_element(__import__("selenium").webdriver.common.by.By.TAG_NAME, "body").text
            return [RawContent(url=url, text=text, engine=self.name, metadata={"company": "Google"})]
        except Exception as e:
            self._log(f"Listing fallback failed: {e}", "error")
            return []
        finally:
            try:
                driver.quit()
            except Exception:
                pass

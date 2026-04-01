from app.services.scraper.base import BaseScraper, RawContent
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import logging
import time

logger = logging.getLogger(__name__)


class SeleniumScraper(BaseScraper):
    """Selenium scraper for JavaScript-rendered pages."""

    name = "selenium"

    def _get_driver(self):
        import os

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

        # Set chrome binary if explicitly configured
        chrome_bin = os.environ.get("CHROME_BIN")
        if chrome_bin and os.path.exists(chrome_bin):
            options.binary_location = chrome_bin

        # Try direct Chrome/Chromium first, fall back to webdriver-manager
        try:
            driver = webdriver.Chrome(options=options)
        except Exception:
            try:
                from webdriver_manager.chrome import ChromeDriverManager
                from selenium.webdriver.chrome.service import Service as ChromeService
                service = ChromeService(ChromeDriverManager().install())
                driver = webdriver.Chrome(service=service, options=options)
            except Exception:
                # Last resort: try chromium-driver
                from webdriver_manager.core.os_manager import ChromeType
                from webdriver_manager.chrome import ChromeDriverManager
                from selenium.webdriver.chrome.service import Service as ChromeService
                service = ChromeService(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
                driver = webdriver.Chrome(service=service, options=options)

        driver.set_page_load_timeout(60)
        return driver

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping (Selenium) {url}")
        config = config or {}
        driver = None

        try:
            driver = self._get_driver()
            driver.get(url)

            # Wait for initial DOM ready
            wait_selector = config.get("wait_for", "body")
            wait_time = config.get("wait_time", 15)
            WebDriverWait(driver, wait_time).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector))
            )

            # For SPAs: wait for network/XHR to settle before reading content
            self._wait_for_spa(driver, config.get("spa_settle_time", 5))

            # Optional: scroll to trigger lazy loading
            if config.get("scroll", True):
                self._scroll_page(driver, max_scrolls=config.get("max_scrolls", 5))

            # Optional: click "Load More" button
            load_more = config.get("load_more_selector")
            if load_more:
                self._click_load_more(driver, load_more, max_clicks=3)

            page_source = driver.page_source
            text = driver.find_element(By.TAG_NAME, "body").text

            # Extract links
            links = []
            for elem in driver.find_elements(By.TAG_NAME, "a"):
                href = elem.get_attribute("href")
                if href and href.startswith("http"):
                    links.append(href)

            title = driver.title

            return [RawContent(
                url=url,
                html=page_source,
                text=text,
                title=title,
                links=links,
                engine=self.name,
            )]

        except Exception as e:
            self._log(f"Selenium scrape failed for {url}: {e}", "error")
            return []

        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    def _wait_for_spa(self, driver, max_seconds: int = 5):
        """Poll until the page body stops growing (XHR/React renders settle)."""
        import time
        prev_len = 0
        stable_count = 0
        deadline = time.time() + max_seconds
        while time.time() < deadline:
            try:
                current_len = len(driver.find_element(By.TAG_NAME, "body").text)
            except Exception:
                break
            if current_len == prev_len:
                stable_count += 1
                if stable_count >= 2:
                    break
            else:
                stable_count = 0
                prev_len = current_len
            time.sleep(1)

    def _scroll_page(self, driver, max_scrolls: int = 5):
        """Scroll the page to load lazy-loaded content."""
        last_height = driver.execute_script("return document.body.scrollHeight")
        for _ in range(max_scrolls):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

    def _click_load_more(self, driver, selector: str, max_clicks: int = 3):
        """Click a 'Load More' button multiple times."""
        for _ in range(max_clicks):
            try:
                btn = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                )
                btn.click()
                time.sleep(2)
            except Exception:
                break

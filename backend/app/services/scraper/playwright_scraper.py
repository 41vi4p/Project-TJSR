"""Playwright-based scraper for JavaScript-heavy career pages."""

import asyncio
import logging
from app.services.scraper.base import BaseScraper, RawContent

logger = logging.getLogger(__name__)


class PlaywrightScraper(BaseScraper):
    """Headless Chromium via Playwright — best for JS SPAs and sites that block Selenium."""

    name = "playwright"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping {url}")
        config = config or {}
        try:
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(self._async_scrape(url, config))
            finally:
                loop.close()
        except ImportError:
            self._log("playwright not installed — run: playwright install chromium", "warning")
            return []
        except Exception as e:
            self._log(f"Failed for {url}: {e}", "error")
            return []

    async def _async_scrape(self, url: str, config: dict) -> list[RawContent]:
        from playwright.async_api import async_playwright

        wait_until = config.get("wait_until", "networkidle")
        timeout    = int(config.get("timeout", 30000))
        wait_for   = config.get("wait_for")          # CSS selector to wait for
        scroll     = config.get("scroll", False)      # scroll to load lazy content
        extra_wait = int(config.get("extra_wait", 0)) # ms to wait after load

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
            )
            page = await ctx.new_page()

            try:
                await page.goto(url, wait_until=wait_until, timeout=timeout)

                if wait_for:
                    try:
                        await page.wait_for_selector(wait_for, timeout=10000)
                    except Exception:
                        pass

                if extra_wait:
                    await asyncio.sleep(extra_wait / 1000)

                if scroll:
                    await self._auto_scroll(page)

                html    = await page.content()
                title   = await page.title()
                text    = await page.evaluate("() => document.body.innerText")
                links   = await page.evaluate(
                    "() => Array.from(document.querySelectorAll('a[href]'))"
                    ".map(a => a.href).filter(h => h.startsWith('http'))"
                )

            finally:
                await browser.close()

        # Try JSON-LD first (same as BS4 scraper)
        from app.services.scraper.bs4_scraper import BS4Scraper
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        json_ld = BS4Scraper()._extract_json_ld(soup, url, html)
        if json_ld:
            return json_ld

        return [RawContent(
            url=url, html=html, text=text, title=title,
            links=links[:200], engine=self.name,
        )]

    @staticmethod
    async def _auto_scroll(page):
        """Scroll to bottom incrementally to trigger lazy-loaded content."""
        await page.evaluate("""async () => {
            await new Promise(resolve => {
                let total = 0;
                const step = 400;
                const timer = setInterval(() => {
                    window.scrollBy(0, step);
                    total += step;
                    if (total >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 120);
            });
        }""")

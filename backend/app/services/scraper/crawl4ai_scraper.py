from app.services.scraper.base import BaseScraper, RawContent
import logging

logger = logging.getLogger(__name__)


class Crawl4AIScraper(BaseScraper):
    """Crawl4AI scraper — requires crawl4ai >= 0.3.x (async API)."""

    name = "crawl4ai"

    def scrape(self, url: str, config: dict | None = None) -> list[RawContent]:
        self._log(f"Scraping (Crawl4AI) {url}")
        config = config or {}
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(self._async_scrape(url, config))
            finally:
                loop.close()
        except ImportError:
            self._log("crawl4ai not installed", "warning")
            return []
        except Exception as e:
            self._log(f"Crawl4AI failed for {url}: {e}", "error")
            return []

    async def _async_scrape(self, url: str, config: dict) -> list[RawContent]:
        from crawl4ai import AsyncWebCrawler

        kwargs = {}

        # Try to import the newer config objects (0.4.x). Fall back gracefully.
        try:
            from crawl4ai import BrowserConfig, CrawlerRunConfig

            run_cfg_kwargs = {}
            if config.get("wait_for"):
                run_cfg_kwargs["wait_for"] = config["wait_for"]
            if config.get("js_code"):
                run_cfg_kwargs["js_code"] = config["js_code"]
            if config.get("page_timeout"):
                run_cfg_kwargs["page_timeout"] = int(config["page_timeout"])

            kwargs["config"] = CrawlerRunConfig(**run_cfg_kwargs)
            browser_cfg = BrowserConfig(headless=True, verbose=False)
            crawler_ctx = AsyncWebCrawler(config=browser_cfg)
        except ImportError:
            # Older 0.3.x — no BrowserConfig
            crawler_ctx = AsyncWebCrawler(verbose=False)

        async with crawler_ctx as crawler:
            if "config" in kwargs:
                result = await crawler.arun(url=url, config=kwargs["config"])
            else:
                result = await crawler.arun(url=url)

        if not result or not result.success:
            self._log(f"Crawl4AI returned failure for {url}", "error")
            return []

        return self._build_content(url, result)

    def _build_content(self, url: str, result) -> list[RawContent]:
        # markdown can be a string OR a MarkdownGenerationResult object (0.4.x)
        text = ""
        md = getattr(result, "markdown", None)
        if md is not None:
            if isinstance(md, str):
                text = md
            elif hasattr(md, "raw_markdown"):
                text = md.raw_markdown or ""
            elif hasattr(md, "fit_markdown"):
                text = md.fit_markdown or ""

        if not text:
            text = getattr(result, "extracted_content", "") or ""

        html = getattr(result, "html", "") or ""

        # links: dict with 'internal'/'external' lists of dicts with 'href'
        links: list[str] = []
        raw_links = getattr(result, "links", None)
        if isinstance(raw_links, dict):
            for key in ("internal", "external"):
                for item in raw_links.get(key, []):
                    href = item.get("href", "") if isinstance(item, dict) else str(item)
                    if href and href.startswith("http"):
                        links.append(href)
        elif isinstance(raw_links, (list, tuple)):
            for item in raw_links:
                href = item.get("href", "") if isinstance(item, dict) else str(item)
                if href:
                    links.append(href)

        title = ""
        meta = getattr(result, "metadata", None)
        if isinstance(meta, dict):
            title = meta.get("title", "") or meta.get("og:title", "")

        return [RawContent(
            url=url,
            html=html,
            text=text,
            title=title,
            links=links,
            engine=self.name,
            metadata={"markdown_length": len(text)},
        )]

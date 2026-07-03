"""Official-website collector — resolves the company's own site from a SearXNG
query, then scrapes the homepage and /about page reusing the existing scraper
engines (Crawl4AI markdown first, BS4 fallback). Bypasses ScraperManager.run(),
which is ScraperConfig-DB-bound."""

import logging
from urllib.parse import urlparse

from app.services.research.collectors.searxng import search_official_site
from app.services.research.utils import SourceDoc, domain_of

logger = logging.getLogger(__name__)

# Domains that can never be a company's own site
_EXCLUDED_DOMAINS = (
    "linkedin.com", "glassdoor", "ambitionbox.com", "indeed.com", "naukri.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
    "wikipedia.org", "crunchbase.com", "zaubacorp.com", "tofler.in",
    "justdial.com", "reddit.com", "quora.com", "monster.com", "shine.com",
    "timesjobs.com", "foundit.in", "github.com", "medium.com",
)


def _scrape_page(url: str) -> str:
    """Best-effort page text: Crawl4AI (clean markdown) → BS4 fallback."""
    try:
        from app.services.scraper.crawl4ai_scraper import Crawl4AIScraper
        pages = Crawl4AIScraper().scrape(url)
        if pages and pages[0].text.strip():
            return pages[0].text
    except Exception as exc:
        logger.info(f"crawl4ai failed for {url}: {exc}")
    try:
        from app.services.scraper.bs4_scraper import BS4Scraper
        pages = BS4Scraper().scrape(url)
        if pages:
            return "\n".join(p.text for p in pages if p.text)
    except Exception as exc:
        logger.info(f"bs4 failed for {url}: {exc}")
    return ""


def resolve_official_site(searxng_url: str, company: str) -> str | None:
    """Pick the first non-excluded result of the 'official website' query whose
    domain contains a company-name token. A token match is REQUIRED: accepting
    an arbitrary top result once attributed a stranger's website (and its whois
    record) to the company being researched — worse than finding nothing."""
    company_tokens = [t for t in company.lower().split() if len(t) > 2]
    candidates = search_official_site(searxng_url, company)

    for r in candidates:
        url = r.get("url", "")
        if not url:
            continue
        dom = domain_of(url)
        if any(x in dom for x in _EXCLUDED_DOMAINS):
            continue
        if any(t in dom.replace("-", "") for t in company_tokens):
            return f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    return None


def collect(searxng_url: str, company: str) -> tuple[list[SourceDoc], str | None]:
    """Returns (sources, official_domain). official_domain is None when no
    credible site was found — that itself feeds the no_official_site red flag."""
    site = resolve_official_site(searxng_url, company)
    if not site:
        return [], None

    sources: list[SourceDoc] = []
    for path, label in [("", "Homepage"), ("/about", "About page")]:
        url = f"{site}{path}"
        text = _scrape_page(url)
        if text.strip():
            sources.append(SourceDoc(
                url=url,
                title=f"{company} — {label}",
                kind="website",
                text=text[:4000],
            ))

    return sources, domain_of(site)

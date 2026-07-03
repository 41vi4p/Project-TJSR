"""SearXNG collector — search snippets for reviews, scam mentions, financials,
tech stack, plus review-site deep links (Glassdoor/AmbitionBox are linked,
never scraped).

Queries are throttled: upstream engines (Brave/DDG/Startpage) suspend the
instance's IP on rapid-fire bursts. The shared company-report cache keeps
real-world volume at one burst per company per 30 days.
"""

import logging
import time

import httpx

from app.services.research.utils import SourceDoc, normalize_url

logger = logging.getLogger(__name__)

_QUERY_DELAY_S = 2.5

_REVIEW_PLATFORMS = {
    "glassdoor.com": "glassdoor",
    "glassdoor.co.in": "glassdoor",
    "ambitionbox.com": "ambitionbox",
    "reddit.com": "reddit",
}

# (query template, results to keep)
_QUERIES: list[tuple[str, int]] = [
    ('"{company}" employee reviews', 10),
    ('"{company}" site:glassdoor.com OR site:ambitionbox.com', 10),
    ('"{company}" work culture OR "work life balance"', 8),
    ('"{company}" clients OR partners OR "case study"', 8),
    ('"{company}" scam OR fraud OR fake offer', 10),
    ('"{company}" "training fee" OR "registration fee" OR deposit', 8),
    ('"{company}" funding OR revenue OR acquisition OR layoffs', 10),
    ('"{company}" tech stack OR "engineering blog"', 8),
]


def _search(base_url: str, query: str, limit: int) -> list[dict]:
    resp = httpx.get(
        f"{base_url.rstrip('/')}/search",
        params={"q": query, "format": "json", "language": "en", "safesearch": 0},
        timeout=20,
    )
    resp.raise_for_status()
    return (resp.json().get("results") or [])[:limit]


def search_official_site(base_url: str, company: str) -> list[dict]:
    """Separate query used by the website collector to resolve the official domain."""
    try:
        return _search(base_url, f'"{company}" official website', 10)
    except Exception as exc:
        logger.warning(f"searxng official-site query failed: {exc}")
        return []


def collect(base_url: str, company: str) -> tuple[list[SourceDoc], list[dict]]:
    """
    Run all query templates. Returns (sources, review_links).
    review_links are deep links to review platforms — content is never scraped.
    """
    sources: list[SourceDoc] = []
    review_links: list[dict] = []
    seen: set[str] = set()

    for i, (template, limit) in enumerate(_QUERIES):
        if i > 0:
            time.sleep(_QUERY_DELAY_S)
        query = template.format(company=company)
        try:
            results = _search(base_url, query, limit)
        except Exception as exc:
            logger.warning(f"searxng query failed ({query!r}): {exc}")
            continue

        for r in results:
            url, title = r.get("url", ""), r.get("title", "")
            if not url:
                continue
            key = normalize_url(url)
            if key in seen:
                continue
            seen.add(key)

            platform = next(
                (p for d, p in _REVIEW_PLATFORMS.items() if d in url.lower()), None
            )
            if platform:
                review_links.append({"platform": platform, "url": url, "title": title[:200]})

            # Search-result SNIPPETS are kept as evidence for every result —
            # including review platforms (ratings/pros-cons text the engines
            # surface). The review pages themselves are never fetched.
            sources.append(SourceDoc(
                url=url,
                title=title,
                kind="searxng",
                text=(r.get("content") or "")[:900],
            ))

    return sources, review_links

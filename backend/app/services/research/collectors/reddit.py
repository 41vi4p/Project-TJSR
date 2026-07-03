"""Reddit collector — discussion threads about the company.

Reddit's public JSON endpoints now return 403 to non-OAuth clients, so threads
are discovered via SearXNG (indexed by the upstream engines) with a
reddit-oriented query, filtered to reddit.com results."""

import logging

from app.services.research.utils import SourceDoc, domain_of

logger = logging.getLogger(__name__)

_MAX_RESULTS = 10


def collect(searxng_url: str, company: str) -> list[SourceDoc]:
    from app.services.research.collectors.searxng import _search

    sources: list[SourceDoc] = []
    try:
        results = _search(
            searxng_url,
            f'"{company}" reddit review OR "work culture" OR experience',
            limit=20,
        )
    except Exception as exc:
        logger.warning(f"reddit-via-searxng failed for {company!r}: {exc}")
        return []

    for r in results:
        url = r.get("url", "")
        if "reddit.com" not in domain_of(url):
            continue
        sources.append(SourceDoc(
            url=url,
            title=r.get("title", ""),
            kind="reddit",
            text=(r.get("content") or r.get("title") or "")[:900],
        ))
        if len(sources) >= _MAX_RESULTS:
            break
    return sources

"""Wikipedia collector — keyless, immune to search-engine suspensions, and for
established companies the article intro carries exactly the facts freshers
need: what the company is, who owns it, acquisitions, and often revenue.

Brands without their own article are frequently covered by their parent's
(e.g. CarWale → CarTrade.com), so candidates are accepted when the article
text mentions the company, not only on a title match."""

import logging
from urllib.parse import quote

import httpx

from app.services.research.utils import SourceDoc

logger = logging.getLogger(__name__)

_UA = {"User-Agent": "TJSR-CompanyCheck/1.0 (job-seeker research tool)"}
_EXTRACT_CHARS = 6000
_MAX_CANDIDATES = 3


def _fetch_extract(title_key: str) -> str:
    # No `exchars` — the API clamps it at 1200, which cuts off the History /
    # Finances sections where revenue and acquisition facts live. Fetch the
    # full plaintext extract and truncate ourselves.
    resp = httpx.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "prop": "extracts", "explaintext": 1,
            "titles": title_key.replace("_", " "),
            "format": "json", "redirects": 1,
        },
        headers=_UA, timeout=20,
    )
    resp.raise_for_status()
    pages = resp.json().get("query", {}).get("pages", {})
    return next((p.get("extract", "") for p in pages.values()), "")[:_EXTRACT_CHARS]


def collect(company: str) -> list[SourceDoc]:
    try:
        resp = httpx.get(
            "https://en.wikipedia.org/w/rest.php/v1/search/page",
            params={"q": f"{company} company", "limit": _MAX_CANDIDATES},
            headers=_UA, timeout=15,
        )
        resp.raise_for_status()
        pages = resp.json().get("pages", [])

        company_lower = company.lower()
        for page in pages:
            key = page.get("key")
            if not key:
                continue
            extract = _fetch_extract(key)
            blob = f"{page.get('title', '')} {extract}".lower()
            # Accept only when the article actually talks about this company
            # (title match, or the exact name appears in the article body).
            if company_lower not in blob:
                continue
            if not extract.strip():
                continue
            return [SourceDoc(
                url=f"https://en.wikipedia.org/wiki/{quote(key)}",
                title=f"{page.get('title', company)} — Wikipedia",
                kind="wikipedia",
                category="finance",
                text=extract[:_EXTRACT_CHARS],
            )]
        return []
    except Exception as exc:
        logger.warning(f"wikipedia collector failed for {company!r}: {exc}")
        return []

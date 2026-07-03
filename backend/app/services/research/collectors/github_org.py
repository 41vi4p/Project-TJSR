"""GitHub collector — unauthenticated org search + repo languages.
Rate limit is 60 req/h per IP; a 403 means rate-limited → skip silently
(the shared company-report cache keeps actual call volume low)."""

import logging

import httpx

from app.services.research.utils import SourceDoc

logger = logging.getLogger(__name__)

_API = "https://api.github.com"
_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "TJSR-CompanyCheck/1.0"}


def collect(company: str) -> list[SourceDoc]:
    try:
        resp = httpx.get(
            f"{_API}/search/users",
            params={"q": f"{company} type:org", "per_page": 3},
            headers=_HEADERS, timeout=15,
        )
        if resp.status_code == 403:
            logger.info("github rate-limited, skipping")
            return []
        resp.raise_for_status()
        items = resp.json().get("items", [])
    except Exception as exc:
        logger.warning(f"github org search failed for {company!r}: {exc}")
        return []

    company_token = company.lower().split()[0] if company.split() else ""
    org = next(
        (i for i in items if company_token and company_token in i.get("login", "").lower()),
        items[0] if items else None,
    )
    if not org:
        return []

    login = org["login"]
    try:
        resp = httpx.get(
            f"{_API}/orgs/{login}/repos",
            params={"sort": "updated", "per_page": 15},
            headers=_HEADERS, timeout=15,
        )
        if resp.status_code in (403, 404):
            return []
        resp.raise_for_status()
        repos = resp.json()
    except Exception as exc:
        logger.warning(f"github repos fetch failed for {login}: {exc}")
        return []

    if not repos:
        return []

    languages = sorted({r["language"] for r in repos if r.get("language")})
    top_repos = [f"{r['name']} ({r.get('language') or 'n/a'}, ★{r.get('stargazers_count', 0)})"
                 for r in repos[:8]]
    summary = (
        f"GitHub org '{login}': {len(repos)} recent public repos. "
        f"Languages: {', '.join(languages) or 'unknown'}. "
        f"Recently updated: {'; '.join(top_repos)}"
    )
    return [SourceDoc(
        url=f"https://github.com/{login}",
        title=f"{company} on GitHub ({login})",
        kind="github",
        text=summary[:900],
    )]

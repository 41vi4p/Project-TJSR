"""Shared utilities for the company background-check pipeline."""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

# Legal suffixes stripped from the end of company names (iteratively, so
# "Acme Solutions Pvt Ltd" → "acme-solutions"). Meaningful words like
# "technologies" or "labs" are intentionally kept.
_LEGAL_SUFFIXES = {
    "pvt", "ltd", "limited", "private", "inc", "llc", "llp",
    "corp", "corporation", "co", "plc",
}


def slugify_company(name: str) -> str:
    """
    Normalize a company name to a canonical Firestore document slug.
    Mirrored in TS at frontend/lib/firestore.ts slugifyCompany() — keep in sync.
    """
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9\s]", " ", s.lower()).strip()
    words = s.split()
    while len(words) > 1 and words[-1] in _LEGAL_SUFFIXES:
        words.pop()
    return "-".join(words)


def normalize_url(url: str) -> str:
    """Dedup key: strip scheme, www., query string, and trailing slash."""
    parsed = urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.rstrip("/")
    return f"{host}{path}"


def domain_of(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


@dataclass
class SourceDoc:
    """One gathered evidence document. `text` stays in memory only — never
    persisted to Firestore (1 MB doc limit); only url/title/domain/kind go out."""
    url: str
    title: str
    kind: str  # website | news | reddit | searxng | whois | github | internal_jobs
    text: str = ""
    id: int = -1  # assigned by SourceRegistry
    retrieved_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def domain(self) -> str:
        return domain_of(self.url)

    def to_firestore(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title[:200],
            "domain": self.domain,
            "kind": self.kind,
            "retrieved_at": self.retrieved_at,
        }


class SourceRegistry:
    """Assigns stable integer ids to sources and dedups by normalized URL."""

    MAX_SOURCES = 40

    def __init__(self):
        self._sources: list[SourceDoc] = []
        self._seen: set[str] = set()

    def add(self, source: SourceDoc) -> SourceDoc | None:
        """Register a source; returns it with id set, or None if dup/full."""
        key = normalize_url(source.url)
        if not key or key in self._seen:
            return None
        if len(self._sources) >= self.MAX_SOURCES:
            return None
        self._seen.add(key)
        source.id = len(self._sources)
        self._sources.append(source)
        return source

    def add_all(self, sources: list[SourceDoc]) -> list[SourceDoc]:
        return [s for s in (self.add(src) for src in sources) if s is not None]

    @property
    def sources(self) -> list[SourceDoc]:
        return list(self._sources)

    def by_kind(self, kind: str) -> list[SourceDoc]:
        return [s for s in self._sources if s.kind == kind]

    def to_firestore(self) -> list[dict]:
        return [s.to_firestore() for s in self._sources]

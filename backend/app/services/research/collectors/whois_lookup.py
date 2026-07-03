"""WHOIS collector — domain age for the red-flag engine.
Lookups (especially .in TLD) are flaky: any failure means "insufficient data",
never a red flag."""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def collect(domain: str | None) -> dict | None:
    """Returns {domain, creation_date, registrar} or None on any failure."""
    if not domain:
        return None
    try:
        import whois
        record = whois.whois(domain)
        created = record.creation_date
        if isinstance(created, list):
            created = created[0] if created else None
        if not isinstance(created, datetime):
            return None
        return {
            "domain": domain,
            "creation_date": created,
            "registrar": str(record.registrar or ""),
        }
    except Exception as exc:
        logger.info(f"whois lookup failed for {domain}: {exc}")
        return None

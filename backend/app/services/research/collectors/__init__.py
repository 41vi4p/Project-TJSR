"""Collector orchestration for company background checks.

Every collector is individually fault-tolerant: a failure contributes zero
sources but never aborts the run (mirrors the non-fatal composition style of
workers/tasks.py process_job_pipeline).
"""

import logging

from app.services.research.utils import SourceDoc, SourceRegistry

logger = logging.getLogger(__name__)


def run_all(company: str, settings) -> dict:
    """
    Run every collector for a company. Returns:
    {
      "registry": SourceRegistry (ids assigned, deduped, capped),
      "review_links": [{platform, url, title}],
      "whois_meta": dict | None,
      "official_domain": str | None,
      "internal_signal": {active_postings, top_skills, sample_titles},
    }
    """
    from app.services.research.collectors import (
        github_org, internal_jobs, news, reddit, searxng, website, whois_lookup,
        wikipedia,
    )

    registry = SourceRegistry()
    review_links: list[dict] = []
    whois_meta = None
    official_domain = None
    internal_signal = {"active_postings": 0, "top_skills": [], "sample_titles": []}

    # Website first — highest-quality evidence and yields the domain for whois.
    try:
        site_sources, official_domain = website.collect(settings.searxng_url, company)
        registry.add_all(site_sources)
    except Exception as exc:
        logger.warning(f"website collector failed: {exc}")

    try:
        whois_meta = whois_lookup.collect(official_domain)
    except Exception as exc:
        logger.warning(f"whois collector failed: {exc}")

    try:
        registry.add_all(wikipedia.collect(company))
    except Exception as exc:
        logger.warning(f"wikipedia collector failed: {exc}")

    try:
        sx_sources, review_links = searxng.collect(settings.searxng_url, company)
        registry.add_all(sx_sources)
    except Exception as exc:
        logger.warning(f"searxng collector failed: {exc}")

    try:
        registry.add_all(news.collect(company))
    except Exception as exc:
        logger.warning(f"news collector failed: {exc}")

    try:
        registry.add_all(reddit.collect(settings.searxng_url, company))
    except Exception as exc:
        logger.warning(f"reddit collector failed: {exc}")

    try:
        registry.add_all(github_org.collect(company))
    except Exception as exc:
        logger.warning(f"github collector failed: {exc}")

    try:
        ij_sources, internal_signal = internal_jobs.collect(company)
        registry.add_all(ij_sources)
    except Exception as exc:
        logger.warning(f"internal jobs collector failed: {exc}")

    logger.info(
        f"collect done for {company!r}: {len(registry.sources)} sources, "
        f"{len(review_links)} review links, domain={official_domain}"
    )
    return {
        "registry": registry,
        "review_links": review_links[:15],
        "whois_meta": whois_meta,
        "official_domain": official_domain,
        "internal_signal": internal_signal,
    }

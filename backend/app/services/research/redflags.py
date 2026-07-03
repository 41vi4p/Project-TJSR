"""
Deterministic red-flag engine for company background checks.

Runs BEFORE and independently of the LLM. The synthesizer receives these
flags read-only and must not add or remove any. Every flag carries evidence
(a URL and, when possible, the source id it came from).

Pattern mirrors classifier/predictor.py::_keyword_classify — pre-compiled
regexes with graded severity.
"""

import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

from app.services.research.utils import SourceDoc, domain_of

MCA_SEARCH_URL = "https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do"

# ── Pre-compiled patterns ─────────────────────────────────────────────────────

_PAY_FOR_TRAINING = re.compile(
    r"registration\s+fee|training\s+fee|pay\S{0,5}\s?(for\s+)?training"
    r"|security\s+deposit|refundable\s+deposit|laptop\s+deposit"
    r"|bond\s+of\s+(rs\.?|₹|inr)?\s?\d|certificate\s+fee"
    r"|offer\s+letter\s+fee|onboarding\s+charges?",
    re.IGNORECASE,
)

_SCAM_TERMS = re.compile(r"\bscam\b|\bfraud\b|fake\s+(offer|job|company)|\bcheated\b", re.IGNORECASE)

# scam_mentions must be about the company AS AN EMPLOYER. Generic fraud talk
# (e.g. criminals scamming a bank's customers) is not a workplace red flag.
_EMPLOYMENT_CONTEXT = re.compile(
    r"\bjob\b|\boffer\s+letter\b|\bhiring\b|\brecruit|\binterview\b|\bplacement\b"
    r"|\bcareer\b|\bemploye[er]|\bjoining\b|\bsalary\b|\binternship\b"
    r"|scam\s+company|company\s+is\s+a\s+scam|fake\s+company",
    re.IGNORECASE,
)

_NEG_NEWS_HIGH = re.compile(
    r"\bfraud\b|\blawsuit\b|\braid(ed)?\b|\binvestigation\b|\bscam\b|shut(ting)?\s+down",
    re.IGNORECASE,
)
_NEG_NEWS_MED = re.compile(
    r"\blayoffs?\b|salary\s+delays?|not\s+paying|\battrition\b", re.IGNORECASE
)

_REVIEW_NEG = re.compile(
    r"\btoxic\b|\bworst\b|\bavoid\b|\bharassment\b|salary\s+delay"
    r"|fake\s+promises|no\s+work\s?-?\s?life",
    re.IGNORECASE,
)
_REVIEW_POS = re.compile(
    r"great\s+place|good\s+culture|\brecommend\b|\blearning\b|good\s+work\s?-?\s?life",
    re.IGNORECASE,
)


@dataclass
class RedFlag:
    signal: str
    severity: str  # high | medium | low | info
    detail: str
    evidence_url: str = ""
    source_id: int | None = None

    def to_firestore(self) -> dict:
        return asdict(self)


def evaluate(
    company: str,
    sources: list[SourceDoc],
    whois_meta: dict | None,
    official_site_found: bool,
) -> list[RedFlag]:
    """Run every deterministic check over the gathered evidence."""
    flags: list[RedFlag] = []
    company_lower = company.lower()

    # domain_age — whois failure is "insufficient data", never a flag
    if whois_meta and whois_meta.get("creation_date"):
        created = whois_meta["creation_date"]
        if isinstance(created, datetime):
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - created).days
            evidence = whois_meta.get("domain", "")
            if age_days < 365:
                flags.append(RedFlag(
                    "domain_age", "high",
                    f"Company domain is only {age_days} days old (registered {created.date()}). "
                    "Very new domains are a common scam indicator.",
                    evidence_url=f"https://who.is/whois/{evidence}",
                ))
            elif age_days < 730:
                flags.append(RedFlag(
                    "domain_age", "medium",
                    f"Company domain is under 2 years old (registered {created.date()}).",
                    evidence_url=f"https://who.is/whois/{evidence}",
                ))

    if not official_site_found:
        flags.append(RedFlag(
            "no_official_site", "medium",
            "No credible official website could be identified for this company.",
        ))

    # pay_for_training — scan every snippet
    for src in sources:
        m = _PAY_FOR_TRAINING.search(src.text)
        if m:
            flags.append(RedFlag(
                "pay_for_training", "high",
                f'Mention of "{m.group(0).strip()}" found — legitimate employers do not '
                "charge candidates fees or deposits.",
                evidence_url=src.url,
                source_id=src.id if src.id >= 0 else None,
            ))
            break  # one flag with the first evidence is enough

    # scam_mentions — count distinct domains whose snippet pairs company name +
    # scam terms IN AN EMPLOYMENT CONTEXT. Two guards against false positives:
    # (1) restricted to search/discussion sources — news stories about scams
    #     *targeting* a company's customers (common for banks) are covered
    #     separately by negative_news and must not fire this signal;
    # (2) the snippet must also mention jobs/hiring/offers, or explicitly call
    #     the company itself a scam — generic fraud talk doesn't count.
    scam_domains: dict[str, SourceDoc] = {}
    for src in sources:
        if src.kind not in ("searxng", "reddit"):
            continue
        blob = f"{src.title} {src.text}"
        if (company_lower in blob.lower()
                and _SCAM_TERMS.search(blob)
                and _EMPLOYMENT_CONTEXT.search(blob)):
            scam_domains.setdefault(domain_of(src.url), src)
    if scam_domains:
        n = len(scam_domains)
        first = next(iter(scam_domains.values()))
        flags.append(RedFlag(
            "scam_mentions",
            "high" if n >= 3 else "medium",
            f"Scam/fraud mentions naming this company found across {n} distinct site(s).",
            evidence_url=first.url,
            source_id=first.id if first.id >= 0 else None,
        ))

    # negative_news — news-kind sources only
    for src in sources:
        if src.kind != "news":
            continue
        blob = f"{src.title} {src.text}"
        if _NEG_NEWS_HIGH.search(blob):
            flags.append(RedFlag(
                "negative_news", "high",
                f"Negative news coverage: {src.title[:120]}",
                evidence_url=src.url,
                source_id=src.id if src.id >= 0 else None,
            ))
            break
        if _NEG_NEWS_MED.search(blob):
            flags.append(RedFlag(
                "negative_news", "medium",
                f"Concerning news coverage: {src.title[:120]}",
                evidence_url=src.url,
                source_id=src.id if src.id >= 0 else None,
            ))
            break

    # review_sentiment — keyword heuristic over review-ish snippets, labelled as such
    review_srcs = [s for s in sources if s.kind in ("searxng", "reddit")]
    neg = sum(len(_REVIEW_NEG.findall(f"{s.title} {s.text}")) for s in review_srcs)
    pos = sum(len(_REVIEW_POS.findall(f"{s.title} {s.text}")) for s in review_srcs)
    if neg >= 4 and neg > 2 * max(pos, 1):
        first = review_srcs[0]
        flags.append(RedFlag(
            "review_sentiment", "medium",
            f"Review mentions skew negative ({neg} negative vs {pos} positive keyword hits). "
            "This is a keyword heuristic, not a full sentiment analysis — read the linked reviews.",
            evidence_url=first.url,
            source_id=first.id if first.id >= 0 else None,
        ))

    if len(sources) < 3:
        flags.append(RedFlag(
            "low_footprint", "info",
            "Very low public footprint — insufficient data to verify most claims about "
            "this company. Treat with extra caution.",
        ))

    # MCA registry check is not automated in the MVP (no free API) — always
    # point the user at the official manual lookup.
    flags.append(RedFlag(
        "mca_registry", "info",
        "Automated registry verification is not available. For Indian companies, verify "
        "registration manually on the MCA company master data portal.",
        evidence_url=MCA_SEARCH_URL,
    ))

    return flags

"""
LLM synthesis for company background checks — Groq, using the REQUESTER'S OWN
API key (users/{uid}.api_keys.groq). No shared server key.

Hard rules enforced here:
- Every claim must cite a numbered source; the model is instructed to omit
  uncitable claims, and citations are post-validated (out-of-range dropped,
  claim-bearing sections without valid citations forced to insufficient).
- Red flags are passed read-only; the model may not add or remove them.
- The API key must NEVER appear in logs or in errors persisted to the
  user-readable request doc (httpx exceptions can embed request headers).
"""

import json
import logging
import time

import httpx

from app.services.research.utils import SourceDoc

logger = logging.getLogger(__name__)

_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Per-kind snippet budget: (max docs, priority — lowest truncated first)
_KIND_BUDGET = {
    "website":       (3, 5),
    "searxng":       (8, 4),
    "news":          (5, 3),
    "reddit":        (4, 2),
    "github":        (1, 1),
    "internal_jobs": (1, 5),
}
_SNIPPET_CHARS = 900
_PROMPT_CHAR_BUDGET = 26000  # ≈ 7-8k tokens, fits Groq free-tier TPM

COMPANY_SECTIONS = ["overview", "clients_products", "culture_reviews",
                    "financial_signals", "tech_stack"]
POSITION_SECTIONS = ["likely_projects", "exposure_learning", "common_stack", "jd_notes"]


class GroqKeyError(Exception):
    """User-actionable Groq failure; str(exc) is safe to persist."""


class GroqCallError(Exception):
    """Non-key Groq failure; str(exc) is safe to persist."""


def _call_groq(messages: list[dict], api_key: str, settings) -> str:
    """Sync Groq chat completion with JSON mode. Retries once on 429/5xx.
    Raises GroqKeyError / GroqCallError with key-free messages."""
    payload = {
        "model": settings.groq_model,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 2000,
    }
    last_status = None
    for attempt in range(2):
        try:
            resp = httpx.post(
                _GROQ_URL,
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=90,
            )
        except httpx.HTTPError as exc:
            # Never propagate the raw exception — it can embed request headers.
            logger.warning(f"groq transport error ({type(exc).__name__})")
            if attempt == 0:
                time.sleep(3)
                continue
            raise GroqCallError("Could not reach Groq. Try again in a few minutes.")

        last_status = resp.status_code
        if resp.status_code in (401, 403):
            raise GroqKeyError("Your Groq API key was rejected. Check it in Settings → API Keys.")
        if resp.status_code == 429:
            if attempt == 0:
                retry_after = min(float(resp.headers.get("retry-after", 10)), 30.0)
                time.sleep(retry_after)
                continue
            raise GroqCallError("Groq rate limit hit for your key. Try again in a few minutes.")
        if resp.status_code >= 500:
            if attempt == 0:
                time.sleep(3)
                continue
            raise GroqCallError("Groq is having issues right now. Try again later.")

        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    raise GroqCallError(f"Groq request failed (HTTP {last_status}). Try again later.")


def _call_groq_json(messages: list[dict], api_key: str, settings) -> dict:
    """JSON-mode call with one repair retry on unparseable output."""
    raw = _call_groq(messages, api_key, settings)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        messages = messages + [
            {"role": "assistant", "content": raw[:2000]},
            {"role": "user", "content": "Return ONLY valid JSON matching the schema. No prose."},
        ]
        raw = _call_groq(messages, api_key, settings)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise GroqCallError("The AI returned an unreadable report. Try again.")


# ─── Context building ─────────────────────────────────────────────────────────

def _build_context(sources: list[SourceDoc]) -> str:
    """Numbered source snippets, per-kind capped, lowest-priority kinds
    truncated first when over the prompt budget."""
    picked: list[SourceDoc] = []
    for kind, (max_docs, _prio) in _KIND_BUDGET.items():
        picked.extend([s for s in sources if s.kind == kind][:max_docs])
    picked.sort(key=lambda s: s.id)

    def render(docs: list[SourceDoc]) -> str:
        return "\n\n".join(
            f"[{s.id}] ({s.kind}) {s.title}\nURL: {s.url}\n{s.text[:_SNIPPET_CHARS]}"
            for s in docs
        )

    ctx = render(picked)
    # Trim by dropping lowest-priority kinds until under budget
    priorities = sorted(_KIND_BUDGET.items(), key=lambda kv: kv[1][1])
    for kind, _ in priorities:
        if len(ctx) <= _PROMPT_CHAR_BUDGET:
            break
        picked = [s for s in picked if s.kind != kind]
        ctx = render(picked)
    return ctx[:_PROMPT_CHAR_BUDGET]


_SECTION_SCHEMA = '{"text_md": "markdown string", "citations": [source numbers], "insufficient": boolean}'

_COMPANY_SYSTEM = f"""You are a rigorous company-research analyst helping job seekers (mostly freshers) avoid scams and toxic employers.

Rules — non-negotiable:
1. Every factual claim MUST cite the numbered sources provided, via the "citations" array of each section.
2. If you cannot cite a claim from the provided sources, OMIT the claim entirely. Never invent facts.
3. If a section has no supporting evidence, set "insufficient": true and "text_md" to exactly "Insufficient data."
4. A pre-computed red-flags list is provided READ-ONLY for context. Do NOT restate, add, or remove red flags in your sections.
5. Be direct and concrete. Write for a fresher deciding whether to apply.

Return ONLY a JSON object with this exact schema:
{{"overview": {_SECTION_SCHEMA},
 "clients_products": {_SECTION_SCHEMA},
 "culture_reviews": {_SECTION_SCHEMA},
 "financial_signals": {_SECTION_SCHEMA},
 "tech_stack": {_SECTION_SCHEMA},
 "company_name_canonical": "best display name from the sources"}}"""

_POSITION_SYSTEM = f"""You are a career analyst. Given a finished company research report, a target position, and optionally a job description, tell a fresher what to expect in THIS role at THIS company.

Rules — non-negotiable:
1. Cite the numbered sources from the company report via each section's "citations" array.
2. Omit claims you cannot ground in the report or the JD. Never invent facts.
3. If a section has no supporting evidence, set "insufficient": true and "text_md" to exactly "Insufficient data."
4. "jd_notes" analyses the provided JD (unrealistic requirements, red-flag phrasing, mismatch with the company's actual stack). If no JD was provided, set it insufficient.

Return ONLY a JSON object with this exact schema:
{{"likely_projects": {_SECTION_SCHEMA},
 "exposure_learning": {_SECTION_SCHEMA},
 "common_stack": {_SECTION_SCHEMA},
 "jd_notes": {_SECTION_SCHEMA}}}"""


def _validate_sections(data: dict, section_keys: list[str], valid_ids: set[int]) -> dict:
    """Drop out-of-range citations; claim-bearing sections with zero valid
    citations are forced to insufficient (never trust the LLM's own audit)."""
    out = {}
    for key in section_keys:
        sec = data.get(key) or {}
        text = str(sec.get("text_md", "")).strip() or "Insufficient data."
        citations = [c for c in sec.get("citations", [])
                     if isinstance(c, int) and c in valid_ids]
        insufficient = bool(sec.get("insufficient", False))
        if text == "Insufficient data.":
            insufficient = True
        if not insufficient and not citations:
            text, insufficient = "Insufficient data.", True
        out[key] = {"text_md": text[:6000], "citations": citations, "insufficient": insufficient}
    return out


# ─── Public API ───────────────────────────────────────────────────────────────

def synthesize_company_report(
    company: str,
    sources: list[SourceDoc],
    red_flags: list[dict],
    api_key: str,
    settings,
) -> dict:
    """Groq call #1 → validated company report sections + canonical name."""
    context = _build_context(sources)
    flags_txt = "\n".join(f"- [{f['severity']}] {f['signal']}: {f['detail']}" for f in red_flags)
    user_msg = (
        f"Company to research: {company}\n\n"
        f"── Pre-computed red flags (read-only) ──\n{flags_txt or 'None detected.'}\n\n"
        f"── Numbered sources ──\n{context or 'No sources gathered.'}"
    )
    data = _call_groq_json(
        [{"role": "system", "content": _COMPANY_SYSTEM},
         {"role": "user", "content": user_msg}],
        api_key, settings,
    )
    valid_ids = {s.id for s in sources}
    sections = _validate_sections(data, COMPANY_SECTIONS, valid_ids)
    canonical = str(data.get("company_name_canonical") or company)[:120]
    return {"sections": sections, "company_name_canonical": canonical}


def synthesize_position_analysis(
    company_report: dict,
    position: str,
    jd_text: str,
    api_key: str,
    settings,
) -> dict:
    """Groq call #2 → validated position-specific sections."""
    report_ctx = {
        "sections": company_report.get("sections", {}),
        "red_flags": company_report.get("red_flags", []),
        "internal_jobs_signal": company_report.get("internal_jobs_signal", {}),
        "sources": [
            {"id": s["id"], "title": s["title"], "url": s["url"], "kind": s["kind"]}
            for s in company_report.get("sources", [])
        ],
    }
    user_msg = (
        f"Target position: {position}\n\n"
        f"── Company report (with numbered sources) ──\n"
        f"{json.dumps(report_ctx, default=str)[:20000]}\n\n"
        f"── Job description ──\n{jd_text[:6000] or '(none provided)'}"
    )
    data = _call_groq_json(
        [{"role": "system", "content": _POSITION_SYSTEM},
         {"role": "user", "content": user_msg}],
        api_key, settings,
    )
    valid_ids = {s["id"] for s in company_report.get("sources", [])}
    return _validate_sections(data, POSITION_SECTIONS, valid_ids)

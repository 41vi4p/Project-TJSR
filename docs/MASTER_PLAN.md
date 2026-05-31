# TJSR — Master Plan

**TJSR** (Tracker for Job Search & Reporting): a system that continuously discovers
the latest job openings, classifies and matches them to each user's resume, and
notifies users through the dashboard and Telegram.

This document captures the current architecture, gaps found during analysis, and a
prioritized roadmap to make TJSR a robust, production-grade system.

---

## 1. Current Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React, Tailwind v4, TanStack Query, Firebase Auth |
| Backend | FastAPI (async), SQLAlchemy 2.0, Pydantic v2 |
| Primary DB | PostgreSQL (jobs, users, applications, configs, logs, notifications) |
| Vector DB | Qdrant (job + resume embeddings, 384-dim MiniLM) |
| Graph DB | Neo4j (company ↔ skill ↔ job knowledge graph) |
| Queue | Celery + Redis (scraping, classification, embedding, digests) |
| LLM | Ollama (local, qwen3) — RAG chat; Featherless configured as cloud fallback |
| ML | DistilBERT fine-tuned classifier (tech / non-tech job detection) |
| Notifications | Telegram Bot (digests, matches, chatbot), in-app notifications |
| Storage | Firebase Storage (resume files); Firestore (resume builder profile backup) |

### Core Pipelines
1. **Scraping** — `ScraperManager` orchestrates 7 engines (bs4, scrapling,
   crawl4ai, selenium, newspaper, phenom, google_careers) with auto-fallback.
   JSON-LD `JobPosting` is preferred; regex/NLP heuristics are the fallback.
2. **Processing** — `process_job_pipeline`: classify (DistilBERT) → compute
   match_score vs user skills → embed (Qdrant) → add to graph (Neo4j).
3. **Matching** — resume skills extracted on upload → `match_score` per job →
   recommendations endpoint ranks jobs by skill overlap.
4. **Chat (RAG)** — Qdrant similarity search → context → Ollama → streamed answer.
5. **Notifications** — Celery Beat daily digest at 08:00 UTC + immediate match alerts.

---

## 2. Gaps & Risks Found

### Reliability
- **Scraping depends on Celery being up.** Mitigated with inline fallback in
  `process_job_pipeline`, but `run_scraper` itself is still Celery-only (a `/run/sync`
  endpoint exists as a workaround). Need a guaranteed scheduler.
- **No scheduled scraping.** Celery Beat only runs the digest. Jobs are only scraped
  on manual trigger — defeats the "latest updates" purpose.
- **No retry/backoff** on transient scraper failures or LLM/DB outages.
- **`date_posted` is set to now()** — not the real posting date (JSON-LD has
  `datePosted` but it's ignored). Hurts "freshness" sorting.

### Data Quality
- **Weak dedup** — only apply_link / title+company. No fuzzy/near-duplicate detection
  across sources (same job posted on 3 boards = 3 rows).
- **No job expiry** — stale/closed postings are never pruned or marked inactive.
- **Salary/location parsing is regex-only** — low recall on free-text postings.

### Matching
- **`match_score` is global max across all users**, stored on the job row — not
  per-user. Two users with different resumes see the same score. Should be per-user.
- **Matching is keyword-overlap only.** Qdrant embeddings exist but aren't used for
  semantic resume↔job matching (only for chat).

### Security / Ops
- **CORS is `allow_origins=["*"]` with credentials** — insecure for production.
- **No rate limiting** on scrape/test/chat endpoints.
- **DB credentials & Firebase key committed** to the repo (`.env`,
  `firebase-service-account.json`). Must be rotated and moved to secrets.
- **No alembic migrations applied** — schema created via `create_all` + ad-hoc
  `ALTER TABLE` in startup. Fine for dev, fragile for prod.
- **No tests** beyond empty `tests/` dirs.

### UX
- Telegram link flow (`/bot/connect`) exists but onboarding is unclear.
- No email channel (Telegram only).
- No saved-search / job-alert customization per user (target_domains exists but unused).

---

## 3. Roadmap

### Phase 1 — Make "Latest Updates" Actually Work (highest priority)
- [ ] **Scheduled scraping via Celery Beat** — run all enabled configs every N hours
      (configurable per source `schedule_cron`). Add `scrape_all_sources` beat task.
- [ ] **Per-user job alerts** — when a new job matches a user's skills above a
      threshold, create an in-app notification + optional Telegram push (the
      `send_job_match_notification` plumbing already exists; wire it into the pipeline).
- [ ] **Real `date_posted`** — parse JSON-LD `datePosted`; fall back to scrape time.
- [ ] **Robustness** — retries with exponential backoff on scraper engines and the
      processing pipeline; mark `last_status` + error detail per config.

### Phase 2 — Smarter Matching
- [ ] **Per-user match scores** — new `user_job_matches` table (user_id, job_id,
      score, matched_skills) instead of a single column on the job.
- [ ] **Semantic matching** — embed the resume, query Qdrant for nearest jobs, blend
      vector similarity with keyword overlap into a final score.
- [ ] **Match explanations** — "matched 8/10 skills; missing: Kubernetes, GraphQL".

### Phase 3 — Data Quality
- [ ] **Fuzzy dedup** — normalize title+company, use trigram similarity (pg_trgm is
      already enabled) to collapse cross-source duplicates; keep all apply links.
- [ ] **Job freshness lifecycle** — `is_active` flag; periodic re-check; auto-archive
      postings older than X days or returning 404.
- [ ] **Enrichment** — spaCy NER (already wired) for better company/location;
      normalize salary to a numeric range.

### Phase 4 — Channels & Personalization
- [ ] **Email digests** (SendGrid/SES) as an alternative to Telegram.
- [ ] **Saved searches / custom alerts** — let users define keyword + location +
      skill filters and get notified on matches (use `bot_config.target_domains`).
- [ ] **Onboarding flow** — guide new users: upload resume → connect Telegram →
      add first scraper source.

### Phase 5 — Production Hardening
- [ ] **Secrets** — move credentials out of the repo; rotate the exposed keys;
      load from environment / secret manager.
- [ ] **CORS** — restrict to known frontend origins.
- [ ] **Rate limiting** — slowapi/Redis token bucket on public + expensive endpoints.
- [ ] **Alembic migrations** — replace `create_all` + ad-hoc ALTERs with versioned
      migrations.
- [ ] **Tests** — unit tests for NLP extraction & matching; integration tests for the
      scrape→store→match pipeline; a CI workflow.
- [ ] **Observability** — structured logging, health checks per dependency, Sentry.

---

## 4. New Feature Ideas (robust, high-impact)

1. **Smart Job Alerts** — per-user, threshold-based, multi-channel (in-app + Telegram
   + email), with daily/instant cadence.
2. **Resume-to-Job Semantic Match** — vector + keyword hybrid score with gap analysis
   and "skills to learn" suggestions.
3. **Application Auto-Tracking** — detect when a user clicks Apply and auto-create an
   application entry; remind on stale applications.
4. **Company Insights** — leverage the Neo4j graph to show "companies hiring for your
   stack" and skill co-occurrence trends.
5. **Market Trends Dashboard** — top in-demand skills this week, salary distributions,
   hiring velocity per company (all derivable from scraped data).
6. **Duplicate-Aware Feed** — one card per unique job with all source apply links.
7. **Scrape Health Monitor** — per-source success rate, last-success time, alerting
   when a source breaks.

---

## 5. Immediate Next Steps (this sprint)

1. Add `scrape_all_sources` Celery Beat task (Phase 1) — turns the app into a real
   "latest updates" system.
2. Wire `send_job_match_notification` + `create_db_notification` into
   `_compute_match_scores` so users actually get alerted on new matches.
3. Parse real `date_posted` from JSON-LD.
4. Restrict CORS and move secrets out of the repo.

> These four changes deliver the core promise (continuous, notified job updates)
> and close the most serious security gaps with minimal surface area.

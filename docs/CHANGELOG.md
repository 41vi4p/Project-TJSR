# Changelog

## v1.0.15 — 2026-07-04
**New training dataset for the tech/non-tech classifier** (fixes the v1.0.14 known issue: the old `job_dataset_advanced.csv` labels were job-posting-vs-news, so the model never learned tech-ness).

- **New `Classifier_Model_training/generate_tech_dataset.py`** — seeded, deterministic generator producing `tech_vs_nontech_dataset.csv` (8,000 rows, 4,000/4,000 balanced, 100% unique). Label 1 = tech posting, label 0 = non-tech posting or news/noise page.
  - Rows use the exact inference-time format from `predictor.classify_job_by_id` (`Title: …\nSkills: …\n<desc>`), with ~15% raw-description rows, sometimes-empty skills lines, and title/format noise (seniority prefixes, ALL-CAPS, remote/hybrid suffixes) for robustness.
  - 19 tech role families and 23 non-tech families; hard positives (tech roles at hospitals/banks/contractors), hard negatives (tech sales, IT recruiters, software asset managers at SaaS companies — tech words, non-tech work), and 8% news articles including tech news (tech vocabulary, not a job).
  - Label semantics mirror `_keyword_classify`'s intent (product manager/scrum master → tech; UX designer/business analyst → non-tech) so ML and keyword paths agree on philosophy.
  - Validated in-container against `_keyword_classify`: 95.8% agreement on the 5,485 rows where it fires; all sampled disagreements are keyword-classifier mistakes on the intentional hard cases.
- `train_bert.py` `DATA_PATH` switched to the new CSV; training config otherwise unchanged (`num_labels=2`, `MAX_LEN=128`, cap 8,000 rows). Retrain with `python train_bert.py`, then rebuild the Docker image so the new `bert_finetuned/` weights are baked in. No backend code change needed — `is_tech = (label == 1)` becomes correct with the new labels.

## v1.0.14 — 2026-07-04
**Backend fully containerized for Raspberry Pi home-lab deployment — no secrets in the image.**

- **`backend/Dockerfile` rewritten for production** (was a dev image with `--reload`). Built from the **repo root** so the fine-tuned DistilBERT classifier (`Classifier_Model_training/bert_finetuned/`, safetensors) is baked in at `/app/ml_model` (matches the classifier's `ML_MODEL_DIR` default). Also baked at build time so the image works offline: spaCy `en_core_web_sm`, Playwright chromium (+ system chromium/chromedriver for Selenium), and the MiniLM embedding model (pre-downloaded to `HF_HOME=/app/hf_cache` — previously fetched on first embed at runtime). Torch installed from the CPU wheel index (PyPI's default amd64 wheel pulls ~4 GB of CUDA libs). Runs as non-root `appuser`.
- **New root `.dockerignore` (allowlist style)**: excludes everything, re-includes only `backend/app`, `requirements.txt`, `alembic.ini`, and the model weights — verified the build context is 102 files with zero `.env`/service-account files. Explicit deny patterns for `.env*`, `firebase-service-account*.json`, `__pycache__`, `celerybeat-schedule*` as a second layer.
- **docker-compose: four new backend services** sharing the image via a `x-backend-common` anchor — `backend` (uvicorn, port 8000, `/docs` healthcheck), `worker` (celery, `--concurrency=1` for Pi RAM), `beat` (schedule file at `/tmp`, ephemeral by design), and `bot` (Telegram polling, opt-in via `--profile bot`). Worker/beat/bot wait for the API to be healthy since it creates the DB schema on startup.
- **Secrets at runtime only**: `backend/.env` loaded via `env_file` (marked `required: false`, needs compose ≥ 2.24); `firebase-service-account.json` volume-mounted read-only to `/run/secrets/firebase-sa` with `FIREBASE_SERVICE_ACCOUNT_KEY` pointed at it. In-network URLs (postgres/redis/qdrant/searxng service names) are set in compose `environment`, overriding the localhost defaults in `config.py`.
- **README**: Quick Start reworked — all-in-Docker path (with `buildx --platform linux/arm64` cross-build + `docker load` instructions for the Pi) plus the bare-metal dev alternative.
- **requirements.txt was unresolvable in a clean install** (surfaced by the image build; dev environments had evidently been installed incrementally, and `crawl4ai` was never actually installed locally — its scraper silently fell back to BS4): `lxml==6.1.0` → `lxml~=5.3` (crawl4ai 0.9.0 hard-requires `~=5.3`) and `sentence-transformers==3.3.1` → `==5.6.0` (3.x requires `transformers<5`, conflicting with the pinned `transformers==5.3.0`). Full set now passes a clean `pip install --dry-run` on Python 3.11.
- Known gap: the RAG chat engine still points at Ollama, which won't exist in-network on the Pi (`/api/v1/chat` has no callers; Ollama removal is planned separately).
- **Known issue discovered during container smoke-testing (pre-existing, NOT introduced by this release)**: the fine-tuned DistilBERT in `Classifier_Model_training/bert_finetuned` was trained on `job_dataset_advanced.csv`, whose labels are **job-posting (1) vs employment-news-article (0)** — not tech vs non-tech. `predictor.py` interprets `label == 1` as `is_tech`, so any confident ML prediction (≥ 0.65) marks *any* job posting as tech (a chef posting scores `is_tech=True` at 0.92). The keyword classifier only runs when ML confidence is below threshold. Needs either a retrained model on tech/non-tech labels, or repurposing the model as the job-vs-news filter it actually is and letting the keyword classifier own tech-ness. Verified against the training data; container and host use the same weights and code.

## v1.0.13 — 2026-07-04
**Neo4j and the knowledge-graph feature removed entirely** (prep for Raspberry Pi home-lab deployment — frees the single largest RAM consumer, a ~1–1.5 GB JVM).

Rationale: the graph had no remaining consumers. The public frontend's graph page was already reduced to a `/dashboard` redirect in the June 20 release, `fetchGraphSnapshot` was never called anywhere, match scoring uses a Postgres skill-overlap query, and RAG retrieval uses Qdrant — Neo4j was being written to on every job with nothing ever reading it back.

- **Backend removed**: `app/services/graph/` (client, queries, builder), `/api/v1/graph/*` endpoints + router entry, `app/schemas/graph.py`, `add_to_graph` Celery task and its call in `process_job_pipeline`, `sync_graph_to_firebase` task + its beat schedule (every 6h) + its trigger in `scrape_all_sources`, `sync_graph_snapshot` in `firebase_sync.py`, `/firebase/sync/graph` admin endpoint, Neo4j health-check probe, `neo4j_*` settings, `neo4j==5.27.0` dependency.
- **Schema**: `Job.neo4j_node_id` column removed from the model. Existing databases keep the (nullable, now-unused) column harmlessly; no migration required. New installs never create it.
- **Infra**: `neo4j` service and `neo4j_data`/`neo4j_logs` volumes removed from docker-compose; `NEO4J_*` removed from `.env.example`.
- **Firestore**: `graph/{docId}` read rule removed from `firestore.rules` (redeploy rules with `firebase deploy --only firestore:rules`). The orphaned `graph/snapshot` document can be deleted manually from the console.
- **Frontend cleanup**: dead "Knowledge Graph" nav links removed from topbar and mobile more-menu (they pointed at the redirect stub, which is kept for old bookmarks); `FSGraphSnapshot` + `fetchGraphSnapshot` dead helpers removed from `lib/firestore.ts`; About page no longer advertises the Knowledge Graph feature or lists Neo4j in the stack.
- **Admin UI**: "Sync Graph Snapshot" tile and `syncGraph` API call removed from the Firebase sync page.
- Backend FastAPI `version` bumped to 1.0.13 (was stale at 1.0.0); README architecture diagram, stack table, env-var table, and project tree updated.

## v1.0.12 — 2026-07-03
Company Check research depth upgrades (after CarWale test returned empty financials):
- **New Wikipedia collector** — keyless and immune to search-engine suspensions; resolves brands to their parent's article when they have no page of their own (CarWale → CarTrade.com) by accepting candidates whose article text mentions the company. Feeds ownership/acquisition/revenue facts to the financial section.
- **Balanced context selection (bug fix)**: search snippets entered the LLM prompt in discovery order, so review snippets (queried first) crowded finance/tech/clients snippets out entirely — sections starved even when evidence had been collected. Snippets are now tagged with a query category and picked round-robin across categories.
- **Deeper finance coverage**: two extra finance queries (revenue/valuation/parent company; acquisition/investors/annual report) plus Crunchbase/Tracxn/Wikipedia site-restricted snippets.
- **SearXNG resilience**: Mojeek and Qwant engines enabled so one provider's CAPTCHA suspension no longer blanks a whole category; snippet budget raised 8→15 docs, prompt budget 26k→30k chars; inter-query delay 2.5s→4s (fewer suspensions).
- **Wrong-domain fix (report integrity)**: the official-site resolver accepted an arbitrary top search result when nothing token-matched the company name — during an engine outage this attributed a spam domain's website and WHOIS record to the researched company. A domain token match is now required; no match honestly means "no official site found".
- **Spam relevance gate**: search results that never mention the company (in title, snippet, or URL) are discarded — during engine outages the surviving engine can return pure spam, which previously entered the evidence pool.
- **Wikipedia full-article extract**: the API silently clamps `exchars` at 1200 chars, cutting off History/Finances sections; the collector now fetches the full plaintext extract (truncated to 6k) and the synthesizer passes Wikipedia untruncated — this carries IPO/acquisition/revenue facts into the financial section.

## v1.0.11 — 2026-07-03
Company Check accuracy fixes after first real-user test (IDFC First Bank report came back news-only with a false scam flag):
- **Degraded-run detection**: if every SearXNG query fails AND no official site is found (upstream engines suspend on query bursts), the report is cached for only 2 hours instead of 30 days so it self-heals; `degraded: true` stored on the report.
- **Review-site search snippets now kept as evidence**: Glassdoor/AmbitionBox search-result snippets (ratings, pros/cons text) feed `culture_reviews` and the sentiment heuristic — previously they were dropped, leaving culture with nothing to cite. The review pages themselves are still never fetched.
- **Two new SearXNG queries**: work culture / work-life balance, and clients / partners / case studies (clients had no dedicated query).
- **scam_mentions false-positive fix**: the signal now requires employment context (job, offer letter, hiring, interview, fees…) or an explicit "company is a scam" phrasing, and only fires from search/discussion sources — news about fraud *targeting* a company's customers (common for banks) no longer flags the company as a scam workplace. Regression-tested with bank-fraud vs job-scam fixtures.
- **Accuracy disclaimers**: visible note on the Company Check page and report header that findings (including red flags) are AI-generated from public sources and may be incorrect — verify via cited sources.
- **Position-analysis citation fix**: `jd_notes` is now exempt from the citation requirement when a JD is provided (its grounding is the JD itself, which has no source number), and if the model writes substantive role sections without citations, the call retries once with an explicit citation reminder — previously a citation lapse blanked the whole "Your Role" tab to "Insufficient data".

## v1.0.10 — 2026-07-03
- **Company Background Check (new feature)** — submit {company, position, optional JD} from the dashboard and get a cited research report: overview, clients, culture/review sentiment, financial signals, tech stack, deterministic scam red flags (domain age, pay-for-training mentions, scam mentions, negative news, review sentiment), Glassdoor/AmbitionBox deep links, and a private position-specific analysis (likely projects, exposure, common stack, JD red-flag notes).
  - **Architecture**: frontend writes `research_requests/{id}` to Firestore → Celery beat (60s) consumes via `backend/app/services/research/orchestrator.py` → company report cached at `company_reports/{slug}` (30-day TTL, shared across all signed-in users); position analysis stays private per request. Redis consumer + per-company locks; stale-claim recovery for crashed workers.
  - **Collectors** (`backend/app/services/research/collectors/`): company website (Crawl4AI→BS4 via existing engines), Google News RSS (India-localised), SearXNG search snippets (7 query templates), Reddit via SearXNG, WHOIS domain age, GitHub org repos, and TJSR's own jobs DB (real hiring signal).
  - **LLM synthesis uses each user's own Groq API key** (`users/{uid}.api_keys.groq`) — no shared server key; keys are never logged or echoed in errors. Every claim carries citations (post-validated); missing evidence renders as "Insufficient data", never guessed.
  - **SearXNG** self-hosted service added to docker-compose (`searxng/settings.yml` with JSON format + limiter disabled). New backend settings: `SEARXNG_URL`, `GROQ_MODEL`. New dep: `python-whois`.
  - **New pages**: `/dashboard/research` (form + consent + live progress checklist + history), `/dashboard/research/[id]` (report with red-flag cards, tabbed sections, citation links, sources), `/privacy` and `/terms` (public; consent checkbox links to them). Footer Privacy/Terms links wired; Company Check added to sidebar + mobile nav.
  - **Firestore**: new rules for `research_requests` (owner create with consent enforced, owner read, backend-only mutation) and `company_reports` (authenticated read); composite index `research_requests(uid, created_at desc)`. Deploy with `firebase deploy --only firestore:rules,firestore:indexes`.

## v1.0.9 — 2026-07-03
- **Fix: toast notifications were completely silent app-wide.** `sonner`'s `<Toaster />` was never mounted in `app/layout.tsx`, so every `toast.success()`/`toast.error()` call (resume analysis, save, delete, matching status, etc.) was a no-op. This made the resume Score tab feel broken — the analysis actually ran and completed, but gave zero feedback. Mounted `<Toaster position="top-right" richColors />` in the root layout.
- **Resume upload restricted to PDF only.** `frontend/app/api/resume/analyze/route.ts` previously read any non-`.pdf` file (including `.docx`, a ZIP binary) as raw UTF-8 text via `file.text()`, producing garbage extraction with no error. Non-PDF uploads now return a clean `400` telling the user to upload a `.pdf` or use "Paste text" instead. Dropzone `accept` attribute and copy updated from `.pdf,.txt,.docx` to `.pdf` only.

## v1.0.8 — 2026-07-03
- **README overhaul**: added an "Architecture" section documenting the three-deployable split (public `frontend/` on Vercel, local `backend/`, local-only `admin-ui/`) with an ASCII diagram showing Firebase Firestore/Auth/Storage as the sole bridge between them.
- Updated Stack table to separate backend RAG LLM (Ollama) from public chat LLM (Groq, user-supplied key) and to list Firestore explicitly as the data bridge.
- Updated Project Structure tree to include `admin-ui/`, `firestore.rules`, and `firestore.indexes.json`.
- Updated Quick Start with a step for running the admin UI (port 3001).
- Updated Environment Variables with a dedicated Admin UI section and simplified the frontend table (no backend URL needed on the public frontend).

## v1.0.7 — 2026-06-01
- **Bot & Mail Control page** — unified page replacing the old Bot Control page. Sections: Telegram connect/disconnect/digest settings, Email Digest List (add/remove subscribers, send digest now), Notification Preferences.
- **Email digest backend** — `POST /bot/send-email-digest` sends personalised HTML job digest to all addresses in the user's email list via SMTP. Returns preview if SMTP not configured.
- `email_list` JSONB column added to `bot_configs` table.
- SMTP settings (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`) added to config.
- Updated README.md with full project details, version badges, stack table, and all features.

## v1.0.6 — 2026-06-01
- **Automatic job discovery** — new `job_aggregator` service pulls jobs from public job-board APIs (RemoteOK, Arbeitnow, The Muse, and Adzuna if keys provided) with **no source URL needed**.
- `ScraperManager.ingest_aggregators()` dedups (apply_link + fuzzy title/company) and runs the full classify→match→embed→graph pipeline on discovered jobs.
- Scheduled `scrape_all_sources` Beat task now also pulls from aggregators every 6h.
- New `POST /scraper/discover` endpoint + "Discover Jobs" button on the Scraper Control page.

## v1.0.5 — 2026-06-01
### Phase 1 — Latest Updates
- **Scheduled scraping**: `scrape_all_sources` Celery Beat task runs every 6 hours, scraping all enabled sources automatically.
- **Per-user job alerts**: `_compute_match_scores` now fires in-app notification + Telegram push for every user with ≥40% skill overlap on a new job.
- **Real `date_posted`**: JSON-LD `datePosted` is now parsed and stored; falls back to scrape time if missing.
- **Robustness**: retry/backoff already added in v1.0.4.

### Phase 2 — Smarter Matching
- **Hybrid semantic matching**: recommendations now blend 60% keyword overlap + 40% Qdrant cosine similarity. Returns `matched_skills` and `missing_skills` for gap analysis.

### Phase 3 — Data Quality
- **Fuzzy dedup**: pg_trgm `similarity()` (title >0.8, company >0.7) replaces exact title+company match — collapses cross-source duplicates.
- **Job lifecycle**: `is_active` flag added to Job model. `scrape_all_sources` archives jobs older than 30 days. Job listing filters `is_active=TRUE` by default.

### Phase 5 — Production Hardening
- **CORS**: restricted to `frontend_url` + localhost:3000/3001 (no more `*`).
- **Rate limiting**: slowapi middleware added (200 req/min default).

## v1.0.4 — 2026-06-01
- Added **Playwright** scraper engine (headless Chromium, auto-scroll, JSON-LD extraction, configurable wait_for/extra_wait). Better stealth than Selenium.
- Added **RSS/Atom Feed** scraper engine (feedparser) — parse job feeds from any RSS/Atom URL.
- Added **Sitemap Discovery** scraper — reads robots.txt → sitemap.xml, filters job URLs by pattern, scrapes each with BS4.
- Added **retry with exponential backoff** (3 attempts, 2s/4s/8s) to all scraper engines in the manager.
- Playwright is now 3rd in the auto-fallback priority chain (bs4 → scrapling → playwright → crawl4ai → selenium → newspaper).
- Added `playwright==1.49.1` and `feedparser==6.0.11` to requirements.txt.

## v1.0.3 — 2026-06-01
- Mobile responsive: replaced sidebar + topbar on mobile with a fixed bottom navigation bar. Primary nav (Home, Jobs, Resume, Chat) always visible; "More" sheet slides up with remaining pages, user profile, theme toggle, and sign out.

## v1.0.2 — 2026-06-01
- Jobs older than 30 days are automatically hidden by default (expired). Added "Freshness" filter toggle in Job Listings to show expired jobs when needed.

## v1.0.1 — 2026-06-01
- Removed Job Tracking page (`/dashboard/tracking`) and all sidebar/topbar references to it.

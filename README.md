# TJSR — Tracker for Job Search & Reporting

[![Version](https://img.shields.io/badge/version-1.0.12-yellow.svg)](docs/CHANGELOG.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

> **Continuously discover, classify, and match the latest job openings — then notify you via dashboard, Telegram, and email.**

---

## What is TJSR?

TJSR is a full-stack AI-powered job discovery platform that:

- **Scrapes** career pages and public job APIs every 6 hours automatically
- **Classifies** jobs as tech/non-tech using a fine-tuned DistilBERT model + keyword fallback
- **Matches** jobs to your resume using hybrid keyword + semantic (Qdrant) scoring
- **Background-checks companies** before you apply — cited research reports with scam red flags, culture signals, and role-specific analysis
- **Notifies** you via in-app notifications, Telegram bot, and email digest
- **Lets you chat** with an AI assistant (Ollama/RAG) about the job database

---

## Architecture

TJSR is split into three deployables that never talk to each other directly — **Firebase (Firestore + Auth + Storage) is the only bridge between them**. The local backend does all the heavy lifting (scraping, classification, matching, graph building) and pushes results into Firestore; the public frontend only ever reads from Firestore, so it can be deployed to Vercel with zero dependency on the local backend being online. Admin-only controls (scraper triggers, bot config, debug logs, manual Firebase sync) live in a separate local-only admin UI that talks to the backend directly.

```
                     ┌────────────────────────────┐
                     │   Public Frontend (Vercel)  │
                     │  Next.js — Dashboard, Jobs, │
                     │  Resume, Chat, Graph, Auth  │
                     └──────────────┬──────────────┘
                                    │ reads / writes
                                    │ (client SDK)
                                    ▼
                     ┌────────────────────────────┐
                     │   Firebase (the bridge)     │
                     │  • Firestore: jobs,         │
                     │    stats/dashboard,         │
                     │    graph/snapshot,          │
                     │    users/{uid},              │
                     │    resume_queue/{uid}       │
                     │  • Authentication            │
                     │  • Storage (resumes)         │
                     └──────┬───────────────┬───────┘
                writes ▲    │               │ reads
                (sync) │    │ triggers      ▼ (poll)
                       │    ▼ (localhost:8000)
        ┌──────────────┴──────────┐   ┌─────────────────────────┐
        │     Local Backend        │◄──│   Admin UI (local only) │
        │  FastAPI + Celery Beat   │   │  Next.js — scraper ctrl,│
        │  PostgreSQL · Qdrant ·   │   │  bot/mail, debug logs,  │
        │  Redis · Ollama          │   │  manual Firebase sync   │
        │  Scrapers → Classifier → │   └─────────────────────────┘
        │  Matcher → Sync          │
        └───────────────────────────┘
```

**Why this split:** the backend needs a real machine (Postgres, Qdrant, Redis, Ollama, headless browsers for scraping) so it stays local/self-hosted. The public frontend needs to be reachable on the internet without exposing that machine, so it's deployed to Vercel and speaks only to Firestore — never to `localhost:8000`. The admin UI is the only piece allowed to call the backend directly, and it's meant to run on the same machine as the backend.

| Piece | Talks to | Deployed |
|-------|----------|----------|
| `frontend/` (public) | Firestore, Storage, Auth, Groq (chat, via its own API route) | Vercel |
| `backend/` | PostgreSQL, Redis, Qdrant, Ollama, scrapes the web, **writes** to Firestore | Local / self-hosted (Docker Compose) |
| `admin-ui/` | `localhost:8000` (backend REST API) directly, plus Firebase Auth | Local only, port 3001 |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React, Tailwind v4, TanStack Query |
| Admin UI | Next.js 16, calls backend REST API directly (localhost:8000) |
| Backend | FastAPI (async), SQLAlchemy 2.0, Pydantic v2 |
| Primary DB | PostgreSQL 16 |
| Vector DB | Qdrant (384-dim MiniLM embeddings) |
| Queue | Celery + Redis |
| LLM (chat + company research) | Groq (user-supplied API key — per-user, never shared) |
| LLM (backend RAG) | Ollama (local, qwen3) |
| Search | SearXNG (self-hosted, company research collectors) |
| ML | Fine-tuned DistilBERT (tech/non-tech classifier) |
| Data bridge | Firebase Firestore (jobs, stats, user profiles, resume queue) |
| Auth | Firebase Authentication |
| Storage | Firebase Storage (resumes) |

---

## Features

### Job Discovery
- **10 scraper engines**: BS4, Playwright, Selenium, Crawl4AI, Scrapling, Newspaper, Phenom, Google Careers, RSS/Atom, Sitemap Discovery
- **4 public job APIs**: RemoteOK, Arbeitnow, The Muse, Adzuna — no URL needed
- **Scheduled scraping** every 6 hours via Celery Beat
- **Fuzzy deduplication** using PostgreSQL `pg_trgm` similarity
- **Auto-expiry**: jobs older than 30 days are archived

### Company Background Checks
- Submit **{company, position, optional JD}** → cited AI research report on the user dashboard
- **Deterministic red flags**: domain age (WHOIS), pay-for-training/deposit mentions, scam mentions across distinct sites, negative news, review-sentiment heuristic — each with evidence links
- **Collectors**: company website, Wikipedia (resolves brands to parent companies), Google News RSS, SearXNG search snippets (10 categorized queries), Reddit, GitHub org, and TJSR's own jobs DB; Glassdoor/AmbitionBox get deep links (never scraped)
- **Per-user Groq key**: synthesis runs on the requester's own API key with explicit consent (`/privacy`, `/terms`); every claim is citation-validated, missing evidence says "Insufficient data"
- Company reports cached 30 days and shared across signed-in users; position analysis stays private

### Resume & Matching
- Upload PDF resume → extract 130+ tech skills
- **Hybrid matching**: 60% keyword overlap + 40% Qdrant semantic similarity
- Match explanations: matched skills + missing skills (gap analysis)
- Per-user job alerts when a new job scores ≥40% skill overlap

### AI Chat
- RAG-powered chat with Ollama (local LLM)
- Context: top 8 semantically similar jobs from Qdrant + DB fallback
- Streaming responses, conversation history (Redis, 7-day TTL)

### Notifications
- **Telegram bot**: daily digest, instant match alerts, chatbot responses
- **Email digest**: SMTP-based, personalised per subscriber
- **In-app notifications**: real-time bell icon with unread count

### Dashboard
- Live stats: total jobs, jobs today, matched jobs (week-over-week %)
- Activity feed from logs + applications
- Latest job matches with apply links

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.10+

### 1. Clone & configure

```bash
git clone https://github.com/your-org/Project-TJSR.git
cd Project-TJSR
cp .env.example .env
# Edit .env with your credentials
```

### 2. Backend — all-in-Docker (recommended, works on Raspberry Pi)

One image (`backend/Dockerfile`, built from the repo root) runs the API, the
Celery worker, beat, and the Telegram bot. Secrets are **not** baked into the
image: `backend/.env` is loaded at runtime and `firebase-service-account.json`
is mounted read-only from the project root.

```bash
docker compose up -d --build          # infra + API + worker + beat
docker compose --profile bot up -d    # also start the Telegram bot (needs TELEGRAM_BOT_TOKEN)
```

Cross-build for a Raspberry Pi (arm64) from an x86 machine, then load it there:

```bash
docker buildx build --platform linux/arm64 -f backend/Dockerfile -t tjsr-backend:latest -o type=docker,dest=tjsr-backend.tar .
scp tjsr-backend.tar docker-compose.yml firebase-service-account.json pi@raspberrypi:~/tjsr/
# on the Pi (with backend/.env placed next to the compose file as backend/.env):
docker load -i tjsr-backend.tar && docker compose up -d
```

### 3. Backend — bare-metal dev alternative

```bash
docker compose up -d postgres redis qdrant searxng   # infra only
cd backend
pip install -r requirements.txt
playwright install chromium   # for Playwright engine
uvicorn app.main:app --reload --port 8000
```

### 4. Celery worker + Beat (bare-metal dev, for scheduled scraping)

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info &
celery -A app.workers.celery_app beat --loglevel=info
```

### 5. Frontend (public)

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### 6. Admin UI (local only, optional)

```bash
cd admin-ui
npm install
npm run dev   # http://localhost:3001
```

Controls scraper runs, bot/mail settings, debug logs, and manual Firebase sync. Calls the backend directly at `localhost:8000` — never deployed publicly.

---

## Environment Variables

### Backend (`.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL async URL | ✅ |
| `SYNC_DATABASE_URL` | PostgreSQL sync URL (Celery) | ✅ |
| `REDIS_URL` | Redis URL | ✅ |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Path to Firebase JSON key | ✅ |
| `FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Optional |
| `OLLAMA_BASE_URL` | Ollama server URL | Optional |
| `OLLAMA_MODEL` | Model name (default: qwen3:latest) | Optional |
| `QDRANT_HOST` | Qdrant host | Optional |
| `SEARXNG_URL` | SearXNG URL for company research (default `http://localhost:8080`) | Optional |
| `GROQ_MODEL` | Groq model for research reports (default `llama-3.3-70b-versatile`) | Optional |
| `SMTP_HOST` | SMTP server for email digests | Optional |
| `SMTP_USER` | SMTP username | Optional |
| `SMTP_PASS` | SMTP password | Optional |
| `ADZUNA_APP_ID` | Adzuna API ID (free tier) | Optional |
| `ADZUNA_APP_KEY` | Adzuna API key | Optional |
| `FRONTEND_URL` | Frontend URL for CORS | ✅ |

### Frontend (`.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config (Firestore, Auth, Storage) |

Chat uses a user-supplied Groq API key stored in Firestore (`users/{uid}.api_keys.groq`) — no backend URL is needed on the public frontend.

### Admin UI (`.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` | Same Firebase project as frontend (Auth only) |

Backend URL is hardcoded to `http://localhost:8000` in `admin-ui/lib/api-client.ts` since it's local-only.

---

## Project Structure

```
Project-TJSR/
├── backend/                      # Local — FastAPI + Celery, writes to Firestore
│   └── app/
│       ├── api/v1/endpoints/    # FastAPI route handlers (incl. firebase_admin.py)
│       ├── models/              # SQLAlchemy ORM models
│       ├── schemas/             # Pydantic schemas
│       ├── services/
│       │   ├── scraper/         # 10 scraper engines + manager
│       │   ├── classifier/      # DistilBERT + keyword classifier
│       │   ├── rag/             # Qdrant embeddings + chat engine
│       │   ├── telegram/        # Telegram bot
│       │   ├── resume/          # Skill extraction
│       │   ├── research/        # Company background checks (collectors, red flags, Groq synthesis)
│       │   └── firebase_sync.py # Pushes jobs/stats/users to Firestore
│       └── workers/             # Celery tasks + Beat schedule
├── frontend/                     # Public (Vercel) — reads Firestore only
│   ├── app/dashboard/           # Next.js App Router pages
│   ├── components/dashboard/    # Sidebar, Topbar, JobCard, etc.
│   └── lib/                     # firestore.ts, firebase.ts, auth, theme context
├── admin-ui/                     # Local only (port 3001) — calls backend directly
│   ├── app/dashboard/           # scraper, bot, debug, firebase sync pages
│   └── lib/                     # api-client.ts (localhost:8000), firebase.ts (auth)
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Composite indexes for jobs + research queries
├── searxng/                      # SearXNG config (company research search)
├── Classifier_Model_training/   # DistilBERT fine-tuning scripts
└── docs/
    ├── MASTER_PLAN.md
    └── CHANGELOG.md
```

---

## Scraper Engines

| Engine | Best For |
|--------|----------|
| `auto` | Let the system choose (tries bs4 → scrapling → playwright → ...) |
| `bs4` | Static HTML, JSON-LD structured data |
| `playwright` | JavaScript SPAs, stealth scraping |
| `selenium` | Legacy JS sites |
| `crawl4ai` | AI-assisted extraction |
| `phenom` | Phenom People ATS (NVIDIA, Comcast, etc.) |
| `google_careers` | google.com/about/careers |
| `rss` | RSS/Atom job feeds |
| `sitemap` | Auto-discover job URLs from sitemap.xml |

---

## Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full version history.

---

## Documentation

Full project documentation: [Google Doc](https://docs.google.com/document/d/1N2CmqfgxLy89CCKTg3LFd7dvZoGmfa1pCll1kcVICMs/edit?usp=sharing)

---

## License

[GPL-3.0](LICENSE)

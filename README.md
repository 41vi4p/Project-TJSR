# TJSR — Tracker for Job Search & Reporting

[![Version](https://img.shields.io/badge/version-1.0.6-yellow.svg)](docs/CHANGELOG.md)
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
- **Notifies** you via in-app notifications, Telegram bot, and email digest
- **Lets you chat** with an AI assistant (Ollama/RAG) about the job database
- **Visualises** company–skill relationships in a Neo4j knowledge graph

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React, Tailwind v4, TanStack Query |
| Backend | FastAPI (async), SQLAlchemy 2.0, Pydantic v2 |
| Primary DB | PostgreSQL 16 |
| Vector DB | Qdrant (384-dim MiniLM embeddings) |
| Graph DB | Neo4j 5 |
| Queue | Celery + Redis |
| LLM | Ollama (local, qwen3) with RAG |
| ML | Fine-tuned DistilBERT (tech/non-tech classifier) |
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

### Resume & Matching
- Upload PDF/DOCX/TXT resume → extract 130+ tech skills
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

### 2. Start infrastructure

```bash
docker-compose up -d   # PostgreSQL, Redis, Neo4j, Qdrant
```

### 3. Backend

```bash
cd backend
pip install -r requirements.txt
playwright install chromium   # for Playwright engine
uvicorn app.main:app --reload --port 8000
```

### 4. Celery worker + Beat (optional, for scheduled scraping)

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info &
celery -A app.workers.celery_app beat --loglevel=info
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

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
| `NEO4J_URI` | Neo4j bolt URI | Optional |
| `SMTP_HOST` | SMTP server for email digests | Optional |
| `SMTP_USER` | SMTP username | Optional |
| `SMTP_PASS` | SMTP password | Optional |
| `ADZUNA_APP_ID` | Adzuna API ID (free tier) | Optional |
| `ADZUNA_APP_KEY` | Adzuna API key | Optional |
| `FRONTEND_URL` | Frontend URL for CORS | ✅ |

### Frontend (`.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config |

---

## Project Structure

```
Project-TJSR/
├── backend/
│   └── app/
│       ├── api/v1/endpoints/    # FastAPI route handlers
│       ├── models/              # SQLAlchemy ORM models
│       ├── schemas/             # Pydantic schemas
│       ├── services/
│       │   ├── scraper/         # 10 scraper engines + manager
│       │   ├── classifier/      # DistilBERT + keyword classifier
│       │   ├── rag/             # Qdrant embeddings + chat engine
│       │   ├── graph/           # Neo4j knowledge graph
│       │   ├── telegram/        # Telegram bot
│       │   └── resume/          # Skill extraction
│       └── workers/             # Celery tasks + Beat schedule
├── frontend/
│   ├── app/dashboard/           # Next.js App Router pages
│   ├── components/dashboard/    # Sidebar, Topbar, JobCard, etc.
│   └── lib/                     # API client, auth, theme context
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

## License

[GPL-3.0](LICENSE)

# Changelog

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

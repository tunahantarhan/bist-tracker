# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BIST Tracker: SaaS MVP that scans Borsa Istanbul stocks with admin-defined technical rules and produces a deterministic "Algoritmik Güven Skoru" (0–100, two-decimal weighted sum) plus notifications. It must never present itself as investment advice or place trades; the legal disclaimer must stay on every page footer and the auth screens. UI text is Turkish; code, comments and commit messages are English. Frontend routes are Turkish (`/ana-sayfa`, `/giris`, `/kullanici/[slug]`, `/detay/[symbol]`, `/admin`).

Product spec (Turkish): `bist_tracker.md` and `CURSOR.md` (both git-ignored, local only). Cursor rules in `.cursor/rules/*.mdc` contain older context; parts are stale (e.g. "JWT auth yok" — auth now exists).

## Running locally

```bash
docker compose up -d                       # Postgres 15 + Redis 7 (linux/arm64), repo root
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000  # starts APScheduler too (lifespan)
alembic upgrade head                       # apply migrations
alembic revision --autogenerate -m "..."   # after model changes
cd frontend && npm run dev                 # http://localhost:3000
npm run lint / npm run build               # frontend checks
```

No test suite exists in either backend or frontend. Backend config comes from `backend/.env` via `app/core/config.py` (template `backend/.env.example`; `SECRET_KEY` is required). Frontend API base: `NEXT_PUBLIC_API_URL` or `http://127.0.0.1:8000/api/v1`.

The backend is run with the system Python 3.13 (`/Library/Frameworks/Python.framework/...`); `backend/venv` was created at an old path and lacks some packages. Yahoo Finance rate-limits aggressively (HTTP 429) — avoid scripts that rescan the whole universe repeatedly.

`frontend/` uses Next.js 16 / React 19 / Tailwind 4 — see `frontend/AGENTS.md`: read `frontend/node_modules/next/dist/docs/` before relying on remembered Next.js APIs.

## Backend architecture (`backend/app`)

- Routers are thin; logic lives in `services/`. All routers mount under `/api/v1` in `main.py`.
- **Auth**: JWT access + refresh tokens carry a `token_type` claim (`core/security.py`). `api/deps.py` provides `get_current_user` (rejects refresh tokens and inactive users) and `get_current_admin`. Every mutating rule/universe/admin endpoint requires admin; `GET /rules` requires login; market read endpoints are public.
- **Data**: `providers/yfinance_provider.py` (async, in-memory master cache, 4h candles resampled from 1h). Symbols are bare BIST tickers (`THYAO`); `.IS` is added inside the provider. Price history is never stored in Postgres; API payloads are cached in Redis (`services/cache_service.py`).
- **Stock catalog vs universe**: `core/stock_catalog.py` is the static symbol→name catalog (search, ticker, admin chips). `universe_stocks` table is the actively scanned subset, edited in the admin panel. To add a new stock, add it to the catalog first.
- **Rule engine** (`services/rule_engine.py`): a `Rule` = `indicator_1(+params)` `condition` against `static_value` or `indicator_2(+params)`, on its own `timeframe`, adding `score_impact` when met. RSI_TRENDLINE is a custom descending trendline on RSI peaks, additionally gated by `peak_qualifies` (peak ≥ `min_peak`, trend tip ≤ `max_trend_end`). One rule is the `is_primary_filter` (enforced unique in the rules router). Rule input is validated in `schemas/rule.py`.
- **Market service** (`services/market_service.py`): scores are always computed on canonical candle sets (`EVALUATION_PERIODS`), never on the chart period the user picked, so overview and detail agree. `get_overview` has Redis + memory cache and an `asyncio.Lock` single-flight guard; `get_symbol_detail` builds chart/overlays/RSI pane/breakdown/returns/fundamentals. Rule or universe changes must call `invalidate_market_caches()`.
- **Notifications**: the APScheduler job (`scheduler/main.py` → `services/task_runner.run_market_scan`) refreshes the overview every `SCAN_INTERVAL_MINUTES` and calls `services/alert_dispatcher.dispatch_alerts` (system alerts for primary-filter passes + users' custom alerts), only during BIST hours (`core/market_hours.py`, `NOTIFY_ONLY_WHEN_MARKET_OPEN`). Page visits never trigger notifications. `NotificationService` de-duplicates via Redis cooldowns keyed by user/symbol/rule.
- Default rule suite for the admin "seed" button: `core/default_rules.py`.

## Frontend architecture (`frontend/src`)

- All HTTP goes through `services/api.ts` (no raw `fetch` in pages/components): it attaches the access token and on 401 does a single shared silent refresh (`refreshSession`); if that fails it clears the session and fires a `session-expired` event that `components/auth/SessionGuard.tsx` turns into the re-login modal. Session storage helpers are in `lib/auth.ts`. Keep `services/api.ts` / `types/index.ts` aligned with backend payloads.
- Rule breakdown rows are rendered by `components/rules/RuleConditionText.tsx` (shared by dashboard drawer and detail page).
- Charts use `lightweight-charts` (`components/charts/ChartWrapper.tsx`), including the RSI pane and trendline overlay.
- Dark trading theme (`#0b0e14` background, slate text, blue accent); reuse existing shadcn/ui components rather than adding new palettes.

## Project notes

`notlar/` (git-ignored) holds the tracking file `notlar/PROJE.md` and incoming chats/docs in `notlar/gelen/`; `/devam` updates it.

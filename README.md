# Book Illustration Studio

A web app that turns book text into character portraits and a chapter illustration using the Gemini API, following the Gradion take-home pipeline (style → characters → portraits → chapters → illustrations).

## Prerequisites

- Node.js 20+
- A Gemini API key with **image model quota** (see below)

## Quick start

```bash
cp .env.example server/.env
# Edit server/.env — add GEMINI_API_KEY and other vars

cd server && npm install && cd ../client && npm install && cd ..

./start.sh
```

Open **http://localhost:5173** (Vite proxies `/api` to the backend on `:3001`).

## Tests

```bash
./test.sh
```

Backend tests run with `GEMINI_USE_STUB=1` automatically (see `server/package.json`) so they do not burn API quota.

## Environment variables

Copy `.env.example` to `server/.env`:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Your Gemini API key (never commit) |
| `GEMINI_TEXT_MODEL` | e.g. `gemini-3.6-flash` |
| `GEMINI_IMAGE_MODEL` | e.g. `gemini-3.1-flash-image` (Nano Banana family) |
| `GEMINI_USE_STUB` | Set to `1` to skip real Gemini calls (local UI dev / tests) |
| `SESSION_SECRET` | Cookie signing secret |
| `PORT` | API port (default `3001`) |
| `CLIENT_ORIGIN` | CORS origin (default `http://localhost:5173`) |

## Image quota (important)

Per the assessment spec: **check free-tier limits for the image model before you start — they are tighter than text.**

- Text steps (style, characters, chapters) often work on a free account.
- **Portrait and illustration steps call the image model.** On free-tier keys, **all native image models** we tested (`gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`) commonly return HTTP 429 with `limit: 0`. Switching from 3.1 to 2.5 does **not** bypass this — it is a project/plan constraint, not a model-version issue.
- Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists free tier as **"Not available"** for native image models.

**Before running the full pipeline:**

```bash
node server/scripts/check-image-quota.js
```

**To use real images:** enable billing on your Google AI Studio project:  
https://aistudio.google.com/app/settings/billing

Monitor usage: https://ai.dev/rate-limit

**To develop the UI without image quota:** set `GEMINI_USE_STUB=1` in `server/.env`. Stub mode skips Gemini and writes placeholder images so you can walk through all five steps locally.

## Architecture (short)

- **Backend:** Express + SQLite (`better-sqlite3`), images on disk under `server/data/images/`
- **Frontend:** React (Vite)
- **Pipeline:** five user-triggered steps; atomic `step_state` lock prevents duplicate Gemini calls; book text uploaded once via Gemini File API and chained on later text steps; portraits use a separate image interaction chain; illustrations attach saved portrait bytes as reference input
- **Caps (server-enforced):** max 2 adult characters, max 1 chapter

See `DECISIONS.md` for design trade-offs and `CLAUDE.md` for pipeline contract details.

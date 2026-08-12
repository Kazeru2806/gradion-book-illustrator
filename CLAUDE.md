# Project: Book Illustration Studio (Gradion take-home)

## What this is
A web app that turns a book's text into character portraits and chapter
illustrations using the Gemini API, following the 5-step pipeline from
Google's cookbook notebook ("Illustrate a book: The Wind in the Willows").

## The 5-step pipeline (hard contract, do not deviate)
1. **Style** — user-supplied, or Gemini generates one from the book text.
2. **Characters** — structured list of main ADULT characters only, each with
   an image prompt. **Hard cap: 2 characters.** Enforced server-side.
3. **Portraits** — one image per character, using the style from step 1.
4. **Chapters** — structured list of chapter illustration prompts, each
   referencing which characters appear in it. **Hard cap: 1 chapter.**
   Enforced server-side.
5. **Illustrations** — one scene image per chapter, reusing the actual
   portrait image bytes from step 3 as reference input so characters stay
   visually consistent.

Steps run in order, one at a time, only on explicit user action. A step
cannot start before the previous one has succeeded.

## Non-negotiable rules
- **Enforce the 2 character / 1 chapter caps server-side.** Never trust the
  frontend to enforce this. Slice the array immediately after parsing the
  structured JSON response, before any image generation call fires.
- **Send the book text to Gemini exactly once per project.** Upload it via
  the File API (or equivalent) once, store the resulting file reference /
  interaction id on the project record, and reuse that reference on every
  subsequent step. Never re-send the full book text on any step.
- **Characters must be adults only.** State this explicitly in the
  character-generation prompt.
- **Never auto-retry a Gemini call in a loop.** All retries are
  user-triggered only, from the UI, for the specific failed step.
- **Use real structured output** (JSON schema / response_format param) for
  the characters and chapters steps — not prompt-engineered JSON you parse
  with regex.
- **Persist generated portrait image bytes to disk**, not just prompts —
  the chapters/illustrations step needs to re-attach the actual portrait
  images as reference input, and this must work even if the app restarted
  between steps.

## Pipeline state (how progress is modeled)
Two fields per project, not one enum:
- `status`: which steps have COMPLETED (CREATED → STYLE_SET →
  CHARACTERS_GENERATED → PORTRAITS_GENERATED → CHAPTERS_GENERATED → DONE)
- `step_state`: whether a step is currently `idle` / `running` / `failed`,
  with a `started_at` timestamp.

A step stuck in `running` for longer than realistic call time (real Gemini
calls take 10–30s+, images longer — use minutes as the stale threshold, not
seconds) must be recoverable via a user-triggered retry, never silently
auto-retried and never requiring manual DB edits.

## No duplicate calls
Before firing a Gemini call for a step, atomically check-and-set
`step_state` to `running` in a single DB transaction. A second tab, a
double-click, or a refresh mid-step must see "already running" and get the
existing in-flight state back — not trigger a second Gemini call.

## Stack
- Backend: Node.js + Express
- Frontend: React (Vite)
- Storage: SQLite (via better-sqlite3) — chosen for atomic transactions,
  see DECISIONS.md. Images and book text stored on local disk, served
  through our own API routes (no S3/CDN).
- Gemini: real API calls via REST or the official SDK, key from
  `process.env.GEMINI_API_KEY`, never hardcoded or committed.

## Conventions
- Small, focused commits. If a commit is mostly AI-generated, say so in the
  commit message body.
- Every new piece of pipeline logic (step ordering, retry, caps) needs a
  backend test before being considered done.
- Don't add abstractions for features we're not building (no plugin system,
  no multi-tenant scaffolding, no generic step-N framework beyond these 5
  fixed steps).

## Out of scope — do not implement
Veo animation, Lyria music, TTS narration, media mixing, audiobook sections
from the notebook. These are explicitly excluded by the assessment spec.
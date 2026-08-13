# Gradion Take-Home — Execution Plan (start → submit)

Budget: ~16h. Deadline: 3 calendar days. Read this once fully before touching code —
the spec punishes guessing at the pipeline instead of reading the notebook.

---

## Phase 0 — Install & accounts (30–45 min)

Do this first, all of it, before anything else.

1. **Node.js LTS** (v20+) — `node -v` to confirm. You'll want this even if your
   backend isn't JS, for tooling.
2. **Git** — `git --version`. Configure `git config --global user.name/user.email`
   if not already set.
3. **An AI coding tool** — this is *required*, not optional (§2 of the spec).
   Options: Claude Code, Cursor, GitHub Copilot, Codex. Pick whichever you're
   fastest in. If you don't have one, Claude Code is installable via npm
   (`npm install -g @anthropic-ai/claude-code`) or the Claude desktop app's
   Code tab.
4. **Gemini API key** — go to https://aistudio.google.com/apikey, create a key.
   Do **not** put it in any file that gets committed. Note the free-tier
   image-model rate limits before you design anything around them
   (https://ai.google.dev/gemini-api/docs/rate-limits) — they're much tighter
   than text, and this shapes whether you queue/serialize image calls.
5. **Docker** (only if you decide you need `docker-compose.yml` — e.g. you pick
   Postgres). If you go with disk/JSON storage you can likely skip this
   entirely — and should say so in `README.md` per §5.5.
6. **A DB client / editor** as needed for your stack choice.
7. Create the GitHub/GitLab/Bitbucket repo now, empty, so you can push small
   commits from minute one (git history is graded — §2.4).

---

## Phase 1 — Explore before building (60–90 min, non-negotiable)

The spec is explicit: **run the notebook yourself before writing app code.**
This isn't busywork — the mechanics you need (how context is chained, how
structured JSON is requested, how portraits get reused for consistency) are
*only* in the notebook, not in the assessment doc.

1. Open the Colab notebook:
   https://colab.research.google.com/github/google-gemini/cookbook/blob/main/examples/Book_illustration.ipynb
2. Run the **"Illustrate a book: The Wind in the Willows"** section, steps 1–5
   only (style → characters → portraits → chapters → illustrations). Skip Veo,
   Lyria, TTS, audiobook — out of scope.
3. While running it, take notes on, specifically:
   - Which model is used for text/structured steps, which for images
     (Nano Banana family) — you'll pick "current" equivalents later and note
     that choice in `DECISIONS.md`.
   - **How is the book's text sent once and reused?** (file upload API +
     reference, or a chat/conversation object that gets appended to). This is
     the mechanic behind the "send the book once" cost rule in §4.3 — get it
     exactly, don't approximate it.
   - **How is structured output requested** for characters/chapters (JSON
     schema / response-schema param, or prompt-engineered JSON)?
   - **How are portraits referenced during illustration generation** to keep
     characters visually consistent (image input alongside the prompt)?
   - Confirm the adults-only restriction on characters and where it's
     enforced in the prompt.
4. Cross-reference each notebook call against the REST docs so you know the
   plain-HTTP shape (no Python/Google SDK needed):
   https://ai.google.dev/gemini-api/docs
   Note: the newest conversation/chaining API may only have Python/JS SDK
   docs — its REST endpoint exists and is documented, use that if you're not
   on JS/Python.
5. Write down the 5-step pipeline as *you* now understand it, in your own
   words. This becomes the backbone of your own spec doc in Phase 2.

## Phase 1b — Play with the reference demo (15–20 min)

Open `app-demo.html` in a browser and click all the way through: sign in,
create a project, paste some text, walk all 5 steps.

What to copy: the screens, the states, the overall shape (stepper, project
list with status pill + progress dots, character/chapter cards, per-item
portrait reveal).

What **not** to copy (the spec calls these out explicitly):
- Its `localStorage` data layer — you need a real backend.
- Its fake timings (~2s per step, 8s "stuck" threshold) — real Gemini calls
  take 10–30s+, so your in-progress/stuck-detection thresholds need to be
  realistic, not copied numbers.
- Its duplicate-click guard — it only works because everything lives in one
  tab's JS memory. Yours must survive a second tab or a hard refresh, which
  means the guard has to live server-side (a `step_state` /
  in-flight-request record the server checks before firing a Gemini call).

---

## Phase 2 — Spec & scaffold (60–90 min)

1. **Write your own short spec** (a scratch doc, doesn't ship) covering: data
   model (User, Project, Character, Chapter, Style, and however you represent
   `status` + `step_state`), API routes, and the pipeline state machine. Brainstorm
   it with your AI tool until the holes are filled — per §09 this is explicitly
   the expected workflow, and it gives the AI tool real context instead of
   improvising as it goes.
2. **Decide stack + storage now**, write the reasoning into `DECISIONS.md`
   immediately (don't backfill later — vague/backfilled entries score badly).
   - Stack: pick boring and familiar. A common fast combo: Node/Express or
     FastAPI backend + React (or plain HTML/JS) frontend, but use whatever
     you're fastest in.
   - Storage: DB is optional. JSON files are explicitly acceptable *if* state
     is isolated per user/project and safe against concurrent/overlapping
     writes (a per-project write lock, as the example decision in the spec
     shows). If you pick JSON files, decide the lock mechanism now (e.g. a
     simple file-based mutex or an in-process queue per project id).
3. **Scaffold the repo:**
   ```
   /server            # backend
   /client            # frontend
   /data               # JSON storage or sqlite file, gitignored
   /docs/plan.md       # your AI-tool-generated planning notes (commit this)
   CLAUDE.md           # or .cursor/rules, AGENTS.md — project context for the AI tool
   DECISIONS.md
   TESTING.md
   README.md
   .env.example
   start.sh
   test.sh
   .gitignore          # data/, .env, node_modules, etc.
   ```
4. Write `CLAUDE.md`/`AGENTS.md` now with: the pipeline contract (2 char / 1
   chapter caps, order, adults-only), the storage decision, the "send book
   text once" rule, and "never auto-retry Gemini in a loop." This is both a
   required artifact (§2.2) and genuinely useful — it's what stops your AI
   tool from inventing an unbounded character list or re-sending the whole
   book every step.
5. First commit: scaffold + `CLAUDE.md` + `.gitignore` + empty `DECISIONS.md`/`TESTING.md`.
   Small commits from here on, not one giant one at the end.

---

## Phase 3 — Data model & pipeline state machine (2–3h)

This is the part most likely to be graded harshly if rushed — §4.3 and the
"resume & concurrency correctness" row in §07 are entirely about this.

1. **Model status as the demo's own comment hints you shouldn't**: not a
   single enum. Use two fields, e.g.:
   - `status`: which steps have *completed* (CREATED → STYLE_SET →
     CHARACTERS_GENERATED → PORTRAITS_GENERATED → CHAPTERS_GENERATED → DONE)
   - `step_state`: whether a step is currently `idle` / `running` / `failed`,
     plus a `started_at` timestamp.
2. **Stranded-step recovery**: if `step_state == running` and `started_at` is
   older than some realistic threshold (well above your real call latency —
   think minutes, not the demo's 8s), treat it as failed/stuck and surface a
   retry affordance. No auto-retry loop — user-triggered only (§4.3 cost
   discipline).
3. **No duplicate calls**: before firing a Gemini call for a step, atomically
   check-and-set `step_state` to `running` server-side (this is the lock — DB
   transaction, or your JSON per-project mutex). A second tab or double-click
   hitting the same endpoint should see "already running" and get the
   in-flight state back, not fire a second call.
4. **Resumability**: reopening a project (fresh load, after logout, after
   server restart) must derive its current screen purely from persisted
   `status`/`step_state`/stored results — never from anything in-memory only.
5. **Retry a single failed step** without touching completed ones — this
   implies each step's output (style text, character list, portrait files,
   chapter list, illustration files) is persisted independently as it
   completes, not all-or-nothing per pipeline.
6. **Enforce the 2 characters / 1 chapter caps server-side**, not just by
   hiding UI — truncate or reject before calling Gemini.
7. Write backend tests for this logic now, before wiring real Gemini calls —
   step ordering, retry-single-step, duplicate-call rejection, stuck-step
   detection are all pure logic you can test with a mocked Gemini client.
   (§09 point 5: TDD here is a leash on the AI, not a coverage target.)

---

## Phase 4 — Gemini integration (2–3h)

1. Implement a small Gemini client wrapper with the calls the notebook used:
   - Upload/attach the book text **once** per project, get back a reference
     (file id / chat/session id), store that reference on the project, reuse
     it for every subsequent step. Never re-send the full book text.
   - Style step: user-supplied style **or** generate one from the book
     reference.
   - Characters step: structured JSON output, adults only, capped at 2,
     each with an image prompt.
   - Portraits step: one image call per character (Nano Banana family model —
     pick a current model id, note it in `DECISIONS.md`).
   - Chapters step: structured JSON, capped at 1, referencing the characters.
   - Illustrations step: image call per chapter, passing the character
     portraits as reference input so characters stay visually consistent.
2. Real key via env var only, never committed. Fill in `.env.example` with
   the var names (no values).
3. Wire each step's endpoint to: check/set `step_state=running` → call Gemini
   → persist result + advance `status` → set `step_state=idle`, or on error
   set `step_state=failed` and persist the error for the retry UI.
4. Serve generated images and the stored book text yourself from disk (no
   S3/CDN per §5.2) — a simple static file route scoped so a user can only
   reach their own project's files.

---

## Phase 5 — Frontend (2.5–3.5h)

Match `app-demo.html`'s coverage, not its layout or data layer. Screens:

1. **Identity** — name + email form, validation, session (cookie/token/header
   — your call, note it).
2. **Project list** — title, created date, status pill (Draft/In
   progress/Done), 5-segment progress indicator, empty state.
3. **New project** — title + `.txt` upload *and* paste-text, validated.
4. **Project detail**:
   - Full book text visible at any pipeline stage (a modal like the demo's
     is fine).
   - 5-step stepper: done/current/pending.
   - Style once generated; character cards (name, prompt, portrait);
     chapter cards (name, prompt, illustration).
   - One action button for the *current* step only; step 1 takes an optional
     style input.
   - Per-item reveal for portraits/illustrations as each one actually
     finishes generating (poll per-item status; don't block on the whole
     batch) — this is one of the three things the mock deliberately fakes.
   - **In-progress state naming the running step** (not a bare spinner).
   - **Error state with a retry button scoped to that step.**
   - **Stuck-step recovery affordance** (surfaced once your backend's
     stranded-step detection fires).
5. Sign out.
6. Poll (or, if you want the bonus, SSE/WebSocket) at an interval sane for
   10–30s+ real calls — not the demo's fast fake polling.
7. Visual bar: consistent spacing/type, real loading/empty/error states, no
   layout jumps, keyboard-usable, responsive. "Match or beat" the demo, not
   copy its CSS.

---

## Phase 6 — Testing (1.5–2h)

1. **Backend**: step ordering (can't skip ahead), retry-single-step,
   duplicate-call rejection under concurrent requests, stuck-step detection,
   cap enforcement (2 chars / 1 chapter) — mock the Gemini client, don't burn
   quota.
2. **Frontend**: a couple of components in their loading/error/empty states —
   pick what matters (e.g. the stepper, the retry button), don't chase 100%.
3. Run the suite for real, capture the actual output, put it in `TESTING.md`
   (paste output or commit the generated report file — it must be a real run).
4. Write `TESTING.md`: strategy for FE + BE, what you deliberately didn't
   test and why, few hundred words, plus the real report.
5. *Optional/nice-to-have*: one mocked-Gemini integration test running all 5
   steps happy-path.

---

## Phase 7 — Docs, scripts, polish (1–1.5h)

1. **`start.sh`** — one command boots the whole stack (backend + frontend +
   whatever storage init). **`test.sh`** — one command runs all tests. Make
   sure a clean checkout + these two scripts actually works (test it in a
   fresh clone if you have time).
2. **`README.md`** — start command, test command, prerequisites, env vars,
   short architecture overview.
3. **`DECISIONS.md`** — finalize 4–6 decisions, each: what was proposed, who
   pushed back (you or the AI), where you landed, what it cost. Must cover at
   minimum: stack + storage choice, how you modeled pipeline progress, how
   you stopped duplicate execution on refresh/second-tab. **At least 3 must
   be places you overrode the AI** — wrong, unsafe, or overcomplicated output,
   and what you did instead (§2.3 — "the single strongest signal in the whole
   submission," don't skip or fake this). Close with the one-more-day answer.
4. Confirm AI artifacts are actually committed: `CLAUDE.md`/`AGENTS.md`,
   `docs/plan.md`, any saved prompts/agent configs — whatever your tool
   really produced, not reconstructed after the fact.
5. Check git history: small meaningful commits with real messages, spread
   over your actual work session (not squashed at the end), AI-authored
   commits noted as such in the body.
6. Do **not** deploy anywhere public — local only (§08).

---

## Final submission checklist

- [ ] Notebook run yourself before any app code (Phase 1)
- [ ] Pipeline matches notebook mechanics: context chained once, structured
      JSON, characters→chapters order, 2/1 caps enforced **server-side**
- [ ] Resumable at any step; no data loss on refresh/logout/restart
- [ ] No duplicate Gemini calls (2nd tab / double-click / refresh mid-step)
- [ ] In-progress state names the running step; failures retryable per-step
- [ ] Stranded "in progress" step has a real recovery path, no manual DB fix
- [ ] Never auto-retries Gemini in a loop
- [ ] Book text sent once, reused via chaining/reference, not resent per step
- [ ] All required screens/states present, matches or beats `app-demo.html`
- [ ] `.env.example` present, real key never committed
- [ ] Backend + frontend tests, real run pasted into `TESTING.md`
- [ ] `README.md`, `DECISIONS.md` (4–6 decisions, ≥3 AI overrides, one-more-day
      answer), `TESTING.md`, `CLAUDE.md`/AI artifacts all present
- [ ] `./start.sh` and `./test.sh` (or equivalent) work from a clean clone
- [ ] Git history is incremental with real timestamps, not one giant commit
- [ ] Nothing deployed publicly
- [ ] One repo link ready to send

Good luck — the grading weights "followed the actual spec" and "resume &
concurrency correctness" heavily, so if you're short on time near the
deadline, protect Phases 1 and 3 over frontend polish.

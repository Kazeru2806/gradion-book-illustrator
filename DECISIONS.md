# Decisions

## SQLite over JSON files for storage

The spec allows either a real database or JSON files on disk, as long as
state is isolated per user/project and safe against concurrent writes. I
considered JSON files first since the assessment explicitly calls them out
as an acceptable choice at this scope. I picked SQLite instead because the
hardest requirement in the spec — no duplicate Gemini calls on refresh or a
second tab — needs an atomic "check if a step is already running, and if
not, mark it running" operation. SQLite gives me that as a single
transaction for free. With JSON files I'd have needed to hand-roll a
per-project file lock to get the same guarantee, which is more code and
more ways to get subtly wrong under real concurrent access (two requests
hitting the same file at once). SQLite is still a single file on disk, no
server process to run, so it doesn't add real operational weight. The cost
I'm accepting: a native dependency (better-sqlite3, which compiles on
install) and slightly more schema/migration thinking up front than "just write a JSON blob."

## Separate `status` and `step_state`

Claude proposed tracking pipeline progress with a single enum. I pushed back:
one enum can't express "step 3 completed in `status`, step 4 currently
`running` in `step_state`," which is exactly what a page refresh mid-step
must read correctly. I split it into `status` (which steps have finished)
and `step_state` (`idle` / `running` / `failed` plus `step_started_at`).
The cost is keeping two fields in sync and needing a stale timeout (5
minutes) so a server crash mid-call doesn't strand a project forever — the
user gets a force-retry affordance instead of manual DB edits.

## Atomic step lock in SQLite, not an in-memory mutex

The AI's first instinct for "no duplicate calls" was an in-process lock map.
That breaks the moment you have two server processes or restart mid-request.
I overrode that with an `UPDATE … WHERE step_state = 'idle'` inside a
`better-sqlite3` immediate transaction: only one request wins, the second
gets `already_running` and the UI shows the in-flight state. Edge case the
AI missed: retry must also allow taking over a *stuck* running step
(`step_started_at` older than the threshold), not only `failed` steps.

## Image quota is an account constraint, not something the app can bypass

The assessment warns to check image-model free-tier limits before starting;
they are tighter than text. I verified this by probing multiple models with
`npm run check-quota`: on a free-tier key, **gemini-2.5-flash-image,
gemini-3.1-flash-image, and gemini-3.1-flash-lite-image all return 429 with
free_tier limit:0** — switching to an "older" model does not unlock quota.
Google's pricing page lists "Not available" for free tier on every native
image model. I did not add automatic model fallback in the app (that would
burn calls and hide misconfiguration); image model stays in `GEMINI_IMAGE_MODEL`
and the check script compares candidates so you can see which (if any) work
on your key. Actionable 429 text, `GEMINI_USE_STUB=1` for tests/local dev,
and incremental portrait saves remain the honest mitigations. Real image
generation still requires a billed project for most accounts.

On submission day I could not complete a live Gemini end-to-end run: the text
model hit the free-tier cap (20 requests/day on `gemini-3.6-flash`) after
development and quota probing, and all native image models still returned
429 with `free_tier limit:0`. I recorded a full five-step demo with
`GEMINI_USE_STUB=1` instead. Backend route tests also use stubs so CI-style
runs do not burn quota. A reviewer with a billed key can follow README +
`npm run check-quota` for real portraits and illustrations.

## Incremental portrait persistence during the portraits step

The demo mock fakes instant images; real calls take 30–90s each and we
generate up to two portraits sequentially. The AI initially returned all
portrait paths only at `completeStep`, so the UI showed one long wait. I
save each portrait to disk and update `characters.portrait_path` as soon as
Gemini returns, while `step_state` stays `running`. The frontend polls every
3s and shows "1 of 2 ready." On retry after a partial failure, characters
that already have a portrait are skipped and the image interaction chain
continues from `portrait_interaction_id`. Cost: partial state visible if
the step fails mid-way — acceptable because retry is step-scoped and the
user sees what succeeded.

## Node/Express + React/Vite for speed

I considered Python/FastAPI (matches the reference notebook) but chose
Node/Express because the Interactions API is well covered by `@google/genai`,
the assessment allows any stack, and Vite gives fast frontend iteration.
Trade-off: no shared language with the Colab notebook — I ran the notebook
once for the pipeline contract, then mapped calls to the JS SDK manually.

---

## If I had one more day

I'd add retry/attempt history per step (bonus item in the spec) and a happy-path integration test that runs all five steps against `GEMINI_USE_STUB=1` in CI — the spec calls that out as nice-to-have and it would lock the full pipeline contract without spending image quota on every push.

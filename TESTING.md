# Testing

## Strategy

### Backend

The server tests focus on pipeline correctness — the highest-risk behavior in
the spec:

- **Atomic step acquisition** — two concurrent `startStep` calls must not both
  acquire the same step (SQLite transaction + worker thread test).
- **Status transitions** — `completeStep` advances `status` and clears
  `step_state`; `failStep` leaves `status` unchanged and surfaces the error.
- **Retry** — a failed step can be reclaimed without redoing completed steps.
- **Stuck detection** — long-running steps are flagged for force-retry without
  auto-firing another Gemini call.
- **HTTP integration** — auth, project create, and a stubbed five-step run
  through the API (`GEMINI_USE_STUB=1` in `routes.test.js`).

Gemini is **not** called in backend tests. Live API calls are slow, quota-
limited, and non-deterministic; stub mode exercises the same persistence and
routing paths without burning keys.

### Frontend

Two components cover the states Gradion cares about on the project detail
flow:

- **`Stepper`** — done / current / running / failed step visuals.
- **`ProgressDots`** — progress indicator on the project list.

Not tested: full `ProjectDetail` E2E (would need API mocking), Gemini
integration, image rendering, or every empty/loading variant. Those are
verified manually with `./start.sh` and stub mode.

### Deliberately out of scope

- Live Gemini text or image calls in CI
- Browser E2E (Playwright/Cypress)
- Load or concurrency tests beyond the single duplicate-step worker test
- Visual regression / screenshot tests

---

## Test report (2026-08-14)

Command: `./test.sh` from repo root.

```
==> Backend tests

> server@1.0.0 test
> node --test test/**/*.test.js

✔ startStep twice concurrently allows only one acquisition (28.984375ms)
✔ completeStep advances status and clears running state (2.630791ms)
✔ failStep keeps status and marks step failed (1.999291ms)
✔ retryStep can reclaim a failed step (8.297708ms)
✔ checkStuck reports long-running steps without auto-retrying (2.586917ms)
✔ auth + project pipeline end-to-end with stubs (290.65675ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0

==> Frontend tests

> client@0.0.0 test
> vitest run

 ✓ src/components/ProgressDots.test.jsx (2 tests)
 ✓ src/components/Stepper.test.jsx (3 tests)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

**Total: 11 tests, 0 failures.**

Manual check before submission: full five-step pipeline with
`GEMINI_USE_STUB=1` in `server/.env` via `./start.sh` at http://localhost:5173.

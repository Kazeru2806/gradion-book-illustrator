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
install) instead of zero dependencies, and slightly more schema/migration
thinking up front than "just write a JSON blob."

## [Decision 2 — stack choice, once you've actually built with it for a bit]

[What you considered, e.g. Python/FastAPI vs Node/Express. Why Node won —
probably speed/familiarity. What you gave up.]

## [Decision 3 — how you modeled pipeline progress]

[Claude proposed / you proposed the two-field status + step_state model —
write what actually happened once you build this in Phase 3. What did the
single-enum alternative fail to express? What did splitting it cost you —
e.g. two fields to keep in sync, needing a stale-timeout to clear a
stranded step.]

## [Decision 4 — how you stopped duplicate execution on refresh/second tab]

[The transaction-based lock, once implemented. Any place the AI's first
attempt at this was wrong or missed an edge case — this is a strong
candidate for one of your required "AI override" entries.]

## [Decision 5, 6 — at least one more, plus 2 more AI-override callouts]

[Spec requires 4-6 decisions total, with AT LEAST 3 being places you
overrode AI output that was wrong, unsafe, or overcomplicated. Keep a
running list as you work with Claude Code — every time you say "no, don't
do that, do X instead," that's a candidate entry. Don't wait until the end
to reconstruct these from memory.]

---

## If I had one more day

[One short, honest answer once you're near the end — what you'd build next
and why. E.g. retry history UI, SSE instead of polling, sample public-domain
books to pick from.]
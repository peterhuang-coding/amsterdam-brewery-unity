# ALG01 Four-hour Algorithm Iteration Plan

**Goal:** Improve the reliability of the existing night exploration algorithms with reproducible evidence during one four-hour execution window.

**Architecture:** One coordinator owns the branch and applies patches sequentially. Coding Plan produces independent drafts in a single batch at a time, initially two concurrent requests; after two actual successful returns, up to four independent requests may run in the next batch. No second dispatcher, paid fallback for speed, or independent coding loop.

**Tech stack:** Existing browser JavaScript modules, Node test runner, Python Coding Plan batch CLI. No engine migration or new dependency.

## Authority and baseline

- D7, 2026-09-19: user explicitly requested four hours of underwater algorithm iteration with Coding Plan and higher concurrency. This authorizes the work below and one bounded follow-up heartbeat.
- Exact baseline: `78b13c06a5df7914fbbb4eb404bec6489b7376cb`.
- Branch: `codex/algorithm-iteration-4h`; worktree: `.claude/worktrees/amsterdam-algorithms-4h`.
- Notion ALG01: https://app.notion.com/p/3e03285284df8189b1a9d2ef89f773b4 . R01's earlier playable delivery stays awaiting review.
- The authoritative execution window and recovery state live at `/tmp/amsterdam-algorithms-4h-20260919/run.json`. The owner thread, heartbeat ID, current batch and checkpoints must be recorded there. Check UTC before every dispatch. At deadline stop new work and only checkpoint/verify already completed changes.

## Acceptance and exclusions

Re-run the 97-test baseline. Every gameplay fix needs a genuine failing reproduction before the change and a passing regression afterward. Measure before/after on identical cases; accept optimizations only when semantics remain correct and repeated measurements support the claim. Keep original versions v1-v3 compatible using fixtures produced by actual historical code, not just a changed version number. No invented player feedback, no objective claim of increased fun from algorithm metrics.

Do not modify the currently served `three-day-slice` worktree, user browser/storage, nightly automation `amsterdam`, Unity, independent economy branch `407697b`, game balance, prices, map content, or product candidates. A browser check uses a separate session and port. Only own branch may be pushed; never force-push or auto-merge. Workbench receives documentation only.

## Independent work packages

### A — Navigation and automatic choices

Scope: `tools/prototype/backstage-auto.js`, `reopening-city.js`, new focused route tests/benchmark files.

1. Draft a deterministic route matrix using actual public APIs: seed/day/kit, dynamic obstruction, near-target line of sight, cargo-full and target-unavailable outcomes. Capture the goal, elapsed simulated time and last actions on failure. Start with the existing `test-district-auto.js` as the API reference.
2. Measure completion/explicit recoverable failure separately from getting stuck; exercise resumed automatic travel. Never teleport as a workaround in a production fix.
3. Minimize a real failure, request a small fix from Coding Plan, run it red/green, then check the full route matrix and old-version behavior.
4. Only if measurements justify it, compare route-cache invalidation or search improvements against the original algorithm on the same corpus.

### B — Physics and spatial interactions

Scope: `tools/prototype/backstage-core.js`, new physics invariant tests/benchmarks.

1. Draft deterministic action sequences through the real movement/command APIs, including drag, hook, drop, conveyor, wet ground and movable barriers.
2. Check finite values, carried/world item ownership, resource conservation, legal collisions and restore acceptance of legitimately reachable states. Do not treat intentional collisions, rescue or extraction as failures.
3. Replay at supported time steps; distinguish expected integration tolerance from invalid state. Persist the shortest useful failure transcript.
4. Fix proven violations minimally. Broad-phase or allocation optimizations require actual profiling and repeated before/after measurements, not speculative rewrites.

### C — Save, restore and day transitions

Scope: `tools/prototype/reopening-core.js`, save tests and actual historical fixtures. Changes to `backstage-core.js` must be queued after B's patch, not concurrently applied.

1. Test real reachable states through serialize/restore and continuation, including paused choices, physics impulses, permanent pump repair and repeated settlement.
2. Check legal new/old saves retain progress; malformed nested structures fail cleanly. Keep immutable reports and day ordering intact.
3. Use deterministic comparisons to distinguish intended state migration from corruption; add only meaningful regression cases.
4. Minimize and fix actual failures, retaining evidence of original failing behavior and the exact baseline.

### D — Replays, failure reduction and performance

Scope: new `tools/prototype/bench-algorithms*.js` / replay helpers and focused tests. Do not edit application UI without a proven need.

1. Build a bounded, seeded harness using the existing API that records seed, actions, elapsed time, checksum/observable outcomes and workload version.
2. Save failing cases so they can be replayed with one command; reduce action sequences only if the same failure still occurs.
3. Benchmark representative workloads with warmup and repeated samples. Record environment, median/tail timings and rejected experiments. No brittle timing thresholds in CI.
4. Reuse the harness for A-C; dependent tasks run in later batches. Stop extending random samples when no new coverage or actionable evidence is gained.

## Execution and recovery contract

- Read the current `task-tiering` skill. Use `/Volumes/SanDisk2TB/toolkits/scripts/coding_plan_batch.py` with stable IDs and a fresh batch directory for genuinely new tasks. Start with A and B test/harness drafts, not placeholder probes.
- Default provider/model: `volcengine-plan` / `doubao-seed-evolving`. `ark-code-latest` is a verified plan candidate for justified new work/correction; it is not a known underlying model. Only public repo excerpts or synthetic data may be sent.
- Each request: at most 40,000 input characters, 8,192 output tokens, 180 seconds; each batch obeys the CLI's total output cap. Two successful returns permit up to four independent jobs in the next single batch. The local cap is not an official account concurrency guarantee.
- Any failure, rate limit or unknown result stops later waves. Inspect original artifacts before doing anything else. Never resubmit an unknown job, reset the attempt count or open another batch to evade the stop. Preserve in-flight results. Same logical task at most three downstream attempts total, with at most one quality correction.
- Returned text is a draft, never execution evidence. Coordinator inspects and applies useful outputs, runs commands and records adoption/rejection in each batch's `review.json`. No main-agent rewrite of a whole delegated deliverable for speed.
- On temporary rate limits, keep recoverable state and wait for the authorized follow-up; do not use paid APIs for speed. After three consecutive rounds without a verifiable increment, stop as blocked. If all meaningful scoped experiments finish, report completion rather than inventing work to consume quota.
- After each useful increment: run proportional tests, commit, push this branch, update a small checkpoint. Record actual dispatched count, peak in-flight, requested/returned model and accepted artifacts, not a claimed quota savings percentage.
- At the end: full tests and appropriate isolated browser/historical checks, record exact commits and real validation, sync documentation to the workbench, update Notion to awaiting review only after push. Update the project Hub with exactly one next step. Disable the bounded heartbeat. Do not change the daily nightshift.

## Initial sequence

- [x] Confirm clean isolated baseline and run `node --test tools/prototype/test-*.js`.
- [x] Batch 01: A route harness draft and B physics invariant harness draft, concurrency 2; store real results and review both.
- [x] Apply accepted new harness files sequentially and run them; separate generator mistakes from genuine defects.
- [ ] Batch 02 only after Batch 01 is known: independent C save cases, D replay helper, and up to two confirmed focused fixes. Raise to 4 only when all four jobs are independent and the first two calls succeeded.
- [ ] Continue evidence-led reproduction, smallest fixes and measurement within the four-hour window.
- [ ] Deadline checkpoint, final verification, push and Notion/Hub handoff.

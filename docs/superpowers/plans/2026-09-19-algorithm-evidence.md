# ALG01 verification evidence

Baseline source: `78b13c06a5df7914fbbb4eb404bec6489b7376cb`; initial plan commit `40cc806`.

## Checkpoint 1 — deterministic navigation and physics corpus

- Baseline: 97/97 Node test groups, no failures.
- Added 216 route combinations (3 seeds × 3 days × 3 kits × 4 routes × restored/unrestored), 27 natural loot routes, 9 focused midtravel restore routes, dynamic barrel, occluded target, capacity and missing repair-part probes.
- Added 81 physics parameter combinations (3 seeds × 3 days × 3 kits × 3 frame intervals), exact restore checks, ownership/capacity/finite state and focused hook/conveyor/wet/drop/delivery checks. Synthetic placements are explicitly distinguished from natural routes.
- First generator failures were test defects: a clone was checked but not continued; a route finished before obstacle insertion; claimed LOS obstruction was clear; bag filled only to capacity minus three. These are not production bug evidence.
- Retained and locally corrected Coding Plan drafts. No gameplay code, economy values or map content changed at this checkpoint.
- Reproduce: `node --test tools/prototype/test-algorithm-{routes,physics}.js` (9/9 groups).
- Full suite: `node --test tools/prototype/test-*.js` (106/106 groups, zero failures).

## Delegation

Batch 01: two concurrent `doubao-seed-evolving` requests; A returned, B emitted incomplete malformed output and stopped the batch. Batch 02: one bounded correction per logical task, two concurrent `ark-code-latest` requests, returned model `auto`; both completed. The coordinator corrected isolated API/variable errors, applied files and ran the real tests. A model response is not execution evidence. No unknown request was resubmitted and no paid fallback was used.

Batch 03 begins only after those two successful returns: four independent save, historical, city and replay/benchmark drafts. Results remain pending review.

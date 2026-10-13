# PLAY08 R2: actual narrow-screen map legibility and complete handoff

This is the ONE targeted correction for logical play08-night-map under D24. Business attempt amsterdam-night-map-20261013 ended by parent worker timeout after1200.151s/CLI143. It left a complete valid report file but no successful terminal event; adapter unknown. Do not claim the original request succeeded. Parent separately reproduced candidate12/12, final tests on adopted bd61443 baseline3/12 (9 RED), all old379+12=391/391. Use supplied candidate exactly; do not restart or redesign.

Authorization D23/D24, Coding Plan Seed Evolving thinking enabled/effort high only. Exact adopted baseline bd614431e31dc44cd3730ef6c0d6c022cd355b1a + original two-file candidate (input hashes recorded by parent). PLAY03/06/07 remain shelved. This correction or its parent acceptance failing ends this logical item; do not self-dispatch or propose another retry.

## Verified defect
Natural new game -> pub -> open -> early close0cups -> hook -> actual night start, at390px viewport the1100px internal canvas has368CSSpx width. The candidate's narrow labelSize13 is 4.3491CSSpx; M label14 is4.6836CSSpx. Screenshot is too tiny to read. Arrow/diamond are also small. Current test only asserts narrow font larger than desktop; that misses true displayed size. Desktop/projection/static water and walls/dynamic door-gate geometry already pass. No gameplay or geometry defect was found.

## Narrow writable boundary
Only tools/prototype/backstage-scene.js within miniMap's NARROW marker/label sizing and needed label placement, plus tools/prototype/test-night-map-scene.js additions for this defect. Dedicated helpers may be reused unchanged; do not change their shape algorithms. Keep desktop appearance unchanged. Keep map scale/origin/whole-world projection, panel, all static/dynamic wall/water geometry and colors, actual gate/door state, player location/facing, cue existence and core interactions unchanged. NO camera/worldPoint/draw/common primitives/UI/CSS/core/economy/save/old test changes. Input files other than the two outputs are read-only. Original12 tests and their assertions must be preserved; add regression tests, do not remove/relax them. Do not change the original test harness unless a new test strictly requires additional observation, and explain it.

## Required result
At actual canvas CSS widths320,350,368,390 (<600 narrow), the short 你 and 回店 labels must render at least11CSSpx, M 全图 at least10CSSpx. Compute/check effective text pixels using actual canvas width /1100. Player and exit remain distinct by silhouette and color, both visible at exact overlap, as position and facing change. At facing(1,0), both marker silhouettes should have at least6CSSpx short bounding dimension so shape can be seen; marker proportions otherwise stay the same. Do not cover one marker completely with the other.

Keep full rendered label extents, not just text anchors, inside1100x640 canvas, the allowed top-right x760..1090/y12..310 area, and clear of top-left HUD, overview banner x360..740/y19..53 and bottom message bar. Separate labels from markers and each other at overlap; clamp only label placement near edges, never fake the true world positions. Keep the map rectangle fixed and improve label/marker sizes within it. For text extent, a deterministic recorded text metric with documented font/CJK assumptions is acceptable for technical tests; parent real screenshots remain the final visual check. Do not rely on arbitrary new DOM/CSS or scale only the entire map.

Preserve real B.create/restore cases, existing all3 street conditions, static water/walls, current dynamic doors and gates, retained Noor/barrels/noise/greenhouse/M cues, zero-facing finite behavior, reduced-motion determinism and read-only state. Synthetic positions used for edge cases must be explicitly labelled technical; natural GUI is parent's work.

## Execute in order
1. Read this brief, parent-findings.md and relevant existing test/miniMap lines once. scene miniMap near294-end; labels/marker constants near329 onward. New test helpers/load/projection near17-114; current narrow projection near152-178; marker/overlap tests near286-360. Read bounded ranges. Do not grep/ls/wc.
2. Append a meaningful regression that executes the real miniMap with CSS widths320/350/368/390, derives actual font sizes and shape/label extents, and catches current4px labels plus insufficient marker dimensions. Run it against the UNMODIFIED supplied candidate: expect genuine RED while original12 remain green. Preserve that log. No temporarily deleting wiring to fake RED.
3. Make only the narrow sizing/placement correction; rerun same new tests GREEN. Verify desktop output/projection/old12 stay unchanged and run all4 exact commands.
4. Finish early with complete adapter report and a short final response. Reserve time for report; do not spend the entire timeout in analysis. If a blocker remains, report it honestly. No extra provider/model calls.

## Only4 Bash commands (exact, no chaining)
node --test tools/prototype/test-night-map-scene.js
node --test tools/prototype/test-district-core.js
node --check tools/prototype/backstage-scene.js
node --check tools/prototype/test-night-map-scene.js

Read/Edit/Bash available; use Edit (no Write dependency).1200seconds/32turns. Final handoff-result.json uses adapter schema; changed_files lists only two output files (never report itself). tests exactly4 FINAL rows, each exact command once with actual final exit; earlier RED belongs summary/memory_delta. No self-acceptance or unrun379/GUI claims. Parent replays final regressions on original candidate, full379+allnew, audits boundary/hash/tools/report, then natural desktop390px night path/movement/manual-auto/M/pause-refresh/actualexit before adoption. If correction or parent acceptance still fails, shelve; no third request.

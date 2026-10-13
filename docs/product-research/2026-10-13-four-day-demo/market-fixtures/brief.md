# PLAY11 implementation plan: recognizable market fixtures

Goal: make existing supermarket stock rack and cold-room fixture visually distinct at their real positions, including honest current power state. Exact adopted base0178350e2fb544a77c8512585ae292e50c54d5ad. D23 existing-location clarity/consistent visuals + user ugly/complex feedback authorize this independent scope. D24 business1 then at most1 targeted correction. Seed Evolving thinking enabled/high only. No PLAY03/06/07 candidate reuse.

Observation: natural night1 initial market view shows stock and cold-room fixtures as similar generic vertical slatted boxes; text labels do most of the work. Desktop and390 before images retained by parent. Approaches considered: more labels adds reading; changing collision/core or adding props adds mechanics. Selected: replace just the two current shelf-kind fixture depictions with different broad construction silhouettes. No new story/object/loot.

## Contract / boundary
Only write tools/prototype/backstage-scene.js and new test-market-fixtures-scene.js.
Allowed scene changes: (A) block method signature optional location/market context plus one early shelf-only branch; (B) dedicated helper(s) called only by that branch, adjacent to block; (C) existing this.block(w) call in draw objects map may pass already obtained location and market. All remaining bytes outside these additions remain identical; generic old block body/fallback remains identical. No other draw lines/methods, item/actors/market signs/miniMap/camera/worldPoint/floors/text/doors/walls/UI/CSS/core/economy/save/oldtests changes.
Branch only for w.kind shelf with actual fixture center inside locationInfo.rooms matching market-stock or market-cold AND market.enabled true. Use actual room IDs/geometry, not hardcoded object indices or coordinates. Generic shelf outside matching rooms, missing/disabled location/market, legacy saves keep original drawing unchanged.
Stock rack: visibly open frame, >=2 broad horizontal tier edges + separated upright supports, muted warm wood/metal depth. Avoid repeated narrow vertical wardrobe slats. Empty structural bays only: do NOT draw fake bottles, barrels, hops, pickups, stock counts, price labels or extra interactive-looking objects.
Cold fixture: solid insulated door panels/seam/handle and broad ventilation grille with restrained cool color. Must be structurally distinguishable from stock even without color and tiny text. Keep a small housing/state light tied only to actual marketInfo.powered: powered cool lit, blackout unpowered dark; after actual repair lights on again. No false energy when disabled/unknown (fall back to unchanged generic). No new text promise/extra explanation, animation or external assets.
Preserve original collision footprint, y-sort, actualposition and scale. Keep geometry within old fixture visual envelope x..x+w+15,y-36..y+h+10; silhouette may be inset. No extra floor glow/geometry into walkable aisle. Existing real items must remain visible and exclusively drawn by item(); existing counter/fuse/state signs remain authoritative. Draw must not mutate r/location/market. Same run/time yields deterministic calls, reduced motion supported via existing draw.

## Steps and meaningful tests
1. Read focused context using Read ranges from state-guide; no shell exploration.
2. Add new real BackstageScene.draw Canvas recorder tests using real B.create/restore and recording transforms/finite numeric enforcement (adapt supplied existing recorder inside newtest). Distinguish stock/cold geometry by required structure in their real world bboxes, not source regex/helper names or fixed invented color-only strings. Check real powered/unpowered/repaired rendering, unchanged generic/legacy paths, state immutability/determinism, desktop/390/overview valid geometry and no core/camera changes. Technical position/inventory fixtures explicitly labelled, validate B.restore; do not claim natural saves. Use real B.command to restore power as existing excerpt shows.
3. Run final new behavior tests against UNMODIFIED adopted scene: meaningful RED for missing structural/power-state differences. Fix harness errors separately, do not remove completed feature to fabricate RED.
4. Implement narrow branch/helper only. Newtests GREEN, oldtests and syntax, preserve every old assertion. All required numeric draw arguments finite numbers (strings invalid); matrices true Canvas transforms, don't let a no-op recorder hide crashes.
5. Complete handoff-result.json before cap. Exactly4 tests rows, one per declared command, only actual final status. RED history in summary/memory_delta, not extra/duplicate final rows. Report deviations truthfully; no invented GUI. Do not git commit or run othercommands in staged workspace.

## Exact commands (only these4 Bash, no grep/ls/wc/true/chains)
node --test tools/prototype/test-market-fixtures-scene.js
node --test tools/prototype/test-night-map-scene.js tools/prototype/test-district-core.js
node --check tools/prototype/backstage-scene.js
node --check tools/prototype/test-market-fixtures-scene.js
1200seconds/32turns. Newtest precreated empty for Edit; reserved handoff-result.json exists. Read/Edit sufficient, actual Bash only above.

## Parent gates
Complete original result/report/tools/scope/SHA; final newtests true baselineRED/candidateGREEN; old411+new fullsuite. Natural new run/nightmarket start and choose real market approach, desktop390 and overview beforeafter, no obstruction of actual pickups/counter/fuse/door/hero, pause-refresh. Actual blackout->repair technical fixture separately labelled; no naturalday3 claim unless played. Old minimap unchanged, collision/action semantics untouched. Only parent acceptance then twofile adopt/push/newplay17bytes. If business fails one targetedcorrection; if correction or parent fails shelve without newIDs/mainagentrewrite.

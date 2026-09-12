# City Backstage Implementation Plan

**Goal:** Deliver an accessible, repeatable city expedition in the existing three-day game: shared action controls, moving loot, confrontation, nightlife, fictional contraband, curiosity, extraction and pub consequences.

**Architecture:** A deterministic Backstage simulation owns the expedition map, moving actors, tool effects and run outcome. Reopening owns spending the daily action and settling the outcome once; its save reader migrates older saves. A separate Canvas renderer and controller share the existing page, pause and storage lifecycle.

**Tech Stack:** Existing dependency-free JavaScript, Canvas 2D, Node assertions and browser interaction. Continue in the clean linked worktree on codex/three-day-reopening. User approved implementation with “改吧”; execute inline without another design gate.

## Approved scope and visual direction

- One connected district with supermarket rear, red-light canal street, nightclub, sorting yard and a discoverable greenhouse; 180-second runs with early extraction and recoverable local pursuit.
- WASD/arrows movement, pointer aim, hook, foam, dash, E contextual action. On-screen movement/action buttons share the simulation. Three equipment choices alter reach/capacity/control. Goods and actor schedules vary with seed/day.
- Fictional “月雾” contraband is a contested sealed parcel, distinct from brewing ingredients. The player can return it to Noor or retain it; the choice has a visible pub consequence. No separate drug-production or adult-service minigame.
- Teal wet cobbles #234957, aubergine brick #453247, rose window light #d5798c, sodium lamps #edbd79, mint greenhouse #9ac8a5. Georgia/Songti for place names, existing sans for controls, mono for the run clock. Signature: reflected window light and warm occupied rooms behind cold service alleys. The action canvas receives most of the space.

## Tasks

- [x] Add meaningful failing Node tests for daily action integration, deterministic runs, walls/tool occlusion, extraction vs bailout losses, parcel separation, persistent discovery and old-save migration. Initial integration test failed with the expected unsupported-action result.
- [x] Create `tools/prototype/backstage-core.js`: create/step/command/restore/rewards APIs; shared map geometry and actor behaviors. Integrate start/return actions and one new validated state field into `reopening-core.js`. Run the new tests and the existing core/city tests.
- [x] Create `backstage-scene.js` and `backstage-ui.js`; load before reopening-ui in index. Add a visible expedition launch from welcome/preparation and relevant destinations, live HUD, controls, equipment choice, contextual actions, run receipt, pause/save recovery, and return to the existing pub loop. Keep brewing and serving behavior working.
- [x] Add `backstage.css` for scene-led responsive layout and readable controls. Browser checks cover desktop/mobile layout, keyboard actions, pause/reload, handover, greenhouse discovery, safe extraction and pub consequences. Forced retreat/timeout and precise pointer-camera behavior are verified by automated tests; do not conflate their evidence with manual play.
- [x] Update prototype README with exact controls, entry and current limits. Run focused regression checks and inspect diff; preserve work in the current branch and record verified outcomes in the project Hub.

## Contracts and acceptance

`Backstage.create(seed, day, kit, discoveries)` returns plain JSON. `step(run, input, dt)` advances a bounded simulation in place; `command(run, verb, aim)` applies one discrete action; `restore(run)` validates serialized state; `rewards(run)` only yields outcome for completed runs. Reopening validates a run before consuming its result and clears it on return, preventing repeated settlement.

The UI must never award loot merely for opening a location panel. A parcel needs physical pickup and carrying to a recipient or exit. Closed doors/walls stop tools and motion. A discovery survives returning and the next day's run. Refresh resumes paused; no hidden-tab time advance. The current browser save must not be reset by installing the feature. Functional tests demonstrate mechanics, not that players already find the game fun.

## Verification record — 2026-09-13

- `node --test tools/prototype/test-backstage.js tools/prototype/test-reopening.js tools/prototype/test-city.js`: all three files passed, comprising 16 expedition + 40 reopening + 13 city behavioral checks. Changed JavaScript files pass syntax checks.
- Isolated Playwright browser against `http://127.0.0.1:18767/?seed=42`: launched from welcome, used actual keyboard movement to reach the club, deliberately picked up the parcel, used foam, crossed the district and handed it to Noor. Then operated the greenhouse lever, entered and discovered its roof exit, and extracted. No position teleporting was used for this playthrough.
- This run brought back 6 cups, 1 hop and €14; settlement raised stock from 6 to 12 ales. Opened the existing pub, served Marta, observed Noor arrive at 19 seconds, and successfully served her. Afterwards cash was €79, ale stock 10, satisfied guests 2. This verifies a real connection to the existing loop.
- Reload after parcel handover preserved exact position/time/parcel state and opened paused. At 390×900, measured document width did not exceed viewport. Screenshots under ignored `output/playwright/` record market, club, red-light street, greenhouse, receipt, mobile layout and Noor in the pub.
- Independent review found stale mouse world coordinates after camera movement. A regression test first reproduced wrong direction with real simulation/controller/camera code; the fix stores screen coordinates and remaps using the current camera before actions and frames. Pointer leaving the canvas restores directional keyboard control. Reviewer rechecked the fix and all 16 expedition tests passed.
- The browser automation tool blocks `file:` navigation, so new direct-file loading was not browser-verified. HTTP preview was verified. Initial favicon 404 was removed by an inline icon; the reloaded HTTP page reported no JavaScript errors. No Unity migration, push, PR or CI run.

The remaining product question is whether repeated trips sustain curiosity and mastery. Map topology and the parcel storyline are still a small fixed slice; procedural neighborhoods, larger stories and drug-use mechanics remain outside this implementation.

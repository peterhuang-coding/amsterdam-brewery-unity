# Location Depth Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the bounded simulation task and independent reviews; the primary agent integrates daytime, bicycle, scene and UI work. One implementation subagent at a time; file ownership is explicit.

**Goal:** Deliver supermarket interiors, timed club exploration, day/night consequences and bicycles that accompany players across bridges.

**Architecture:** Extend Backstage's deterministic simulation and existing auto navigator, expose one geometry/status view to canvas/UI, and preserve legacy runs. Keep daytime clue/reward persistence in Reopening and crossing behavior in City.

**Tech Stack:** Vanilla JavaScript UMD modules, Canvas2D, node:test, Playwright browser verification.

## Checklist / file ownership

- [ ] Core implementer: backstage-core.js, backstage-auto.js, test-location-depth.js and existing night tests when expectations intentionally change. Implement the spec's version migration, rooms/shortcut, music/hearing/crowds, contextual automatic choices, reward outcomes. Publish locationInfo shape to integrator first. Start with behavior tests that fail; run Node regressions. Do not edit UI/scene/reopening files or commit other changes.
- [ ] Primary: reopening-city.js and test-city-bike.js. Replace entrance parking with mounted/pushing/parked transition. Test every crossing in both directions manually and automatically, restore mid-crossing, deliberate parking, obstacle tunnelling.
- [ ] Primary: reopening-core.js and test-location-daynight.js. Add life.clues migration/validation, scout command, create context, discovered/outcomes integration. Verify prep scout is free/idempotent; next-night context, return feedback, next-day reset, old saves.
- [ ] Primary: backstage-scene.js/backstage-ui.js plus reopening-scene.js/reopening-ui.js and styles/index. Render source geometry, room labels, music meter and local rules, actual day clue buttons, next-day feedback, push-bike pose and wording; bump asset cache key.
- [ ] Spec reviewer: compare final diff against specification, report omissions with reproduction. Resolve all important findings.
- [ ] Quality reviewer after spec review: navigation/save/recovery edge cases, regression risks. Resolve all important findings.
- [ ] Run `node --test tools/prototype/test-*.js`, syntax/diff checks. In isolated Playwright verify welcome → daytime clue → pub close → both night interiors → extraction → sleep → feedback; pause/refresh, old save, 390px.
- [ ] Update tools/prototype/README.md and this plan with exact evidence; stage only owned files, commit, push new branch. Update Notion and Hub; read back records.

## Test commands and expected results

Run new focused tests before implementation: `node --test tools/prototype/test-location-depth.js tools/prototype/test-location-daynight.js tools/prototype/test-city-bike.js`. New behavior assertions must fail on baseline for missing interiors/clues or parked bicycle. Run the same after corresponding implementation: all pass. Finally full suite must exit 0; no console errors or horizontal overflow in browser. Tests must assert physical outcomes and save validity, not mirror helper implementations.

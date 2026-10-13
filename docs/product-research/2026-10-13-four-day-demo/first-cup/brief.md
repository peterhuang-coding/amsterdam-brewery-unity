# PLAY03 — One actionable first-cup cue

Approved project direction: make the browser demo easier to start and less visually/textually overwhelming, using Coding Plan within the fixed four-day window. Existing PLAY02 street slice is adopted at 6e4f7b3fbb7ad7eca5d3b30b474f61d7437059c7. This is a NEW bounded task, not a restart of old blocked ART01/UPG01/etc. Parent tested natural street→pub→service, actual pour/€8 payment, refresh and 390px; users' real complaint is complexity, ugly map and long tutorial. Do not claim fun validated.

## Chosen interaction
During day1/night and !tutorialSeen, replace the three-step list with exactly ONE short current-action cue. It must reflect the actual selected guest, actual selected beer, actual pouring state and waiting/no-guest state. Never say Marta is selected when a different guest is selected. Keep dismiss and P pause; successful serve and explicit dismiss retain current tutorialSeen persistence. No automatic serving, free stock/cash, simulation-pausing tutorial, new modal, timer/rent changes or save schema change.

In this same first-cup mode only, give the first actionable control visual priority. Above the primary action show a compact honest order summary: actual guest/request, selected beer, price, batch quality/available cups. Default hide batch/price controls under a keyboard-operable explicit '调整酒款、批次和报价' disclosure; all existing choices remain reachable. Do NOT automatically change selection/price as a side effect of render. User selection must remain visible in the summary. Out-of-stock/quality/contract/overbudget/wrongbeer messages stay visible outside collapsed controls; when disabled explain how to recover and expose a way to open adjustments. Preserve disclosure state across normal renders; do not collapse while user adjusts. After successful first serve or dismiss, existing normal service interface stays available; day2/day3 unchanged. During pour keep timer/green target and collect action prominent, one short instruction, optional water/close and trade actions remain accessible. Keep quote/personality but remove redundant tutorial paragraphs in this focused mode. Use existing palette/type, readable body text >=14px for newly added cue/summary, touch controls >=44px, no new assets/libs/framework.

## Writable files and limits
- tools/prototype/reopening-ui.js: firstGuestCue/renderService, minimal UI state/events only; preserve city and night/market logic.
- tools/prototype/reopening.css: scoped first-cup layout/disclosure, no global palette overhaul.
- tools/prototype/test-first-cup-ui.js: new genuine-module behavior tests.
- tools/prototype/test-first-street-ui.js: ONLY update the old test named 'first night shows a short local select/pour/stop cue that can be dismissed once'. Its old simultaneous select/pour/stop wording expectation intentionally conflicts with the new one-step behavior. Replace that assertion with actual transition/dismiss persistence assertions; retain other ten tests, names and assertions unchanged. Do not reduce coverage or force obsolete words into UI to satisfy it.
All remaining input files are read-only. No core, scene, city collision, save version, economic values, new story branches or art redesign.

## Implementation / evidence steps
1. Read focused UI and existing real-module VM harness. Keep dependencies as staged. Design compact cue/summary/disclosure in these files only, no broad refactor.
2. Write new real runtime tests first, run exact new-test command to record expected failures on unchanged UI. Cover at least: selected guest changes and no hardcoded Marta; empty waiting state; pour→collect cue; first serve/dismiss and restored tutorialSeen; first-cup default disclosure and opened choices; user beer/batch/price retained; visible blocked/risk reasons; day2 normal controls. Use valid R.act/restore states, not source substring assertions. Reuse harness pattern locally in the new test; no new shared helper file.
3. Implement minimal UI/CSS and the explicitly authorized old-test update. Run new tests, old targeted suite and syntax check. Any failure diagnose in scope; report genuine out-of-scope blockers, never weaken old tests or alter core.
4. Complete handoff-result.json while within turn budget. Use status completed or blocked, summary, changed_files (game/test paths only, never report itself), tests [{command,exit_code,summary}], blockers/memory_delta/next_steps arrays of strings. State actual tests, not GUI claims. Parent will rerun full358+new tests and natural browser/390px before adoption. Reserve last4 turns for report.

## Exact allowed shell commands (no prefix/suffix/pipes/helpers)
node --test tools/prototype/test-first-cup-ui.js
node --test tools/prototype/test-first-street-ui.js tools/prototype/test-city.js tools/prototype/test-city-bike.js tools/prototype/test-market-daynight-ui.js
node --check tools/prototype/reopening-ui.js

Only actual Read/Edit/Bash tools; use Edit on precreated files including reserved handoff-result.json, not unavailable Write. No network/git/install/own CLI logs/subagents/shell probes. Use Read offsets instead of grep/sed. Output genuine work in temporary workspace, parent controls adoption.

This task has one business attempt now, at most one targeted correction after a confirmed failure under D24. If that also fails, parent shelves it and chooses independent work. It is NOT shelved merely because it passes. Never silently retry or switch model. Historical failures for other logical items are preserved.

# PLAY02 R2 — finish the existing candidate, do not redesign

New D23 user authorization: continue improving the web demo for four days. First repair this existing candidate. Prior D22 reached max_turns, and parent GUI found a real wrong-target bug despite 356 passing tests. You implement only this small correction; parent will review and adopt. Do not spend time restating a plan.

Read this brief, then focused ranges of reopening-ui.js around firstWalkCard (302), renderStreetBoard (316), existing city-travel handler (~600), and test-first-street-ui.js. Other copied modules are read-only test runtime dependencies; do not read every module or redesign the renderer.

## Exact correction
1. At Lotte, returning to map then clicking '直接进酒馆 · E' invokes city-enter and reopens Lotte. Any UI shortcut promising pub/home must use real City travel to pub from current location, not teleport, not current-nearest entry. Use an accurate label such as '回酒馆开门'; do not advertise E as a pub shortcut because E still enters nearest. Keep generic nearest E behavior unchanged. At the initial pub it must still enter/open the actual pub flow normally.
2. firstWalkCard currently renders all three steps at once. Show exactly ONE current recommendation, optional: before meeting Lotte -> visit bridge; met but not promised -> real promise action if nearby or navigate back; promised -> return pub/open existing flow. If zero prep or already used, show an honest feasible next action instead of an impossible promise. One main CTA for the current step plus one secondary route to pub; no automatic resource changes. Preserve full-city access. Brief cost text visible before real promise. Remove/reduce the separate long movement instruction; one short line is enough. Avoid duplicate primary buttons in the day1 street board.
3. Extend the existing behavioral test harness to cover pub shortcut from pub, Lotte and a non-pub location (use real travel plus frame pumping), and the one-current-step transitions before/after promise and no prep. Preserve existing 9 scenario coverage; remove its tautological `||true` assertion and replace with a real check. Do not alter any other old test files.

## Scope
Only edit tools/prototype/reopening-ui.js and tools/prototype/test-first-street-ui.js. Candidate scene and CSS are finished inputs and MUST remain byte-identical. Core/economy/saves/geometry/other games are read-only. Do not add features, libraries or files besides the report. Input = exact d89421e plus archived D22 4-file candidate (hash manifest retained by parent), NOT already adopted game code.

## Work sequence / commands
Add meaningful regression assertions and run them to reproduce; fix these two known issues; run the two exact final commands below; finish the report. Use Read/Edit tools, not unavailable Write. Bash only exact commands, no grep/wc/ls/pipes/echo/subagents/own CLI logs/network/git. Avoid rereading huge files. Parent does the full 356+ suite and browser/mobiles.

node --test tools/prototype/test-first-street-ui.js tools/prototype/test-city.js tools/prototype/test-city-bike.js tools/prototype/test-market-daynight-ui.js
node --check tools/prototype/reopening-ui.js

## Required handoff-result.json
Create using Edit. Exact top-level keys: status, summary, changed_files, tests, blockers, memory_delta, next_steps. status must be 'completed' or 'blocked'. changed_files is the two changed relative paths, NEVER include handoff-result.json. tests has exactly TWO entries, one FINAL result per exact command, each object {command,exit_code,summary}. Mention the earlier red results only in summary, not duplicate tests entries. blockers/memory_delta/next_steps arrays of strings. If incomplete say blocked truthfully. No subjective fun claim. Stop after the report.

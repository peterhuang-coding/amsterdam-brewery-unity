# PLAY06 sole correction after a provider call failure

Logical play06-morning-market / correction1 (sole D24 correction). Original business amsterdam-morning-market-20261013 definitively ended06:08:36.918996Z after556.983s/16turns, CLI1/blocked with provider System protection triggered by request burst. Actual HTTP status is absent, do not label an observed429. Read11/Bash4, no Edit/writes/test run/report; all22 inputs unchanged. Four undeclared read-only grep calls were outside exact commands. There is no finished implementation or passing new test to reuse. Exact adopted baseline remains bd614431e31dc44cd3730ef6c0d6c022cd355b1a. This is same logical task and failure history, not a fresh feature ID. Parent will submit only after30min cooldown; timing is not service recovery proof.

Original-brief.md contains the unchanged complete contract. Implement only its bounded near-street day2/day3 morning outcome card and new behavioral tests. Do not broaden scope, modify source handlers or solve shelved PLAY03. Scope remains reopening-ui.js new read-only helper+renderStreetBoard insertion and test-morning-market-ui.js only. All other supplied files/old assertions read-only. No main game modifications, network or credentials.

## Efficient lookup guide (use Read with offset/limit, not undeclared shell searches)
These line ranges are baseline orientation, not permission to rewrite surrounding functions:
- reopening-ui.js lines210-257 existing marketInfo-driven receipt text;302-356 firstWalkCard and renderStreetBoard insertion area;405-440 travelTo and entry behavior;600-640 existing action dispatch. Use existing city-travel/city-enter, never add remote redemption or teleport.
- reopening-core.js236-274 stable read-only marketInfo contract;440-470 guarded marketErrand implementation. Contract keys condition,label,clue,price,priceReason,receipt,canClaim,reason. Currentday previous-entry is market.history entry.day===state.day-1. Old claimed or expired receipt must not become a new reward. Read-only display cannot spend resources.
- test-first-street-ui.js first~170 lines has full real-module VM rendering/movement harness; latter tests demonstrate realistic travel and input-state invariance. Reuse needed test scaffolding in NEW test file without editing originals.
- test-market-daynight.js first~155 lines builds real B/A trade/delivery/safeexit->R.returnExplore->R.next;280-305 and525-570 show restore-valid guard/cap fixtures. Day3 morning has valid day2 reward, night3 has no day4 reward. Core is authority; no invented bag flags or fabricated valid-receipt state.
- CSS available first-walk, upgrade-card, morning-post, small-note, risk-note, primary/secondary classes. Reuse them read-only; no CSS inspection loop required.

Read minimum needed ranges once, build focused new tests early and reserve final turns for handoff. Entire source files are supplied because harness requires them, not because all must be reread. Do not repeat prose planning indefinitely. Original package preflight63/63 plus UI syntax is historic parent baseline only; run final declared commands yourself after changes.

## Acceptance reminders
One optional short card only prep day2/3 nearstreet, before generic nearby. Only current prior-night true delivered&&safe and/or stockTaken consequences qualify. Real live receipt/claim state and reason; today-only price10, 1action/no money/3cupsq1+hop capped15/today expiry are truthful. Available but action0/batch32 gives genuine reason rather than claiming redeemable. Claimed no future reward CTA; absent/no relevant history/unsuccessful rescue no promise. No state/resource changes on rendering/walking. Existing true walk/entry keeps actual target, path and user stopping; no auto-restart on rerender. No card in overview/place/day1/night/end and those existing contents unchanged. Natural real path and full old379 remain parent gate.

Use Read/Edit/Bash (Write is not present in init). Only these EXACT standalone Bash commands:
1. node --test tools/prototype/test-morning-market-ui.js
2. node --test tools/prototype/test-first-street-ui.js tools/prototype/test-city.js tools/prototype/test-city-bike.js tools/prototype/test-market-daynight-ui.js tools/prototype/test-market-daynight.js
3. node --check tools/prototype/reopening-ui.js
4. node --check tools/prototype/test-morning-market-ui.js
No grep/ls/wc/head combinations, private logs, git, other shell commands or tools. Add meaningful regressions and observe actual red on unchanged adopted UI before implementation; parent reproduces independently. Then run four final commands.

1500 seconds/40turns. Complete promptly, reserve final turns. Runner permits Edit of handoff-result.json separately. Write legal final report: status completed or blocked; summary string; changed_files actual allowed outputs excluding report; tests EXACT4 entries command/FINAL actual exit_code/summary; blockers, memory_delta,next_steps string arrays. Expected RED in summary/memory_delta only, not extra final tests row. No invented results/adoption/GUI/fun claims. If interrupted/blocked and capable, preserve truthful report. Parent verifies and decides adoption; correction or parent acceptance still fails => shelve PLAY06, no further retry or renamed replacement.

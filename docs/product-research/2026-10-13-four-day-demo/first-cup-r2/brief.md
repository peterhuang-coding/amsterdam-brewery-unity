# PLAY03 one permitted targeted correction
Baseline: adopted6e4f7b3 plus the exact first-cup candidate copied into this input. Original task timed out1500s; original worker is confirmed exited. Same logical task play03-first-cup; this is correction1/1. Keep existing implementation and tests.

Parent candidate full33files367/367; final newtests9/9 and at adoptedbaseline3/9(expected6fail). Original CC did not complete final validation/report. Parent realbrowser from newgame to first night found Enter on summary.first-cup-adjust-toggle opens details, but focus becomes BODY because render replaces summary. SubsequentSpace does not close it. Fix keyboard focus retention using existing focus preservation convention; do not rewrite the UI or rules.

Writable: ONLY tools/prototype/reopening-ui.js and tools/prototype/test-first-cup-ui.js. CSS and first-street test are alreadycandidate and READONLY. All other inputs READONLY. Reserved handoff-result.json editable for protocol.
Requirements: Enter/Space toggle with summary focus preserved; ordinary rerenders while focused keep focus/open state; Tab can reach the actual expanded controls; no key leaks to pour/serve while using summary. Preserve all9newtests and original42tests. Add an actual focus/activation regression in the existing VM harness, no source-substring test or always-passing assertion. Demonstrate new regression failing before UI fix then green. Browser behavior checked by parent later; do not claim browser/fun validation yourself.
Do not change core, scene, city, economics, saves, tutorial scope, stock, pricing, rewards. No dependencies, network, git, broad bash, wc/grep/head, own CLI logs, helpers, or subagents. Read by Read, edit by Edit; all outputs precreated. Exact allowedcommands only:
1. node --test tools/prototype/test-first-cup-ui.js
2. node --test tools/prototype/test-first-street-ui.js tools/prototype/test-city.js tools/prototype/test-city-bike.js tools/prototype/test-market-daynight-ui.js
3. node --check tools/prototype/reopening-ui.js

Read the precreated handoff-result schema early. Reserve last4turns for complete valid report status completed (not complete), changed_files only actual2code/testoutputs, NEVER report itself. Tests describe observed actual final command results; memory_delta facts only. If blocked, report accurately. Budget1200s32turns; concise targeted work.

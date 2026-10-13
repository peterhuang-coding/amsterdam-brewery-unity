# PLAY13: clear one-item cargo decisions

Exact adopted base 0178350e2fb544a77c8512585ae292e50c54d5ad. Existing BackstageUI cargo modal only, independent of shelved first-cup, morning, characters, market fixtures, city labels. D23 allows clarity of existing choices; D24 one business attempt and at most one separately submitted correction. Only Seed Evolving thinking enabled/high. Public supplied code only, no network. Do not implement new mechanics.

## Observed problem and intended design
Natural adopted new game seed42001, night1 cart: shelf bottle then actual automatic walk to Noor collected a second bottle. Bag reads 2/12 and two repeated bottle names. Cargo modal has a single '放下封口艾尔' button without held quantity or explicit one-item wording; actual click drops only the first matching ID, bag becomes1/12. This is a wording/information gap, not wrong drop mechanics.
Chosen minimal design: inside existing cargo modal, show current used/capacity slots, one option per held kind in existing first-seen order with current count and explicit drop-one wording, per-item weight and slots freed. Keep the existing first/cancel choice and callback identities. No new confirmation step. Leave the wider automatic/manual bag display unchanged; rewriting all panels is unnecessary.

## Exact edit scope
Only backstage-ui.js inside `if(verb==='cargo'){` up to immediately before `if(verb.startsWith('cargo-drop:')){` (current lines43-47), plus new test-cargo-choice-ui.js. Keep every other byte of backstage-ui.js unchanged, including cargo-drop routing, all key handlers, frame/render, market focus cards, and modal integration. No new shared helper elsewhere; small calculations local to this branch. All other inputs readonly, all old assertions unchanged. Reserved handoff-result.json may be written but is NOT a changed_files task output.

## Player requirements
- Current used/capacity in slots from real B.load(r) and B.KITS[r.kit].capacity, clearly distinguish slots from item count.
- Each held kind appears once, live held count including duplicates, in original first-seen bag order. No world/delivered item included. Full real B.TYPES name preserved and escaped as appropriate to existing API.
- Every action explicitly says only one item is dropped; expose held count, per-item weight, exact weight freed by that one item. Same first occurrence ID and existing `this.perform('cargo-drop:'+id)` callback. Do not sort bag or mutate it while presenting.
- Keep existing paragraph facts: object lands in street, no immediate cash, one salvage is needed for greenhouse pump. Do not invent prices/rewards or overpromise post-action bag counts (capacity-mode auto may then take parcel).
- First choice remains '先都留着，继续探索', with no callback. Real generic Escape will choose this safe first choice; do not touch generic modal/keyboard code. No implicit drop from opening/canceling.
- Reopen after a real drop to show changed count/load. Manual mode, automatic ordinary decision and auto capacity decision must continue using unchanged logic. Current hints/read-time pause remain intact.
- Compact enough at390x844 with current CSS, including all five types. No CSS, new icons, animations, rules, or new in-world labels.

## Focused input reading
Read this brief. Read backstage-ui.js offset1 limit85 for constructor and perform/cargo, offset90 limit85 for rendering/API context. backstage-core.js exports and B.create/B.restore/B.command/drop/load/B.TYPES/B.KITS are authoritative; use Read offset/limit, not shell search. backstage-auto.js offset75 limit65 covers capacity UI and choose/take semantics. test-district-core.js/test-district-auto.js show existing real-core fixtures. CSS is readonly for existing modal styles. All required input files are staged; do not request additional paths.

## Tests before implementation
Use node:test/VM to execute REAL BackstageUI.perform with REAL B.create/restore/command and BackstageAuto. It is acceptable to supply minimal DOM/scene plumbing for constructor and capture showModal arguments/callbacks; do not stub actual drop effects or calculate expected UI using implementation helper. Clearly label technical bag/position fixtures; they are not natural saves. Real browser/native keys are parent acceptance, do not claim them from VM.
Write final meaningful new assertions first, run them on untouched supplied backstage-ui.js for genuine missing-behavior RED; then implement only cargo branch and obtain GREEN. Do not delete implementation temporarily to manufacture RED.
Cover duplicate kinds and first-seen ID order; counts/weights/load/capacity across hook/cart/foam; mixed bottle/hops/barrel/salvage/parcel and distinguish slot sum from count; no mutation on modal open/cancel; real chosen ID alone drops while another same kind remains; reopen reflects new count; automatic ordinary and capacity branch preserve real existing take/drop effects; restore retains identities; empty valid bag onlycancel/no invented item. Keep tests scoped and avoid generic DOM framework. Existing old tests must remain byte exact.

## Only four exact Bash commands (may repeat for RED/GREEN)
node --test tools/prototype/test-cargo-choice-ui.js
node --test tools/prototype/test-district-core.js tools/prototype/test-district-auto.js
node --check tools/prototype/backstage-ui.js
node --check tools/prototype/test-cargo-choice-ui.js

Read/Edit suffice, no requirement to use Write. No grep/head/ls/wc/true/node-e/cat or other shell command, no files outside staged input and two writable task outputs plus reserved report. Leave enough turns to finish: limit1200 seconds32turns, complete at least several turns before cap.

Final reserved JSON report: status/summary/changed_files/tests/blockers/next_steps/memory_delta per supplied launcher schema. changed_files only actual two task outputs, never reserved report. tests EXACTLY four rows, one real final result per declared command with accurate counts and exitcodes; earlier RED only in summary, not extra final rows. Do not say complete before actually writing report and running final tests.

Parent independently checks terminal/report/tools/hashes/exact branch, finalnew on untouched adoptedbase RED and candidate GREEN, all old411+new; natural duplicate pickup/drop/reopen, Escape/cancel no state change, desktop390 and five-kind technical fixture, manual/auto/capacity, paused refresh. Only after all pass may candidate be adopted/pushed; technical success is not fun validation.

# Three-day Reopening Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the bounded rules module and independent reviews; execute the connected UI and integration here. User approved implementation; continue without further approval gates.

**Goal:** A complete three-day playable brewery game where scarce preparation, real beer stock and remembered promises cause the night's outcomes.

**Architecture:** Preserve the former monolith as legacy.html and point its regression suite at that file. New index.html loads reopening-core.js (pure deterministic transitions), reopening-ui.js (DOM, controls and persistence), reopening-scene.js (Canvas pub) and reopening.css.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Canvas 2D, Node built-in test runner. No new dependencies.

## Task 1 — Rules and behavioral tests

- [x] Create `tools/prototype/reopening-core.js` and `tools/prototype/test-reopening.js`. Implement the public contract below; tests precede implementation and a failing test run is recorded.
- [x] Test finite preparation, invalid actions, batch/quality conservation, queued service, stock reservation, promises, upgrades, deterministic three-day outcomes and save validation.
- [x] Run `node --test tools/prototype/test-reopening.js` until passing, with no rule stubs in tests.

### Shared API contract (must remain stable for UI integration)

Browser global `Reopening`, CommonJS export of the same object. `createGame(seed)` returns state. `act(state, action)` returns `{state, ok, message}` and never mutates the input. Invalid actions return input unchanged. `stock(state, beer)` returns available unreserved cups. `customers(state)` returns currently waiting customers. `pourProgress(state, pour)` returns normalized 0..1 fill. `restore(value)` validates an object and returns restored state or null. `BEERS`, `UPGRADES`, `PEOPLE` are keyed metadata dictionaries. UI receives all runtime state explicitly.

State fields: `version:1, seed, day:1..3, phase:'welcome'|'prep'|'brew'|'forage'|'night'|'summary'|'ending', cash, actions:2, batches:[], friends:{lotte:0,bram:0,marta:0}, promises:{lotte:false}, upgrades:[], hops:0, music:false, log:[], totalSatisfied:0, totalServed:0, brew:null, forage:null, night:null, reports:[], lastMessage, result:null`.

Batch: `{id, beer:'blond'|'stout', cups, quality:1..3, madeDay, aged:false}`. Brew: `{beer,hits:[]}`. Night: `{elapsed,duration,orders:[],pours:[],earned,served,satisfied,lost,promiseKept:false,promiseBroken:false,event:null,rentAdjustment:0}`. Order: `{id,name,person:null|'lotte'|'bram'|'marta',beer,budget,arrival,patience,status:'future'|'waiting'|'served'|'lost',portrait,quote}`. Pour: `{customerId,beer,price,quality,aged,startedAt,duration}`. `customers` only returns waiting orders. Stage limits waiting seats; arrival overflow marks lost.

BEERS metadata: `{id,name,short,color,price,cost,yield,description}`; cost 12 / yield 6; two beer kinds. UPGRADES: `{id,name,description,tradeoff}` keyed doubleTap/cellar/stage. PEOPLE: `{name,role,quote,color}` keyed lotte/bram/marta.

Actions (unmentioned phase/action combinations invalid):

```js
{type:'start'} // welcome -> prep
{type:'prepare',kind:'brew',beer:'blond'|'stout'} // spend one action and €12; -> brew
{type:'brewHit',score:0..1} // 3 results then 6-cup batch, quality = earned skill + any hops; -> prep
{type:'cancelBrew'} // -> prep, spent resources not returned
{type:'prepare',kind:'coffee'} // once/day; spend action; €18 and Bram +1, later guest benefit
{type:'prepare',kind:'visit'} // once/day; spend action; promise Lotte stout tonight
{type:'prepare',kind:'surf'} // once/day; spend action; -> 30-second three-lane forage
{type:'forageTick',seconds:0..1} // drift items; 30s or 3 useful catches returns to prep
{type:'forageMove',direction:-1|1} // clamp among lanes 0/1/2
{type:'forageCatch'} // current lane, normalized progress .5..9; hops +1, bottle +2 cups, junk -€2
{type:'dock'} // return to prep with acquired rewards
{type:'event',choice} // resolve pending nightly dilemma, apply metadata-described cost and outcome
{type:'open'} // prep -> night, discard unused actions; create seeded arrival plan
{type:'tick',seconds:0..1} // night clock; arrive and expire guests, expire overfilled pours; finalizes at duration or all orders resolved
{type:'pour',customerId,beer,price} // night, must be waiting, max 1 simultaneous or 2 doubleTap; reserve/consume stock once
{type:'serve',customerId} // night, corresponding pour exists; grade timing from elapsed/duration, no score supplied; pay only valid service
{type:'water',customerId} // free fallback, guest leaves gently, no success reward
{type:'close'} // night -> summary; mark outstanding guests lost, release no consumed beer
{type:'upgrade',id} // summary on days 1/2, choose one not owned, then day++ -> prep, 2 actions
{type:'next'} // summary on days 1/2 skips upgrade; same day transition
{type:'finish'} // summary day3 -> ending; result {won,title,description}
```

Additional fields permitted when returned consistently, but notify integrator of changes. Put prep once/day flags in `prepared:[]`. Reports: `{day,earned,served,satisfied,lost,rent,cash,promiseKept,promiseBroken,note}`. Log entries strings (newest first, capped). Price must be finite positive integer; reject > customer budget at service (visible budget before pouring). No action produces NaN. Supply free-water fallback and €18 coffee recovery so no hard economic lock. Initial inventory 6 blond + 2 stout, cash €45. Rent €18/night; no cash below zero. Night durations around 165/180/195 seconds, first Marta arrival0 and Lotte near end; nights 8/10/12 orders, sufficiently spaced for brewing skill. Perfect fill around .72, tolerable .45..95. Visitors with correct beer, price within budget and tolerable fill are satisfied; quality and perfect skill earn tips. Lotte promise succeeds only on satisfying stout service, yields friendship and next-night music. Promise broken recorded clearly; all promises reset next day. Stage trades seats 3->2 for patience and tips. Cellar ages leftover batches once each night; age changes actual receipts. DoubleTap allows two real reservations. Save restore must not accept arbitrary malformed objects; include appropriate bounded fields and no prototype mutation.

## Task 2 — Playable interface and pub scene

- [x] Save old `index.html` as `legacy.html`; update old test paths `index.html` -> `legacy.html` in legacy tests only.
- [x] Create default HTML using a top day/cash/stock strip, left pub illustration and context, right current action area. Add start, preparation, 18-second brew, service, reports, upgrades, ending, pause/help panels.
- [x] Implement Canvas pub window, bottle stock, counter, taps, guests and fill; do not put required interactions exclusively on Canvas. DOM buttons support keyboard and pointer.
- [x] Bind UI to core API, render resource costs before actions, announce results via aria-live, persist accepted actions to isolated key `ab_reopening_v1`. Pause on hidden page and restore. UI only ticks core in active night or forage. Help and overlays pause brew, night and forage.
- [x] Add fair/premium price and beer selection, order selection, one/two pour slots, explicit water and early close paths. Timing gauge updates without replacing focused DOM each frame.
- [x] Test browser opening, brew inputs, first service, price/stock errors, pause/help and responsive layout through actual UI.

## Task 3 — Review and delivery

- [x] Update root/prototype README with current default and legacy links, duration, controls, tests and save behavior.
- [x] Run new rules suite, old Node suite, JS syntax check and `git diff --check`. Run a 3-day UI-oriented smoke where feasible plus deterministic rules success/failure playthrough.
- [x] Independent spec review, followed by quality review, fix actionable findings and reverify.
- [x] Commit complete changes on `codex/three-day-reopening`; show local running preview to user with final summary and accurate test limits.

## User steering — implemented extension

The tone is now dark comedy about rent, paperwork, influencer economics and startup/academic life; the three regulars remain sympathetic. `NIGHT_EVENTS` metadata describes each exact choice and cost. At 35 seconds each night the core pauses for landlord/influencer/inspector; UI event dialogs cannot be dismissed with Escape. The 30-second `forage` state tracks lane, floating-item status, elapsed time and useful haul; `forageProgress` supports scene and DOM gauges. One stored hop boosts one completed brew. Clickable controls duplicate the Canvas information for small screens and accessibility.

## Verification record

- New pure-rule suite: 36 behavioral checks including three-day win/loss and all forage/event paths.
- Legacy Phase E Node suite: 410 assertions passed; legacy.html is byte-for-byte the previous index.html.
- Independent spec review: passed, including VM event/reload/freeze and forage capture scenarios.
- Real browser: captured hops and bottle, confirmed inventory +2, refreshed into paused forage with rewards retained, brewed with a hop, and served Marta perfectly for €10 with one cup consumed. A natural landlord event survived reload and comp correctly consumed one cup with €12 rent; the UI then completed days 2/3 through early-close failure and replay. At 390px there was no horizontal overflow and all event choices fit the viewport. Browser console had no errors. Full winning routes were tested in rules, not manually played to victory.

- Quality review: no actionable P1/P2; 40 randomized three-day games and 30,661 accepted transitions remained restorable. Fixed the direct-file wordmark link and a resolved-promise label found in the manual walkthrough.
- Delivery uses the isolated `codex/three-day-reopening` worktree and local preview. Existing user worktrees stay available; no remote publication is part of this change.

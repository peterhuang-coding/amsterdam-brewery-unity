# PLAY02 final handoff recovery (R3)

Scoped audit and handoff recovery of the **existing** candidate. No source or test
was edited this turn; nothing here claims playable adoption or user-fun approval.

## Inputs audited (read-only)

- `tools/prototype/reopening-ui.js` — day-1 recommendation card, city travel/entry
  dispatch, first-guest cue.
- `tools/prototype/reopening-city.js` — destinations, routing, proximity.
- `tools/prototype/reopening-scene.js` — city camera and close-street rendering.
- Tests: `test-first-street-ui.js`, `test-city.js`, `test-city-bike.js`,
  `test-market-daynight-ui.js`.
- `index.html`, `reopening.css` and the other staged sources were not modified.

## Code anchors — the pub shortcut targets the destination pub

- `reopening-ui.js:302–335` `firstWalkCard()` renders only on day 1 / `phase==='prep'`;
  eyebrow `可选推荐 / 只看当前这一步`; exactly one primary CTA.
- `reopening-ui.js:311` `toPub()` emits `data-action="city-travel" data-place="pub"`
  (never `city-enter`): `进酒馆开门营业` when already there, otherwise `回酒馆开门`.
- `reopening-ui.js:405–414` `travelTo()` resolves `cityPlace('pub')` to
  `C.PLACES.pub` (290,590) and builds a real `C.route(...)` path — free City walking,
  not a teleport and not a nearest-place entry mislabelled as the pub.
- `reopening-ui.js:415–425` `enterCityPlace()` refuses when the avatar is >65 units
  from the place; arrival (`:437`) then enters the real destination.
- Dispatch keeps the two actions distinct: `city-travel` (`:620`) vs generic nearest
  `city-enter` / E (`:636`). Regression `test-first-street-ui.js:365–420` drives real
  frames from the pub, Lotte's bridge and Bram's café: the card route ends <5 units
  from the pub and >100 from Lotte, while E still enters the nearest place.

## One optional, honest current step; no free rewards, no forced tutorial

- Branches in `firstWalkCard()`: after promising Lotte → return to pub (`:313–316`);
  visit already used or `actions<1` → pub, with copy naming the real reason
  (`:317–320`); before meeting her → free roam to the bridge (`:321–325`); met but
  elsewhere → walk back, and the real `prepare {kind:'visit'}` button appears only
  when standing on the bridge (`:326–333`).
- The promise is the genuine one-preparation action: €0, actions 2→1,
  `prepared ['visit']`, no music granted; core rejects a second same-day promise;
  with zero preparations no visit CTA is offered. Verified at
  `test-first-street-ui.js:223–249` and `:426–487`; arrival alone changes nothing
  (`:236`, `:441`).
- Night-1 teaching is the dismissible inline `firstGuestCue()` (`reopening-ui.js:97–100`,
  `tutorial-dismiss` `:635`), not a modal; the skip test (`:254–275`) asserts service
  starts with the overlay hidden and the open-preparations warning intact.

## Close-street view retained (read-only renderer)

- `reopening-scene.js:57–76` draws the street camera at ~2.6× overview scale;
  `:141–146` labels only the active/near place in street view while the overview keeps
  all seven labels; `:53–56` `cityWorldPoint` inverts the live transform; Lotte remains
  the bridge musician (`:111`, `:285–297`). Covered by `test-first-street-ui.js:314–359`
  and the camera tests in `test-city.js` / `test-city-bike.js`.

## Commands actually run (each exactly once, exact lines, no suffixes)

1. `node --test tools/prototype/test-first-street-ui.js tools/prototype/test-city.js tools/prototype/test-city-bike.js tools/prototype/test-market-daynight-ui.js`
   — exit code 0. TAP `1..42`, `# tests 42 # pass 42 # fail 0`. Composition: 17 bike
   subtests; `test-city.js` contributes 13 inline assertions wrapped as one file
   subtest (prints `13 city tests passed.`); 11 first-street tests; 13 market/daynight
   tests.
2. `node --check tools/prototype/reopening-ui.js` — exit code 0, no output.

## Source unchanged

Sources and tests were touched only with Read this turn; the sole writes are
`recovery-review.md` and `handoff-result.json`. The four-file candidate restoration was
previously recorded hash-matched on clean `d89421e` (turn memory). No hash/git tool is
authorized in this scoped turn, so the authoritative unchanged-tree verification stays
with the parent.

## Explicitly pending parent verification (not claimed here)

- Full regression suite on the applied tree (prior parent record: 358/358).
- Natural in-browser GUI playthrough — canvas movement, keyboard E/B/M, modal focus —
  including the manual first-cup / first-guest cue check.
- 390px narrow-viewport layout.
- Canvas click-coordinate inversion / tap targeting at the pub and the far boundary.
- Final user/fun judgment. No playable-adoption or user-fun approval is claimed.
- Historical D22 turn-limit/GUI failure and D23 R2 transport failure stay on record;
  after this single directed correction the PLAY02 item is to be shelved.

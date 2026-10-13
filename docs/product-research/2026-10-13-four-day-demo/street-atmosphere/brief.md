# PLAY04 canal street atmosphere

## Approved scope and exact baseline
D23 authorizes independent demo visual clarity and scene feedback improvements within the fixed four-day window. This is a new scene-only package from adopted commit 6e4f7b3fbb7ad7eca5d3b30b474f61d7437059c7. No failed first-cup candidate is included. PLAY03 is shelved after its correction failed; do not implement its UI, controls, onboarding, focus, or economy changes here. Only Seed Evolving, thinking enabled/high.

Player feedback: map looks unattractive, interface is complex, teaching too long. Adopted build already opens at 2.6x near-street view and has 2.5D destination facades; preserve those. The remaining scene has broad tan grids, flat rectangular canals, repetitive flat shadows, and competing labels. Improve a coherent small environment, not add another feature or tutorial.

## Chosen visual direction
Quiet illustrated Amsterdam canal street, cool blue water against warm brick/quay, crisp light and shade. Main focus is the pub doorway, a readable player, and the route to Lotte on the bridge. Approach selected: improve existing deterministic Canvas materials, depth and hierarchy. Alternatives considered: another zoom-only adjustment (doesn't improve materials); raster background replacement (risks geometry mismatch and new asset dependency). Do not add external assets, fonts, libraries or network calls.

1. Give land/quay a controlled light stone base with sparse deterministic brick/paving joints and a darker canal-edge coping/shadow. Texture must be subordinate to avatar, route and doors, not dense noise. Visually distinguish stone quay, path and water.
2. Make the canal read as water with a limited tonal band/reflection treatment and restrained highlights. Existing bridge footprints and walkable center stay recognizable. Add visible bridge deck/edge depth without blocking the walkable center or appearing to create a new crossing.
3. Improve existing facade light/shadow and a few deterministic window/brick accents so destination buildings read as places, not flat slabs. Decorative houses remain visually subordinate. No extra fake doors/interaction markers. Keep the pub, Lotte and all seven existing destinations recognizable.
4. Preserve selected destination, route and player contrast on every surface in both day and night. Keep close-view labels sparse and overview labels complete. Avoid global repeated labels intruding over facades. Preserve existing label names, targets, door positions and hit coordinate transform.
5. Reduced-motion mode: at fixed view state, ALL city scene drawing (including water, rings, musician notes and path dash) must be independent of time. Normal mode retains gentle existing ambient movement. Rendering must not mutate view/City geometry.

## Exact interfaces / files
Write ONLY tools/prototype/reopening-scene.js and tools/prototype/test-street-atmosphere.js (empty file precreated for Edit). Other inputs are read-only. Scope scene changes to drawCity and its city helper methods: drawHouses, drawFacade, drawDoor, drawBridgeMusician, plus small city-only helpers if needed. Preserve constructor, generic shared drawing helpers, cityWorldPoint, drawCanal, pub/interior/service renderers and export. Keep camera calculation and cityTransform contract unchanged. Never modify collision geometry, UI, prices, save data or gameplay.
Existing helpers rect/line/poly/ellipse/text are suitable. Stable deterministic integer seeds instead of Math.random. No framework, rendering engine or generalized style system. Bounded drawing; no huge per-pixel loops.

## Implementation / verification sequence
Read this brief and the reserved handoff report schema first. Read scene, city and test-city. Add meaningful behavioral test(s) in the new empty file using node:test and a recording Canvas2D VM harness. Verify reduced-motion fixed-state frame equality at two different times (red on baseline); don't check source substrings or exact aesthetic color constants. Also cover input immutability, finite draw coordinates, balanced real save/restore transformations, and cityWorldPoint inverse mapping in street and overview at pub/bridge/map edges. Existing test-city.js is immutable.
Run the new test red before the scene change. Then improve the scene and rerun exact commands below. Self-critique: eliminate excess texture and incidental shadows that obscure the route; daytime and nighttime still distinguish destinations. Parent will execute full repository regressions and natural browser/screenshot comparison at desktop/390px, near/overview map clicks, walk pub to bridge and return; no browser access here. Do not claim aesthetics/fun approved or browser tested.

Allowed exact Bash commands ONLY:
- node --test tools/prototype/test-street-atmosphere.js
- node --test tools/prototype/test-city.js
- node --check tools/prototype/reopening-scene.js
Read files with Read, edit with Edit. No Write tool required. No grep/wc/ls/git/network, logs, process inspection, subagents or arbitrary shell. For test harness use node builtins only, a real context save/restore stack, no-op drawing calls recording effective styles/transforms; provide gradient addColorStop as needed. VM globals window.City, matchMedia, devicePixelRatio; expose PubScene via window.PubScene. A view has position City.create(), path:[], target:null, mode:'map', notes:[], camera:'street' or 'overview', zoom:1, afterHours:false/true. No garden/bouquet required for basic invariants; FlowerNetwork is available read-only if necessary. Do not encode test expectations for new features not in this contract.

## Completion
Budget 1200 seconds / 36 turns. Reserve last 4 turns for final tests and a valid handoff-result.json. Use status completed, not complete. changed_files lists actual scene/test outputs only, never the report itself. Record actual commands and outcomes, red/green separately. If blocked be accurate. No source commit/push. Parent reviews and adopts only after tests, visual hierarchy and real GUI pass. This is business attempt1; D24 permits at most one targeted correction if it fails, not unlimited tries.

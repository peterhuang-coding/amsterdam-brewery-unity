# CITY01 implementation brief draft — not dispatched

New authorized game adaptation after qualification of PACK and NAV. Intended
fixed ID amsterdam-d27-real-city-20261020, logical f02-real-city-d27, one business
attempt plus at most one targeted correction, proposed2400seconds/70turns.
Current wave must be collected first. Only Coding Plan enabled/high implements.

Own tools/prototype/geo-world.js, reopening-city.js, the coordinate imports in
flower-network.js, and focused test-geo-city.cjs / test-geo-flower-network.cjs.
Do not modify scene, UI, index, runtime, navigation, renderer, economy, night,
journey or other modules. Supplied other modules are readonly behavioral context.
The later BOOT package owns consumers and geometry-specific legacy test migration.

Replace the invented rectangular city collision geometry with configured real
data and the accepted navigation predicates. Do not silently retain old fallback
geometry or initialize a fake city for tests. Tests explicitly configure fixtures.
Preserve place identity, names, prose, costs, action semantics and visited IDs.

Shared immutable UMD/CommonJS GeoWorld holds exact reviewed anchors, map version,
seven existing places, garden/cart and F3 banks, plus provenance and fictional
placement notes. Noord maps to ferryNorth. FlowerNetwork uses GeoWorld ENTRY/CART
while all its economic/story functions remain unchanged. Preserve bounded public
API references needed by the subsequent browser adapter.

City.configure(data,{navigator,routes}) validates/configures once per runtime;
City.isReady(), getData(), dispose() expose readiness/lifecycle. WIDTH/HEIGHT and
world bounds use the actual data. PLACES references shared anchors. Before
configure, methods requiring geometry fail clearly; no old-map fallback.

The routes dependency surface is frozen as:

```
routes.route(from,to,{mode,radius,signal,onProgress}) -> Promise<{
  found,reason,points,length,visited,startSnap,endSnap
}>
```

It is provided by the independently implemented memory/runtime package. Do not
implement another pathfinder in City. City.routeAsync(from,to,options) uses it and
returns `{found,reason,path,length}` with a path preserving metadata expected by
moveAlong, with observable failure/progress/cancellation. Walking path points
retain `{x,y}`; a boat endpoint also has `transport:'ferry',id:'F3',from,to` where
from/to are canonical ferry anchor IDs. Abort rejects with AbortError rather than
publishing a partial path. A compatibility City.route may never trigger a long blocking
full-map search; be explicit about any cached-only behavior. User-changing target
cancels stale work; City must not install stale results or mutate caller input.

Actor radius0.4m, walk48/bike96/ferry32 metres per game-second; arrival4m,
bicycle retrieval2m. Export these named constants for UI. Every attempted move
uses the complete swept capsule, including diagonal sliding and carried bicycles.
Riding is allowed only on NAV bike-safe surfaces; otherwise dismount/push at
walking speed without losing the bicycle. Independently parked bikes stay put.
Keep existing creation, restore, move, moveAlong, near, toggleBike, parkBike
behavioral intent and immutable input/output ownership. Efficient per-frame work
must not scan all145703features or revalidate complete saved geometry each tick.

F3 is an explicit saved transit leg, never a walkable water rectangle. Compose
validated ground route to boarding, canonical boat leg and validated onward route.
Start only at the actual boarding anchor; verify all required ground legs before
accepting a composed route. Ferry metadata includes canonical from/to/progress;
boat position derives from those values. Cancellation or movement keys aboard
clear onward intent but finish the crossing to safe destination ground. Pausing
does not advance simulation. Refresh restores the same progress and reaches the
bank even with an empty ephemeral path. Mounted/pushed bike is carried; remote
parked bike never teleports. Reject forged/nonfinite/unknown transit safely.

New city saves carry map version. Legacy city coordinates are old1800x1120 units,
not new metres: migrate once to corresponding safe named places when recognized,
otherwise pub, treating player and parked bicycle independently. Retain valid
visited-place history and never touch the separate economic game object. New
save restore validates finite values, map version, actual walkability, bicycle
ownership and transit consistency; preserve valid values exactly and clone them.
Invalid position resets safely without unnecessarily deleting valid visits.
Expose a migration indication for BOOT's short player-facing notice.

Focused acceptance includes explicit configuration/readiness, shared10anchors,
forbidden water/buildings/highways, exact radius and swept movement, bike push/
park/retrieval, old/new malformed saves, alias-free clones, async target races,
progress and abort, F3 boarding/direction/cancel/refresh with and without bicycle,
and Garden/FlowerNetwork economic behavior. Use the supplied actual pub fixture
where applicable and clearly named synthetic transit fixtures for state machines.
No synthetic fixture is a claim of full-map route coverage. Parent runs exact full
geometry/routes and natural game flow after integration.

Only listed public files and exact test commands are permitted. All unchanged
read-only inputs must retain SHA. Do not install, fetch, use git, inspect unrelated
directories, spawn agents or modify the game through a separate copy. Return a
complete legal handoff result with exact API additions and limitations.

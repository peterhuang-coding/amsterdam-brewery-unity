# DistrictCity API (CITY02)

`tools/prototype/district-city.js` is the district movement / saved-travel
adapter. UMD: CommonJS export and browser global `DistrictCity`. The legacy
global `City` (`reopening-city.js`) is unchanged and still owns the old
1800×1120 standalone scene.

## Geometry ownership

- The module contains **no map geometry**. After `configure(session)` all
  local predicates and routes come from the accepted DistrictRuntime session's
  **active** district navigator (`isWalkable` / `segmentWalkable` / `route`).
- Authoritative positions are only `active.data.anchors` and
  `active.data.entrance` (snapped, half-metre points). Overview markers are
  source coordinates used for remote metadata only — never as walkability
  claims.
- Cross-district travel uses only the manifest's explicit undirected
  `travelLinks`. There is no whole-map graph, no route cache and no fabricated
  fallback map. Routing errors/aborts surface to the caller (`[]` for
  no-route, `AbortError` for abort).

## Lifecycle

- `configure(session)` — bind one accepted DistrictRuntime session
  (`manifest`, `overview`, `active {data, navigator}` plus async
  `loadDistrict(id)`). Validates manifest districts, links
  (`street` | `ferry`, known distinct endpoints) and overview markers; throws
  on malformed input or when already configured.
- **Null-active startup.** `DistrictRuntime.open()` resolves with
  `active: null` until the first `loadDistrict`. `configure` accepts that
  session: manifest/overview validation is complete, but no district
  geometry exists and the adapter never invents or downloads a fallback
  district. In this state finite geometry predicates (`walkable`,
  `rideable`, `segmentWalkable`, `nearBike`) answer `false`, while action
  surfaces (`create`, `restore`, `move`, `data`, `activeDistrictId`,
  `beginTransfer`, …) throw “no active district”. `requiredDistrict`,
  `planTravel` and `configure`/`isReady` need only the configured manifest.
  After the caller's real `await session.loadDistrict(id)` resolves, every
  local call reads the session's live `active` value. A non-null malformed
  `active` still rejects `configure` atomically; reconfiguration requires an
  explicit `dispose()` first.
- `dispose()`, `isReady()`. Every non-predicate call throws before
  configuration; predicates return `false` by design.
- `requiredDistrict(savedCity)` — which district the caller must load before
  restoring: in-progress transfer → `transit.from`; new-map state → its
  `districtId`; legacy save → recognized venue district; else `jordaan`.
  Works from the manifest alone (including a null-active session).

## Getters

- `PLACES` — frozen map of the seven preserved venues (pub, lotte, coffee,
  noord, market, flowers, lab) with names/icons/prose/costs unchanged, plus
  `districtId`, `anchorId`, `x`, `y`. Coordinates are snapped when the venue's
  district is active, otherwise the overview marker.
- `GARDEN` / `FLOWER_CART` — depijp special anchors (`garden`, `flowerCart`).
- `activeDistrictId`, `data` (active district document).
- Constants: `ACTOR_RADIUS 0.4`, `WALK_SPEED 48`, `BIKE_SPEED 96`,
  `FERRY_SPEED 32`, `ARRIVAL_RADIUS 4`, `BIKE_RETRIEVAL 2` (metres / fictional
  seconds; per-step elapsed clamps to 0.1 s).

## Saved state

```js
{ map, districtId, x, y, visited:[venueIds],
  bike: { districtId, x, y, mounted, pushing?, anchorId? },
  transit?: { from, to, mode, id?, elapsed, duration, departure:{x,y}, carried } }
```

- `create(placeId='pub')` — fresh state on the venue's snapped anchor; the
  venue's district must be active. Bike parks at the same point.
- `restore(saved)` → normalized state; `restoreInfo(saved)` →
  `{position, migrated, warnings}`. Inputs are JSON-cloned and never mutated.
  A 1800×1120 save migrates internally to the normalized shape and is exposed
  publicly as `position` with `migrated: true`; saved economy data lives
  outside this module and is never seen or altered by migration.
- New-map saves validate player/bike against the active nav; remote finite
  in-bounds bikes are preserved (never dragged to the player) and anchor-snap
  once their district activates. In-progress transfers are **cancelled on
  restore/refresh** back to the stored safe departure (`transit-cancelled`).
- Legacy 1800×1120 saves migrate once: player and bike recognize independently
  within 60 units of the seven old place points; unknown player → pub,
  unknown bike → pub (`legacy-bike-default-pub`); a carried bike is preserved
  only when it truly coincides with the player.

## Local movement

- `walkable(x,y)`, `rideable(x,y)`, `segmentWalkable(a,b,mode='walk'|'bike')`,
  `near(position,radius=4)` (venues + garden/cart physically present in the
  active district), `nearBike(position)` (same district, ≤ 2 m, clear walk
  segment, not already carried).
- `routeAsync(from,to,{mode='walk'|'bike',signal,onProgress})` → path points
  with the echoed start stripped; one independent navigator call per intent;
  bike intents may fall back to a valid walk route while the bike stays with
  the player.
- `move(position,dx,dy,seconds)` — swept-capsule movement in ≤ 2 m chunks with
  diagonal axis sliding (no corner cutting); mounted 96 only on a bike-safe
  capsule, otherwise push at 48 with automatic remount on bike-safe ground.
  While `transit` is present it advances the transfer instead.
- `moveAlong(position,path,seconds)` → `{position,path,arrived}`; per-waypoint
  time/distance budgets continue inside one tick; caller arrays are cloned.
- `toggleBike(position)` (mount when reachable / park), `parkBike(position)`;
  remote bikes never move and mid-transfer bike actions are refused.
- `relocateToPlace(position,placeId)` — explicit home/return transition: the
  caller has already loaded the destination district; the input may still
  describe the former district. A carried bike parks at the departure point;
  a separately parked bike (possibly in another district) is preserved.

## Cross-district travel

- `planTravel(fromDistrict,toDistrict)` — BFS over explicit undirected links;
  `[]` for same/unknown/disconnected. Legs are
  `{from,to,mode,id?}` (ferry legs carry the source id, e.g. `F3`).
- Street duration: centre-distance /48 (or /96 while carrying), clamped to
  3–12 fictional seconds. Ferry duration: snapped-bank marker distance /32.
- `beginTransfer(state,toDistrict)` — direct neighbour only. The raw caller
  departure is validated **before** any normalization: missing/non-object
  state, wrong map, unknown district, inactive departure district, missing or
  non-finite coordinates, a non-walkable street point, or an F3 departure not
  within 0.05 m of the snapped bank anchor all throw and leave the input
  object untouched. A normal travel intent is never silently repaired onto
  the entrance or bank (only `restore` deliberately repairs corrupt saves).
  F3 boarding requires standing within 0.05 m of the snapped bank anchor,
  reached by normal walking first.
- `advanceTransfer(state,seconds)` → `{position,ready}`; elapsed clamps to
  0.1 s per call, zero seconds is a pause (no elapsed, no local movement).
- `completeTransfer(state)` — only when `ready` **and** the destination
  district is active; lands on the snapped destination entrance (street) or
  bank (ferry); a carried bike commits with the player, a parked bike is
  untouched. Failure throws and leaves the input state unchanged.
- `cancelTransfer(state)` — departure district must be active; restores the
  stored departure and carried-bike ownership.

## FlowerNetwork boundary

`flower-network.js` gains `configureMap({mapVersion,districtId,entry,cart})`,
`resetMap()` and `isMapConfigured()`; `isAtEntry(position)` then requires the
matching map + district and a ≤ 4 m arrival at the snapped entry.
Unconfigured it remains the exact legacy 1800×1120 / 60-unit predicate used by
the standalone economy. `reopening-core.js` `gardenVisit` delegates the
coordinate check to `G.isAtEntry`; no economy action, cost, settlement, prose
or minigame behavior changed.

## Pending limitations

- No whole-map geometry and no route cache: cross-district movement exists
  only as explicit manifest links, and overview marker coordinates are remote
  metadata only — never walkability claims and never transfer endpoints.
- District fetch and the separate player/cart `AbortController`s remain the
  UI's responsibility; `routeAsync` aborts only its own navigator intent and
  has no global cancellation.
- Street transfer duration is a displayed fictional value (clamped 3–12 s),
  not a surveyed continuous route; nothing lands on a destination before its
  district is active and the snapped entrance/bank validates.
- Unconfigured FlowerNetwork keeps the legacy 1800×1120 predicate for
  standalone economy tests only; active new-map UI is gated on
  `configureMap()` and cannot fall back to the legacy rectangle.
- Synthetic fixtures (and the single real pub-sample navigator test) are not
  natural new-map gameplay acceptance; real five-district HTTP data is
  validated separately by the parent.

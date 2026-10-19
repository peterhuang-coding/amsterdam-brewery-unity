# D27 next-wave design — dependency-gated, not dispatched

Human D27 explicitly authorized loading/memory work and game integration after
dependency acceptance. This is a concrete parent interface and acceptance design,
not implementation, a submitted handoff, or renewed attempt counts. Only Coding
Plan enabled/high may implement it. Current first wave must be collected first.

## Evidence and choice

The rejected R2 candidate has 145703 features, 16943508 coordinate pairs,
397004443 JSON bytes, and 101347149 gzip bytes. Old browser measurements found
2.02–2.49 GB end heap and roughly 7 seconds of event-loop interruption. A fresh
parent count on that exact candidate found 9737 points in its largest ring and
48425 in its largest feature. Its coordinates alone require 271096128 bytes as
Float64 pairs, rather than millions of persistent small point arrays. These are
R2 measurements, not claims about the unfinished R3 output or a phone.

Three options were considered:

1. Increase the JSON cap: smallest change, but retains the large object graph and
   blocking parse. Rejected as the loading/memory solution.
2. Load only a local area: bounds memory, but adds missing-data and long-route
   behavior, and cannot silently omit the authorized complete source. Deferred.
3. Losslessly encode coordinates in bounded binary chunks, keep small metadata
   separately, decode and index cooperatively. Selected for the next package.

Use Float64 as the conservative format; an alternative exact integer encoding
must prove exact round trips for every input ordinate and reject unsupported
values rather than rounding them. No simplification, reclassification, clipped
geometry, removed features/properties/holes, changed IDs, or repaired invalid
polygons is permitted in the memory package. PACK's qualified geometry is frozen.

## MEMORY01 ownership and interface

New business logical task `f02-compact-runtime-d27`; fixed attempt ID will be
`amsterdam-d27-compact-runtime-20261020`. One business attempt plus at most one
targeted correction, with a separate ledger from PACK/NAV original/extra attempts.
Freeze inputs and actual commands only after qualified PACK/NAV artifacts exist.

Own new `tools/geo/runtime` packer, loader, tests, and small browser demonstration.
The qualified navigation and renderer modules may receive *only* cooperative
construction entry points for the new compact representation. Preserve existing
synchronous factories, pure geometry kernels, route semantics, rendering,
labels, size synchronization, and cache limits. Original accepted artifacts and
their prior tests remain provenance; this is new loading functionality, not a
new attempt to erase an old rejected task.

Proposed stable browser surface:

```text
AmsterdamGeoRuntime.load(manifestUrl, {signal, onProgress}) -> Promise<runtime>
runtime.data                  shared v1 feature/geometry semantics, read-only
runtime.stats()               actual bytes, chunks, counts, storage information
runtime.dispose()             release loader-owned state and stop pending work
AmsterdamGeoNavigation.createNavigatorAsync(data, options) -> Promise<navigator>
AmsterdamGeoRenderer.createAsync(data, options) -> Promise<renderer>
```

Both async factories accept `signal`, `onProgress`, and a bounded cooperative
scheduler. The resulting instances retain the existing synchronous query/draw
interfaces, so City does not depend on format internals. An Array-compatible lazy
ring view over typed coordinate buffers is acceptable if all existing predicates,
iteration, indexing and validation behave identically, no unbounded per-point
cache is retained, and parent full-data equivalence passes. Do not JSON-stringify
the full lazy map to transfer or persist it. Do not duplicate geometry into both
navigation and renderer instances.

Packer consumes qualified runtime JSON and emits deterministic manifest/chunks
with source and output hashes, counts and geometry provenance. Each chunk has
strict length/offset/count bounds and a checksum. Fetch at bounded concurrency,
validate before publication, handle raw gzip and HTTP Content-Encoding exactly
once, and enforce total decoded and per-chunk caps. Preserve all source metadata.
Cancellation/error/retry must release stale state and never publish partial data
as a complete map. Malformed offsets, oversized lengths, duplicate IDs, NaNs,
missing layers and digest mismatches must fail with actionable errors.

Provisional parent product gates, to be measured on the exact full candidate:

- Exact ordinate, feature identity, properties, ring/hole/order round trip against
  qualified PACK JSON; deterministic repeated build; all 145703 features retained.
- Full load plus both indexes: sampled JS used heap plus backing storage below
  768 MiB; report both counters and sampling limitations, not a claimed peak RSS.
- Full load/index heartbeat maximum gap below 250 ms in an isolated desktop
  Chromium run; report total time, chunk bounds, cold rendering separately.
- Browser abort/retry and two complete load/dispose cycles do not retain two maps.
- Original NAV and renderer test intent, independent GEOS cases and full render
  matrix remain valid on compact views; no input-geometry or UI behavior changes.

These are acceptance targets, not verified performance. If full measured data
cannot meet them, record the reason and use only this new task's bounded correction
opportunity. Do not claim a 512 MiB cap itself proves memory efficiency.

## CITY01 independent interface after geometry acceptance

In the same next wave, City adaptation can run independently of MEMORY01 once
PACK and NAV semantic acceptance has passed, because it consumes only v1 data and
the existing navigator query API. It must not modify runtime, NAV or renderer.
If the complete-route parent checks expose missing dependency capability, resolve
that fact before dispatch; do not call a synthetic fixture a full-route pass.

Own `geo-world.js`, `reopening-city.js`, the shared-coordinate dependency in
`flower-network.js`, focused tests and fixtures. Do not edit scene/UI/index or the
economic core. Freeze `City.configure(data, {navigator})`, `isReady()`, `getData()`,
shared named anchor coordinates and existing movement/state API. Before configure,
there is no hidden fallback to invented rectangle geometry. Keep all current
destination actions, descriptions, economic effects and valid visit history.

Use the existing D26 integration-boundaries.md for actor radius 0.4 m, actual
walk/bike permissions, swept-segment collision, explicit F3 boat metadata, route
cancellation and refreshed crossings reaching a safe bank, independently parked
bicycles, and versioned old-save migration. Never treat water as ordinary ground.
Exact anchor coordinates and feature IDs remain the reviewed candidates; do not
silently move fictional shops to hide routing failure. Full-route coverage must
include pub/Lotte, southern venues/garden/cart, ferry banks and Science Park.

## BOOT01 follows qualified MEMORY01 and CITY01

Only then freeze scene/UI/index bootstrap handoff using the new Promise factories.
Loading/progress/error/retry must be visible, gameplay starts exactly once, and old
economy saves survive. Keep existing pub/night gameplay; delegate city drawing to
the accepted renderer. Use actual CSS/DPR transformations and label hit bounds,
keyboard focus, pause, hidden-tab and refresh behavior. No technical IDs/worker
details in player-facing flow.

Final parent acceptance is an actual new-commit browser run of first cup → night
cargo → real return → day 2, plus representative walks/rides, ferry cancellation
and refresh, garden/cart, 390 px keyboard/focus, exact served resource bytes and
console checks. Preserve the old 18860/dad6b38 server and old evidence.

## Time and notification boundary

Fixed cutoff remains UTC2026-10-19T22:52:30Z. Budget each new package's full maximum
runtime plus independent parent acceptance before submission. Independent packages
may use the same two-slot wave; dependent or overlapping work is serial. No task
is submitted by this design, no third live CC, no extra old attempt, and no
completion guarantee. Record meaningful deliveries/failures and keep routine
unchanged heartbeat checks quiet.

## New measured full-route constraint (D27 parent, 17:17Z)

On the complete original converted source (not an approved PACK candidate), NAV
R3 finds pub→coffee at radius0.4: 3118.969343 m,73points,71574 expanded nodes,
124577.379ms. Full source indexing825.506ms; every reviewed anchor is walkable.
After this one query, caches hold110066 point entries and220844 segment entries;
these Maps currently have no eviction bound. This is a correct bounded search
result independently confirmed by GEOS on all72segments (minimum clearance0.400835m), but is unsuitable as a
synchronous browser click handler. It does not revoke the original bounded-search
contract or authorize another correction of its already fixed geometry kernels.

The integration design therefore also needs bounded navigation caches and a
non-blocking route service. Prefer exact precomputed common venue routes tied to
geometry hashes, checked against the qualified map, with explicit asynchronous
and cancellable fallback for uncached endpoints. Precomputation does not authorize
invented connectors, silently snapped anchors, or claiming all arbitrary routes
are fast. Parent measures cached and uncached latency separately. City and BOOT
must use this service through a frozen interface rather than call the long sync
search directly. Freeze the precise package/file split only after the first wave
has been collected; no new request has been submitted by this note.

## Draft concrete async boundary (not yet dispatched)

Use one shared compact geometry representation on the main thread. Cooperative
factories and search avoid retaining a second whole map in a Worker. Refactor
the existing route traversal only enough to expose resumable work; keep the
existing synchronous API as a drain of the same logic and compare identical
results in tests. Pure geometric predicates stay unchanged. NAV point/segment
caches gain explicit bounded capacities and disposal; counters report evictions.
Any node-budget or time-budget exhaustion stays distinguishable from unreachable.

Runtime return value additionally exposes `navigator`, `renderer`, and
`routes.route(from, to, {mode, radius, signal, onProgress}) -> Promise<RouteResult>`.
RouteResult retains `{found, reason, points, length, visited, startSnap, endSnap}`.
Returned endpoints are exact caller coordinates; no implicit snapping. The
route service first uses exact verified common-route graph edges tied to the
same geometry SHA, with bounded, individually safe endpoint connectors. It then
falls back to cancellable cooperative navigation. Named-venue queries on the
precomputed graph must be fast; uncached latency is measured separately.

A deterministic offline CLI builds common routes from the accepted navigation
module, current geometry and fixed named anchors. Include pub/lotte, southern
venues/cart/garden, ferrySouth and lab. FerryNorth is not connected by invented
walk edges: City composes the explicit F3 boat transition. Report every missing
route and the actual source/hash, length, node budget and generation time.
Parent must independently validate every stored walking segment against the
full qualified geometry before publishing this asset. No precomputed route may
be copied across geometry hashes without regeneration and checking.

Compact chunks may use Int32 millimetres only when every decoded ordinate is
exactly equal to its input JavaScript number; otherwise use lossless Float64.
The loader must enforce offset/count/type/checksum bounds before exposing lazy
array-compatible rings. No retained per-point object cache or full JSON copy.
The full metadata and geometry remain available; format changes cannot erase
features, IDs, properties, rings, holes, attribution, source or projection.

City is configured with `City.configure(data, {navigator, routes})`. Movement and
collision use the accepted synchronous predicates on short segments. New
`City.routeAsync(from,to,options)` wraps the Promise route service and adds only
explicit boat-leg metadata when needed. `City.route` must never synchronously
run an unbounded city search; any retained compatibility surface must be explicit
about readiness. BOOT awaits routeAsync, suppresses stale results when targets
change, shows progress/cancel without freezing input, and cancels on restart or
dispose. Real ferry state belongs to the saved city position, not an ephemeral
Promise or a path line painted across water.

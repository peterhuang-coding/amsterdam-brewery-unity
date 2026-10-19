# MEMORY01 frozen implementation brief

New authorized capability: lossless compact loading and bounded/cooperative
navigation for the complete BGT map. This is not another PACK/NAV geometry repair.
Do not change accepted polygon predicates, classifications or source geometry.
The prior wave is terminal. Use the already accepted complete UNSIMPLIFIED GEO converter v1 data as the independent input. No PACK implementation or simplified candidate is supplied or required. PACK R3 has a valid on-disk report but abnormal CLI max-turn exit; parent full review is separate and not authority for this package.
Fixed intended ID amsterdam-d27-compact-runtime-20261020, logical
f02-compact-runtime-d27. Business once, at most one targeted correction. Proposed
maximum3000seconds/90turns; actual remaining window must be checked at submission.

## Files and public APIs

Own new tools/geo/runtime/pack-runtime.py, geo-runtime.js,
precompute-routes.cjs, runtime-demo.html, test-runtime.cjs and test_runtime.py.
May extend tools/geo/navigation/geo-navigation.js only with cooperative indexing,
resumable routeAsync and bounded caches; keep all existing sync APIs/results.
May extend tools/geo/renderer/geo-map-renderer.js only with cooperative indexing
over the compact representation. Existing geometry, draw, label and CSS-size
behavior must remain valid. Existing NAV/renderer tests and fixtures are readonly.
Do not modify game, City, UI, scene, HTML bootstrap or economic files.

Global/CommonJS AmsterdamGeoRuntime.load(manifestUrl, options) returns a Promise
of {data,navigator,renderer,routes,stats,dispose}. `data` exposes existing v1
feature geometry semantics with shared, immutable, lazy array-compatible rings.
Do not retain millions of coordinate-pair arrays. Do not stringify/clone/transfer
the full geometry or retain two decoded copies. All feature/source/projection
metadata and original property values must be retained.

Options: signal, onProgress, navigation, rendering, routesUrl (optional), and
explicit maximum encoded/decoded bytes. Progress uses finite {phase,loaded,total}
values; phases describe actual work. Load resolves only after full validation and
both indexes. A failed or aborted load must not publish a partial runtime.

AmsterdamGeoNavigation.createNavigatorAsync(data, options) and
AmsterdamGeoRenderer.createAsync(data, options) yield between bounded batches and
honor signal/onProgress. Reuse existing constructors/logic without duplicating
the geometry. No fake asynchronous wrapper around a single blocking constructor.

Navigator.routeAsync(from,to,{mode,radius,maxNodes,signal,onProgress}) returns the
same RouteResult as sync route; it must yield during search and reconstruction,
cancel promptly without publishing a partial path, and distinguish budget limits
from unreachable. Refactor to shared traversal logic if needed. Geometric
predicates and exact endpoint semantics remain frozen. Point and segment caches
have finite configurable capacities with bounded defaults; stats report size,
capacity and evictions; dispose releases owned references and pending work.

runtime.routes.route(from,to,options) also returns Promise<RouteResult>:
{found,reason,points,length,visited,startSnap,endSnap}. Prefer exact precomputed
common edges whose geometry hash matches the current manifest. Graph search and
bounded safe endpoint connectors may join those edges. Never snap/move endpoints,
invent a bridge or treat an unknown checksum as compatible. Fallback is the
cooperative navigator, with cancellation and progress. Walk and bike policies
remain distinct; a walk-only edge cannot be reported as bike-safe.

## Offline artifacts

Packer command shape: python pack-runtime.py --input input.json --outdir DIR
--chunk-bytes 1048576. Deterministic manifest.json plus metadata-00000.json.gz and
coords-00000.bin.gz for a small fixture; more numbered chunks for full input.
Describe the exact format/version in the module/README. Use Int32 millimetres only
if decoded values exactly equal every original number; otherwise Float64. No
rounding, simplification, deletion, merging or invalid-geometry repair. Offsets,
counts, endianness, encoding, decoded lengths and both artifact/source hashes
must be explicit. Bound chunks and total bytes before allocation; validate
finite coordinates, exact closure, IDs/layers, ring cardinality, offsets,
duplicates and source metadata. Reject malformed data with useful errors.

Browser loading is bounded-concurrency and cooperative; SHA validation and JSON
parsing operate on bounded chunks. Handle an actual raw gzip response and a
response already decompressed by HTTP Content-Encoding exactly once, including
query/hash URLs. Do not only test fake Response objects. Parent will serve both.
Checksum/cap/cancel/retry errors must be observable and dispose partial state.

precompute-routes.cjs --data input.json --anchors anchors.json --out routes.json
uses the accepted navigator to generate a deterministic common-venue graph.
Use exact anchor coordinates, radius0.4m and no snapping. At minimum connect
pub/lotte, pub/coffee, pub/ferrySouth, coffee/lab and nearby southern anchors
(market,flowers,flowerCart,garden); use reviewed named anchors that exist in input.
Do not create a walking edge across ferrySouth/ferryNorth. Record missing edges,
mode, hash, node budgets, route lengths and measured generation time. Validate
stored segments with accepted segmentWalkable. Parent independently uses GEOS on
all stored walking segments against the actual full candidate. A failed edge is
not permission to move a shop, draw a connector or silently claim completion.

runtime-demo.html uses the real browser loader and actual Canvas renderer, shows
progress/cancel/retry, draws the original sample, offers a route query and reports
measured storage/cache counts. Keep it small; this technical demo is not game UI.

## Independent acceptance targets

- Exact full-data roundtrip for every feature, property, ordinate, ring/hole/order,
  metadata and source identity; repeated pack produces identical bytes.
- Original NAV43 and renderer43 tests stay green. Compact views preserve their
  behavior; explicit async tests verify yielding, cancellation, retry, cache caps,
  deterministic sync/async results and complete disposal.
- Full145703feature load plus both indexes: sampled JS heap plus backing storage
  below768MiB; maximum load/index heartbeat gap below250ms on parent Chromium.
  Report total load time and cold Canvas paint separately, not as phone/peakRSS.
- Two load/dispose cycles and cancellation/retry do not retain two maps.
- Common cached venue query target below100ms after readiness; uncached queries
  remain responsive/cancellable with honest elapsed time and budget outcomes.
- Real full-route geometry remains independently safe; no source omission to
  satisfy memory, no invented geometry to satisfy routing.

Current evidence: original full source pub→coffee correctly finds3118.969343m but
takes124.6seconds and holds110066point/220844segment cache entries. All72segments
passed independent GEOS. The objective is to make this usable without changing
what is safe. The full source is not supplied to CC; public bounded real samples,
schemas and measured counts are supplied, and parent runs the full acceptance.

Tests should operate in memory where possible. The exact output and test command
allowlists will be frozen in handoff.json before launch; do not improvise shell
discovery, install dependencies, fetch files, use git or access outside staged
inputs. A standalone artifact needs a complete legal handoff report.

Additional full-source measurement: pub-to-lab cellSize2/maxNodes250000 exhausts
the budget after380.8s/250001expandednodes, reason=limit. The accepted navigator
already permits configurable cellSize. Offline precomputation may try a coarser
existing grid to reduce work, but every resulting segment must retain radius0.4
safety and exact endpoints; fall back to finer grids where narrow corridors need
them, without claiming budget exhaustion proves disconnection. Do not alter
classification/predicate tolerances or silently omit lab.

## Execution boundary

This is the only business attempt for this new logical capability. Do not change source geometry, tolerances, classification, anchors or the frozen economic behavior. Old failed corrections remain historical and are not reset. Complete the report BEFORE the final turn; reserve at least five turns for exact commands and report. Bash only the exact commands listed in handoff.json; use Read for inspection, never ad-hoc grep/wc/python-c or command suffixes. Tests may use temporary test directories and loopback HTTP servers only within their controlled test harness, cleaning them afterward. No installs, network fetches, git, agents, credentials or unrelated files. Errors must be reported honestly. Parent independently runs the full map; do not invent city-wide results.

Full source sourceSHA256=3a18d70c3dd6e77e10af71b71ab54ca0fb59b74e8287d2c358933475dcf199f5; 514313066 JSON bytes,145703 features,22977546 coordinate pairs. Source contains2693 GEOS-invalid objects, intentionally retained unchanged: structural validation is not geometry repair. Parent full pub-to-lab cellSize4 also returns unreachable after304 nodes on that coarse lattice; this does not prove actual road disconnection. Preserve truthful missing routes. All43 NAV and43 renderer intentions must remain.

Allowed sample artifact generation writes tools/geo/runtime/sample-out/manifest.json,metadata-00000.json.gz,coords-00000.bin.gz only; this fixture fits one1MiB coordinate/metadata chunk. Unit tests create their own bounded temporary outputs and clean up. Full parent packing may produce arbitrary numbered chunks using the same format. Node tests must include actual loopback HTTP raw-gzip and Content-Encoding response paths, abort/dispose, strict corrupted metadata and coordinate count cases, exact number roundtrip, async equivalence and cache bounds. Python tests should load pack-runtime.py with importlib, as its hyphen prevents a normal import. Extend existing navigation/renderer through shared logic, not copied alternative implementations. README is writable in tools/geo/runtime.

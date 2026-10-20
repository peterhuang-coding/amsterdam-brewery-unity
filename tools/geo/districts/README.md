# F29-MAP / MAP01 — offline shape-first district compiler

`build_districts.py` is an **offline maker**. It reads a local BGT-style
extract and a map config and emits a deterministic, bounded bundle of
simplified overview/local map shapes plus independently compiled navigation
masks. It does not talk to a game, a browser, or the network, contains no
route cache, and is not part of the running game/navigation core.

Map data: **Kadaster / PDOK BGT, CC0-1.0**. All visual shapes are simplified
and illustrative — they are **not** collision or navigation authority.
Navigation is compiled independently from raw road and actual bridge-deck
surfaces. Venue names/locations in configs are fictional game locations
(except anchors explicitly marked `fictionalVenue: false`).

## Commands

Run from the repository root (Python 3 with `shapely` 2 and `numpy` only;
no extra dependencies):

```
python -m unittest discover -s tools/geo/districts -p test_districts.py -v
python tools/geo/districts/build_districts.py \
  --source tools/geo/districts/real-pub-sample.json \
  --config tools/geo/districts/sample-config.json \
  --out tools/geo/districts/sample-out
python -m py_compile tools/geo/districts/build_districts.py
```

The full parent source uses the same schema as `real-pub-sample.json`. The
worker fixture is deliberately incomplete (237 KB); the full source (~145,703
features / 22.98 M points / 514 MB) is run by the parent. A successful sample
build is evidence only for the sample — never a claim of full-city
acceptance.

## Source schema (offline JSON, not GeoJSON)

```
{
  "schemaVersion": 1,
  "width": <metres>, "height": <metres>,
  "bbox": [minLon, minLat, maxLon, maxLat],
  "projection": {"type": "...", "units": "metres", ...},
  "source": {"provider", "license", "snapshot", "complete": bool},
  "layers": {
    "water":     [ {"id", "properties", "bounds"?, "polygons": [[ring, hole, ...], ...]} ],
    "buildings": [ ... ],
    "roads":     [ ... ],
    "bridges":   [ ... ]
  }
}
```

Each ring is `[[x, y], ...]` in projected **world metres**, closed. Road
exclusion keys live in `properties.functie`; bridge kind in
`properties.type_overbruggingsdeel`; level in
`properties.relatieve_hoogteligging`.

Config: `schemaVersion 1`, `mapVersion`, `cellSize` (0 < s <= 10),
`bodyRadius` (0 <= r < cellSize; production value 0.4), `overviewTolerance`
(4), `localTolerance` (0.5), `anchors` (finite x/y + `featureId`),
`districts` (validated id, name, metre bounds that tile the cell grid
exactly, non-empty `anchorIds`), and optional `travelLinks`.

## Outputs

All JSON is utf-8, `sort_keys=true`, compact separators, no trailing newline
and no timestamps. Gzip sizes use `compresslevel=9, mtime=0` for measurement;
hashes are sha-256 over the exact final file bytes. URLs are relative.

- `manifest.json` — `schemaVersion 1`, `mapVersion`, `projection`,
  `source{provider,license,snapshot,bbox,complete,inputSha256}`,
  `overview{url,sha256,bytes,gzipBytes}`,
  `districts[{id,name,bounds,url,sha256,bytes,gzipBytes,anchorIds}]`,
  `travelLinks`, attribution. Written **last**, only on success.
- `overview.json` — `bounds [0,0,width,height]`, `shapes` in fixed layer
  order (water, building, road, bridge) with `rings`, `markers[{id,x,y,
  districtId}]`, `travelLinks`. World metres, clipped to the bbox, simplified
  visually (Douglas–Peucker, coordinates rounded to 0.01 m). Decorative
  road/building shapes below the minimum area are dropped; water uses a
  conservative 10 m² threshold; bridges are always retained.
- `districts/<id>.json` — local shapes at 0.5 m visual tolerance and the
  fixed 80/80/10 m² area thresholds, plus `nav`:
  `{origin:[minx,miny], cellSize, cols, rows, walkRuns, bikeRuns}` with
  row-major flat index `y*cols + x` and sorted, non-overlapping RLE runs
  `[flatStart, length]` (runs may cross row boundaries). Every cell starts
  blocked; only runs are traversable. `anchors{<id>:{x,y,sourceX,sourceY,
  featureId}}`, `entrance` (first required anchor), attribution.
- `audit.json` — source/selected/output geometry counts, actual coordinate
  (vertex) counts, invalid polygons skipped for navigation and repaired for
  visuals (counted separately per layer), walk/bike cell and 4-neighbour
  component counts, per-anchor displacement/reason/component, raw+gzip sizes
  vs budgets, and the overview fallback ladder attempts. On any failure a
  diagnostic `audit.json` is still written and the process exits non-zero.

## Navigation semantics (compiled, never painted)

1. Source polygons are clipped to the district box. Invalid polygons are
   never repaired for navigation (counted as skipped); visuals may use a
   disclosed `make_valid` derivative.
2. Roads exclude `autosnelweg`, `autoweg`, `spoorbaan`, `OV-baan`,
   `baan voor vliegverkeer` (also with a `rijbaan ` prefix) and negative
   `relatieve_hoogteligging`. Bike additionally excludes `voetpad`,
   `voetpad op trap`, `voetgangergebied`, `voetgangersgebied`, `ruiterpad`
   (still walkable; later dismount is allowed).
3. **Raw water is subtracted from road surface.** A road polygon over a
   canal is not legal ground. Only `type_overbruggingsdeel = "dek"` bridge
   decks (non-negative height) are added back and may span water; piers
   (`pijler`, `landhoofd`, …) and stacked crossings are never inferred
   links. Buildings block the result.
4. A 1 m cell is marked safe only when its square expanded by `bodyRadius`
   (0.4 m) on **every** side is wholly covered by the allowed surface — no
   centre-only tests, no diagonal corner leakage. Tests use prepared/
   vectorized chunked coverage checks (bounded chunk size), never
   cell×feature or all-feature pair loops.
5. An anchor snaps at most 5 m, only to a safe cell centre whose straight
   segment from the original point has full 0.4 m covered clearance; the
   original and snapped positions are both reported. Otherwise the build
   fails with the exact anchor — it is never dragged across water.
6. All required anchors in a district must share one 4-neighbour walk
   component or the build fails; disconnected safe cells are retained and
   reported, never deleted to fake connectivity.

## Budgets, caps and the overview ladder

Hard deterministic failures (never silent swapping): grid cap
`cols*rows <= 4,000,000` per district; overview visual cap 3,000,000
coordinates; district cap 1,500,000. Budget targets: overview gzip
**<= 2 MiB**, district gzip **<= 8 MiB**.

If the 4 m / 80 m² overview exceeds the 2 MiB gzip budget, the compiler runs
an **overview-only** deterministic ladder, stopping at the first passing
step and recording every attempt (settings, shape/vertex/selected counts,
bytes, gzip, dropped shapes) in `audit.json`:

| step | road+building tolerance | road+building min area |
|------|-------------------------|------------------------|
| 1    | 4 m                     | 80 m²                  |
| 2    | 6 m                     | 120 m²                 |
| 3    | 8 m                     | 200 m²                 |
| 4    | 8 m                     | 300 m²                 |

Water always keeps 4 m / 10 m² and bridges are always retained; local
0.5 m visuals and 1 m navigation never change. If all four steps fail, the
build fails honestly — the cap is never raised and major water/bridges are
never silently discarded.

A rebuild removes any previous `manifest.json` before starting, so a failed
build can never leave an apparently successful manifest behind.

## Browser/runtime integration contract

Consumers load `manifest.json`, fetch the relative `overview.json` and,
on demand, `districts/<id>.json`; verify `sha256/bytes/gzipBytes`, and render
`shapes` purely as decoration (kind + rings in world metres). Local
collision/navigation uses only `nav`: allocate `cols*rows` booleans, fill
`walkRuns`/`bikeRuns` (RLE of flat indices), and treat everything else as
blocked. `origin`, `cellSize` and `entrance`/`anchors` are in the same
world-metre frame as the shapes. There are no per-vertex JS objects and no
precomputed routes in the bundle.

## Known limitations

- Visual outlines are simplified for recognition, not topological equality
  with BGT; do not derive collision from them.
- Water/road/deck rules are conservative: legal surface not modelled as a
  `dek` will not cross water (by design).
- The shipped `real-pub-sample.json` is a small public subset; full-source
  results (including the ladder choice and per-district connectivity) are
  produced and validated by the parent full run.

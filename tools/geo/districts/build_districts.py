#!/usr/bin/env python3
"""F29-MAP / MAP01 offline shape-first district compiler.

Reads an offline BGT-style source (schema documented in README/brief) and a
map config and emits a fixed deterministic bundle:

  <out>/manifest.json
  <out>/overview.json
  <out>/districts/<id>.json
  <out>/audit.json

Visual shapes are simplified and illustrative. Navigation masks are compiled
independently from raw road/bridge-deck surfaces with a conservative expanded
cell test. Nothing here talks to a game, a browser or the network.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import sys
from collections import deque

import numpy as np
import shapely
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiPolygon,
    Point,
    Polygon,
    polygon as shp_polygon,
)

SCHEMA_VERSION = 1

# Fixed, documented resource caps. Deterministic failure instead of swapping.
MAX_GRID_CELLS = 4_000_000            # cols*rows per district (2000x2000 at 1 m)
MAX_OVERVIEW_VERTICES = 3_000_000
MAX_DISTRICT_VERTICES = 1_500_000
CELL_CHUNK = 4096

OVERVIEW_GZIP_BUDGET = 2 * 1024 * 1024
DISTRICT_GZIP_BUDGET = 8 * 1024 * 1024

# Visual filtering (square metres after simplification). Local districts use
# the 0.5 m tolerance and these base minimum areas.
BUILDING_MIN_AREA = 80.0
ROAD_MIN_AREA = 80.0
WATER_MIN_AREA = 10.0
# Bridge decks always retain visually (they are the actual crossings).

# Approved deterministic overview-only fallback ladder. Water and bridges
# keep the configured overview tolerance (4 m) / conservative thresholds;
# only road+building detail is coarsened, in order, until the gzip cap
# passes. Stop at the first passing step; fail honestly if all steps fail.
OVERVIEW_LADDER = (
    # (road/building tolerance m, road/building minimum area m2)
    (4.0, 80.0),
    (6.0, 120.0),
    (8.0, 200.0),
    (8.0, 300.0),
)

MAX_ANCHOR_SNAP_M = 5.0

# BGT 'functie' classes that are never walk/bike surface.
ROAD_EXCLUDED_BASE = (
    "autosnelweg",
    "autoweg",
    "spoorbaan",
    "OV-baan",
    "baan voor vliegverkeer",
)
# Walking surface exists but cycling is forbidden.
BIKE_EXCLUDED_EXTRA = (
    "voetpad",
    "voetpad op trap",
    "voetgangergebied",
    "voetgangersgebied",
    "ruiterpad",
)

ATTRIBUTION = (
    "Map data: Kadaster / PDOK BGT, licensed CC0-1.0. Visual shapes are "
    "simplified and illustrative, not collision or navigation authority. "
    "Navigation is compiled independently from raw road and bridge-deck "
    "surfaces. Venues are fictional game locations except anchors explicitly "
    "marked fictionalVenue=false."
)

LAYERS = ("water", "buildings", "roads", "bridges")


class BuildError(Exception):
    """Any deterministic build failure (bad input, cap, anchor/connectivity)."""


# --------------------------------------------------------------------------- #
# Loading and validation
# --------------------------------------------------------------------------- #

def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _finite(v):
    return _is_num(v) and math.isfinite(float(v))


def read_json(path, what):
    try:
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError as exc:
        raise BuildError("cannot read %s %s: %s" % (what, path, exc))
    try:
        return json.loads(raw.decode("utf-8")), raw
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BuildError("malformed JSON in %s %s: %s" % (what, path, exc))


def _scan_polygons(polygons, where):
    """Validate feature.polygons = [polygon[rings[[x, y], ...]]].

    Returns the numerical envelope (minx, miny, maxx, maxy).
    """
    if not isinstance(polygons, list) or not polygons:
        raise BuildError("%s: polygons must be a non-empty list" % where)
    minx = miny = float("inf")
    maxx = maxy = float("-inf")
    for pi, poly in enumerate(polygons):
        if not isinstance(poly, list) or not poly:
            raise BuildError("%s: polygon %d must list rings" % (where, pi))
        for ri, ring in enumerate(poly):
            if not isinstance(ring, list) or len(ring) < 3:
                raise BuildError(
                    "%s: polygon %d ring %d needs >=3 points" % (where, pi, ri)
                )
            for pt in ring:
                if (
                    not isinstance(pt, list)
                    or len(pt) != 2
                    or not _finite(pt[0])
                    or not _finite(pt[1])
                ):
                    raise BuildError(
                        "%s: non-finite or malformed coordinate" % where
                    )
                x, y = float(pt[0]), float(pt[1])
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    return [minx, miny, maxx, maxy]


def load_source(path):
    data, raw = read_json(path, "source")
    if not isinstance(data, dict) or data.get("schemaVersion") != SCHEMA_VERSION:
        raise BuildError("source: schemaVersion must be 1")
    for key in ("width", "height"):
        if not _finite(data.get(key)) or float(data[key]) <= 0:
            raise BuildError("source: %s must be a positive finite number" % key)
    proj = data.get("projection")
    if not isinstance(proj, dict) or proj.get("units") != "metres":
        raise BuildError("source: projection.units must be 'metres'")
    src = data.get("source")
    if not isinstance(src, dict):
        raise BuildError("source: missing provenance block")
    for key in ("provider", "license", "snapshot"):
        if not isinstance(src.get(key), str):
            raise BuildError("source: source.%s must be a string" % key)
    if not isinstance(src.get("complete"), bool):
        raise BuildError("source: source.complete must be boolean")
    bbox = data.get("bbox")
    if (
        not isinstance(bbox, list)
        or len(bbox) != 4
        or not all(_finite(v) for v in bbox)
        or not (bbox[0] < bbox[2] and bbox[1] < bbox[3])
    ):
        raise BuildError("source: bbox must be [minlon,minlat,maxlon,maxlat]")
    layers = data.get("layers")
    if not isinstance(layers, dict):
        raise BuildError("source: layers must be an object")
    counts = {}
    for layer in LAYERS:
        feats = layers.get(layer)
        if feats is None:
            feats = []
        if not isinstance(feats, list):
            raise BuildError("source: layers.%s must be a list" % layer)
        for fi, feat in enumerate(feats):
            where = "source %s[%d]" % (layer, fi)
            if not isinstance(feat, dict) or not isinstance(feat.get("id"), str):
                raise BuildError("%s: feature needs string id" % where)
            if not isinstance(feat.get("properties"), dict):
                raise BuildError("%s: feature needs properties object" % where)
            env = _scan_polygons(feat.get("polygons"), where)
            declared = feat.get("bounds")
            if declared is not None:
                if (
                    not isinstance(declared, list)
                    or len(declared) != 4
                    or not all(_finite(v) for v in declared)
                ):
                    raise BuildError("%s: invalid bounds" % where)
            else:
                feat["bounds"] = env
        counts[layer] = len(feats)
        layers[layer] = feats
    data["_layerCounts"] = counts
    data["_inputSha256"] = hashlib.sha256(raw).hexdigest()
    data["_inputBytes"] = len(raw)
    return data


def load_config(path):
    cfg, _ = read_json(path, "config")
    if not isinstance(cfg, dict) or cfg.get("schemaVersion") != SCHEMA_VERSION:
        raise BuildError("config: schemaVersion must be 1")
    if not isinstance(cfg.get("mapVersion"), str) or not cfg["mapVersion"]:
        raise BuildError("config: mapVersion must be a non-empty string")
    cs = cfg.get("cellSize")
    if not _finite(cs) or not (0.0 < float(cs) <= 10.0):
        raise BuildError("config: cellSize must be within (0, 10] metres")
    cfg["cellSize"] = float(cs)
    br = cfg.get("bodyRadius")
    if not _finite(br) or not (0.0 <= float(br) < cfg["cellSize"]):
        raise BuildError("config: bodyRadius must be 0 <= r < cellSize")
    cfg["bodyRadius"] = float(br)
    for key in ("overviewTolerance", "localTolerance"):
        v = cfg.get(key)
        if not _finite(v) or float(v) < 0:
            raise BuildError("config: %s must be a finite >= 0 number" % key)
        cfg[key] = float(v)
    anchors = cfg.get("anchors")
    if not isinstance(anchors, dict) or not anchors:
        raise BuildError("config: anchors must be a non-empty object")
    for aid, a in anchors.items():
        if (
            not isinstance(a, dict)
            or not _finite(a.get("x"))
            or not _finite(a.get("y"))
            or not isinstance(a.get("featureId"), str)
        ):
            raise BuildError("config: anchor %s needs finite x,y and featureId" % aid)
        a["x"] = float(a["x"])
        a["y"] = float(a["y"])
    districts = cfg.get("districts")
    if not isinstance(districts, list) or not districts:
        raise BuildError("config: districts must be a non-empty list")
    seen = set()
    for d in districts:
        if not isinstance(d, dict):
            raise BuildError("config: district entries must be objects")
        did = d.get("id")
        if (
            not isinstance(did, str)
            or not did
            or not all(c.isalnum() or c in "-_" for c in did)
            or not did[0].isalnum()
        ):
            raise BuildError("config: district id must match [A-Za-z0-9][A-Za-z0-9_-]*")
        if did in seen:
            raise BuildError("config: duplicate district id %s" % did)
        seen.add(did)
        if not isinstance(d.get("name"), str) or not d["name"]:
            raise BuildError("config: district %s needs a name" % did)
        b = d.get("bounds")
        if (
            not isinstance(b, list)
            or len(b) != 4
            or not all(_finite(v) for v in b)
            or not (b[0] < b[2] and b[1] < b[3])
        ):
            raise BuildError("config: district %s has invalid bounds" % did)
        d["bounds"] = [float(v) for v in b]
        ids = d.get("anchorIds")
        if not isinstance(ids, list) or not ids:
            raise BuildError("config: district %s needs anchorIds" % did)
        for aid in ids:
            if aid not in anchors:
                raise BuildError(
                    "config: district %s references unknown anchor %s" % (did, aid)
                )
        if len(set(ids)) != len(ids):
            raise BuildError("config: district %s lists an anchor twice" % did)
    links = cfg.get("travelLinks", [])
    if not isinstance(links, list):
        raise BuildError("config: travelLinks must be a list")
    for link in links:
        if (
            not isinstance(link, dict)
            or link.get("from") not in seen
            or link.get("to") not in seen
            or not isinstance(link.get("mode"), str)
            or not link["mode"]
        ):
            raise BuildError("config: each travelLink needs known from/to and mode")
    return cfg


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #

def iter_dim2(geom):
    """Yield Polygon/MultiPolygon surfaces from a possibly-collection result."""
    if geom.is_empty:
        return
    if isinstance(geom, Polygon):
        if not geom.is_empty:
            yield geom
    elif isinstance(geom, MultiPolygon):
        for part in geom.geoms:
            if isinstance(part, Polygon) and not part.is_empty:
                yield part
    elif isinstance(geom, GeometryCollection):
        for part in geom.geoms:
            yield from iter_dim2(part)
    # Lines/points carry no area: silently dropped.


def raw_polygons(feature):
    """Build shapely polygons; yields (polygon, is_valid)."""
    for spec in feature["polygons"]:
        shell = spec[0]
        holes = spec[1:]
        try:
            poly = Polygon(shell, holes)
        except Exception as exc:  # shapely rarely raises; treat as invalid
            raise ValueError(str(exc))
        yield poly


def bbox_intersects(b, box):
    return not (b[2] <= box[0] or b[0] >= box[2] or b[3] <= box[1] or b[1] >= box[3])


def clip_surfaces(poly, box):
    """Clip one raw polygon to box; return area polygons (may be empty)."""
    clipped = shapely.clip_by_rect(poly, box[0], box[1], box[2], box[3])
    return list(iter_dim2(clipped))


def road_class_excluded_walk(functie):
    f = (functie or "").strip() if isinstance(functie, str) else ""
    if f in ROAD_EXCLUDED_BASE:
        return True
    if f.startswith("rijbaan "):
        return f[len("rijbaan "):] in ROAD_EXCLUDED_BASE
    return False


def road_class_bike_blocked(functie):
    f = (functie or "").strip() if isinstance(functie, str) else ""
    return f in BIKE_EXCLUDED_EXTRA


def is_bridge_deck(feature):
    return feature.get("properties", {}).get("type_overbruggingsdeel") == "dek"


def is_negative_height(feature):
    h = feature.get("properties", {}).get("relatieve_hoogteligging")
    return _is_num(h) and float(h) < 0


def union_of(geoms):
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return Polygon()
    if len(geoms) == 1:
        return geoms[0]
    return shapely.union_all(geoms)


# --------------------------------------------------------------------------- #
# Navigation
# --------------------------------------------------------------------------- #

def collect_nav_surfaces(source, box):
    """Clip/filter raw source to legal walk and bike surface for one district.

    Raw water is subtracted from road surface first (a road polygon painted
    over a canal is not legal ground); only actual legal bridge decks are
    added back on top of water; buildings block afterwards. Non-deck bridge
    parts (pijler/landhoofd) are never surface. Negative-height roads are
    ignored. Invalid polygons are skipped for navigation and counted.
    """
    layers = source["layers"]
    walk_roads, bike_roads, decks, buildings, waters = [], [], [], [], []
    stats = {
        "excludedClass": 0,
        "bikeOnlyWalking": 0,
        "negativeHeight": 0,
        "invalidPolygons": {"roads": 0, "bridges": 0, "buildings": 0,
                            "water": 0},
        "surfacePolygons": 0,
        "buildingPolygons": 0,
    }

    for feat in layers["water"]:
        if not bbox_intersects(feat["bounds"], box):
            continue
        for poly in raw_polygons(feat):
            if not poly.is_valid:
                stats["invalidPolygons"]["water"] += 1
                continue  # invalid water is skipped for nav, never repaired
            for part in clip_surfaces(poly, box):
                waters.append(part)

    for feat in layers["roads"]:
        if not bbox_intersects(feat["bounds"], box):
            continue
        props = feat["properties"]
        if is_negative_height(feat):
            stats["negativeHeight"] += 1
            continue
        functie = props.get("functie")
        excluded_walk = road_class_excluded_walk(functie)
        bike_blocked = road_class_bike_blocked(functie)
        if excluded_walk:
            stats["excludedClass"] += 1
            continue
        if bike_blocked:
            stats["bikeOnlyWalking"] += 1
        for poly in raw_polygons(feat):
            if not poly.is_valid:
                stats["invalidPolygons"]["roads"] += 1
                continue  # invalid source is skipped for nav, never repaired
            for part in clip_surfaces(poly, box):
                walk_roads.append(part)
                if not bike_blocked:
                    bike_roads.append(part)
                stats["surfacePolygons"] += 1

    for feat in layers["bridges"]:
        if not bbox_intersects(feat["bounds"], box):
            continue
        if not is_bridge_deck(feat):
            # Pier, pijler, landhoofd etc. are structure, not traversable deck.
            continue
        if is_negative_height(feat):
            stats["negativeHeight"] += 1
            continue
        for poly in raw_polygons(feat):
            if not poly.is_valid:
                stats["invalidPolygons"]["bridges"] += 1
                continue
            for part in clip_surfaces(poly, box):
                # Decks are collected separately: they are restored AFTER
                # raw water is subtracted from roads, never removed by it.
                decks.append(part)
                stats["surfacePolygons"] += 1

    for feat in layers["buildings"]:
        if not bbox_intersects(feat["bounds"], box):
            continue
        for poly in raw_polygons(feat):
            if not poly.is_valid:
                stats["invalidPolygons"]["buildings"] += 1
                continue
            for part in clip_surfaces(poly, box):
                buildings.append(part)
                stats["buildingPolygons"] += 1

    building_union = union_of(buildings)
    water_union = union_of(waters)
    walk = union_of(walk_roads)
    bike = union_of(bike_roads)
    # Roads never overwrite raw water: subtract water from painted roads, then
    # add only actual legal deck surface back (decks legitimately span water),
    # then let buildings block. No water is ever inferred as a crossing.
    if not water_union.is_empty:
        walk = walk.difference(water_union)
        bike = bike.difference(water_union)
    walk = union_of([walk, union_of(decks)])
    bike = union_of([bike, union_of(decks)])
    if not building_union.is_empty:
        walk = walk.difference(building_union)
        bike = bike.difference(building_union)
    return walk, bike, stats


def conservative_grid(surface, origin, cell_size, cols, rows, radius):
    """Boolean flat mask; cell safe only if its rect expanded by radius on
    EVERY side is wholly covered by the allowed surface."""
    total = cols * rows
    if total > MAX_GRID_CELLS:
        raise BuildError(
            "district grid %dx%d exceeds cap of %d cells; raise cellSize"
            % (cols, rows, MAX_GRID_CELLS)
        )
    mask = np.zeros(total, dtype=bool)
    if surface.is_empty:
        return mask
    minx, miny, maxx, maxy = surface.bounds
    xs = origin[0] + (np.arange(cols, dtype=np.float64) + 0.5) * cell_size
    ys = origin[1] + (np.arange(rows, dtype=np.float64) + 0.5) * cell_size
    gx, gy = np.meshgrid(xs, ys)
    cx = gx.reshape(-1)
    cy = gy.reshape(-1)
    half = cell_size / 2.0
    x0 = cx - half
    y0 = cy - half
    x1 = cx + half
    y1 = cy + half
    # Cheap envelope pre-filter before exact coverage tests.
    cand = np.where(
        (x1 > minx) & (x0 < maxx) & (y1 > miny) & (y0 < maxy)
    )[0]
    for start in range(0, len(cand), CELL_CHUNK):
        idx = cand[start:start + CELL_CHUNK]
        boxes = shapely.box(
            x0[idx] - radius,
            y0[idx] - radius,
            x1[idx] + radius,
            y1[idx] + radius,
        )
        covered = shapely.covered_by(boxes, surface)
        mask[idx[np.asarray(covered, dtype=bool)]] = True
    return mask


def encode_runs(mask):
    """Sorted, non-overlapping RLE [flatStart, length]; runs may span rows."""
    idx = np.flatnonzero(mask)
    runs = []
    if idx.size:
        start = int(idx[0])
        prev = start
        for v in idx[1:]:
            v = int(v)
            if v == prev + 1:
                prev = v
                continue
            runs.append([start, prev - start + 1])
            start = prev = v
        runs.append([start, prev - start + 1])
    return runs


def label_components(mask, cols, rows):
    """4-neighbour labelling over a flat mask. Returns (labels, componentCount)."""
    labels = np.full(cols * rows, -1, dtype=np.int64)
    comp = 0
    seeds = np.flatnonzero(mask)
    for seed in seeds.tolist():
        if labels[seed] != -1:
            continue
        labels[seed] = comp
        queue = deque([seed])
        while queue:
            cur = queue.popleft()
            col = cur % cols
            nbrs = (cur - cols, cur + cols)
            if col > 0:
                nbrs += (cur - 1,)
            if col < cols - 1:
                nbrs += (cur + 1,)
            for nb in nbrs:
                if 0 <= nb < mask.size and mask[nb] and labels[nb] == -1:
                    labels[nb] = comp
                    queue.append(nb)
        comp += 1
    return labels, comp


def snap_anchor(anchor_id, anchor, surface, mask, origin, cell_size, cols, rows,
                radius):
    """Snap to the nearest safe cell centre within MAX_ANCHOR_SNAP_M, provided
    the straight corridor from the original point has `radius` clearance on
    the legal surface. Returns dict or raises BuildError with exact reason."""
    ax, ay = anchor["x"], anchor["y"]
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        raise BuildError("anchor %s: no safe cells in district" % anchor_id)
    cx = origin[0] + (idx % cols + 0.5) * cell_size
    cy = origin[1] + (idx // cols + 0.5) * cell_size
    dist = np.hypot(cx - ax, cy - ay)
    order = np.argsort(dist, kind="stable")
    failures = []
    for k in order:
        d = float(dist[k])
        if d > MAX_ANCHOR_SNAP_M + 1e-9:
            break
        nxi, nyi = float(cx[k]), float(cy[k])
        if d == 0.0:
            corridor = Point(nxi, nyi).buffer(radius)
        else:
            corridor = LineString([(ax, ay), (nxi, nyi)]).buffer(radius)
        if shapely.covers(surface, corridor):
            flat = int(idx[k])
            return {
                "id": anchor_id,
                "sourceX": ax,
                "sourceY": ay,
                "x": nxi,
                "y": nyi,
                "featureId": anchor["featureId"],
                "displacement": round(d, 4),
                "walkComponent": None,
                "reason": (
                    "snapped %.3fm to nearest safe cell centre; direct "
                    "corridor with %.1fm clearance is covered" % (d, radius)
                    if d > 0 else
                    "already on a safe cell centre; %.1fm clearance covered"
                    % radius
                ),
                "_flat": flat,
            }
        failures.append(round(d, 3))
    raise BuildError(
        "anchor %s: no safe cell centre within %.0fm with a covered %.1fm "
        "clearance corridor from (%.3f, %.3f); anchor not moved"
        % (anchor_id, MAX_ANCHOR_SNAP_M, radius, ax, ay)
    )


# --------------------------------------------------------------------------- #
# Visual shapes
# --------------------------------------------------------------------------- #

def _rings_from_geom(geom, tol, min_area):
    """Simplify, orient, round and emit rings; return (rings, vertices)."""
    out = []
    verts = 0
    for part in iter_dim2(geom):
        if tol > 0:
            part = part.simplify(tol, preserve_topology=True)
        for p in iter_dim2(part):
            if p.is_empty or p.area < min_area:
                continue
            p = shp_polygon.orient(p, 1.0)  # exterior CCW, holes CW
            rings = []
            for ring in (p.exterior, *p.interiors):
                coords = list(ring.coords)
                if len(coords) < 4:  # closed ring needs 4 positions
                    continue
                pts = [[round(x, 2), round(y, 2)] for x, y in coords[:-1]]
                if len(pts) < 3:
                    continue
                if pts[0] != pts[-1]:
                    pts.append([pts[0][0], pts[0][1]])
                if len(pts) < 4:
                    continue
                rings.append(pts)
                verts += len(pts)
            if rings:
                out.append(rings)
    return out, verts


def visual_shapes(source, box, tol_by_layer, min_area_by_layer,
                  audit_counts, vertex_cap):
    """Fixed layer order water, buildings, roads, bridges; input feature order.

    Invalid polygons are only used after make_valid, and that is counted.
    Every emitted coordinate position in every ring is counted exactly once
    and the cap is enforced against that actual coordinate count."""
    shapes = []
    total_verts = 0
    kind_for_layer = {
        "water": "water",
        "buildings": "building",
        "roads": "road",
        "bridges": "bridge",
    }
    selected = {layer: 0 for layer in LAYERS}
    for layer in LAYERS:
        threshold = min_area_by_layer[layer]
        tol = tol_by_layer[layer]
        for feat in source["layers"][layer]:
            if not bbox_intersects(feat["bounds"], box):
                continue
            contributed = False
            for poly in raw_polygons(feat):
                if not poly.is_valid:
                    audit_counts[layer] += 1
                    repaired = shapely.make_valid(poly)
                else:
                    repaired = poly
                for part in clip_surfaces(repaired, box):
                    rings, verts = _rings_from_geom(part, tol, threshold)
                    if not rings:
                        continue
                    if total_verts + verts > vertex_cap:
                        raise BuildError(
                            "visual vertex cap %d exceeded (actual coordinate "
                            "count %d + %d); raise tolerance or narrow bounds"
                            % (vertex_cap, total_verts, verts)
                        )
                    for ring_set in rings:
                        shapes.append({"kind": kind_for_layer[layer],
                                       "rings": ring_set})
                        total_verts += sum(len(r) for r in ring_set)
                        contributed = True
            if contributed:
                selected[layer] += 1
    return shapes, selected, total_verts


# --------------------------------------------------------------------------- #
# Serialisation
# --------------------------------------------------------------------------- #

def encode_json(obj):
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def gzip_size(data):
    return len(gzip.compress(data, compresslevel=9, mtime=0))


def write_bytes(path, data):
    with open(path, "wb") as fh:
        fh.write(data)


# --------------------------------------------------------------------------- #
# Build orchestration
# --------------------------------------------------------------------------- #

def build(source_path, config_path, out_dir):
    source = load_source(source_path)
    cfg = load_config(config_path)
    cs = cfg["cellSize"]
    radius = cfg["bodyRadius"]
    width, height = float(source["width"]), float(source["height"])

    os.makedirs(os.path.join(out_dir, "districts"), exist_ok=True)
    # A failed rebuild must not leave the previous successful manifest in
    # place (only this owned output file is touched).
    manifest_path = os.path.join(out_dir, "manifest.json")
    if os.path.exists(manifest_path):
        os.remove(manifest_path)

    audit = {
        "schemaVersion": SCHEMA_VERSION,
        "mapVersion": cfg["mapVersion"],
        "attribution": ATTRIBUTION,
        "determinism": {
            "json": "utf-8, sort_keys=true, compact separators, no trailing "
                    "newline; stable layer/feature order",
            "gzip": "gzip compresslevel=9 with mtime=0 for measured sizes only",
            "hash": "sha256 over the exact final file bytes",
            "visualCoordinates": "rounded to 0.01 m after Douglas-Peucker "
                                 "simplification; nav uses raw coordinates",
            "noTimestamps": True,
        },
        "source": {
            "provider": source["source"]["provider"],
            "license": source["source"]["license"],
            "snapshot": source["source"]["snapshot"],
            "bbox": source["bbox"],
            "complete": source["source"]["complete"],
            "inputSha256": source["_inputSha256"],
            "inputBytes": source["_inputBytes"],
        },
        "counts": {
            "sourceFeatures": source["_layerCounts"],
            "invalidNavPolygonsSkipped": {"roads": 0, "bridges": 0,
                                          "buildings": 0, "water": 0},
            "invalidVisualMakeValid": {layer: 0 for layer in LAYERS},
            "navExcludedFeatures": {"excludedClass": 0, "negativeHeight": 0,
                                    "bikeOnlyWalking": 0},
        },
        "overview": {},
        "districts": [],
        "budgets": {
            "overviewGzipLimit": OVERVIEW_GZIP_BUDGET,
            "districtGzipLimit": DISTRICT_GZIP_BUDGET,
            "maxGridCells": MAX_GRID_CELLS,
        },
        "errors": [],
    }

    errors = []
    try:
        # ---- overview ---------------------------------------------------- #
        world_box = [0.0, 0.0, width, height]

        district_of_anchor = {}
        for d in cfg["districts"]:
            for aid in d["anchorIds"]:
                district_of_anchor.setdefault(aid, d["id"])
        markers = []
        for aid in sorted(cfg["anchors"]):
            if aid not in district_of_anchor:
                errors.append("anchor %s not referenced by any district" % aid)
                continue
            a = cfg["anchors"][aid]
            markers.append({
                "id": aid,
                "x": a["x"],
                "y": a["y"],
                "districtId": district_of_anchor[aid],
            })

        # Deterministic overview-only fallback ladder. Water keeps the
        # configured 4 m tolerance / 10 m2 threshold and bridges are always
        # retained; road/building detail is coarsened step by step.
        attempts = []
        ov_shapes = ov_selected = None
        ov_verts = 0
        ov_bytes = b""
        ov_gz = 0
        chosen_step = None
        chosen_settings = None
        for step, (rb_tol, rb_min_area) in enumerate(OVERVIEW_LADDER, start=1):
            tol_map = {
                "water": cfg["overviewTolerance"],
                "buildings": rb_tol,
                "roads": rb_tol,
                "bridges": cfg["overviewTolerance"],
            }
            area_map = {
                "water": WATER_MIN_AREA,
                "buildings": rb_min_area,
                "roads": rb_min_area,
                "bridges": 0.0,
            }
            call_counts = {layer: 0 for layer in LAYERS}
            shapes, selected, verts = visual_shapes(
                source, world_box, tol_map, area_map, call_counts,
                MAX_OVERVIEW_VERTICES,
            )
            overview = {
                "schemaVersion": SCHEMA_VERSION,
                "mapVersion": cfg["mapVersion"],
                "bounds": [0, 0, round(width, 3), round(height, 3)],
                "shapes": shapes,
                "markers": markers,
                "travelLinks": cfg["travelLinks"],
                "attribution": ATTRIBUTION,
            }
            data = encode_json(overview)
            gz = gzip_size(data)
            attempts.append({
                "step": step,
                "roadBuildingTolerance": rb_tol,
                "roadBuildingMinArea": rb_min_area,
                "waterTolerance": cfg["overviewTolerance"],
                "waterMinArea": WATER_MIN_AREA,
                "selectedFeatures": selected,
                "shapeCount": len(shapes),
                "vertexCount": verts,
                "bytes": len(data),
                "gzipBytes": gz,
                "withinBudget": gz <= OVERVIEW_GZIP_BUDGET,
            })
            if gz <= OVERVIEW_GZIP_BUDGET:
                ov_shapes, ov_selected, ov_verts = shapes, selected, verts
                ov_bytes, ov_gz = data, gz
                chosen_step = step
                chosen_settings = {
                    "roadBuildingTolerance": rb_tol,
                    "roadBuildingMinArea": rb_min_area,
                    "waterTolerance": cfg["overviewTolerance"],
                    "waterMinArea": WATER_MIN_AREA,
                }
                for layer in LAYERS:
                    audit["counts"]["invalidVisualMakeValid"][layer] += \
                        call_counts[layer]
                break

        base_shapes = attempts[0]["shapeCount"] if attempts else 0
        for att in attempts:
            att["droppedShapesSinceFirst"] = base_shapes - att["shapeCount"]

        if chosen_step is None:
            last = attempts[-1]
            audit["overview"] = {
                "selectedFeatures": last["selectedFeatures"],
                "shapeCount": last["shapeCount"],
                "vertexCount": last["vertexCount"],
                "bytes": last["bytes"],
                "gzipBytes": last["gzipBytes"],
                "withinBudget": False,
                "fallback": {
                    "budget": OVERVIEW_GZIP_BUDGET,
                    "chosenStep": None,
                    "chosen": None,
                    "attempts": attempts,
                },
            }
            raise BuildError(
                "overview gzip budget ladder exhausted after %d attempts; "
                "smallest %d B still exceeds budget %d B"
                % (len(attempts),
                   min(a["gzipBytes"] for a in attempts),
                   OVERVIEW_GZIP_BUDGET)
            )

        write_bytes(os.path.join(out_dir, "overview.json"), ov_bytes)
        audit["overview"] = {
            "selectedFeatures": ov_selected,
            "shapeCount": len(ov_shapes),
            "vertexCount": ov_verts,
            "bytes": len(ov_bytes),
            "gzipBytes": ov_gz,
            "withinBudget": True,
            "fallback": {
                "budget": OVERVIEW_GZIP_BUDGET,
                "chosenStep": chosen_step,
                "chosen": chosen_settings,
                "attempts": attempts,
            },
        }

        # ---- districts --------------------------------------------------- #
        district_entries = []
        local_tol_map = {layer: cfg["localTolerance"] for layer in LAYERS}
        local_area_map = {
            "water": WATER_MIN_AREA,
            "buildings": BUILDING_MIN_AREA,
            "roads": ROAD_MIN_AREA,
            "bridges": 0.0,
        }
        for d in cfg["districts"]:
            did = d["id"]
            box = d["bounds"]
            d_audit = {
                "id": did,
                "bounds": box,
                "selectedFeatures": {},
                "walkCells": 0,
                "bikeCells": 0,
                "walkComponents": 0,
                "bikeComponents": 0,
                "disconnectedWalkCells": 0,
                "requiredAnchorConnected": False,
                "anchors": [],
                "bytes": 0,
                "gzipBytes": 0,
                "withinBudget": False,
                "nav": {},
            }
            w = box[2] - box[0]
            h = box[3] - box[1]
            cols = int(round(w / cs))
            rows = int(round(h / cs))
            if abs(cols * cs - w) > 1e-7 * max(1.0, w) or \
               abs(rows * cs - h) > 1e-7 * max(1.0, h):
                raise BuildError(
                    "district %s: bounds size %.6fx%.6f is not an integer "
                    "number of %.3fm cells" % (did, w, h, cs)
                )

            walk_surf, bike_surf, nav_stats = collect_nav_surfaces(source, box)
            for k in ("excludedClass", "negativeHeight", "bikeOnlyWalking"):
                audit["counts"]["navExcludedFeatures"][k] += nav_stats[k]
            for layer, n in nav_stats["invalidPolygons"].items():
                audit["counts"]["invalidNavPolygonsSkipped"][layer] += n
            d_audit["nav"] = {
                "surfacePolygons": nav_stats["surfacePolygons"],
                "buildingPolygons": nav_stats["buildingPolygons"],
                "cols": cols,
                "rows": rows,
            }

            walk_mask = conservative_grid(walk_surf, [box[0], box[1]], cs,
                                          cols, rows, radius)
            bike_mask = conservative_grid(bike_surf, [box[0], box[1]], cs,
                                          cols, rows, radius)
            walk_labels, walk_comp = label_components(walk_mask, cols, rows)
            bike_labels, bike_comp = label_components(bike_mask, cols, rows)
            d_audit["walkCells"] = int(walk_mask.sum())
            d_audit["bikeCells"] = int(bike_mask.sum())
            d_audit["walkComponents"] = walk_comp
            d_audit["bikeComponents"] = bike_comp

            anchors_out = {}
            anchor_components = []
            for aid in d["anchorIds"]:
                a = cfg["anchors"][aid]
                try:
                    snapped = snap_anchor(
                        aid, a, walk_surf, walk_mask,
                        [box[0], box[1]], cs, cols, rows, radius,
                    )
                except BuildError as exc:
                    errors.append(str(exc))
                    d_audit["anchors"].append({
                        "id": aid,
                        "sourceX": a["x"],
                        "sourceY": a["y"],
                        "featureId": a["featureId"],
                        "displacement": None,
                        "reason": str(exc),
                        "walkComponent": None,
                    })
                    continue
                flat = snapped.pop("_flat")
                comp_id = int(walk_labels[flat])
                snapped["walkComponent"] = comp_id
                anchor_components.append(comp_id)
                d_audit["anchors"].append(snapped)
                anchors_out[aid] = {
                    "x": snapped["x"],
                    "y": snapped["y"],
                    "sourceX": snapped["sourceX"],
                    "sourceY": snapped["sourceY"],
                    "featureId": snapped["featureId"],
                }

            connected = len(anchor_components) == len(d["anchorIds"]) and (
                len(set(anchor_components)) == 1
            )
            d_audit["requiredAnchorConnected"] = connected
            if not connected:
                errors.append(
                    "district %s: required anchors %s do not share one "
                    "4-neighbour walk component; no path fabricated"
                    % (did, ",".join(d["anchorIds"]))
                )
            if walk_comp > 1:
                comp_sizes = [0] * walk_comp
                for c in walk_labels[walk_mask].tolist():
                    comp_sizes[c] += 1
                comp_sizes.sort(reverse=True)
                d_audit["disconnectedWalkCells"] = sum(comp_sizes[1:])
                d_audit["walkComponentSizes"] = comp_sizes

            local_call_counts = {layer: 0 for layer in LAYERS}
            shapes, selected, verts = visual_shapes(
                source, box, local_tol_map, local_area_map,
                local_call_counts, MAX_DISTRICT_VERTICES,
            )
            for layer in LAYERS:
                audit["counts"]["invalidVisualMakeValid"][layer] += \
                    local_call_counts[layer]
            d_audit["selectedFeatures"] = selected
            d_audit["shapeCount"] = len(shapes)
            d_audit["vertexCount"] = verts

            entrance = None
            if d["anchorIds"][0] in anchors_out:
                p = anchors_out[d["anchorIds"][0]]
                entrance = {"x": p["x"], "y": p["y"]}

            district_obj = {
                "schemaVersion": SCHEMA_VERSION,
                "mapVersion": cfg["mapVersion"],
                "id": did,
                "name": d["name"],
                "bounds": box,
                "shapes": shapes,
                "nav": {
                    "origin": [box[0], box[1]],
                    "cellSize": cs,
                    "cols": cols,
                    "rows": rows,
                    "walkRuns": encode_runs(walk_mask),
                    "bikeRuns": encode_runs(bike_mask),
                },
                "anchors": anchors_out,
                "entrance": entrance,
                "attribution": ATTRIBUTION,
            }
            d_bytes = encode_json(district_obj)
            d_gz = gzip_size(d_bytes)
            write_bytes(os.path.join(out_dir, "districts", did + ".json"),
                       d_bytes)
            d_audit["bytes"] = len(d_bytes)
            d_audit["gzipBytes"] = d_gz
            d_audit["withinBudget"] = d_gz <= DISTRICT_GZIP_BUDGET
            if d_gz > DISTRICT_GZIP_BUDGET:
                errors.append(
                    "district %s gzip %d exceeds budget %d"
                    % (did, d_gz, DISTRICT_GZIP_BUDGET)
                )
            district_entries.append({
                "id": did,
                "name": d["name"],
                "bounds": box,
                "url": "districts/%s.json" % did,
                "sha256": None,
                "bytes": len(d_bytes),
                "gzipBytes": d_gz,
                "anchorIds": d["anchorIds"],
                "_data": d_bytes,
            })
            audit["districts"].append(d_audit)

        audit["errors"] = errors
        if errors:
            raise BuildError("; ".join(errors))

        # ---- manifest after hashing final bytes -------------------------- #
        manifest_districts = []
        for entry in district_entries:
            data = entry.pop("_data")
            manifest_districts.append({
                "id": entry["id"],
                "name": entry["name"],
                "bounds": entry["bounds"],
                "url": entry["url"],
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": entry["bytes"],
                "gzipBytes": entry["gzipBytes"],
                "anchorIds": entry["anchorIds"],
            })
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "mapVersion": cfg["mapVersion"],
            "projection": source["projection"],
            "source": {
                "provider": source["source"]["provider"],
                "license": source["source"]["license"],
                "snapshot": source["source"]["snapshot"],
                "bbox": source["bbox"],
                "complete": source["source"]["complete"],
                "inputSha256": source["_inputSha256"],
            },
            "overview": {
                "url": "overview.json",
                "sha256": hashlib.sha256(ov_bytes).hexdigest(),
                "bytes": len(ov_bytes),
                "gzipBytes": ov_gz,
            },
            "districts": manifest_districts,
            "travelLinks": cfg["travelLinks"],
            "attribution": ATTRIBUTION,
        }
        write_bytes(os.path.join(out_dir, "manifest.json"),
                    encode_json(manifest))
    except BuildError as exc:
        # Always leave a diagnostic audit behind on failure; never leave a
        # stale manifest (it was removed before any work began).
        if not audit.get("errors"):
            audit["errors"] = [str(exc)]
        else:
            audit["errors"] = list(audit["errors"])
        write_bytes(os.path.join(out_dir, "audit.json"), encode_json(audit))
        raise
    write_bytes(os.path.join(out_dir, "audit.json"), encode_json(audit))
    return audit


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Offline shape-first overview/district compiler")
    parser.add_argument("--source", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        build(args.source, args.config, args.out)
    except BuildError as exc:
        print("build_districts: ERROR: %s" % exc, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

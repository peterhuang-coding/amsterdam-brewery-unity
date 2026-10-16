#!/usr/bin/env python3
"""D26 PACK01: measured, conservative geometry simplification packer.

Reads the frozen v1 real-geography document (see geo-interface.md), simplifies
each *valid* feature's polygon rings independently with Shapely/GEOS
``simplify(..., preserve_topology=True)`` and writes:

  * deterministic compact sorted-key JSON,
  * deterministic gzip (mtime 0, no original filename),
  * an audit report with real measurements only.

Safety rules (see brief.md):
  * feature identity, properties, polygon/hole counts and order are preserved;
  * invalid original geometry is kept byte-for-byte (never silently repaired);
  * any simplification that changes polygon/hole cardinality, validity,
    dimension or whose measured Hausdorff distance exceeds
    ``tolerance + 1e-8`` metres causes the whole feature to fall back
    unchanged;
  * tolerance 0 produces geometrically identical output;
  * non-finite / malformed input structure is rejected with the feature id;
  * coordinates are never re-rounded (input is already 3-decimal metres and
    Douglas-Peucker only selects existing vertices).

This module exposes :func:`pack_document` for tests; the CLI is used by the
authorized build command.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
import resource
import sys
import time
from datetime import datetime, timezone
from typing import Any

from shapely.errors import ShapelyError
from shapely.geometry import MultiPolygon, Polygon
from shapely.strtree import STRtree

SCHEMA_VERSION = 1
LAYER_NAMES = ("water", "buildings", "roads", "bridges")
DEFAULT_TOLERANCE = 0.05
MAX_TOLERANCE = 0.25
HAUSDORFF_EPS = 1e-8
GZIP_COMPRESSLEVEL = 9

# Frozen v1 schema constants (see geo-interface.md).
SUPPORTED_PROJECTION_TYPE = "local-equirectangular"
SUPPORTED_UNITS = "metres"
REQUIRED_SOURCE_FIELDS = (
    "provider",
    "url",
    "license",
    "snapshot",
    "complete",
    "inputs",
)

# Shared boundary seams shorter than this (metres) are treated as incidental
# point contacts rather than seams. Source coordinates carry millimetre
# precision, so 1 micrometre keeps every real shared edge without locking
# isolated crossing/touch points.
SEAM_MIN_LENGTH_M = 1e-6

# Appended to source.limitations (kept stable so repacking does not duplicate).
TOL_LIMITATION_PREFIX = "Derivative asset: Shapely/GEOS Douglas-Peucker"
SEAM_LIMITATION_MARK = "Shared seam vertices are locked"
CONTINUITY_LIMITATION_MARK = "inter-feature network continuity"


class PackError(Exception):
    """Base class for expected packer failures."""


class InputFormatError(PackError):
    """Malformed or non-finite input structure."""


class ToleranceError(PackError):
    """Requested simplification tolerance is outside the allowed range."""


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
def validate_tolerance(tolerance: Any) -> float:
    """Return a usable tolerance float or raise :class:`ToleranceError`.

    Allowed: 0 (geometrically unchanged) up to 0.25 metres inclusive.
    Booleans, non-numbers, NaN/inf and negatives are rejected.
    """
    if isinstance(tolerance, bool) or not isinstance(tolerance, (int, float)):
        raise ToleranceError(
            f"tolerance must be a number, got {type(tolerance).__name__}"
        )
    tolerance = float(tolerance)
    if not math.isfinite(tolerance):
        raise ToleranceError("tolerance must be finite")
    if tolerance < 0.0:
        raise ToleranceError(f"tolerance must be >= 0, got {tolerance}")
    if tolerance > MAX_TOLERANCE:
        raise ToleranceError(
            f"tolerance must be <= {MAX_TOLERANCE} metres, got {tolerance}"
        )
    return tolerance


def _is_real_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _feature_context(layer: str, index: int, feature: Any) -> str:
    fid = feature.get("id") if isinstance(feature, dict) else None
    fid_text = f" id={fid!r}" if fid is not None else " without id"
    return f"layer={layer!r} feature_index={index}{fid_text}"


def validate_structure(doc: Any) -> None:
    """Reject malformed/non-finite documents, naming the offending feature."""
    if not isinstance(doc, dict):
        raise InputFormatError("top-level document must be an object")
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise InputFormatError(
            f"only schemaVersion {SCHEMA_VERSION} is supported, got "
            f"{doc.get('schemaVersion')!r}"
        )
    for key in ("bbox", "projection", "width", "height", "source", "layers"):
        if key not in doc:
            raise InputFormatError(f"top-level document missing {key!r}")
    bbox = doc["bbox"]
    if not (
        isinstance(bbox, list)
        and len(bbox) == 4
        and all(_is_real_number(v) for v in bbox)
    ):
        raise InputFormatError("bbox must be four finite numbers")
    west, south, east, north = (float(v) for v in bbox)
    if not (west <= east and south <= north):
        raise InputFormatError(
            "bbox must be ordered [west, south, east, north] with "
            "west <= east and south <= north"
        )
    projection = doc["projection"]
    if not isinstance(projection, dict):
        raise InputFormatError("projection must be an object")
    if projection.get("type") != SUPPORTED_PROJECTION_TYPE:
        raise InputFormatError(
            "projection.type must be "
            f"{SUPPORTED_PROJECTION_TYPE!r}, got {projection.get('type')!r}"
        )
    if projection.get("units") != SUPPORTED_UNITS:
        raise InputFormatError(
            f"projection.units must be {SUPPORTED_UNITS!r}, "
            f"got {projection.get('units')!r}"
        )
    for key in ("originLon", "originLat", "referenceLat"):
        if not _is_real_number(projection.get(key)):
            raise InputFormatError(
                f"projection.{key} must be a finite number"
            )
    if not _is_real_number(projection.get("radiusMeters")):
        raise InputFormatError("projection.radiusMeters must be a finite number")
    if float(projection["radiusMeters"]) <= 0.0:
        raise InputFormatError("projection.radiusMeters must be positive")
    if not _is_real_number(doc["width"]) or not _is_real_number(doc["height"]):
        raise InputFormatError("width/height must be finite numbers")
    if float(doc["width"]) <= 0.0 or float(doc["height"]) <= 0.0:
        raise InputFormatError("width/height must be positive")

    source = doc["source"]
    if not isinstance(source, dict):
        raise InputFormatError("source must be an object")
    for key in REQUIRED_SOURCE_FIELDS:
        if key not in source:
            raise InputFormatError(f"source.{key} is required")
    for key in ("provider", "url", "license", "snapshot"):
        if not isinstance(source[key], str) or not source[key]:
            raise InputFormatError(f"source.{key} must be a non-empty string")
    if not isinstance(source["complete"], bool):
        raise InputFormatError(
            "source.complete must be a boolean, got "
            f"{type(source['complete']).__name__}"
        )
    if not isinstance(source["inputs"], list):
        raise InputFormatError("source.inputs must be an array")
    for i_index, entry in enumerate(source["inputs"]):
        if not isinstance(entry, dict):
            raise InputFormatError(
                f"source.inputs[{i_index}] must be an object"
            )
        for key in ("file", "sha256", "collection"):
            if not isinstance(entry.get(key), str) or not entry[key]:
                raise InputFormatError(
                    f"source.inputs[{i_index}].{key} must be a non-empty string"
                )
    if "limitations" in source and not (
        isinstance(source["limitations"], list)
        and all(isinstance(item, str) for item in source["limitations"])
    ):
        raise InputFormatError("source.limitations must be an array of strings")

    layers = doc["layers"]
    if not isinstance(layers, dict):
        raise InputFormatError("layers must be an object")
    for name in LAYER_NAMES:
        if name not in layers:
            raise InputFormatError(f"layers missing required layer {name!r}")
        if not isinstance(layers[name], list):
            raise InputFormatError(f"layer {name!r} must be an array")

    for name in LAYER_NAMES:
        for index, feature in enumerate(layers[name]):
            ctx = _feature_context(name, index, feature)
            if not isinstance(feature, dict):
                raise InputFormatError(f"{ctx}: feature must be an object")
            if not isinstance(feature.get("id"), str) or not feature["id"]:
                raise InputFormatError(f"{ctx}: feature id must be a string")
            if not isinstance(feature.get("sourceId"), str) or not feature[
                "sourceId"
            ]:
                raise InputFormatError(
                    f"{ctx}: sourceId must be a non-empty string"
                )
            if "localId" not in feature or not (
                feature["localId"] is None
                or (
                    isinstance(feature["localId"], str)
                    and feature["localId"]
                )
            ):
                raise InputFormatError(
                    f"{ctx}: localId must be a string or null"
                )
            if "properties" not in feature or not isinstance(
                feature["properties"], dict
            ):
                raise InputFormatError(f"{ctx}: properties must be an object")
            polygons = feature.get("polygons")
            if not isinstance(polygons, list) or not polygons:
                raise InputFormatError(
                    f"{ctx}: polygons must be a non-empty array"
                )
            bounds = feature.get("bounds")
            if not (
                isinstance(bounds, list)
                and len(bounds) == 4
                and all(_is_real_number(v) for v in bounds)
            ):
                raise InputFormatError(
                    f"{ctx}: bounds must be four finite numbers "
                    "[minX, minY, maxX, maxY]"
                )
            if not (
                float(bounds[0]) <= float(bounds[2])
                and float(bounds[1]) <= float(bounds[3])
            ):
                raise InputFormatError(
                    f"{ctx}: bounds must be ordered min <= max"
                )
            for p_index, polygon in enumerate(polygons):
                if not isinstance(polygon, list) or not polygon:
                    raise InputFormatError(
                        f"{ctx} polygon_index={p_index}: polygon must be a "
                        "non-empty array of rings"
                    )
                for r_index, ring in enumerate(polygon):
                    role = "outer" if r_index == 0 else f"hole[{r_index - 1}]"
                    if not isinstance(ring, list) or len(ring) < 4:
                        raise InputFormatError(
                            f"{ctx} polygon_index={p_index} ring={role}: "
                            "closed ring needs at least 4 coordinate tuples"
                        )
                    if ring[0] != ring[-1]:
                        raise InputFormatError(
                            f"{ctx} polygon_index={p_index} ring={role}: "
                            "ring is not closed (first != last coordinate)"
                        )
                    distinct = set()
                    for c_index, coord in enumerate(ring):
                        if not isinstance(coord, (list, tuple)) or len(coord) != 2:
                            raise InputFormatError(
                                f"{ctx} polygon_index={p_index} ring={role} "
                                f"coord_index={c_index}: coordinate must be "
                                "[x, y]"
                            )
                        x, y = coord
                        if not _is_real_number(x) or not _is_real_number(y):
                            raise InputFormatError(
                                f"{ctx} polygon_index={p_index} ring={role} "
                                f"coord_index={c_index}: coordinates must be "
                                "finite real numbers"
                            )
                        distinct.add((float(x), float(y)))
                    if len(distinct) < 3:
                        raise InputFormatError(
                            f"{ctx} polygon_index={p_index} ring={role}: "
                            "closed ring needs at least 3 distinct finite "
                            "vertices"
                        )


# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #
def _count_rings_and_vertices(polygons: list) -> tuple:
    rings = 0
    vertices = 0
    for polygon in polygons:
        rings += len(polygon)
        for ring in polygon:
            vertices += len(ring)
    return rings, vertices


def _bounds(polygons: list) -> list:
    min_x = math.inf
    min_y = math.inf
    max_x = -math.inf
    max_y = -math.inf
    for polygon in polygons:
        for ring in polygon:
            for x, y in ring:
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
    return [min_x, min_y, max_x, max_y]


def _copy_polygons(polygons: list) -> list:
    """Deep copy of the plain coordinate structure."""
    return [
        [[[float(x), float(y)] for x, y in ring] for ring in polygon]
        for polygon in polygons
    ]


def _ring_from_shapely(linear_ring) -> list:
    coords = list(linear_ring.coords)
    ring = [[float(x), float(y)] for x, y in coords]
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise InputFormatError("simplifier returned an unclosed ring")
    if not all(math.isfinite(x) and math.isfinite(y) for x, y in ring):
        raise InputFormatError("simplifier returned non-finite coordinates")
    return ring


def _signed_area2(open_ring: list) -> float:
    area = 0.0
    for (x1, y1), (x2, y2) in zip(open_ring, open_ring[1:] + open_ring[:1]):
        area += x1 * y2 - x2 * y1
    return area


def _restore_ring_orientation(original_ring: list, result_ring: list) -> list:
    """Match winding and start vertex of ``original_ring``.

    Shapely orients shells/holes and GEOS may rotate the ring start during
    simplification. Geometry is unchanged, but the frozen document preserves
    ring order, so undo both transforms. Result vertices are a subset of the
    original vertices (Douglas-Peucker selects existing points only).
    """
    original_open = [[float(x), float(y)] for x, y in original_ring[:-1]]
    result_open = [[float(x), float(y)] for x, y in result_ring[:-1]]

    area_o = _signed_area2(original_open)
    area_r = _signed_area2(result_open)
    if area_o != 0.0 and area_r != 0.0 and (area_o > 0) != (area_r > 0):
        result_open.reverse()

    surviving = {tuple(point) for point in result_open}
    start_point = next(
        (tuple(point) for point in original_open if tuple(point) in surviving),
        None,
    )
    if start_point is not None:
        for index, point in enumerate(result_open):
            if tuple(point) == start_point:
                result_open = result_open[index:] + result_open[:index]
                break
    result_open.append([result_open[0][0], result_open[0][1]])
    return result_open


def _build_shapely_polygons(polygons: list) -> list:
    """Build Shapely polygons WITHOUT repairing anything.

    Invalid self-intersecting input is constructed as-is (``is_valid``
    stays false) so the caller can fall back unchanged instead of silently
    fixing it.
    """
    built = []
    for polygon in polygons:
        shell = [(float(x), float(y)) for x, y in polygon[0]]
        holes = [
            [(float(x), float(y)) for x, y in ring]
            for ring in polygon[1:]
        ]
        built.append(Polygon(shell, holes))
    return built


def _cyclic_index_map(positions: dict, wanted: list, n: int):
    """Map ``wanted`` coordinate tuples to forward cyclic indices.

    GEOS may rotate the ring start and reverse winding; try both directions
    and every duplicate occurrence of the first coordinate. Returns
    ``(indices, reversed_order)`` or ``None`` if the result is not a cyclic
    subsequence of the original ring.
    """
    if not wanted:
        return None
    for reversed_order in (False, True):
        sequence = list(reversed(wanted)) if reversed_order else wanted
        starts = positions.get(sequence[0])
        if not starts:
            continue
        for start in starts:
            indices = [start]
            current = start
            ok = True
            for point in sequence[1:]:
                options = positions.get(point)
                if not options:
                    ok = False
                    break
                next_index = None
                best_forward = None
                for option in options:
                    forward = (option - current) % n
                    if 0 < forward and (
                        best_forward is None or forward < best_forward
                    ):
                        best_forward = forward
                        next_index = option
                if next_index is None:
                    ok = False
                    break
                indices.append(next_index)
                current = next_index
            if ok and len(set(indices)) == len(indices):
                return indices, reversed_order
    return None


def _merge_locked_ring(original_ring: list, simplified_ring: list,
                       locked_indices: set):
    """Re-add shared-seam vertices to a GEOS-simplified ring.

    All output vertices remain original coordinates: the result is the GEOS
    Douglas-Peucker selection plus every locked seam vertex, replayed in the
    original cyclic order with original winding/start restored. Adding points
    that lie on the original boundary can only reduce the Hausdorff error.
    Returns ``None`` when the GEOS result is not a cyclic subsequence.
    """
    original_open = [
        (float(x), float(y)) for x, y in original_ring[:-1]
    ]
    simplified_open = [
        (float(x), float(y)) for x, y in simplified_ring[:-1]
    ]
    n = len(original_open)
    positions: dict = {}
    for i, point in enumerate(original_open):
        positions.setdefault(point, []).append(i)
    mapping = _cyclic_index_map(positions, simplified_open, n)
    if mapping is None:
        return None
    mapped_indices, reversed_order = mapping
    keep = set(mapped_indices) | set(locked_indices)
    ordered = sorted(keep)
    coords = [list(original_open[i]) for i in ordered]
    if reversed_order:
        coords.reverse()
    coords.append([coords[0][0], coords[0][1]])
    return _restore_ring_orientation(original_ring, coords)


def _lineal_parts(geom) -> list:
    """Return the LineString/MultiLineString parts of an intersection."""
    kind = geom.geom_type
    if kind == "LineString":
        return [] if geom.is_empty else [geom]
    if kind == "MultiLineString":
        return [part for part in geom.geoms if not part.is_empty]
    if kind == "GeometryCollection":
        parts = []
        for part in geom.geoms:
            if part.geom_type in ("LineString", "MultiLineString"):
                if part.geom_type == "LineString":
                    if not part.is_empty:
                        parts.append(part)
                else:
                    parts.extend(p for p in part.geoms if not p.is_empty)
        return parts
    return []


def _point_on_segment(point: tuple, start: tuple, end: tuple,
                      tolerance: float = 1e-7) -> bool:
    """Exact-near collinearity + box containment in projected metres.

    The tolerance is far below millimetre source precision (and orders below
    the observed ~4 mm gaps), so genuinely gapped borders never lock; it only
    absorbs float rounding for points genuinely on a shared edge.
    """
    px, py = point
    ax, ay = start
    bx, by = end
    cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
    if abs(cross) > tolerance:
        return False
    return (
        min(ax, bx) - tolerance <= px <= max(ax, bx) + tolerance
        and min(ay, by) - tolerance <= py <= max(ay, by) + tolerance
    )


def _feature_multipolygon(polygons: list):
    built = _build_shapely_polygons(polygons)
    return built[0] if len(built) == 1 else MultiPolygon(built)


def _empty_lock_map(polygons: list) -> list:
    return [[set() for _ in polygon] for polygon in polygons]


def _build_shared_boundary_locks(doc: dict) -> tuple:
    """Find shared boundary seams and lock their vertices on both sides.

    Uses a Shapely STRtree (R-tree) so the neighbour search is not O(N^2).
    A seam is an exact (distance-zero), lineal intersection of two polygon
    boundaries, i.e. a genuinely shared border in the source. Near-but-gapped
    borders are never buffered together and overlapping polygons on different
    layers/heights only lock where their boundaries actually coincide.

    Returns ``(locks, force_safe, counts)``. ``locks[key]`` is a per-ring set
    of open-ring vertex indices that must survive simplification. Keys whose
    seam safety cannot be computed are added to ``force_safe`` and must be
    kept unchanged.
    """
    keys: list = []
    geoms: list = []
    built_store: list = []
    locks: dict = {}
    force_safe: set = set()

    for layer_name in LAYER_NAMES:
        for index, feature in enumerate(doc["layers"][layer_name]):
            key = (layer_name, index)
            keys.append(key)
            locks[key] = _empty_lock_map(feature["polygons"])
            try:
                built = _build_shapely_polygons(feature["polygons"])
                geom = built[0] if len(built) == 1 else MultiPolygon(built)
            except (ShapelyError, ValueError, TypeError):
                geoms.append(None)
                built_store.append(None)
                force_safe.add(key)
            else:
                geoms.append(geom)
                built_store.append(built)

    live = [i for i, geom in enumerate(geoms) if geom is not None]
    tree_geoms = [geoms[i] for i in live]
    tree = STRtree(tree_geoms) if tree_geoms else None
    pair_count = 0

    def apply_seam(global_a: int, global_b: int, parts: list) -> None:
        nonlocal pair_count
        seam_coords = set()
        for part in parts:
            seam_coords.update(
                (float(x), float(y)) for x, y in part.coords
            )
        for global_index in (global_a, global_b):
            key = keys[global_index]
            feature = doc["layers"][key[0]][key[1]]
            lock_map = locks[key]
            for p_index, polygon in enumerate(feature["polygons"]):
                for r_index, ring in enumerate(polygon):
                    ring_locks = lock_map[p_index][r_index]
                    open_ring = [
                        (float(x), float(y)) for x, y in ring[:-1]
                    ]
                    ring_points = set(open_ring)
                    for v_index, point in enumerate(open_ring):
                        if point in seam_coords:
                            ring_locks.add(v_index)
                    # T-junction: a neighbour's seam vertex can fall in the
                    # interior of this ring's edge. Locking the edge endpoints
                    # keeps the whole edge (and therefore the seam path)
                    # without inventing, buffering or moving anything.
                    loose = seam_coords - ring_points
                    if loose:
                        edge_count = len(open_ring)
                        for point in loose:
                            for e_index, start in enumerate(open_ring):
                                end = open_ring[(e_index + 1) % edge_count]
                                if _point_on_segment(point, start, end):
                                    ring_locks.add(e_index)
                                    ring_locks.add(
                                        (e_index + 1) % edge_count
                                    )
        pair_count += 1

    def seam_between(geom_a, geom_b):
        intersection = geom_a.boundary.intersection(geom_b.boundary)
        parts = _lineal_parts(intersection)
        if not parts:
            return None
        if sum(part.length for part in parts) < SEAM_MIN_LENGTH_M:
            return None
        return parts

    if tree is not None:
        for t_index in range(len(tree_geoms)):
            global_a = live[t_index]
            try:
                candidates = [
                    int(j)
                    for j in tree.query(
                        tree_geoms[t_index], predicate="intersects"
                    )
                ]
            except (ShapelyError, ValueError, TypeError):
                # Predicate failure on invalid source: keep the feature
                # unchanged rather than risking an unsearched seam.
                force_safe.add(keys[global_a])
                continue
            for t_other in candidates:
                global_b = live[t_other]
                if global_b <= global_a:
                    continue
                try:
                    parts = seam_between(
                        tree_geoms[t_index], tree_geoms[t_other]
                    )
                except (ShapelyError, ValueError, TypeError):
                    # Conservative: when seam safety is unprovable, both
                    # neighbours stay unchanged.
                    force_safe.add(keys[global_a])
                    force_safe.add(keys[global_b])
                    continue
                if parts:
                    apply_seam(global_a, global_b, parts)

    # Polygon components inside one MultiPolygon feature can share seams too.
    for global_index, key in enumerate(keys):
        built = built_store[global_index]
        if built is None or len(built) < 2:
            continue
        for a in range(len(built)):
            for b in range(a + 1, len(built)):
                try:
                    parts = seam_between(built[a], built[b])
                except (ShapelyError, ValueError, TypeError):
                    force_safe.add(key)
                    continue
                if parts:
                    apply_seam(global_index, global_index, parts)

    locked_vertices = 0
    for lock_map in locks.values():
        for polygon_locks in lock_map:
            for ring_locks in polygon_locks:
                locked_vertices += len(ring_locks)
    counts = {
        "pairs": pair_count,
        "locked_vertices": locked_vertices,
        "force_safe_features": len(force_safe),
    }
    return locks, force_safe, counts


def _fallback_copy(polygons: list, reason: str) -> tuple:
    return _copy_polygons(polygons), "fallback", 0.0, reason


def _simplify_feature(polygons: list, tolerance: float,
                      lock_map=None) -> tuple:
    """Simplify one feature while preserving locked shared seams.

    Returns ``(new_polygons, status, max_hausdorff_m, reason)`` where status is
    one of ``unchanged``, ``simplified`` or ``fallback`` and reason names the
    fallback cause (``None`` otherwise). On fallback the returned polygons are
    an exact copy of the originals.
    """
    original_rings, original_vertices = _count_rings_and_vertices(polygons)

    if tolerance == 0.0:
        return _copy_polygons(polygons), "unchanged", 0.0, None

    try:
        shapely_polygons = _build_shapely_polygons(polygons)
    except (ShapelyError, ValueError, TypeError):
        return _fallback_copy(polygons, "invalid_original")
    for geom in shapely_polygons:
        if geom.is_empty or not geom.is_valid:
            return _fallback_copy(polygons, "invalid_original")

    new_polygons: list = []
    feature_max_distance = 0.0
    for p_index, original in enumerate(shapely_polygons):
        try:
            simplified = original.simplify(tolerance, preserve_topology=True)
        except (ShapelyError, ValueError):
            return _fallback_copy(polygons, "simplifier_error")

        if simplified.geom_type != "Polygon":
            return _fallback_copy(polygons, "polygon_cardinality_changed")
        if simplified.is_empty or not simplified.is_valid:
            return _fallback_copy(polygons, "invalid_output")
        if bool(getattr(simplified, "has_z", False)):
            return _fallback_copy(polygons, "dimension_changed")
        if len(simplified.interiors) != len(original.interiors):
            return _fallback_copy(polygons, "hole_cardinality_changed")
        try:
            distance = original.hausdorff_distance(simplified)
        except (ShapelyError, ValueError):
            return _fallback_copy(polygons, "hausdorff_error")
        if not math.isfinite(distance) or distance > tolerance + HAUSDORFF_EPS:
            return _fallback_copy(polygons, "hausdorff_exceeded")

        try:
            raw_rings = [_ring_from_shapely(simplified.exterior)]
            for interior in simplified.interiors:
                raw_rings.append(_ring_from_shapely(interior))
        except InputFormatError:
            return _fallback_copy(polygons, "invalid_simplifier_ring")

        original_polygon = polygons[p_index]
        polygon_locks = lock_map[p_index] if lock_map is not None else None
        rings = []
        for r_index, (before, after) in enumerate(
            zip(original_polygon, raw_rings)
        ):
            locked = (
                polygon_locks[r_index] if polygon_locks is not None else set()
            )
            merged = _merge_locked_ring(before, after, locked)
            if merged is None:
                return _fallback_copy(polygons, "lock_mapping_failed")
            locked_coords = {
                (float(x), float(y))
                for i, (x, y) in enumerate(before[:-1])
                if i in locked
            }
            surviving = {(float(x), float(y)) for x, y in merged[:-1]}
            if not locked_coords.issubset(surviving):
                return _fallback_copy(polygons, "seam_lock_failed")
            rings.append(merged)

        try:
            candidate_shell = [(float(x), float(y)) for x, y in rings[0]]
            candidate_holes = [
                [(float(x), float(y)) for x, y in ring]
                for ring in rings[1:]
            ]
            candidate = Polygon(candidate_shell, candidate_holes)
        except (ShapelyError, ValueError):
            return _fallback_copy(polygons, "locked_result_invalid")
        if candidate.geom_type != "Polygon" or candidate.is_empty:
            return _fallback_copy(polygons, "locked_result_invalid")
        if not candidate.is_valid:
            return _fallback_copy(polygons, "locked_result_invalid")
        if bool(getattr(candidate, "has_z", False)):
            return _fallback_copy(polygons, "dimension_changed")
        if len(candidate.interiors) != len(original.interiors):
            return _fallback_copy(polygons, "hole_cardinality_changed")
        try:
            locked_distance = original.hausdorff_distance(candidate)
        except (ShapelyError, ValueError):
            return _fallback_copy(polygons, "hausdorff_error")
        if (
            not math.isfinite(locked_distance)
            or locked_distance > tolerance + HAUSDORFF_EPS
        ):
            return _fallback_copy(polygons, "hausdorff_exceeded")

        new_polygons.append(rings)
        feature_max_distance = max(feature_max_distance, float(locked_distance))

    new_rings, new_vertices = _count_rings_and_vertices(new_polygons)
    if new_rings != original_rings:
        return _fallback_copy(polygons, "ring_cardinality_changed")
    if new_vertices > original_vertices:
        # Douglas-Peucker plus seam locking only selects original vertices.
        return _fallback_copy(polygons, "unexpected_vertex_growth")

    status = "simplified" if new_vertices < original_vertices else "unchanged"
    return new_polygons, status, feature_max_distance, None


def _empty_layer_stats() -> dict:
    return {
        "input": {"features": 0, "polygons": 0, "rings": 0, "vertices": 0},
        "output": {"features": 0, "polygons": 0, "rings": 0, "vertices": 0},
        "features_simplified": 0,
        "features_unchanged": 0,
        "features_fallback": 0,
        "fallback_reasons": {},
        "features_valid_original": 0,
        "features_invalid_original": 0,
        "removed_vertices": 0,
        "max_hausdorff_m": 0.0,
    }


def _limitations(source: dict, tolerance: float) -> list:
    limitations = list(source.get("limitations") or [])
    if not any(
        isinstance(item, str) and item.startswith(TOL_LIMITATION_PREFIX)
        for item in limitations
    ):
        limitations.append(
            "Derivative asset: Shapely/GEOS Douglas-Peucker simplification "
            "with preserve_topology=True at tolerance "
            f"{tolerance} metres (0 means geometrically unchanged); "
            "coordinates stay in projected metres and are not re-rounded."
        )
    if not any(
        isinstance(item, str) and SEAM_LIMITATION_MARK in item
        for item in limitations
    ):
        limitations.append(
            "Shared seam vertices are locked across neighbouring polygons "
            "(including holes and multi-polygon components) so original "
            "shared borders are retained exactly without buffering, "
            "enlargement or new connection lines; when seam safety cannot "
            "be proved the feature stays unchanged."
        )
    if not any(
        isinstance(item, str) and CONTINUITY_LIMITATION_MARK in item
        for item in limitations
    ):
        limitations.append(
            "Shared-boundary locking does not establish inter-feature "
            "network continuity; parents must independently test routes."
        )
    return limitations


def pack_document(doc: Any, tolerance: float = DEFAULT_TOLERANCE) -> tuple:
    """Validate and pack a document.

    Returns ``(output_document, measurements)``. Raises
    :class:`InputFormatError` or :class:`ToleranceError` on bad input.
    """
    tolerance = validate_tolerance(tolerance)
    validate_structure(doc)

    measurements: dict = {
        "tolerance_m": tolerance,
        "preserve_topology": True,
        "hausdorff_guard_m": tolerance + HAUSDORFF_EPS,
        "layers": {name: _empty_layer_stats() for name in LAYER_NAMES},
    }

    # Coordinated shared-boundary locking. At tolerance 0 nothing moves, so
    # the index is skipped. The STRtree keeps neighbour discovery well under
    # O(N^2) for the 145,703-feature parent source.
    if tolerance > 0.0:
        lock_maps, force_safe, seam_counts = _build_shared_boundary_locks(doc)
    else:
        lock_maps = {
            (name, index): _empty_lock_map(feature["polygons"])
            for name in LAYER_NAMES
            for index, feature in enumerate(doc["layers"][name])
        }
        force_safe = set()
        seam_counts = {"pairs": 0, "locked_vertices": 0,
                       "force_safe_features": 0}
    measurements["shared_boundaries"] = dict(seam_counts)
    measurements["shared_boundaries"]["min_seam_length_m"] = SEAM_MIN_LENGTH_M

    out_layers: dict = {}
    for layer_name in LAYER_NAMES:
        stats = measurements["layers"][layer_name]
        out_features = []
        for feature_index, feature in enumerate(doc["layers"][layer_name]):
            polygons = feature["polygons"]
            in_rings, in_vertices = _count_rings_and_vertices(polygons)
            in_polygons = len(polygons)
            key = (layer_name, feature_index)

            if key in force_safe:
                # Seam safety unprovable: conservative unchanged fallback.
                # Still label genuinely invalid source geometry honestly.
                reason = "shared_boundary_unverified"
                try:
                    guarded = _build_shapely_polygons(polygons)
                except (ShapelyError, ValueError, TypeError):
                    reason = "invalid_original"
                else:
                    if any(
                        geom.is_empty or not geom.is_valid for geom in guarded
                    ):
                        reason = "invalid_original"
                new_polygons, status, feature_distance, reason = (
                    _fallback_copy(polygons, reason)
                )
            else:
                new_polygons, status, feature_distance, reason = (
                    _simplify_feature(
                        polygons, tolerance, lock_maps.get(key)
                    )
                )
            out_rings, out_vertices = _count_rings_and_vertices(new_polygons)

            if status == "fallback":
                # Label why for the audit; the reason comes straight from the
                # guard that tripped (no second, possibly divergent pass).
                stats["features_fallback"] += 1
                stats["fallback_reasons"][reason] = (
                    stats["fallback_reasons"].get(reason, 0) + 1
                )
                stats["features_invalid_original"] += (
                    1 if reason == "invalid_original" else 0
                )
                stats["features_valid_original"] += (
                    0 if reason == "invalid_original" else 1
                )
            else:
                stats["features_valid_original"] += 1
                if status == "simplified":
                    stats["features_simplified"] += 1
                else:
                    stats["features_unchanged"] += 1

            stats["input"]["features"] += 1
            stats["input"]["polygons"] += in_polygons
            stats["input"]["rings"] += in_rings
            stats["input"]["vertices"] += in_vertices
            stats["output"]["features"] += 1
            stats["output"]["polygons"] += len(new_polygons)
            stats["output"]["rings"] += out_rings
            stats["output"]["vertices"] += out_vertices
            stats["removed_vertices"] += in_vertices - out_vertices
            stats["max_hausdorff_m"] = max(
                stats["max_hausdorff_m"], feature_distance
            )

            out_feature = dict(feature)
            out_feature["polygons"] = new_polygons
            out_feature["bounds"] = _bounds(new_polygons)
            out_features.append(out_feature)

        out_layers[layer_name] = out_features

    out_doc = dict(doc)
    out_source = dict(doc["source"])
    out_source["limitations"] = _limitations(doc["source"], tolerance)
    # complete is preserved honestly; it is never flipped by the packer.
    out_doc["source"] = out_source
    out_doc["layers"] = out_layers
    return out_doc, measurements


# --------------------------------------------------------------------------- #
# Serialization
# --------------------------------------------------------------------------- #
def encode_json(doc: dict) -> bytes:
    """Deterministic compact JSON: sorted keys, UTF-8, no whitespace."""
    return json.dumps(
        doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def gzip_deterministic(
    payload: bytes, compresslevel: int = GZIP_COMPRESSLEVEL
) -> bytes:
    """Deterministic gzip: fixed mtime 0, no filename, fixed compression."""
    buffer = io.BytesIO()
    with gzip.GzipFile(
        filename="",
        mode="wb",
        compresslevel=compresslevel,
        fileobj=buffer,
        mtime=0,
    ) as gz:
        gz.write(payload)
    return buffer.getvalue()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _totals(measurements: dict) -> dict:
    totals = _empty_layer_stats()
    for stats in measurements["layers"].values():
        for side in ("input", "output"):
            for key in ("features", "polygons", "rings", "vertices"):
                totals[side][key] += stats[side][key]
        for key in (
            "features_simplified",
            "features_unchanged",
            "features_fallback",
            "features_valid_original",
            "features_invalid_original",
            "removed_vertices",
        ):
            totals[key] += stats[key]
        for reason, count in stats["fallback_reasons"].items():
            totals["fallback_reasons"][reason] = (
                totals["fallback_reasons"].get(reason, 0) + count
            )
        totals["max_hausdorff_m"] = max(
            totals["max_hausdorff_m"], stats["max_hausdorff_m"]
        )
    return totals


def _peak_rss_bytes():
    try:
        raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except Exception:  # pragma: no cover - platform without resource
        return None, "resource.getrusage unavailable"
    if sys.platform == "darwin":
        return int(raw), "ru_maxrss reported in bytes on macOS"
    return int(raw) * 1024, "ru_maxrss reported in kilobytes, x1024"


def build_audit(
    *,
    options_tolerance,
    input_path,
    input_bytes,
    json_path,
    json_bytes,
    gzip_path,
    gzip_bytes,
    measurements,
    source,
    elapsed_seconds,
):
    gunzip_bytes = gzip.decompress(gzip_bytes)
    peak_rss, rss_note = _peak_rss_bytes()
    return {
        "tool": "pack_geo.py",
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z"),
        "options": {
            "tolerance_m": options_tolerance,
            "preserve_topology": True,
            "hausdorff_guard_m": options_tolerance + HAUSDORFF_EPS,
            "coordinates_re_rounded": False,
            "gzip_mtime": 0,
            "gzip_compresslevel": GZIP_COMPRESSLEVEL,
        },
        "input": {
            "path": input_path,
            "bytes": len(input_bytes),
            "sha256": _sha256(input_bytes),
        },
        "output": {
            "json": {
                "path": json_path,
                "bytes": len(json_bytes),
                "sha256": _sha256(json_bytes),
            },
            "gzip": {
                "path": gzip_path,
                "bytes": len(gzip_bytes),
                "sha256": _sha256(gzip_bytes),
            },
            "gunzip_bytes": len(gunzip_bytes),
            "gunzip_sha256": _sha256(gunzip_bytes),
            "gunzip_matches_json": gunzip_bytes == json_bytes,
        },
        "layers": measurements["layers"],
        "totals": _totals(measurements),
        "shared_boundaries": measurements.get("shared_boundaries", {}),
        "source": {
            "provider": source.get("provider"),
            "url": source.get("url"),
            "license": source.get("license"),
            "snapshot": source.get("snapshot"),
            "complete": source.get("complete"),
            "inputs": source.get("inputs"),
            "limitations": source.get("limitations"),
        },
        "performance": {
            "elapsed_seconds": elapsed_seconds,
            "peak_rss_bytes": peak_rss,
            "peak_rss_note": rss_note,
        },
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _parse_args(argv: list) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Conservative measured geometry packer (D26 PACK01)."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--json", required=True, dest="json_path")
    parser.add_argument("--gzip", required=True, dest="gzip_path")
    parser.add_argument("--audit", required=True)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=DEFAULT_TOLERANCE,
        help="metres; 0 = unchanged, max 0.25 (default 0.05)",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    started = time.perf_counter()
    try:
        with open(args.input, "rb") as handle:
            input_bytes = handle.read()
        try:
            doc = json.loads(input_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise InputFormatError(f"input is not valid UTF-8 JSON: {exc}")

        out_doc, measurements = pack_document(doc, args.tolerance)
        json_bytes = encode_json(out_doc)
        gzip_bytes = gzip_deterministic(json_bytes)

        with open(args.json_path, "wb") as handle:
            handle.write(json_bytes)
        with open(args.gzip_path, "wb") as handle:
            handle.write(gzip_bytes)

        audit = build_audit(
            options_tolerance=validate_tolerance(args.tolerance),
            input_path=args.input,
            input_bytes=input_bytes,
            json_path=args.json_path,
            json_bytes=json_bytes,
            gzip_path=args.gzip_path,
            gzip_bytes=gzip_bytes,
            measurements=measurements,
            source=out_doc["source"],
            elapsed_seconds=time.perf_counter() - started,
        )
        with open(args.audit, "w", encoding="utf-8") as handle:
            json.dump(audit, handle, sort_keys=True, indent=2)
            handle.write("\n")
    except PackError as exc:
        print(f"pack_geo: error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

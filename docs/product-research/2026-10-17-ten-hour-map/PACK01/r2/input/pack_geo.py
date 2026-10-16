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
from shapely.geometry import Polygon

SCHEMA_VERSION = 1
LAYER_NAMES = ("water", "buildings", "roads", "bridges")
DEFAULT_TOLERANCE = 0.05
MAX_TOLERANCE = 0.25
HAUSDORFF_EPS = 1e-8
GZIP_COMPRESSLEVEL = 9

# Appended to source.limitations (kept stable so repacking does not duplicate).
TOL_LIMITATION_PREFIX = "Derivative asset: Shapely/GEOS Douglas-Peucker"
CONTINUITY_LIMITATION_MARK = (
    "per-feature topology preservation does not establish inter-feature "
    "network continuity"
)


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
    if not isinstance(doc["projection"], dict):
        raise InputFormatError("projection must be an object")
    if not _is_real_number(doc["width"]) or not _is_real_number(doc["height"]):
        raise InputFormatError("width/height must be finite numbers")
    source = doc["source"]
    if not isinstance(source, dict):
        raise InputFormatError("source must be an object")

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
            if not isinstance(feature.get("sourceId"), str):
                raise InputFormatError(f"{ctx}: sourceId must be a string")
            if "properties" not in feature or not isinstance(
                feature["properties"], dict
            ):
                raise InputFormatError(f"{ctx}: properties must be an object")
            polygons = feature.get("polygons")
            if not isinstance(polygons, list) or not polygons:
                raise InputFormatError(
                    f"{ctx}: polygons must be a non-empty array"
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


def _simplify_feature(polygons: list, tolerance: float) -> tuple:
    """Simplify one feature.

    Returns ``(new_polygons, status, max_hausdorff_m)`` where status is one of
    ``unchanged``, ``simplified`` or ``fallback``. On fallback the returned
    polygons are an exact copy of the originals.
    """
    original_rings, original_vertices = _count_rings_and_vertices(polygons)

    if tolerance == 0.0:
        return _copy_polygons(polygons), "unchanged", 0.0

    shapely_polygons = []
    for polygon in polygons:
        shell = [(float(x), float(y)) for x, y in polygon[0]]
        holes = [
            [(float(x), float(y)) for x, y in ring]
            for ring in polygon[1:]
        ]
        try:
            geom = Polygon(shell, holes)
        except (ShapelyError, ValueError):
            return _copy_polygons(polygons), "fallback", 0.0
        if geom.is_empty or not geom.is_valid:
            return _copy_polygons(polygons), "fallback", 0.0
        shapely_polygons.append(geom)

    new_polygons: list = []
    feature_max_distance = 0.0
    for original in shapely_polygons:
        try:
            simplified = original.simplify(tolerance, preserve_topology=True)
        except (ShapelyError, ValueError):
            return _copy_polygons(polygons), "fallback", 0.0

        if simplified.geom_type != "Polygon":
            return _copy_polygons(polygons), "fallback", 0.0
        if simplified.is_empty or not simplified.is_valid:
            return _copy_polygons(polygons), "fallback", 0.0
        if bool(getattr(simplified, "has_z", False)):
            return _copy_polygons(polygons), "fallback", 0.0
        if len(simplified.interiors) != len(original.interiors):
            return _copy_polygons(polygons), "fallback", 0.0
        try:
            distance = original.hausdorff_distance(simplified)
        except (ShapelyError, ValueError):
            return _copy_polygons(polygons), "fallback", 0.0
        if not math.isfinite(distance) or distance > tolerance + HAUSDORFF_EPS:
            return _copy_polygons(polygons), "fallback", 0.0

        try:
            raw_rings = [_ring_from_shapely(simplified.exterior)]
            for interior in simplified.interiors:
                raw_rings.append(_ring_from_shapely(interior))
        except InputFormatError:
            return _copy_polygons(polygons), "fallback", 0.0
        # Restore original winding/start vertex for every ring.
        original_polygon = polygons[len(new_polygons)]
        rings = [
            _restore_ring_orientation(before, after)
            for before, after in zip(original_polygon, raw_rings)
        ]
        new_polygons.append(rings)
        feature_max_distance = max(feature_max_distance, float(distance))

    new_rings, new_vertices = _count_rings_and_vertices(new_polygons)
    if new_rings != original_rings:
        return _copy_polygons(polygons), "fallback", 0.0
    if new_vertices > original_vertices:
        # Douglas-Peucker only removes vertices; anything else is unsafe.
        return _copy_polygons(polygons), "fallback", 0.0

    status = "simplified" if new_vertices < original_vertices else "unchanged"
    return new_polygons, status, feature_max_distance


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
        isinstance(item, str) and CONTINUITY_LIMITATION_MARK in item
        for item in limitations
    ):
        limitations.append(
            "Per-feature topology preservation does not establish "
            "inter-feature network continuity; shared boundaries can diverge "
            "and parents must independently test routes."
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

    out_layers: dict = {}
    for layer_name in LAYER_NAMES:
        stats = measurements["layers"][layer_name]
        out_features = []
        for feature in doc["layers"][layer_name]:
            polygons = feature["polygons"]
            in_rings, in_vertices = _count_rings_and_vertices(polygons)
            in_polygons = len(polygons)

            new_polygons, status, feature_distance = _simplify_feature(
                polygons, tolerance
            )
            out_rings, out_vertices = _count_rings_and_vertices(new_polygons)

            if status == "fallback":
                # Label why for the audit; reason check mirrors the guards.
                reason = _fallback_reason(polygons, tolerance)
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


def _fallback_reason(polygons: list, tolerance: float) -> str:
    """Re-run the guard sequence to label why a feature fell back."""
    for polygon in polygons:
        shell = [(float(x), float(y)) for x, y in polygon[0]]
        holes = [
            [(float(x), float(y)) for x, y in ring] for ring in polygon[1:]
        ]
        try:
            original = Polygon(shell, holes)
        except (ShapelyError, ValueError):
            return "invalid_original"
        if original.is_empty or not original.is_valid:
            return "invalid_original"
        try:
            simplified = original.simplify(tolerance, preserve_topology=True)
        except (ShapelyError, ValueError):
            return "simplifier_error"
        if simplified.geom_type != "Polygon":
            return "polygon_cardinality_changed"
        if simplified.is_empty or not simplified.is_valid:
            return "invalid_output"
        if bool(getattr(simplified, "has_z", False)):
            return "dimension_changed"
        if len(simplified.interiors) != len(original.interiors):
            return "hole_cardinality_changed"
        distance = original.hausdorff_distance(simplified)
        if not math.isfinite(distance) or distance > tolerance + HAUSDORFF_EPS:
            return "hausdorff_exceeded"
    return "unsafe_result"


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

#!/usr/bin/env python3
"""Deterministic importer for public Kadaster/PDOK BGT GeoJSON sample pages.

Converts raw BGT FeatureCollection pages (CRS84 lon/lat) into the frozen
geo-interface v1 schema (local equirectangular metres). Python standard
library only; no network access, no geometry repair.

Usage:
    python3 import_bgt.py --manifest source-manifest.json \
        --json geo-data.json --js geo-data.js --audit import-audit.json

The Python API ``convert(manifest, base_dir)`` returns ``(data, audit)``.
"""

import argparse
import hashlib
import json
import math
import os
import sys

EARTH_RADIUS = 6371008.8
SCHEMA_VERSION = 1

# source BGT collection -> output layer name (only these mappings exist)
LAYER_MAP = {
    "waterdeel": "water",
    "pand": "buildings",
    "wegdeel": "roads",
    "overbruggingsdeel": "bridges",
}
LAYER_ORDER = ["water", "buildings", "roads", "bridges"]

# Original BGT properties retained verbatim, only when present on the feature.
KEEP_PROPERTIES = [
    "status",
    "creation_date",
    "termination_date",
    "tijdstip_registratie",
    "eind_registratie",
    "relatieve_hoogteligging",
    "functie",
    "fysiek_voorkomen",
    "type",
    "type_overbruggingsdeel",
    "hoort_bij_typeoverbrugging",
    "bag_pnd",
]

# Always reported, independent of completeness: geometry is never clipped.
UNCLIPPED_LIMITATION = (
    "Source geometry intersecting the request bbox is retained whole and "
    "unclipped; polygons may extend outside the request bbox and the "
    "renderer is expected to clip them."
)


def build_limitations(complete, input_count, next_link_count):
    """Build the truthful limitation list shared by source metadata and audit.

    ``next_link_count`` counts listed input pages that were actually
    verified (from their parsed ``links`` arrays) to carry a
    ``rel == "next"`` link. A next page is never claimed without that
    verification, and a ``complete`` claim is scoped to the listed manifest
    bbox and listed collection inputs only -- never city-wide.
    """
    if complete:
        coverage = (
            "Completeness covers only the listed manifest bbox and the %d "
            "listed collection input page(s); any other bbox, area or "
            "collection is outside this completeness claim." % input_count
        )
    else:
        coverage = (
            "Incomplete listed inputs: the %d listed collection input "
            "page(s) only partially cover the listed manifest bbox, so "
            "feature counts describe only the listed pages and not any "
            "other area." % input_count
        )
        if input_count > 0 and next_link_count == input_count:
            coverage += (
                " Each of the %d listed source pages was verified from its "
                "links to carry a next page link, so further unlisted pages "
                "exist." % next_link_count
            )
        elif next_link_count > 0:
            coverage += (
                " %d of the %d listed source pages were verified from their "
                "links to carry a next page link."
                % (next_link_count, input_count)
            )
    return [coverage, UNCLIPPED_LIMITATION]


class BgtImportError(Exception):
    """Raised for any input that cannot be converted without silent repair."""


# --------------------------------------------------------------------------- #
# small validation helpers
# --------------------------------------------------------------------------- #

def _is_finite_number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def parse_iso8601(value, *, field, feature_id):
    """Parse an ISO-8601 timestamp; requires an explicit timezone (BGT uses Z)."""
    if not isinstance(value, str):
        raise BgtImportError(
            "feature %s: %s must be an ISO-8601 string, got %r"
            % (feature_id, field, type(value).__name__)
        )
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        from datetime import datetime

        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise BgtImportError(
            "feature %s: unparseable %s %r" % (feature_id, field, value)
        ) from exc
    if dt.tzinfo is None:
        raise BgtImportError(
            "feature %s: %s %r is missing timezone" % (feature_id, field, value)
        )
    return dt


def _parse_snapshot(value):
    if not isinstance(value, str):
        raise BgtImportError("manifest snapshot must be an ISO-8601 string")
    text = value[:-1] + "+00:00" if value.endswith(("Z", "z")) else value
    from datetime import datetime

    try:
        dt = datetime.fromisoformat(text)
    except ValueError as exc:
        raise BgtImportError("manifest snapshot %r is invalid" % value) from exc
    if dt.tzinfo is None:
        raise BgtImportError("manifest snapshot %r is missing timezone" % value)
    return dt


def validate_bbox(bbox):
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise BgtImportError("manifest bbox must be [west,south,east,north]")
    west, south, east, north = bbox
    for name, coord in (
        ("west", west),
        ("south", south),
        ("east", east),
        ("north", north),
    ):
        if not _is_finite_number(coord):
            raise BgtImportError("manifest bbox %s must be a finite number" % name)
    if not (-180.0 <= west <= 180.0 and -180.0 <= east <= 180.0):
        raise BgtImportError("manifest bbox longitude out of range: %r" % bbox)
    if not (-90.0 <= south <= 90.0 and -90.0 <= north <= 90.0):
        raise BgtImportError("manifest bbox latitude out of range: %r" % bbox)
    if west >= east:
        raise BgtImportError("manifest bbox requires west < east: %r" % bbox)
    if south >= north:
        raise BgtImportError("manifest bbox requires south < north: %r" % bbox)
    return [float(west), float(south), float(east), float(north)]


def validate_complete(value):
    """Accept only a real JSON boolean; never coerce 0/1 or "false"/"true"."""
    # bool is a subclass of int, so an explicit isinstance bool check is the
    # only way to reject integer 0/1 while accepting true/false.
    if not isinstance(value, bool):
        raise BgtImportError(
            "manifest 'complete' must be a JSON boolean (true or false); "
            "got %s %r (no boolean coercion)"
            % (type(value).__name__, value)
        )
    return value


# --------------------------------------------------------------------------- #
# geometry validation (no repair)
# --------------------------------------------------------------------------- #

def _validated_ring(ring, feature_id, where):
    if not isinstance(ring, list):
        raise BgtImportError(
            "feature %s: %s is not a list of positions" % (feature_id, where)
        )
    if len(ring) < 4:
        raise BgtImportError(
            "feature %s: %s has %d positions; a closed ring needs >=4"
            % (feature_id, where, len(ring))
        )
    for index, position in enumerate(ring):
        if not isinstance(position, list) or len(position) != 2:
            raise BgtImportError(
                "feature %s: %s position %d must be [lon,lat]"
                % (feature_id, where, index)
            )
        lon, lat = position
        if not _is_finite_number(lon) or not _is_finite_number(lat):
            raise BgtImportError(
                "feature %s: %s position %d has non-finite coordinates"
                % (feature_id, where, index)
            )
        if not (-180.0 <= float(lon) <= 180.0 and -90.0 <= float(lat) <= 90.0):
            raise BgtImportError(
                "feature %s: %s position %d outside CRS84 range: %r"
                % (feature_id, where, index, position)
            )
    if ring[0] != ring[-1]:
        raise BgtImportError(
            "feature %s: %s is not closed (first != last); no silent repair"
            % (feature_id, where)
        )
    distinct = {tuple(position) for position in ring[:-1]}
    if len(distinct) < 3:
        raise BgtImportError(
            "feature %s: %s has fewer than 3 distinct points"
            % (feature_id, where)
        )
    return [[float(lon), float(lat)] for lon, lat in ring]


def validated_polygons(geometry, feature_id):
    """Return raw lon/lat polygons (list of rings) or raise with feature id."""
    if not isinstance(geometry, dict):
        raise BgtImportError(
            "feature %s: geometry is missing or not an object" % feature_id
        )
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if geom_type == "Polygon":
        if not isinstance(coords, list) or not coords:
            raise BgtImportError(
                "feature %s: Polygon coordinates missing or empty" % feature_id
            )
        rings = [
            _validated_ring(ring, feature_id, "polygon ring %d" % i)
            for i, ring in enumerate(coords)
        ]
        return rings and [rings]
    if geom_type == "MultiPolygon":
        if not isinstance(coords, list) or not coords:
            raise BgtImportError(
                "feature %s: MultiPolygon coordinates missing or empty"
                % feature_id
            )
        polygons = []
        for p_index, polygon in enumerate(coords):
            if not isinstance(polygon, list) or not polygon:
                raise BgtImportError(
                    "feature %s: MultiPolygon polygon %d is malformed"
                    % (feature_id, p_index)
                )
            rings = [
                _validated_ring(
                    ring,
                    feature_id,
                    "multipolygon %d ring %d" % (p_index, r_index),
                )
                for r_index, ring in enumerate(polygon)
            ]
            polygons.append(rings)
        return polygons
    raise BgtImportError(
        "feature %s: unsupported geometry type %r (only Polygon and "
        "MultiPolygon are mapped)" % (feature_id, geom_type)
    )


# --------------------------------------------------------------------------- #
# date validity at snapshot
# --------------------------------------------------------------------------- #

def exclusion_reason(properties, snapshot, feature_id):
    """Return exclusion reason, or None when the feature is current at snapshot."""
    creation = properties.get("creation_date") if properties else None
    termination = properties.get("termination_date") if properties else None
    if creation is not None:
        try:
            created = parse_iso8601(
                creation, field="creation_date", feature_id=feature_id
            )
        except BgtImportError:
            return "invalid_creation_date"
        if created > snapshot:
            return "created_after_snapshot"
    if termination is not None:
        try:
            ended = parse_iso8601(
                termination, field="termination_date", feature_id=feature_id
            )
        except BgtImportError:
            return "invalid_termination_date"
        if ended <= snapshot:
            return "terminated_before_snapshot"
    return None


# --------------------------------------------------------------------------- #
# projection
# --------------------------------------------------------------------------- #

def make_projection(bbox):
    west, south, east, north = bbox
    reference_lat = (south + north) / 2.0
    return {
        "type": "local-equirectangular",
        "originLon": west,
        "originLat": north,
        "referenceLat": reference_lat,
        "radiusMeters": EARTH_RADIUS,
        "units": "metres",
    }


def project_point(lon, lat, projection):
    """x = R cos(refLat) dlon; y = R (originLat - lat), rounded to 3 decimals."""
    radius = projection["radiusMeters"]
    reference = math.radians(projection["referenceLat"])
    x = radius * math.cos(reference) * math.radians(lon - projection["originLon"])
    y = radius * math.radians(projection["originLat"] - lat)
    return [round(x, 3), round(y, 3)]


def _round3(value):
    return round(value, 3)


# --------------------------------------------------------------------------- #
# conversion
# --------------------------------------------------------------------------- #

def canonical_bytes(feature):
    return json.dumps(
        feature, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _select_properties(properties):
    selected = {}
    for key in KEEP_PROPERTIES:
        if key in properties:
            selected[key] = properties[key]
    return selected


def _check_collection_identity(collection_doc, expected_collection, file_name):
    links = collection_doc.get("links")
    if not isinstance(links, list):
        raise BgtImportError(
            "%s: missing links; cannot verify collection identity" % file_name
        )
    needle = "/collections/%s/items" % expected_collection
    self_hrefs = [
        link.get("href")
        for link in links
        if isinstance(link, dict) and link.get("rel") == "self"
    ]
    if not any(isinstance(href, str) and needle in href for href in self_hrefs):
        raise BgtImportError(
            "%s: self link does not identify collection %r"
            % (file_name, expected_collection)
        )


def convert(manifest, base_dir=None):
    """Convert a manifest (dict or path) and return ``(data, audit)``."""
    if isinstance(manifest, (str, os.PathLike)):
        manifest_path = os.path.abspath(os.fspath(manifest))
        try:
            with open(manifest_path, "rb") as handle:
                raw = handle.read()
        except OSError as exc:
            raise BgtImportError(
                "cannot read manifest %s: %s" % (manifest_path, exc)
            ) from exc
        try:
            manifest = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BgtImportError("manifest is not valid JSON: %s" % exc) from exc
        if base_dir is None:
            base_dir = os.path.dirname(manifest_path)
    elif not isinstance(manifest, dict):
        raise BgtImportError("manifest must be a dict or a path to JSON")
    if base_dir is None:
        base_dir = os.getcwd()
    base_dir = os.path.abspath(base_dir)

    for key in ("bbox", "snapshot", "complete", "inputs"):
        if key not in manifest:
            raise BgtImportError("manifest missing required key %r" % key)
    bbox = validate_bbox(manifest["bbox"])
    snapshot = _parse_snapshot(manifest["snapshot"])
    complete = validate_complete(manifest["complete"])
    inputs = manifest["inputs"]
    if not isinstance(inputs, list) or not inputs:
        raise BgtImportError("manifest inputs must be a non-empty list")

    projection = make_projection(bbox)
    width = _round3(
        EARTH_RADIUS
        * math.cos(math.radians(projection["referenceLat"]))
        * math.radians(bbox[2] - bbox[0])
    )
    height = _round3(EARTH_RADIUS * math.radians(bbox[3] - bbox[1]))

    # source feature id -> (source collection, canonical bytes, raw feature, file)
    seen = {}
    # localId -> (source feature id, source collection)
    local_ids = {}
    exclusions = []
    exclusion_counts = {}
    duplicates = 0
    next_link_inputs = 0
    input_audit = []
    input_feature_total = 0
    current_feature_total = 0

    def _record_exclusion(file_name, collection, feature, reason):
        properties = feature.get("properties") or {}
        exclusions.append(
            {
                "file": file_name,
                "collection": collection,
                "id": str(feature.get("id")),
                "localId": properties.get("lokaal_id"),
                "reason": reason,
            }
        )
        exclusion_counts[reason] = exclusion_counts.get(reason, 0) + 1

    for entry in inputs:
        if not isinstance(entry, dict):
            raise BgtImportError("manifest input entry must be an object")
        file_name = entry.get("file")
        collection = entry.get("collection")
        expected_sha = entry.get("sha256")
        if not file_name or not isinstance(file_name, str):
            raise BgtImportError("manifest input missing string 'file'")
        if collection not in LAYER_MAP:
            raise BgtImportError(
                "%s: unknown or unsupported collection %r"
                % (file_name, collection)
            )
        if (
            not isinstance(expected_sha, str)
            or len(expected_sha) != 64
            or any(c not in "0123456789abcdef" for c in expected_sha)
        ):
            raise BgtImportError(
                "%s: manifest sha256 must be 64 lowercase hex characters"
                % file_name
            )

        path = os.path.join(base_dir, file_name)
        try:
            with open(path, "rb") as handle:
                payload = handle.read()
        except OSError as exc:
            raise BgtImportError("cannot read %s: %s" % (file_name, exc)) from exc
        actual_sha = hashlib.sha256(payload).hexdigest()
        if actual_sha != expected_sha:
            raise BgtImportError(
                "%s: sha256 mismatch (tampered or changed file): "
                "expected %s, got %s" % (file_name, expected_sha, actual_sha)
            )
        try:
            doc = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BgtImportError("%s: malformed JSON: %s" % (file_name, exc))

        if not isinstance(doc, dict) or doc.get("type") != "FeatureCollection":
            raise BgtImportError(
                "%s: root must be a GeoJSON FeatureCollection" % file_name
            )
        _check_collection_identity(doc, collection, file_name)
        # Verify (never assume) whether this page itself advertises a next
        # page; limitation wording may only claim what was actually observed.
        has_next_link = any(
            isinstance(link, dict) and link.get("rel") == "next"
            for link in doc.get("links", [])
        )
        if has_next_link:
            next_link_inputs += 1
        features = doc.get("features")
        if not isinstance(features, list):
            raise BgtImportError("%s: features must be a list" % file_name)

        input_audit.append(
            {
                "file": file_name,
                "collection": collection,
                "sha256": expected_sha,
                "sha256Verified": True,
                "collectionIdentity": True,
                "nextLink": has_next_link,
                "bytes": len(payload),
                "features": len(features),
            }
        )
        input_feature_total += len(features)

        for feature in features:
            if not isinstance(feature, dict) or feature.get("type") != "Feature":
                raise BgtImportError(
                    "%s: entry is not a GeoJSON Feature" % file_name
                )
            source_id = feature.get("id")
            if not isinstance(source_id, str) or not source_id:
                raise BgtImportError(
                    "%s: feature is missing a string id" % file_name
                )
            properties = feature.get("properties")
            if not isinstance(properties, dict):
                raise BgtImportError(
                    "feature %s: properties must be an object" % source_id
                )

            reason = exclusion_reason(properties, snapshot, source_id)
            if reason is not None:
                _record_exclusion(file_name, collection, feature, reason)
                continue

            # Geometry is validated before any conflict handling so malformed
            # data always fails loudly with its feature id.
            validated_polygons(feature.get("geometry"), source_id)

            bytes_key = canonical_bytes(feature)
            prior = seen.get(source_id)
            if prior is not None:
                prior_collection, prior_bytes = prior[0], prior[1]
                if prior_collection == collection and prior_bytes == bytes_key:
                    duplicates += 1
                    continue
                raise BgtImportError(
                    "conflicting versions for source id %s: identical id in "
                    "collection %r with different JSON bytes; explicit "
                    "resolution required, no silent last-wins"
                    % (source_id, collection)
                )

            local_id = properties.get("lokaal_id")
            if local_id is not None:
                if not isinstance(local_id, str) or not local_id:
                    raise BgtImportError(
                        "feature %s: lokaal_id must be a non-empty string "
                        "when present" % source_id
                    )
                prior_local = local_ids.get(local_id)
                if prior_local is not None and prior_local[0] != source_id:
                    raise BgtImportError(
                        "conflicting current versions for lokaal_id %s: "
                        "features %s and %s; explicit resolution required"
                        % (local_id, prior_local[0], source_id)
                    )
                local_ids[local_id] = (source_id, collection)

            current_feature_total += 1
            seen[source_id] = (collection, bytes_key, feature, file_name)

    # Build projected features per layer, sorted by source id then JSON bytes.
    layers = {name: [] for name in LAYER_ORDER}
    for collection, bytes_key, feature, _file_name in seen.values():
        layer = LAYER_MAP[collection]
        layers[layer].append((feature.get("id"), bytes_key, feature))
    for layer in layers:
        layers[layer].sort(key=lambda item: (item[0], item[1]))

    layer_audit = {}
    output_layers = {}
    for layer in LAYER_ORDER:
        out_features = []
        polygon_count = ring_count = vertex_count = 0
        extent = None
        for source_id, _bytes_key, feature in layers[layer]:
            raw_polygons = validated_polygons(feature.get("geometry"), source_id)
            projected_polygons = []
            min_x = min_y = float("inf")
            max_x = max_y = float("-inf")
            for polygon in raw_polygons:
                projected_polygon = []
                for ring in polygon:
                    projected_ring = [
                        project_point(lon, lat, projection) for lon, lat in ring
                    ]
                    # Projection of the same repeated input coordinate must
                    # produce the same repeated output coordinate.
                    if projected_ring[0] != projected_ring[-1]:
                        raise BgtImportError(
                            "feature %s: closure changed under projection"
                            % source_id
                        )
                    projected_polygon.append(projected_ring)
                    ring_count += 1
                    vertex_count += len(projected_ring)
                    for x, y in projected_ring:
                        min_x = min(min_x, x)
                        min_y = min(min_y, y)
                        max_x = max(max_x, x)
                        max_y = max(max_y, y)
                projected_polygons.append(projected_polygon)
                polygon_count += 1
            bounds = [
                _round3(min_x),
                _round3(min_y),
                _round3(max_x),
                _round3(max_y),
            ]
            if extent is None:
                extent = list(bounds)
            else:
                extent[0] = min(extent[0], bounds[0])
                extent[1] = min(extent[1], bounds[1])
                extent[2] = max(extent[2], bounds[2])
                extent[3] = max(extent[3], bounds[3])
            out_features.append(
                {
                    "id": "%s:%s" % (_collection_for_layer(layer), source_id),
                    "sourceId": source_id,
                    "localId": (feature.get("properties") or {}).get(
                        "lokaal_id", None
                    ),
                    "properties": _select_properties(feature.get("properties") or {}),
                    "polygons": projected_polygons,
                    "bounds": bounds,
                }
            )
        output_layers[layer] = out_features
        layer_audit[layer] = {
            "features": len(out_features),
            "polygons": polygon_count,
            "rings": ring_count,
            "vertices": vertex_count,
            "extent": extent,
        }

    source_inputs = [
        {"file": item["file"], "sha256": item["sha256"], "collection": item["collection"]}
        for item in input_audit
    ]
    # One shared, truthful list: source metadata and audit stay consistent.
    limitations = build_limitations(
        complete, len(input_audit), next_link_inputs
    )
    data = {
        "schemaVersion": SCHEMA_VERSION,
        "bbox": bbox,
        "projection": projection,
        "width": width,
        "height": height,
        "source": {
            "provider": manifest.get("provider", "Kadaster / PDOK BGT"),
            "url": manifest.get("url", "https://api.pdok.nl/kadaster/bgt/ogc/v1/"),
            "license": manifest.get("license", "CC0-1.0"),
            "snapshot": manifest["snapshot"],
            "complete": complete,
            "inputs": source_inputs,
            "limitations": limitations,
        },
        "layers": output_layers,
    }

    output_feature_total = sum(len(output_layers[name]) for name in LAYER_ORDER)
    audit = {
        "schemaVersion": SCHEMA_VERSION,
        "snapshot": manifest["snapshot"],
        "complete": complete,
        "bbox": bbox,
        "projection": {
            "referenceLat": projection["referenceLat"],
            "width": width,
            "height": height,
        },
        "inputs": input_audit,
        "inputFeatures": input_feature_total,
        "currentFeatures": current_feature_total,
        "duplicates": duplicates,
        "exclusions": exclusions,
        "exclusionCounts": exclusion_counts,
        "layers": layer_audit,
        "outputFeatures": output_feature_total,
        "limitations": list(limitations),
    }
    return data, audit


def _collection_for_layer(layer):
    for collection, name in LAYER_MAP.items():
        if name == layer:
            return collection
    raise BgtImportError("internal: unknown layer %r" % layer)


# --------------------------------------------------------------------------- #
# output writers
# --------------------------------------------------------------------------- #

def dumps_json(data):
    return (
        json.dumps(
            data,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
    )


def render_js(json_text):
    body = json_text.rstrip("\n")
    return (
        "/* Generated by import_bgt.py from public CC0 BGT pages. */\n"
        "/* Do not edit by hand; rerun the importer instead. */\n"
        "(function (global, factory) {\n"
        "  \"use strict\";\n"
        "  var data = factory();\n"
        "  if (typeof module === \"object\" && module.exports) {\n"
        "    module.exports = data;\n"
        "  }\n"
        "  if (global) {\n"
        "    global.AmsterdamGeoData = data;\n"
        "  }\n"
        "})(\n"
        "  typeof globalThis !== \"undefined\"\n"
        "    ? globalThis\n"
        "    : typeof self !== \"undefined\"\n"
        "      ? self\n"
        "      : this,\n"
        "  function () {\n"
        "    return "
        + body
        + ";\n"
        "  }\n"
        ");\n"
    )


def write_outputs(data, audit, json_path, js_path, audit_path):
    json_text = dumps_json(data)
    audit_text = dumps_json(audit)
    js_text = render_js(json_text)
    with open(json_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json_text)
    with open(js_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(js_text)
    with open(audit_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(audit_text)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Convert BGT GeoJSON pages to deterministic browser data."
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--json", dest="json_path", required=True)
    parser.add_argument("--js", dest="js_path", required=True)
    parser.add_argument("--audit", dest="audit_path", required=True)
    args = parser.parse_args(argv)
    try:
        data, audit = convert(args.manifest)
        write_outputs(
            data, audit, args.json_path, args.js_path, args.audit_path
        )
    except BgtImportError as exc:
        sys.stderr.write("import_bgt: error: %s\n" % exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

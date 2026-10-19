#!/usr/bin/env python3
"""
D27 compact-runtime packer.

Packs the accepted GEO v1 converter JSON (schemaVersion 1) into a lossless,
deterministic, chunked on-disk representation consumed by geo-runtime.js:

    outdir/manifest.json
    outdir/metadata-00000.json.gz
    outdir/coords-00000.bin.gz
    ... more numbered, zero-padded chunks for bigger inputs ...

The packer never rounds, simplifies, deletes, merges, reorders or repairs
geometry.  Structural problems (non-finite ordinates, open/short rings,
duplicate ids, wrong layer shape, ...) reject the whole input with an error
that names the offending feature.  The source intentionally contains
GEOS-invalid polygons; those are *structural-valid* and pass through byte for
byte.  Structural validation is explicitly not geometry repair.

Coordinate encoding (global, recorded in the manifest):
  * "int32-millimetres" little-endian signed Int32 per ordinate, used ONLY
    when every ordinate v satisfies round(v*1000)/1000 == v and fits; decoded
    metres are then bit-identical to the source number.
  * otherwise "float64-le": the original IEEE-754 doubles, little-endian.

Coordinates are stored interleaved (x0,y0,x1,y1,...), feature by feature, in
the fixed layer order water, buildings, roads, bridges (the same order the
navigator and renderer index in).  Polygon/ring structure and every metadata
value live in the gzip JSON metadata chunks:

  {"features": [{
      "l": 0..3,                       # layer 0 water 1 buildings 2 roads 3 bridges
      "id": "<original id>",
      "s":  <original sourceId>,       # retained verbatim, may be null
      "u":  <original localId>,        # retained verbatim, may be null
      "p":  <original properties>,     # retained verbatim (empty {} if absent)
      "o":  <global pair offset>,      # 0-based index of the feature's first pair
      "g":  [[v0,v1,...], ...],        # per polygon, vertex count of every ring
      "b":  [minX,minY,maxX,maxY]      # exact bounds (validated when supplied)
  }, ...]}

manifest.json fields are explicit about version, endianness, encoding,
counts, offsets, lengths, per-chunk and total hashes:
  format                       "amsterdam-geo-runtime-manifest/v1"
  data                         every original top-level key except "layers"
                               (schemaVersion, bbox, projection, source,
                               width, height, ...), retained verbatim
  geometrySha256               SHA-256 over canonical Float64-LE bytes of
                               every ordinate in flatten order; independent
                               of the chosen storage encoding, so route
                               artifacts can bind to the exact geometry
  sourceSha256/sourceBytes     hash and size of the raw input JSON bytes
  coordEncoding/endianness/interleaved/ordinateBytes
  pairCount/featureCount/layerCounts
  chunks[]                     index, file names, feature/pair offsets and
                               counts, uncompressed/compressed byte lengths,
                               sha256 of the uncompressed payloads
  total* bytes                 explicit total sizes

Gzip members are deterministic (mtime 0, level 9, no embedded file name) so
repeated packing of identical input produces byte-identical artifacts.

CLI:
  python pack-runtime.py --input input.json --outdir DIR --chunk-bytes 1048576
"""

import argparse
import array
import gzip
import hashlib
import io
import json
import math
import os
import struct
import sys

MANIFEST_FORMAT = "amsterdam-geo-runtime-manifest/v1"
METADATA_FORMAT = "amsterdam-geo-runtime-metadata/v1"
LAYER_ORDER = ("water", "buildings", "roads", "bridges")
LAYER_CODES = {name: i for i, name in enumerate(LAYER_ORDER)}
GZIP_LEVEL = 9


class PackError(ValueError):
    """Structural rejection of the input; message names the offending part."""


def _is_finite_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _point(p, where):
    if not isinstance(p, (list, tuple)) or len(p) < 2:
        raise PackError(where + ": coordinate must be an [x, y] pair")
    x, y = p[0], p[1]
    if not _is_finite_number(x) or not _is_finite_number(y):
        raise PackError(where + ": coordinate must hold two finite numbers")
    return float(x), float(y)


def _validate_feature(rec_index, layer_name, feature, seen_ids):
    where = layer_name + "[" + str(rec_index) + "]"
    if not isinstance(feature, dict):
        raise PackError(where + ": feature must be an object")
    fid = feature.get("id")
    if not isinstance(fid, str) or not fid:
        raise PackError(where + ": feature id must be a non-empty string")
    if fid in seen_ids:
        raise PackError(where + ": duplicate feature id " + fid)
    seen_ids.add(fid)
    where = "feature " + fid

    polygons = feature.get("polygons")
    if not isinstance(polygons, list) or not polygons:
        raise PackError(where + ": polygons must be a non-empty array")

    props = feature.get("properties", {})
    if props is None:
        props = {}
    if not isinstance(props, dict):
        raise PackError(where + ": properties must be an object")

    min_x = math.inf
    min_y = math.inf
    max_x = -math.inf
    max_y = -math.inf
    group = []  # per polygon list of ring vertex counts
    pair_count = 0
    for pi, polygon in enumerate(polygons):
        if not isinstance(polygon, list) or not polygon:
            raise PackError(where + " polygon[" + str(pi) + "]: empty/missing ring list")
        ring_counts = []
        for ri, ring in enumerate(polygon):
            rwhere = where + " polygon[" + str(pi) + "] ring[" + str(ri) + "]"
            if not isinstance(ring, list) or len(ring) < 4:
                raise PackError(rwhere + ": ring must be a closed list of at least 4 points")
            first = ring[0]
            last = ring[-1]
            if not isinstance(first, (list, tuple)) or not isinstance(last, (list, tuple)) or \
                    len(first) < 2 or len(last) < 2 or \
                    first[0] != last[0] or first[1] != last[1]:
                raise PackError(rwhere + ": ring must close with the exact first point repeated")
            distinct = set()
            for ci, coord in enumerate(ring):
                x, y = _point(coord, rwhere + " point[" + str(ci) + "]")
                distinct.add((x, y))
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
            if len(distinct) < 3:
                raise PackError(rwhere + ": ring needs at least 3 distinct points")
            ring_counts.append(len(ring))
            pair_count += len(ring)
        group.append(ring_counts)

    bounds = [min_x, min_y, max_x, max_y]
    supplied = feature.get("bounds")
    if supplied is not None:
        if not isinstance(supplied, list) or len(supplied) != 4 or \
                not all(_is_finite_number(v) for v in supplied):
            raise PackError(where + ": bounds must be four finite numbers")
        supplied = [float(v) for v in supplied]
        if supplied != bounds:
            raise PackError(
                where + ": bounds do not describe the actual polygon: stored "
                + json.dumps(supplied) + " computed " + json.dumps(bounds))

    return {
        "layer": layer_name,
        "l": LAYER_CODES[layer_name],
        "id": fid,
        "s": feature.get("sourceId"),
        "u": feature.get("localId"),
        "p": props,
        "g": group,
        "b": bounds,
        "polygons": polygons,
        "pairCount": pair_count,
    }


def _iter_pairs(features):
    """Yield every (x, y) pair of a feature list in source order."""
    for feature in features:
        for polygon in feature["polygons"]:
            for ring in polygon:
                for coord in ring:
                    yield float(coord[0]), float(coord[1])


def _mm_exact(x, y):
    for v in (x, y):
        n = int(round(v * 1000.0))
        if n < -2147483648 or n > 2147483647:
            return False
        if n / 1000.0 != v:
            return False
    return True


def _gzip_bytes(payload):
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", compresslevel=GZIP_LEVEL,
                       mtime=0, fileobj=buf) as gz:
        gz.write(payload)
    return buf.getvalue()


def _write_if_changed(path, payload):
    # Never rewrite identical bytes: keeps mtime stable and proves
    # determinism to anyone watching the fixture directory.
    if os.path.exists(path):
        with open(path, "rb") as fh:
            if fh.read() == payload:
                return False
    with open(path, "wb") as fh:
        fh.write(payload)
    return True


def pack(input_path, outdir, chunk_bytes):
    if not isinstance(chunk_bytes, int) or chunk_bytes <= 0:
        raise PackError("--chunk-bytes must be a positive integer")
    with open(input_path, "rb") as fh:
        raw = fh.read()
    source_sha = hashlib.sha256(raw).hexdigest()
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackError("input is not valid UTF-8 JSON: " + str(exc))
    if not isinstance(doc, dict):
        raise PackError("input root must be a JSON object")
    if doc.get("schemaVersion") != 1:
        raise PackError("input schemaVersion must be 1, got "
                        + repr(doc.get("schemaVersion")))
    layers = doc.get("layers")
    if not isinstance(layers, dict):
        raise PackError("input layers must be an object")

    features = []
    seen_ids = set()
    layer_counts = {}
    for layer_name in LAYER_ORDER:
        arr = layers.get(layer_name)
        if not isinstance(arr, list):
            raise PackError("layers." + layer_name + " must be an array")
        layer_counts[layer_name] = len(arr)
        for i, feature in enumerate(arr):
            features.append(_validate_feature(i, layer_name, feature, seen_ids))

    # Choose the global encoding and compute the encoding-independent
    # geometry hash (canonical Float64-LE of every ordinate, flatten order).
    all_mm = True
    geom = hashlib.sha256()
    pair_total = 0
    doubles = array.array("d")
    for x, y in _iter_pairs(features):
        if all_mm and not _mm_exact(x, y):
            all_mm = False
        doubles.append(x)
        doubles.append(y)
        pair_total += 1
        if len(doubles) >= 65536:
            if sys.byteorder != "little":
                doubles.byteswap()
            geom.update(doubles.tobytes())
            del doubles[:]
    if doubles:
        if sys.byteorder != "little":
            doubles.byteswap()
        geom.update(doubles.tobytes())
        del doubles[:]
    encoding = "int32-millimetres" if all_mm else "float64-le"
    ordinate_bytes = 4 if all_mm else 8

    # Assign global pair offsets; flatten offsets are contiguous and ordered.
    offset = 0
    for feature in features:
        feature["o"] = offset
        offset += feature["pairCount"]
    if offset != pair_total:
        raise PackError("internal: offset/pair count mismatch")

    metadata = {k: v for k, v in doc.items() if k != "layers"}

    # Walk features into chunks bounded (per coordinate payload) by chunk_bytes.
    chunks = []
    chunk_index = 0
    i = 0
    pair_cursor = 0
    total_coord_bytes = 0
    total_coord_gz = 0
    total_meta_gz = 0
    while i < len(features):
        members = []
        coord = array.array("i") if all_mm else array.array("d")
        bytes_used = 0
        while i < len(features):
            f = features[i]
            add = f["pairCount"] * 2 * ordinate_bytes
            if members and bytes_used + add > chunk_bytes:
                break
            members.append(f)
            bytes_used += add
            for x, y in _iter_pairs([f]):
                if all_mm:
                    coord.append(int(round(x * 1000.0)))
                    coord.append(int(round(y * 1000.0)))
                else:
                    coord.append(x)
                    coord.append(y)
            i += 1

        if sys.byteorder != "little":
            coord.byteswap()
        coord_payload = coord.tobytes()
        if len(coord_payload) != bytes_used:
            raise PackError("internal: encoded coordinate byte length mismatch")
        if any(m["o"] + m["pairCount"] > pair_total for m in members):
            raise PackError("internal: chunk pair offsets out of range")

        meta_doc = {
            "format": METADATA_FORMAT,
            "chunk": chunk_index,
            "pairOffset": pair_cursor,
            "features": [{
                "l": m["l"], "id": m["id"], "s": m["s"], "u": m["u"],
                "p": m["p"], "o": m["o"], "g": m["g"], "b": m["b"]
            } for m in members],
        }
        meta_payload = json.dumps(
            meta_doc, sort_keys=True, separators=(",", ":"),
            ensure_ascii=False, allow_nan=False).encode("utf-8")
        if pair_cursor != members[0]["o"]:
            raise PackError("internal: chunk pairOffset discontinuity")

        coord_gz = _gzip_bytes(coord_payload)
        meta_gz = _gzip_bytes(meta_payload)
        coord_name = "coords-%05d.bin.gz" % chunk_index
        meta_name = "metadata-%05d.json.gz" % chunk_index
        rec = {
            "index": chunk_index,
            "metadata": meta_name,
            "coords": coord_name,
            "features": len(members),
            "firstFeatureLayer": members[0]["layer"],
            "pairOffset": pair_cursor,
            "pairCount": sum(m["pairCount"] for m in members),
            "coordBytes": len(coord_payload),
            "coordCompressedBytes": len(coord_gz),
            "metadataBytes": len(meta_payload),
            "metadataCompressedBytes": len(meta_gz),
            "coordSha256": hashlib.sha256(coord_payload).hexdigest(),
            "metadataSha256": hashlib.sha256(meta_payload).hexdigest(),
        }
        _write_if_changed(os.path.join(outdir, coord_name), coord_gz)
        _write_if_changed(os.path.join(outdir, meta_name), meta_gz)
        chunks.append(rec)
        pair_cursor += rec["pairCount"]
        total_coord_bytes += len(coord_payload)
        total_coord_gz += len(coord_gz)
        total_meta_gz += len(meta_gz)
        chunk_index += 1

    if pair_cursor != pair_total:
        raise PackError("internal: chunked pair total mismatch")

    manifest = {
        "format": MANIFEST_FORMAT,
        "data": metadata,
        "schemaVersion": 1,
        "geometrySha256": geom.hexdigest(),
        "sourceSha256": source_sha,
        "sourceBytes": len(raw),
        "coordEncoding": encoding,
        "endianness": "little",
        "interleaved": True,
        "ordinateBytes": ordinate_bytes,
        "pairCount": pair_total,
        "ordinateCount": pair_total * 2,
        "featureCount": len(features),
        "layerCounts": {name: layer_counts[name] for name in LAYER_ORDER},
        "layerOrder": list(LAYER_ORDER),
        "chunkBytesTarget": int(chunk_bytes),
        "chunks": chunks,
        "totalCoordBytes": total_coord_bytes,
        "totalCoordCompressedBytes": total_coord_gz,
        "totalMetadataCompressedBytes": total_meta_gz,
        "totalDownloadBytes": total_coord_gz + total_meta_gz,
    }
    # Deterministic pretty text; stable across runs.
    manifest_bytes = (json.dumps(
        manifest, sort_keys=True, indent=2, ensure_ascii=False,
        allow_nan=False) + "\n").encode("utf-8")
    _write_if_changed(os.path.join(outdir, "manifest.json"), manifest_bytes)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pack GEO v1 JSON into compact runtime chunks")
    parser.add_argument("--input", required=True)
    parser.add_argument("--outdir", required=True)
    parser.add_argument("--chunk-bytes", required=True, type=int)
    args = parser.parse_args(argv)
    os.makedirs(args.outdir, exist_ok=True)
    try:
        manifest = pack(args.input, args.outdir, args.chunk_bytes)
    except PackError as exc:
        sys.stderr.write("pack-runtime: " + str(exc) + "\n")
        return 2
    print(json.dumps({
        "ok": True,
        "features": manifest["featureCount"],
        "pairs": manifest["pairCount"],
        "chunks": len(manifest["chunks"]),
        "encoding": manifest["coordEncoding"],
        "geometrySha256": manifest["geometrySha256"],
        "downloadBytes": manifest["totalDownloadBytes"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())

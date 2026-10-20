#!/usr/bin/env python3
"""
D27 compact-runtime packer tests.

The implementation module is pack-runtime.py; its hyphen forbids a normal
import, so it is loaded explicitly with importlib from this file's directory.
Every test works inside TemporaryDirectory fixtures and cleans them up.
"""

import gzip
import hashlib
import importlib.util
import io
import json
import os
import struct
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load_packer():
    spec = importlib.util.spec_from_file_location(
        "pack_runtime", os.path.join(HERE, "pack-runtime.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pack = load_packer()


def ring(points):
    """Close an open point list exactly (first point repeated verbatim)."""
    return [list(p) for p in points] + [list(points[0])]


def rect_feature(layer_id, index, x0, y0, x1, y1, properties=None, extra=None):
    polygons = [[ring([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])]]
    bounds = [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]
    feature = {
        "id": layer_id + ":" + str(index),
        "sourceId": "src-" + str(index),
        "localId": None,
        "properties": properties if properties is not None else {},
        "polygons": polygons,
        "bounds": bounds,
    }
    if extra:
        feature.update(extra)
    return feature


def make_doc(layers=None, mm=True):
    scale = 1.0 if mm else 1.0
    doc = {
        "schemaVersion": 1,
        "bbox": [4.86, 52.34, 4.98, 52.41],
        "width": 7127.775 * scale,
        "height": 6671.705 * scale,
        "projection": {
            "type": "local-equirectangular",
            "originLon": 4.86,
            "originLat": 52.41,
            "referenceLat": 52.375,
            "radiusMeters": 6371008.8,
            "units": "metres",
        },
        "source": {
            "provider": "Kadaster / PDOK BGT",
            "url": "https://example.invalid/",
            "license": "CC0-1.0",
            "snapshot": "2026-10-16T00:00:00Z",
            "complete": False,
            "inputs": ["a", "b"],
            "limitations": ["test fixture"],
        },
        "layers": {
            "water": [], "buildings": [], "roads": [], "bridges": [],
        },
    }
    if layers:
        for name, feats in layers.items():
            doc["layers"][name] = feats
    return doc


def read_bytes(path):
    with open(path, "rb") as fh:
        return fh.read()


def read_gz(path):
    return gzip.decompress(read_bytes(path))


def write_json(path, doc, raw=None):
    with open(path, "wb") as fh:
        if raw is not None:
            fh.write(raw)
        else:
            fh.write(json.dumps(doc, ensure_ascii=False).encode("utf-8"))


def iter_ordinates(doc):
    order = ("water", "buildings", "roads", "bridges")
    for name in order:
        for f in doc["layers"][name]:
            for polygon in f["polygons"]:
                for r in polygon:
                    for x, y in r:
                        yield float(x)
                        yield float(y)


def canonical_geometry_sha(doc):
    h = hashlib.sha256()
    buf = bytearray()
    for v in iter_ordinates(doc):
        buf += struct.pack("<d", v)
        if len(buf) >= 65536:
            h.update(bytes(buf))
            buf.clear()
    h.update(bytes(buf))
    return h.hexdigest()


class PackerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _pack(self, doc, chunk_bytes=1048576, name="input.json", raw=None):
        in_path = os.path.join(self.tmp, name)
        out = os.path.join(self.tmp, "out")
        os.makedirs(out, exist_ok=True)
        write_json(in_path, doc, raw=raw)
        return in_path, out, pack.pack(in_path, out, chunk_bytes)

    def test_lossless_roundtrip_millimetres(self):
        # Two disjoint road polygons, one with an actual hole; unicode prop.
        road0 = rect_feature("wegdeel", 0, -12.0, -3.5, 40.25, 3.5,
                             properties={"functie": "fietspad", "naam": "kade 道"})
        road0["polygons"].append([ring([(100.0, 0.0), (140.0, 0.0),
                                       (140.0, 6.0), (100.0, 6.0)])])
        road0["bounds"] = [-12.0, -3.5, 140.0, 6.0]
        hole = rect_feature("wegdeel", 1, 0.0, 0.0, 10.0, 10.0,
                            properties={"functie": None})
        hole["polygons"][0].append(ring([(2.0, 2.0), (8.0, 2.0),
                                         (8.0, 8.0), (2.0, 8.0)]))
        doc = make_doc({"roads": [road0, hole]})
        in_path, out, manifest = self._pack(doc)
        self.assertEqual(manifest["coordEncoding"], "int32-millimetres")
        self.assertEqual(manifest["ordinateBytes"], 4)
        self.assertEqual(manifest["endianness"], "little")
        self.assertEqual(len(manifest["chunks"]), 1)
        self.assertEqual(manifest["geometrySha256"], canonical_geometry_sha(doc))
        with open(in_path, "rb") as fh:
            self.assertEqual(manifest["sourceSha256"],
                             hashlib.sha256(fh.read()).hexdigest())
        self.assertEqual(manifest["layerCounts"],
                         {"water": 0, "buildings": 0, "roads": 2, "bridges": 0})
        # Metadata passthrough keeps every original top-level value.
        self.assertEqual(manifest["data"]["projection"], doc["projection"])
        self.assertEqual(manifest["data"]["source"], doc["source"])
        self.assertEqual(manifest["data"]["width"], doc["width"])
        self.assertEqual(manifest["data"]["bbox"], doc["bbox"])

        chunk = manifest["chunks"][0]
        meta = json.loads(read_gz(os.path.join(out, chunk["metadata"])))
        coord = read_gz(os.path.join(out, chunk["coords"]))
        self.assertEqual(meta["format"], "amsterdam-geo-runtime-metadata/v1")
        self.assertEqual(chunk["coordBytes"], len(coord))
        self.assertEqual(chunk["metadataBytes"],
                         len(json.dumps(meta, sort_keys=True,
                                        separators=(",", ":"),
                                        ensure_ascii=False).encode("utf-8")))
        ints = struct.unpack("<%di" % (len(coord) // 4), coord)
        # Walk metadata in storage order and compare every value exactly.
        expected_pairs = []
        for name in ("water", "buildings", "roads", "bridges"):
            for f in doc["layers"][name]:
                for polygon in f["polygons"]:
                    for r in polygon:
                        for x, y in r:
                            expected_pairs.append((x, y))
        self.assertEqual(len(ints), len(expected_pairs) * 2)
        for i, (x, y) in enumerate(expected_pairs):
            self.assertEqual(ints[2 * i] / 1000.0, x)
            self.assertEqual(ints[2 * i + 1] / 1000.0, y)

        # Metadata records preserve order, layer code, ids, properties,
        # ring cardinalities, offsets and exact bounds.
        records = meta["features"]
        self.assertEqual([r["id"] for r in records],
                         [road0["id"], hole["id"]])
        self.assertEqual([r["l"] for r in records], [2, 2])
        r0, r1 = records
        self.assertEqual(r0["p"], road0["properties"])
        self.assertEqual(r0["g"], [[5], [5]])  # two polygons, one ring each
        self.assertEqual(r1["g"], [[5, 5]])  # one polygon: outer 5 + hole 5
        self.assertEqual(r0["b"], [-12.0, -3.5, 140.0, 6.0])
        self.assertEqual(r0["s"], "src-0")
        self.assertIsNone(r0["u"])
        # Offsets contiguous and ordered.
        self.assertEqual(r0["o"], 0)
        self.assertEqual(r1["o"], 10)
        self.assertEqual(chunk["pairCount"], 20)
        self.assertEqual(manifest["pairCount"], 20)

    def test_float64_when_millimetres_lossy_and_exact_numbers(self):
        # 0.123456789012345 does not survive a millimetre round: forces f64.
        v = 0.123456789012345
        f = rect_feature("waterdeel", 0, v, 1.0, 2.0, 2.0,
                         properties={"type": "watervlakte"})
        doc = make_doc({"water": [f]})
        _, out, manifest = self._pack(doc)
        self.assertEqual(manifest["coordEncoding"], "float64-le")
        self.assertEqual(manifest["ordinateBytes"], 8)
        self.assertEqual(manifest["geometrySha256"], canonical_geometry_sha(doc))
        chunk = manifest["chunks"][0]
        coord = read_gz(os.path.join(out, chunk["coords"]))
        doubles = struct.unpack("<%dd" % (len(coord) // 8), coord)
        self.assertEqual(doubles[0], v)  # bit-exact original number
        self.assertEqual(doubles[1], 1.0)
        self.assertEqual(chunk["coordBytes"], 80)  # 5 vertices * 2 * 8

    def test_repeated_pack_is_byte_identical(self):
        doc = make_doc({"roads": [
            rect_feature("wegdeel", 0, 0, 0, 10, 10, {"functie": None}),
            rect_feature("wegdeel", 1, 20, 0, 30, 8, {"functie": "fietspad"}),
        ]})
        _, out1, m1 = self._pack(doc)
        out2 = os.path.join(self.tmp, "out2")
        os.makedirs(out2, exist_ok=True)
        in_path = os.path.join(self.tmp, "input.json")
        m2 = pack.pack(in_path, out2, 1048576)
        names = ["manifest.json"]
        for c in m1["chunks"]:
            names += [c["coords"], c["metadata"]]
        for name in names:
            self.assertEqual(read_bytes(os.path.join(out1, name)),
                             read_bytes(os.path.join(out2, name)),
                             name + " must be deterministic")
        self.assertEqual(json.loads(read_bytes(os.path.join(out1, "manifest.json"))), m2)

    def test_multiple_chunks_offsets_and_hashes(self):
        # 6 m-wide roads, pairs of 5 vertices = 80 bytes (f64) each; a
        # 200-byte budget forces multiple chunks (feature never split).
        roads = [rect_feature("wegdeel", i, i * 100.0, 0, i * 100.0 + 90, 6)
                 for i in range(6)]
        doc = make_doc({"roads": roads})
        _, out, manifest = self._pack(doc, chunk_bytes=200)
        self.assertGreater(len(manifest["chunks"]), 1)
        pair_offset = 0
        pair_seen = 0
        coord_concat = b""
        for ci, chunk in enumerate(manifest["chunks"]):
            self.assertEqual(chunk["index"], ci)
            self.assertEqual(chunk["pairOffset"], pair_offset)
            coord = read_gz(os.path.join(out, chunk["coords"]))
            meta_raw = read_gz(os.path.join(out, chunk["metadata"]))
            self.assertEqual(hashlib.sha256(coord).hexdigest(),
                             chunk["coordSha256"])
            self.assertEqual(hashlib.sha256(meta_raw).hexdigest(),
                             chunk["metadataSha256"])
            meta = json.loads(meta_raw)
            self.assertEqual(meta["pairOffset"], pair_offset)
            running = pair_offset
            for rec in meta["features"]:
                self.assertEqual(rec["o"], running)
                verts = sum(sum(g) for g in rec["g"])
                running += verts
            pair_offset = running
            pair_seen += chunk["pairCount"]
            coord_concat += coord
            # Each chunk honours the target, except possibly the last.
            if ci < len(manifest["chunks"]) - 1:
                self.assertLessEqual(chunk["coordBytes"], 200)
        self.assertEqual(pair_seen, manifest["pairCount"])
        self.assertEqual(pair_offset, manifest["pairCount"])
        self.assertEqual(manifest["totalCoordBytes"], len(coord_concat))

    def test_structural_rejections(self):
        def expect_error(layers_mutator=None, raw=None, doc=None):
            d = doc if doc is not None else make_doc()
            if layers_mutator:
                layers_mutator(d["layers"])
            with self.assertRaises(pack.PackError):
                self._pack(d, raw=raw)

        # Open ring.
        open_ring = rect_feature("wegdeel", 1, 0, 0, 4, 4)
        open_ring["polygons"][0][0] = open_ring["polygons"][0][0][:-1]
        expect_error(lambda l: l["roads"].append(open_ring))
        # Only two distinct vertices, alternating, closed.
        two = rect_feature("wegdeel", 2, 0, 0, 1, 1)
        two["polygons"] = [[ring([(0.0, 0.0), (1.0, 0.0), (0.0, 0.0),
                                   (1.0, 0.0)])[:-1]]]
        two["polygons"][0][0].append(two["polygons"][0][0][0])
        expect_error(lambda l: l["roads"].append(two))
        # Non-finite ordinate.
        nanf = rect_feature("wegdeel", 3, 0, 0, 4, 4)
        nanf["polygons"][0][0][1][0] = float("nan")
        expect_error(lambda l: l["roads"].append(nanf))
        # Duplicate id.
        a = rect_feature("wegdeel", 4, 0, 0, 2, 2)
        b = rect_feature("wegdeel", 4, 4, 0, 6, 2)
        expect_error(lambda l: l["roads"].extend([a, b]))
        # Wrong bounds.
        badb = rect_feature("wegdeel", 5, 0, 0, 2, 2)
        badb["bounds"] = [0, 0, 99, 2]
        expect_error(lambda l: l["roads"].append(badb))
        # Missing layer array.
        d = make_doc()
        del d["layers"]["bridges"]
        expect_error(doc=d)
        # Bad schema.
        d = make_doc()
        d["schemaVersion"] = 2
        expect_error(doc=d)
        # NaN token in raw JSON.
        nan_doc = make_doc({"roads": [rect_feature("wegdeel", 6, 0, 0, 1, 1)]})
        raw = json.dumps(nan_doc).replace("[1, 0]", "[NaN, 0]", 1).encode()
        expect_error(raw=raw)
        # Properties not an object.
        pf = rect_feature("wegdeel", 7, 0, 0, 2, 2, properties={})
        pf["properties"] = ["nope"]
        expect_error(lambda l: l["roads"].append(pf))

    def test_holes_and_multipolygon_cardinality_preserved(self):
        f = rect_feature("waterdeel", 9, 0, 0, 100, 100)
        f["polygons"][0].append(ring([(10, 10), (20, 10), (20, 20), (10, 20)]))
        f["polygons"].append([ring([(200, 200), (260, 200), (260, 260)])])
        f["bounds"] = [0, 0, 260, 260]
        doc = make_doc({"water": [f]})
        _, out, manifest = self._pack(doc)
        meta = json.loads(read_gz(os.path.join(
            out, manifest["chunks"][0]["metadata"])))
        rec = meta["features"][0]
        self.assertEqual(rec["g"], [[5, 5], [4]])
        self.assertEqual(rec["b"], [0, 0, 260, 260])

    def test_real_public_sample(self):
        sample = os.path.normpath(os.path.join(
            HERE, "..", "navigation", "real-pub-sample.json"))
        out = os.path.join(self.tmp, "sample-out")
        os.makedirs(out, exist_ok=True)
        manifest = pack.pack(sample, out, 1048576)
        self.assertEqual(manifest["layerCounts"],
                         {"water": 2, "buildings": 23, "roads": 36, "bridges": 1})
        self.assertEqual(manifest["featureCount"], 62)
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(len(manifest["chunks"]), 1)
        with open(sample, "rb") as fh:
            raw = fh.read()
        self.assertEqual(manifest["sourceSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(manifest["sourceBytes"], len(raw))
        # Independently decode and compare every ordinate and feature record.
        source = json.loads(raw.decode("utf-8"))
        self.assertEqual(manifest["geometrySha256"], canonical_geometry_sha(source))
        chunk = manifest["chunks"][0]
        coord = read_gz(os.path.join(out, chunk["coords"]))
        meta = json.loads(read_gz(os.path.join(out, chunk["metadata"])))
        mm = manifest["coordEncoding"] == "int32-millimetres"
        width = 4 if mm else 8
        self.assertEqual(chunk["coordBytes"],
                         manifest["pairCount"] * 2 * width)
        expected = list(iter_ordinates(source))
        if mm:
            vals = struct.unpack("<%di" % (len(coord) // 4), coord)
            got = [v / 1000.0 for v in vals]
        else:
            got = list(struct.unpack("<%dd" % (len(coord) // 8), coord))
        self.assertEqual(got, expected)
        # Every feature id/property appears exactly once in metadata.
        ids = []
        for name in ("water", "buildings", "roads", "bridges"):
            for f in source["layers"][name]:
                ids.append(f["id"])
        self.assertEqual([r["id"] for r in meta["features"]], ids)
        by_id = {r["id"]: r for r in meta["features"]}
        for name in ("water", "buildings", "roads", "bridges"):
            for f in source["layers"][name]:
                r = by_id[f["id"]]
                self.assertEqual(r["p"], f["properties"])
                self.assertEqual(r["s"], f.get("sourceId"))
                self.assertEqual(r["u"], f.get("localId"))
                g = [[len(rng) for rng in poly] for poly in f["polygons"]]
                self.assertEqual(r["g"], g)
                self.assertEqual(r["b"], f["bounds"])

        # Chunk payload honours the target except for a single feature that
        # alone exceeds it (features are never split across chunks).

    def test_signed_zero_ordinates_force_per_chunk_float64(self):
        # The full real source has exactly two -0.0 ordinates. Int32
        # millimetres decode 0 as +0.0 and would flip the IEEE-754 sign bit,
        # so a chunk carrying a negative zero must store raw Float64 bytes
        # while unrelated chunks stay compact Int32.
        ring0 = [[-0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [-0.0, 0.0]]
        signed = {
            "id": "wegdeel:signed-zero", "sourceId": "synthetic", "localId": None,
            "properties": {"functie": "voetpad"},
            "polygons": [[ring0]], "bounds": [-0.0, 0.0, 10.0, 10.0],
        }
        other = rect_feature("wegdeel", 1, 100.0, 0.0, 110.0, 10.0)
        doc = make_doc({"roads": [signed, other]})
        _, out, manifest = self._pack(doc, chunk_bytes=80)
        self.assertEqual(manifest["coordEncoding"], "per-chunk")
        self.assertIsNone(manifest["ordinateBytes"])
        c0, c1 = manifest["chunks"]
        self.assertEqual(c0["coordEncoding"], "float64-le")
        self.assertEqual(c0["ordinateBytes"], 8)
        self.assertEqual(c1["coordEncoding"], "int32-millimetres")
        self.assertEqual(c1["ordinateBytes"], 4)
        # The canonical geometry hash is computed from the SOURCE Float64
        # ordinates (sign bit included), not from decoded values.
        self.assertEqual(manifest["geometrySha256"], canonical_geometry_sha(doc))
        # IEEE-754 byte identity of every ordinate in the Float64 chunk,
        # including the two negative-zero x ordinates.
        coord0 = read_gz(os.path.join(out, c0["coords"]))
        got = struct.unpack("<%dd" % (len(coord0) // 8), coord0)
        expected = list(iter_ordinates(doc))[:len(got)]
        self.assertEqual(len(got), 10)
        for gi, ev in zip(got, expected):
            self.assertEqual(struct.pack("<d", gi), struct.pack("<d", ev))
        neg_zero = 0x8000000000000000
        self.assertEqual(struct.unpack("<Q", struct.pack("<d", got[0]))[0], neg_zero)
        self.assertEqual(struct.unpack("<Q", struct.pack("<d", got[8]))[0], neg_zero)
        # The interior x=0 ordinate stays a positive zero.
        self.assertEqual(struct.unpack("<Q", struct.pack("<d", got[6]))[0], 0)
        # The neighbouring millimetre-exact chunk is still compact Int32.
        coord1 = read_gz(os.path.join(out, c1["coords"]))
        ints1 = struct.unpack("<%di" % (len(coord1) // 4), coord1)
        self.assertEqual(ints1[0] / 1000.0, 100.0)

    def test_single_oversized_feature_is_never_split(self):
        # A long thin road (402 vertices) cannot fit an 512-byte Int32 chunk;
        # it occupies one larger chunk and round-trips without omission.
        pts = [(float(i), 0.0) for i in range(200)]
        pts += [(199.0, 1.0)] + [(float(i), 1.0) for i in range(198, -1, -1)]
        ring1 = pts + [pts[0]]
        big = {
            "id": "wegdeel:long", "sourceId": "synthetic", "localId": None,
            "properties": {}, "polygons": [[ring1]],
            "bounds": [0.0, 0.0, 199.0, 1.0],
        }
        doc = make_doc({"roads": [big]})
        _, out, manifest = self._pack(doc, chunk_bytes=512)
        self.assertEqual(len(manifest["chunks"]), 1)
        chunk = manifest["chunks"][0]
        self.assertEqual(chunk["features"], 1)
        self.assertGreater(chunk["coordBytes"], 512)
        self.assertEqual(chunk["pairCount"], len(ring1))
        coord = read_gz(os.path.join(out, chunk["coords"]))
        ints = struct.unpack("<%di" % (len(coord) // 4), coord)
        self.assertEqual(ints[0] / 1000.0, 0.0)
        self.assertEqual(ints[2 * 200] / 1000.0, 199.0)
        self.assertEqual(ints[-2] / 1000.0, 0.0)
        self.assertEqual(manifest["geometrySha256"], canonical_geometry_sha(doc))

    def test_main_returns_nonzero_on_bad_input(self):
        bad = os.path.join(self.tmp, "bad.json")
        with open(bad, "wb") as fh:
            fh.write(b"{")
        out = os.path.join(self.tmp, "o")
        os.makedirs(out, exist_ok=True)
        self.assertEqual(pack.main(
            ["--input", bad, "--outdir", out, "--chunk-bytes", "1048576"]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)

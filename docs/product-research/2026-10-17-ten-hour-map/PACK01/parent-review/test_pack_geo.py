"""Regression tests for D26 PACK01 pack_geo.py.

Covers: identity/property/hole/cardinality preservation, deterministic gzip
roundtrip, tolerance 0, dense curved rings within measured Hausdorff error,
invalid-original fallback without silent repair, thin holes / thin bridge
polygons, malformed/nonfinite rejection with feature id, invalid tolerances,
empty layers and the real parent-selected sample (including the CLI).
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
import unittest

import pack_geo as pack
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "sample-input.json")
TOL = 0.05


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
def ring(points):
    """Close an open point list into a [x, y] ring."""
    pts = [[float(x), float(y)] for x, y in points]
    pts.append([pts[0][0], pts[0][1]])
    return pts


def rectangle(x0, y0, x1, y1):
    return ring([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def circle_ring(cx, cy, r, n=120):
    pts = [
        (cx + r * math.cos(2.0 * math.pi * i / n),
         cy + r * math.sin(2.0 * math.pi * i / n))
        for i in range(n)
    ]
    return ring(pts)


def make_feature(fid, polygons, *, layer_source="test:collection",
                 local_id=None, properties=None):
    return {
        "id": f"collection:{fid}",
        "sourceId": fid,
        "localId": local_id,
        "properties": properties if properties is not None else {
            "status": "present",
            "functie": "ondersteunend wegdeel",
            "relatieve_hoogteligging": 0,
        },
        "polygons": polygons,
        "bounds": [0.0, 0.0, 0.0, 0.0],
    }


def make_doc(layers=None):
    empty = {"water": [], "buildings": [], "roads": [], "bridges": []}
    if layers:
        empty.update(layers)
    return {
        "schemaVersion": 1,
        "bbox": [4.90, 52.36, 4.92, 52.38],
        "projection": {
            "type": "local-equirectangular",
            "originLon": 4.90,
            "originLat": 52.38,
            "referenceLat": 52.37,
            "radiusMeters": 6371008.8,
            "units": "metres",
        },
        "width": 1356.0,
        "height": 2226.0,
        "source": {
            "provider": "Kadaster / PDOK BGT",
            "url": "https://api.pdok.nl/kadaster/bgt/ogc/v1/",
            "license": "CC0-1.0",
            "snapshot": "2026-10-16T00:00:00Z",
            "complete": False,
            "inputs": [
                {"file": "synthetic-page.json", "sha256": "x" * 64,
                 "collection": "synthetic"}
            ],
            "limitations": [],
        },
        "layers": empty,
    }


def packed(doc, tolerance=TOL):
    return pack.pack_document(doc, tolerance)


def is_cyclic_subsequence(original_open, out_open):
    """True if out_open follows original_open's winding as a cyclic
    subsequence (tolerates dropped vertices and duplicated coordinates)."""
    if not out_open:
        return False
    orig = [[float(x), float(y)] for x, y in original_open]
    out = [[float(x), float(y)] for x, y in out_open]
    n = len(orig)
    doubled = orig * 2
    for start in range(n):
        if tuple(doubled[start]) != tuple(out[0]):
            continue
        index = start
        found = True
        for point in out[1:]:
            index += 1
            while index < start + n and tuple(doubled[index]) != tuple(point):
                index += 1
            if index >= start + n:
                found = False
                break
        if found:
            return True
    return False


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
class ToleranceTests(unittest.TestCase):
    def test_valid_tolerances(self):
        self.assertEqual(pack.validate_tolerance(0), 0.0)
        self.assertEqual(pack.validate_tolerance(0.05), 0.05)
        self.assertEqual(pack.validate_tolerance(0.25), 0.25)

    def test_invalid_tolerances(self):
        for bad in (-0.01, 0.2500001, 1.0, float("nan"), float("inf"),
                    float("-inf"), "0.05", None, True, False, [0.05]):
            with self.assertRaises(pack.ToleranceError):
                pack.validate_tolerance(bad)


class IdentityPreservationTests(unittest.TestCase):
    def setUp(self):
        big = circle_ring(50.0, 50.0, 8.0, 120)
        hole = circle_ring(52.0, 50.0, 1.5, 48)
        second_poly = [[rectangle(0, 0, 6, 4)]]
        self.doc = make_doc({
            "water": [
                make_feature("w1", [[big, hole]]),
                make_feature("w2", second_poly, local_id="L-2",
                             properties={"status": "present"}),
            ],
            "buildings": [
                make_feature("b1", [[rectangle(100, 100, 106, 104)]]),
            ],
        })

    def test_ids_properties_order_and_cardinality_preserved(self):
        out, _ = packed(self.doc)
        for layer in pack.LAYER_NAMES:
            in_feats = self.doc["layers"][layer]
            out_feats = out["layers"][layer]
            self.assertEqual(len(in_feats), len(out_feats))
            for before, after in zip(in_feats, out_feats):
                self.assertEqual(before["id"], after["id"])
                self.assertEqual(before["sourceId"], after["sourceId"])
                self.assertEqual(before["localId"], after["localId"])
                self.assertEqual(before["properties"], after["properties"])
                self.assertEqual(
                    [len(p) for p in before["polygons"]],
                    [len(p) for p in after["polygons"]],
                )
                self.assertEqual(len(before["polygons"]),
                                 len(after["polygons"]))

    def test_schema_projection_and_completeness_preserved(self):
        out, _ = packed(self.doc)
        for key in ("schemaVersion", "bbox", "projection", "width", "height"):
            self.assertEqual(self.doc[key], out[key])
        self.assertIs(out["source"]["complete"], False)
        self.assertEqual(
            out["source"]["inputs"], self.doc["source"]["inputs"]
        )
        joined = " ".join(out["source"]["limitations"]).lower()
        self.assertIn("0.05", joined)
        self.assertIn("inter-feature network continuity", joined)

    def test_simplified_coordinates_are_subset_of_input(self):
        """DP selects existing vertices: no fabricated/rounded points."""
        out, _ = packed(self.doc)
        for before, after in zip(
            self.doc["layers"]["water"], out["layers"]["water"]
        ):
            allowed = {
                (x, y)
                for polygon in before["polygons"]
                for ring_ in polygon
                for x, y in ring_
            }
            for polygon in after["polygons"]:
                for ring_ in polygon:
                    for x, y in ring_:
                        self.assertIn((x, y), allowed)

    def test_bounds_recomputed_accurately(self):
        out, _ = packed(self.doc)
        for layer in out["layers"].values():
            for feature in layer:
                xs, ys = [], []
                for polygon in feature["polygons"]:
                    for ring_ in polygon:
                        for x, y in ring_:
                            xs.append(x)
                            ys.append(y)
                self.assertEqual(
                    feature["bounds"],
                    [min(xs), min(ys), max(xs), max(ys)],
                )


class DenseRingTests(unittest.TestCase):
    def test_curved_ring_simplified_within_measured_error(self):
        outer = circle_ring(30.0, 30.0, 6.0, 200)
        hole = circle_ring(31.0, 30.0, 1.2, 64)
        doc = make_doc({"water": [make_feature("pond", [[outer, hole]])]})
        out, measurements = packed(doc)
        stats = measurements["layers"]["water"]
        self.assertEqual(stats["features_simplified"], 1)
        self.assertGreater(
            stats["input"]["vertices"], stats["output"]["vertices"]
        )
        self.assertLessEqual(stats["max_hausdorff_m"], TOL + 1e-8)
        after = out["layers"]["water"][0]
        # Polygon / ring cardinality and closure survive.
        self.assertEqual(len(after["polygons"]), 1)
        self.assertEqual(len(after["polygons"][0]), 2)
        for ring_ in after["polygons"][0]:
            self.assertGreaterEqual(len(ring_), 4)
            self.assertEqual(ring_[0], ring_[-1])
            for x, y in ring_:
                self.assertTrue(math.isfinite(x) and math.isfinite(y))
        # Independently re-measure with Shapely.
        before_poly = Polygon(
            [(x, y) for x, y in outer],
            [[(x, y) for x, y in hole]],
        )
        after_outer = [(x, y) for x, y in after["polygons"][0][0]]
        after_hole = [(x, y) for x, y in after["polygons"][0][1]]
        after_poly = Polygon(after_outer, [after_hole])
        self.assertTrue(after_poly.is_valid)
        self.assertLessEqual(
            before_poly.hausdorff_distance(after_poly), TOL + 1e-8
        )


class ToleranceZeroTests(unittest.TestCase):
    def test_tolerance_zero_is_geometrically_unchanged(self):
        outer = circle_ring(0.0, 0.0, 5.0, 96)
        hole = rectangle(-1, -1, 1, 1)
        doc = make_doc({"water": [make_feature("w", [[outer, hole]])]})
        out, measurements = packed(doc, 0.0)
        feat = out["layers"]["water"][0]
        self.assertEqual(feat["polygons"], doc["layers"]["water"][0]["polygons"])
        stats = measurements["layers"]["water"]
        self.assertEqual(stats["features_unchanged"], 1)
        self.assertEqual(stats["features_simplified"], 0)
        self.assertEqual(stats["features_fallback"], 0)
        self.assertEqual(stats["removed_vertices"], 0)
        self.assertEqual(stats["max_hausdorff_m"], 0.0)


class InvalidOriginalTests(unittest.TestCase):
    def test_bowtie_falls_back_unchanged_without_repair(self):
        # Self-intersecting bowtie: invalid, but must never be "fixed".
        bowtie = ring([(0, 0), (10, 10), (10, 0), (0, 10)])
        self.assertFalse(Polygon([(x, y) for x, y in bowtie]).is_valid)
        doc = make_doc({"buildings": [make_feature("bad", [[bowtie]])]})
        out, measurements = packed(doc)
        feat = out["layers"]["buildings"][0]
        self.assertEqual(feat["polygons"], [[bowtie]])
        stats = measurements["layers"]["buildings"]
        self.assertEqual(stats["features_fallback"], 1)
        self.assertEqual(stats["features_invalid_original"], 1)
        self.assertEqual(stats["features_simplified"], 0)
        self.assertEqual(stats["input"]["vertices"],
                         stats["output"]["vertices"])
        self.assertEqual(stats["fallback_reasons"]["invalid_original"], 1)
        # The output geometry is still the invalid original, not repaired.
        again = Polygon([(x, y) for x, y in feat["polygons"][0][0]])
        self.assertFalse(again.is_valid)

    def test_invalid_polygon_alongside_valid_feature_isolated(self):
        bowtie = ring([(0, 0), (4, 4), (4, 0), (0, 4)])
        dense = circle_ring(20, 20, 3, 80)
        doc = make_doc({"roads": [
            make_feature("ok", [[dense]]),
            make_feature("broken", [[bowtie]]),
        ]})
        out, measurements = packed(doc)
        roads = out["layers"]["roads"]
        self.assertEqual(roads[0]["id"], "collection:ok")
        self.assertEqual(roads[1]["id"], "collection:broken")
        self.assertEqual(roads[1]["polygons"], [[bowtie]])
        stats = measurements["layers"]["roads"]
        self.assertEqual(stats["features_fallback"], 1)
        self.assertEqual(stats["features_simplified"], 1)
        self.assertEqual(stats["features_invalid_original"], 1)
        self.assertEqual(stats["features_valid_original"], 1)


class ThinGeometryTests(unittest.TestCase):
    def test_thin_hole_is_never_dropped(self):
        outer = rectangle(0, 0, 20, 20)
        # 2 mm wide, 4 m long slit hole: far below the 0.05 m tolerance.
        thin_hole = ring([
            (8.0, 7.999), (12.0, 7.999), (12.0, 8.001), (8.0, 8.001)
        ])
        doc = make_doc({"buildings": [
            make_feature("thin-hole", [[outer, thin_hole]])
        ]})
        out, measurements = packed(doc)
        feat = out["layers"]["buildings"][0]
        stats = measurements["layers"]["buildings"]
        # Feature, polygon and hole all survive: slit never deleted.
        self.assertEqual(len(feat["polygons"]), 1)
        self.assertEqual(len(feat["polygons"][0]), 2)
        hole_after = feat["polygons"][0][1]
        self.assertEqual(hole_after[0], hole_after[-1])
        self.assertGreaterEqual(
            len({(x, y) for x, y in hole_after}), 3
        )
        if stats["features_fallback"]:
            # If simplification would be unsafe, exact fallback wins.
            self.assertEqual(feat["polygons"], [[outer, thin_hole]])
        else:
            # Every retained vertex existed in the source ring.
            for point in hole_after:
                self.assertIn(
                    tuple(point), {tuple(p) for p in thin_hole}
                )
            self.assertLessEqual(stats["max_hausdorff_m"], TOL + 1e-8)

    def test_thin_bridge_deck_polygon_preserved(self):
        # Narrow 3 cm bridge deck with several densified long edges.
        pts = []
        for i in range(12):
            pts.append((i * 0.5, 0.0))
        for i in range(12):
            pts.append((5.5 - i * 0.5, 0.03))
        deck = ring(pts)
        props = {
            "status": "present",
            "type_overbruggingsdeel": "dek",
            "relatieve_hoogteligging": 1,
        }
        doc = make_doc({"bridges": [
            make_feature("bridge-dek", [[deck]], properties=props)
        ]})
        out, _ = packed(doc)
        feat = out["layers"]["bridges"][0]
        self.assertEqual(feat["id"], "collection:bridge-dek")
        self.assertEqual(feat["properties"]["type_overbruggingsdeel"], "dek")
        self.assertEqual(len(feat["polygons"]), 1)
        self.assertGreaterEqual(len(feat["polygons"][0]), 1)
        # Deck still occupies its original extent in projected metres.
        self.assertEqual(feat["bounds"][0], 0.0)
        self.assertEqual(feat["bounds"][2], 5.5)


class MalformedInputTests(unittest.TestCase):
    def _doc_with_feature(self, feature):
        doc = make_doc({"roads": [feature]})
        return doc

    def test_nan_coordinate_rejected_with_feature_id(self):
        bad = make_feature("nan-feat", [[rectangle(0, 0, 1, 1)]])
        bad["polygons"][0][0][1] = [float("nan"), 0.0]
        doc = self._doc_with_feature(bad)
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(doc)
        self.assertIn("nan-feat", str(ctx.exception))

    def test_infinity_coordinate_rejected_with_feature_id(self):
        bad = make_feature("inf-feat", [[rectangle(0, 0, 1, 1)]])
        bad["polygons"][0][0][2] = [1.0, float("inf")]
        doc = self._doc_with_feature(bad)
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(doc)
        self.assertIn("inf-feat", str(ctx.exception))

    def test_malformed_coordinate_pair_rejected(self):
        bad = make_feature("pair-feat", [[rectangle(0, 0, 1, 1)]])
        bad["polygons"][0][0][1] = [1.0]
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(self._doc_with_feature(bad))
        self.assertIn("pair-feat", str(ctx.exception))

    def test_unclosed_ring_rejected(self):
        bad = make_feature("open-feat", [[[0, 0], [1, 0], [1, 1], [0, 1]]])
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(self._doc_with_feature(bad))
        self.assertIn("open-feat", str(ctx.exception))

    def test_missing_layer_rejected(self):
        doc = make_doc()
        del doc["layers"]["roads"]
        with self.assertRaises(pack.InputFormatError):
            packed(doc)

    def test_missing_id_rejected(self):
        bad = make_feature("x", [rectangle(0, 0, 1, 1)])
        del bad["id"]
        with self.assertRaises(pack.InputFormatError):
            packed(self._doc_with_feature(bad))


class DeterminismTests(unittest.TestCase):
    def setUp(self):
        self.doc = make_doc({
            "water": [
                make_feature("w", [[circle_ring(0, 0, 4, 100)]])
            ],
            "buildings": [
                make_feature("b", [[rectangle(0, 0, 2, 2)]]),
            ],
        })

    def test_json_bytes_deterministic_and_compact_sorted(self):
        out_a, _ = packed(self.doc)
        out_b, _ = packed(self.doc)
        bytes_a = pack.encode_json(out_a)
        bytes_b = pack.encode_json(out_b)
        self.assertEqual(bytes_a, bytes_b)
        # Compact + sorted keys: re-encoding with the same canonical recipe is
        # byte-identical (string contents cannot inject whitespace).
        recanon = json.dumps(
            json.loads(bytes_a),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        self.assertEqual(recanon, bytes_a)
        self.assertTrue(bytes_a.startswith(b'{"bbox":'))

    def test_gzip_bytes_deterministic_and_lossless(self):
        out, _ = packed(self.doc)
        payload = pack.encode_json(out)
        gz_a = pack.gzip_deterministic(payload)
        gz_b = pack.gzip_deterministic(payload)
        self.assertEqual(gz_a, gz_b)
        self.assertEqual(gzip.decompress(gz_a), payload)
        # gzip header: magic, then mtime bytes 4:8 must be zero.
        self.assertEqual(gz_a[:2], b"\x1f\x8b")
        self.assertEqual(gz_a[4:8], b"\x00\x00\x00\x00")

    def test_repacked_limitations_are_not_duplicated(self):
        out, _ = packed(self.doc)
        out2, _ = packed(out)
        marks = [
            x for x in out2["source"]["limitations"]
            if x.startswith("Derivative asset:")
        ]
        self.assertEqual(len(marks), 1)


class EmptyLayersTests(unittest.TestCase):
    def test_empty_layers_pack_cleanly(self):
        out, measurements = packed(make_doc())
        self.assertEqual(
            {name: out["layers"][name] for name in pack.LAYER_NAMES},
            {name: [] for name in pack.LAYER_NAMES},
        )
        totals = pack._totals(measurements)
        self.assertEqual(totals["input"]["features"], 0)
        self.assertEqual(totals["output"]["vertices"], 0)
        self.assertEqual(pack.encode_json(out)[:1], b"{")


class RealSampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(SAMPLE, "rb") as handle:
            cls.raw = handle.read()
        cls.doc = json.loads(cls.raw.decode("utf-8"))

    def test_sample_is_the_real_non_empty_53_feature_subset(self):
        total = sum(len(self.doc["layers"][n]) for n in pack.LAYER_NAMES)
        self.assertEqual(total, 53)

    def test_preservation_and_measured_error_on_real_sample(self):
        out, measurements = packed(self.doc)
        totals = pack._totals(measurements)
        self.assertEqual(totals["input"]["features"], 53)
        self.assertEqual(totals["output"]["features"], 53)
        # No polygon or ring may disappear.
        self.assertEqual(
            totals["input"]["polygons"], totals["output"]["polygons"]
        )
        self.assertEqual(totals["input"]["rings"], totals["output"]["rings"])
        self.assertLessEqual(
            totals["max_hausdorff_m"], TOL + 1e-8
        )
        self.assertIs(out["source"]["complete"], False)
        for name in pack.LAYER_NAMES:
            before, after = self.doc["layers"][name], out["layers"][name]
            self.assertEqual([f["id"] for f in before],
                             [f["id"] for f in after])
            for bf, af in zip(before, after):
                self.assertEqual(bf["sourceId"], af["sourceId"])
                self.assertEqual(bf["localId"], af["localId"])
                self.assertEqual(bf["properties"], af["properties"])
                self.assertEqual(
                    [len(p) for p in bf["polygons"]],
                    [len(p) for p in af["polygons"]],
                )
                allowed = {
                    (x, y)
                    for polygon in bf["polygons"]
                    for ring_ in polygon
                    for x, y in ring_
                }
                for bp, ap in zip(bf["polygons"], af["polygons"]):
                    for bring_, aring_ in zip(bp, ap):
                        self.assertEqual(aring_[0], aring_[-1])
                        for x, y in aring_:
                            self.assertIn((x, y), allowed)
                        # Survivors keep the original cyclic winding and
                        # order as a cyclic subsequence (duplicate input
                        # coordinates allowed).
                        self.assertTrue(
                            is_cyclic_subsequence(bring_[:-1], aring_[:-1]),
                            "output ring broke original cyclic vertex order",
                        )
                xs = [x for p in af["polygons"] for r in p for x, _ in r]
                ys = [y for p in af["polygons"] for r in p for _, y in r]
                self.assertEqual(
                    af["bounds"], [min(xs), min(ys), max(xs), max(ys)]
                )

    def test_cli_end_to_end_on_real_sample(self):
        with tempfile.TemporaryDirectory() as tmp:
            j = os.path.join(tmp, "out.json")
            g = os.path.join(tmp, "out.json.gz")
            a = os.path.join(tmp, "audit.json")
            proc = subprocess.run(
                [
                    sys.executable, os.path.join(HERE, "pack_geo.py"),
                    "--input", SAMPLE,
                    "--json", j,
                    "--gzip", g,
                    "--audit", a,
                    "--tolerance", "0.05",
                ],
                capture_output=True,
                text=True,
                cwd=HERE,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            with open(j, "rb") as handle:
                json_bytes = handle.read()
            with open(g, "rb") as handle:
                gz_bytes = handle.read()
            with open(a, encoding="utf-8") as handle:
                audit = json.load(handle)
            parsed = json.loads(json_bytes.decode("utf-8"))
            total = sum(
                len(parsed["layers"][n]) for n in pack.LAYER_NAMES
            )
            self.assertEqual(total, 53)
            # Audit hashes/sizes describe the actual files.
            self.assertEqual(audit["input"]["bytes"], len(self.raw))
            self.assertEqual(
                audit["input"]["sha256"],
                hashlib.sha256(self.raw).hexdigest(),
            )
            self.assertEqual(audit["output"]["json"]["bytes"],
                             len(json_bytes))
            self.assertEqual(
                audit["output"]["json"]["sha256"],
                hashlib.sha256(json_bytes).hexdigest(),
            )
            self.assertEqual(
                audit["output"]["gzip"]["sha256"],
                hashlib.sha256(gz_bytes).hexdigest(),
            )
            self.assertTrue(audit["output"]["gunzip_matches_json"])
            self.assertEqual(gzip.decompress(gz_bytes), json_bytes)
            self.assertLessEqual(
                audit["totals"]["max_hausdorff_m"], TOL + 1e-8
            )
            self.assertEqual(audit["totals"]["input"]["features"], 53)
            self.assertEqual(
                audit["totals"]["output"]["features"],
                audit["totals"]["input"]["features"],
            )
            self.assertIs(audit["source"]["complete"], False)
            self.assertGreaterEqual(audit["performance"]["elapsed_seconds"], 0)
            limitations = " ".join(audit["source"]["limitations"])
            self.assertIn("inter-feature network continuity", limitations)

    def test_cli_rejects_malformed_file_with_feature_id(self):
        bad = make_doc({"roads": [
            make_feature("cli-bad", [[rectangle(0, 0, 1, 1)]])
        ]})
        bad["layers"]["roads"][0]["polygons"][0][0][0] = [
            float("nan"), 0.0
        ]
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "bad.json")
            with open(src, "w", encoding="utf-8") as handle:
                json.dump(bad, handle)  # emits literal NaN
            proc = subprocess.run(
                [
                    sys.executable, os.path.join(HERE, "pack_geo.py"),
                    "--input", src,
                    "--json", os.path.join(tmp, "o.json"),
                    "--gzip", os.path.join(tmp, "o.json.gz"),
                    "--audit", os.path.join(tmp, "a.json"),
                ],
                capture_output=True,
                text=True,
                cwd=HERE,
            )
            self.assertEqual(proc.returncode, 2)
            self.assertIn("cli-bad", proc.stderr)

    def test_cli_rejects_bad_tolerance(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = subprocess.run(
                [
                    sys.executable, os.path.join(HERE, "pack_geo.py"),
                    "--input", SAMPLE,
                    "--json", os.path.join(tmp, "o.json"),
                    "--gzip", os.path.join(tmp, "o.json.gz"),
                    "--audit", os.path.join(tmp, "a.json"),
                    "--tolerance", "5",
                ],
                capture_output=True,
                text=True,
                cwd=HERE,
            )
            self.assertNotEqual(proc.returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)

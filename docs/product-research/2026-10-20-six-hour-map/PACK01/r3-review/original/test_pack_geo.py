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
from shapely.geometry import Polygon, box
from shapely.strtree import STRtree

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
            self.assertIn("Shared seam vertices are locked", limitations)
            self.assertIn("shared_boundaries", audit)
            self.assertGreaterEqual(
                audit["shared_boundaries"]["min_seam_length_m"], 0.0
            )

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


class StrictSchemaTests(unittest.TestCase):
    """Frozen v1 required-schema checks the original packer accepted."""

    def _reject(self, mutate, *, fragment=None):
        doc = make_doc({"roads": [
            make_feature("schema-feat", [[rectangle(0, 0, 1, 1)]])
        ]})
        mutate(doc)
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(doc)
        message = str(ctx.exception)
        if fragment is not None:
            self.assertIn(fragment, message)
        return message

    def test_ring_with_two_distinct_vertices_rejected(self):
        # Parent probe: [[0,0],[1,0],[0,0],[1,0],[0,0]] is closed and long
        # enough but has only 2 distinct vertices.
        bad = make_feature("two-verts", [
            [[[0, 0], [1, 0], [0, 0], [1, 0], [0, 0]]]
        ])
        doc = make_doc({"roads": [bad]})
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(doc)
        self.assertIn("two-verts", str(ctx.exception))
        self.assertIn("distinct", str(ctx.exception))

    def test_string_completeness_rejected(self):
        def mutate(doc):
            doc["source"]["complete"] = "false"
        self._reject(mutate, fragment="complete")

    def test_boolean_complete_true_is_accepted_and_preserved(self):
        doc = make_doc()
        doc["source"]["complete"] = True
        out, _ = packed(doc)
        self.assertIs(out["source"]["complete"], True)

    def test_wrong_projection_type_rejected(self):
        def mutate(doc):
            doc["projection"]["type"] = "web-mercator"
        self._reject(mutate, fragment="projection.type")

    def test_missing_projection_field_rejected(self):
        def mutate(doc):
            del doc["projection"]["radiusMeters"]
        self._reject(mutate, fragment="radiusMeters")

    def test_non_positive_dimensions_rejected(self):
        def mutate(doc):
            doc["width"] = 0.0
        self._reject(mutate, fragment="width/height")

    def test_misordered_bbox_rejected(self):
        def mutate(doc):
            doc["bbox"] = [4.92, 52.36, 4.90, 52.38]
        self._reject(mutate, fragment="bbox")

    def test_missing_required_source_field_rejected(self):
        def mutate(doc):
            del doc["source"]["license"]
        self._reject(mutate, fragment="source.license")

    def test_malformed_source_input_rejected(self):
        def mutate(doc):
            doc["source"]["inputs"][0]["sha256"] = ""
        self._reject(mutate, fragment="sha256")

    def test_bounds_required_and_ordered(self):
        bad = make_feature("no-bounds", [[rectangle(0, 0, 1, 1)]])
        del bad["bounds"]
        with self.assertRaises(pack.InputFormatError):
            packed(make_doc({"roads": [bad]}))
        bad2 = make_feature("bad-bounds", [[rectangle(0, 0, 1, 1)]])
        bad2["bounds"] = [1.0, 1.0, 0.0, 0.0]
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(make_doc({"roads": [bad2]}))
        self.assertIn("bounds", str(ctx.exception))

    def test_localId_must_be_string_or_null(self):
        bad = make_feature("lid", [[rectangle(0, 0, 1, 1)]])
        bad["localId"] = 7
        with self.assertRaises(pack.InputFormatError) as ctx:
            packed(make_doc({"roads": [bad]}))
        self.assertIn("localId", str(ctx.exception))

    def test_sourceId_required(self):
        bad = make_feature("sid", [[rectangle(0, 0, 1, 1)]])
        del bad["sourceId"]
        with self.assertRaises(pack.InputFormatError):
            packed(make_doc({"roads": [bad]}))

    def test_structurally_valid_bowtie_is_not_a_schema_error(self):
        # Structural invalidity and GEOS-invalid source are different
        # categories: a bowtie is structurally sound and must reach the
        # geometry stage and fall back unchanged.
        bowtie = ring([(0, 0), (10, 10), (10, 0), (0, 10)])
        feat = make_feature("bowtie-struct", [[bowtie]])
        out, measurements = packed(make_doc({"roads": [feat]}))
        self.assertEqual(
            out["layers"]["roads"][0]["polygons"], [[bowtie]]
        )
        self.assertEqual(
            measurements["layers"]["roads"]["features_invalid_original"], 1
        )


def subdivided_rect(x0, y0, x1, y1, shared=(), shared_side="right"):
    """CCW axis-aligned rectangle with collinear subdivisions.

    ``shared`` lists intermediate y coordinates along one vertical edge
    (the future shared seam); every other edge carries interior collinear
    points that Douglas-Peucker removes at any positive tolerance.
    """
    def along(ax, ay, bx, by, steps=4):
        return [
            (ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
            for i in range(1, steps)
        ]

    pts = [(x0, y0)]
    if shared_side == "left":
        for y in shared:
            pts.append((x0, float(y)))
        pts.append((x0, y1))
        pts.extend(along(x0, y1, x1, y1))
        pts.append((x1, y1))
        pts.extend(along(x1, y1, x1, y0))
        pts.append((x1, y0))
        pts.extend(along(x1, y0, x0, y0))
    else:
        pts.extend(along(x0, y0, x0, y1))
        pts.append((x0, y1))
        pts.extend(along(x0, y1, x1, y1))
        pts.append((x1, y1))
        for y in reversed(list(shared)):
            pts.append((x1, float(y)))
        pts.append((x1, y0))
        pts.extend(along(x1, y0, x0, y0))
    return ring([(float(x), float(y)) for x, y in pts])


class SharedBoundarySyntheticTests(unittest.TestCase):
    def _adjacent_doc(self):
        seam_y = [5.0, 10.0, 15.0]
        # Dense shared edge on the left tile only; the right tile offers a
        # straight edge, exercising T-junction seam locking.
        left = subdivided_rect(
            0, 0, 10, 20, shared=seam_y, shared_side="right"
        )
        right = subdivided_rect(
            10, 0, 20, 20, shared=(), shared_side="left"
        )
        return (
            make_doc({"roads": [
                make_feature("road-a", [[left]]),
                make_feature("road-b", [[right]]),
            ]}),
            seam_y,
        )

    def test_shared_seam_is_locked_exactly_on_both_sides(self):
        doc, seam_y = self._adjacent_doc()
        out, measurements = packed(doc)
        feats = out["layers"]["roads"]
        a_after, b_after = feats[0]["polygons"], feats[1]["polygons"]

        # Both features actually simplified (non-shared collinear points
        # dropped), so this proves the lock works against simplification.
        stats = measurements["layers"]["roads"]
        self.assertEqual(stats["features_simplified"], 2)
        self.assertGreaterEqual(
            measurements["shared_boundaries"]["pairs"], 1
        )
        self.assertGreater(
            measurements["shared_boundaries"]["locked_vertices"], 0
        )

        a_ring = {(x, y) for x, y in a_after[0][0]}
        b_ring = {(x, y) for x, y in b_after[0][0]}
        # The dense side keeps every seam vertex; the straight side keeps
        # the endpoints that delimit the same geometric seam.
        for y in [0.0] + seam_y + [20.0]:
            self.assertIn((10.0, y), a_ring)
        self.assertIn((10.0, 0.0), b_ring)
        self.assertIn((10.0, 20.0), b_ring)

        ga_before = pack._feature_multipolygon(
            doc["layers"]["roads"][0]["polygons"]
        )
        gb_before = pack._feature_multipolygon(
            doc["layers"]["roads"][1]["polygons"]
        )
        ga = pack._feature_multipolygon(a_after)
        gb = pack._feature_multipolygon(b_after)
        seam = ga_before.boundary.intersection(gb_before.boundary)
        self.assertGreaterEqual(seam.length, 20.0 - 1e-9)
        # Exact shared seam geometry survives on both packed boundaries.
        self.assertTrue(seam.difference(ga.boundary).is_empty)
        self.assertTrue(seam.difference(gb.boundary).is_empty)
        # Still touching along the full seam; interiors never overlap.
        after_seam = ga.boundary.intersection(gb.boundary)
        self.assertGreaterEqual(after_seam.length, 20.0 - 1e-9)
        self.assertLess(ga.intersection(gb).area, 1e-12)
        # No gap.
        self.assertEqual(ga.distance(gb), 0.0)

    def test_real_gap_between_disjoint_polygons_is_not_buffered_away(self):
        # Two dense tiles separated by a genuine 0.30 m gap. Each side can
        # move at most 0.05 m, so at least 0.199... m of separation must
        # remain and touching must not be invented.
        left = subdivided_rect(0, 0, 9.85, 20, shared_side="right")
        right = subdivided_rect(10.15, 0, 20, 20, shared_side="left")
        doc = make_doc({"roads": [
            make_feature("gap-a", [[left]]),
            make_feature("gap-b", [[right]]),
        ]})
        out, _ = packed(doc)
        ga = pack._feature_multipolygon(out["layers"]["roads"][0]["polygons"])
        gb = pack._feature_multipolygon(out["layers"]["roads"][1]["polygons"])
        self.assertFalse(ga.intersects(gb))
        self.assertGreater(ga.distance(gb), 0.30 - 2 * (TOL + 1e-8))
        self.assertEqual(
            out["layers"]["roads"][0]["id"], "collection:gap-a"
        )


class RealSharedBoundaryRegressionTests(unittest.TestCase):
    """62 real public BGT features (parent-shared-edge-failure evidence)."""

    @classmethod
    def setUpClass(cls):
        real_path = os.path.join(HERE, "real-pub-source.json")
        with open(real_path, "rb") as handle:
            cls.raw = handle.read()
        cls.before = json.loads(cls.raw.decode("utf-8"))
        cls.after, cls.measurements = pack.pack_document(cls.before, TOL)
        cls.before_geoms = {}
        cls.after_geoms = {}
        for layer_name in pack.LAYER_NAMES:
            b_layer = cls.before["layers"][layer_name]
            a_layer = cls.after["layers"][layer_name]
            for bf, af in zip(b_layer, a_layer):
                cls.before_geoms[bf["id"]] = (
                    pack._feature_multipolygon(bf["polygons"])
                )
                cls.after_geoms[af["id"]] = (
                    pack._feature_multipolygon(af["polygons"])
                )

    def test_all_62_features_and_cardinality_retained(self):
        before_total = sum(
            len(self.before["layers"][n]) for n in pack.LAYER_NAMES
        )
        after_total = sum(
            len(self.after["layers"][n]) for n in pack.LAYER_NAMES
        )
        self.assertEqual(before_total, 62)
        self.assertEqual(after_total, 62)
        for name in pack.LAYER_NAMES:
            self.assertEqual(
                [f["id"] for f in self.before["layers"][name]],
                [f["id"] for f in self.after["layers"][name]],
            )

    def test_seams_were_detected_and_locked(self):
        shared = self.measurements["shared_boundaries"]
        self.assertGreaterEqual(shared["pairs"], 3)
        self.assertGreater(shared["locked_vertices"], 0)

    def test_original_touching_pairs_remain_touching_with_exact_seams(self):
        # Every original shared seam (lineal boundary intersection >= 1 mm)
        # must remain exactly covered by both packed boundaries and keep its
        # length: no uncovered sliver gap may open along a shared border.
        ids = list(self.before_geoms)
        geoms = [self.before_geoms[i] for i in ids]
        tree = STRtree(geoms)
        checked = 0
        for i, geom in enumerate(geoms):
            for j in tree.query(geom, predicate="intersects"):
                if int(j) <= i:
                    continue
                other = geoms[int(j)]
                parts = pack._lineal_parts(
                    geom.boundary.intersection(other.boundary)
                )
                length = sum(p.length for p in parts)
                if length < 1e-3:
                    continue
                checked += 1
                ga = self.after_geoms[ids[i]]
                gb = self.after_geoms[ids[int(j)]]
                for part in parts:
                    self.assertTrue(
                        part.difference(ga.boundary).is_empty,
                        f"seam lost on {ids[i]} (len {part.length})",
                    )
                    self.assertTrue(
                        part.difference(gb.boundary).is_empty,
                        f"seam lost on {ids[int(j)]} (len {part.length})",
                    )
                after_parts = pack._lineal_parts(
                    ga.boundary.intersection(gb.boundary)
                )
                after_length = sum(p.length for p in after_parts)
                self.assertGreaterEqual(
                    after_length, length - 1e-6,
                    f"{ids[i]} ~ {ids[int(j)]}: {length} -> {after_length}",
                )
                self.assertEqual(ga.distance(gb), 0.0)
        self.assertGreaterEqual(checked, 3)

    def test_no_new_overlaps_open_across_real_gaps(self):
        # Pairs that were genuinely disjoint with more than 2x the maximum
        # per-side movement between them cannot intersect after packing.
        ids = list(self.before_geoms)
        geoms = [self.before_geoms[i] for i in ids]
        tree = STRtree(geoms)
        limit = 2 * (TOL + 1e-8)
        checked = 0
        for i, geom in enumerate(geoms):
            # Expand the spatial-index query envelope by 0.25 m to find
            # genuinely disjoint neighbours close enough to be relevant.
            minx, miny, maxx, maxy = geom.bounds
            query_box = box(minx - 0.25, miny - 0.25,
                            maxx + 0.25, maxy + 0.25)
            for j in tree.query(query_box, predicate="intersects"):
                if int(j) <= i:
                    continue
                other = geoms[int(j)]
                if geom.intersects(other):
                    continue
                gap = geom.distance(other)
                if gap <= limit:
                    continue
                checked += 1
                ga = self.after_geoms[ids[i]]
                gb = self.after_geoms[ids[int(j)]]
                self.assertFalse(
                    ga.intersects(gb),
                    f"new overlap invented between {ids[i]} and "
                    f"{ids[int(j)]} across a {gap:.4f} m gap",
                )
                self.assertGreaterEqual(ga.distance(gb), gap - limit - 1e-9)
        # The real subset contains such genuinely separated neighbours.
        self.assertGreater(checked, 0)

    def test_parent_evidence_adjacencies_are_restored(self):
        evidence = [
            ("wegdeel:b5910e46-8d27-5ba7-982d-41b311e24e21",
             "wegdeel:c7384aed-c91b-5319-8622-737e9c5a7d40",
             11.972785306686028),
            ("wegdeel:a875e61c-e42f-51b0-b6b1-12894e79f887",
             "wegdeel:b5910e46-8d27-5ba7-982d-41b311e24e21",
             5.7176278297908025),
            ("overbruggingsdeel:8b1d9302-4306-51af-ae31-9b60532e81c5",
             "wegdeel:a15ae580-47f7-5e24-a635-14dc17ea2701",
             1.2735101098930814),
        ]
        for a, b, original_length in evidence:
            self.assertIn(a, self.after_geoms)
            self.assertIn(b, self.after_geoms)
            ga, gb = self.after_geoms[a], self.after_geoms[b]
            parts = pack._lineal_parts(
                ga.boundary.intersection(gb.boundary)
            )
            length = sum(p.length for p in parts)
            self.assertGreaterEqual(
                length, original_length - 1e-6,
                f"{a} ~ {b}: {length} < {original_length}",
            )
            self.assertEqual(ga.distance(gb), 0.0)

    def test_max_hausdorff_still_within_tolerance(self):
        totals = pack._totals(self.measurements)
        self.assertLessEqual(totals["max_hausdorff_m"], TOL + 1e-8)
        self.assertEqual(
            totals["input"]["polygons"], totals["output"]["polygons"]
        )
        self.assertEqual(
            totals["input"]["rings"], totals["output"]["rings"]
        )


# --------------------------------------------------------------------------- #
# PACK01 R3: mixed Point/LineString contacts, pure point contacts and nearby
# neighbour geometry. R2 locked shared lineal seams but `_lineal_parts`
# dropped Point members of boundary intersections, and candidates were never
# validated against neighbouring features: shallow pinch points removed on
# only one side let independent Douglas-Peucker chords cross and enclose new
# area (0 -> positive m^2 overlap) while nearby simplifications could close
# genuine gaps.
# --------------------------------------------------------------------------- #
def densify(points, steps=3):
    """Insert exactly collinear interior points on every segment."""
    out = [points[0]]
    for start, end in zip(points, points[1:]):
        for k in range(1, steps):
            out.append((
                start[0] + (end[0] - start[0]) * k / steps,
                start[1] + (end[1] - start[1]) * k / steps,
            ))
        out.append(end)
    return out


def strip_polygon(top_chain_east_to_west, x0, x1, ybottom=0.0):
    """CCW polygon whose TOP boundary is the supplied chain (east->west)."""
    pts = [(x0, ybottom), (x1, ybottom)]
    pts.extend([(float(x), float(y)) for x, y in top_chain_east_to_west])
    return ring(pts)


def strip_polygon_above(bottom_chain_west_to_east, x0, x1, ytop=20.0):
    """CCW polygon whose BOTTOM boundary is the supplied chain (west->east)."""
    pts = [(float(x), float(y)) for x, y in bottom_chain_west_to_east]
    pts.extend([(x1, ytop), (x0, ytop)])
    return ring(pts)


class PurePointContactSyntheticTests(unittest.TestCase):
    """Two strips that touch ONLY at isolated vertices (pinch contacts).

    The shared pinch points are shallow (<= 0.05 m): per-ring Douglas-Peucker
    drops them on one ring while the other ring keeps them because its global
    ring geometry evaluates the same point against a different long chord.
    R2 produced a triangular overlap; the contacts must be locked so both
    strips still simplify everywhere else and keep touching at zero area.
    """

    def _doc(self):
        # A: lower strip, top edge bows slightly DOWN through shared pinches
        # L, P, M. P is only 0.035 m off the L-M chord, so DP drops it.
        a_top_east_west = list(reversed(densify([
            (0.0, 10.0), (25.0, 9.9825), (50.0, 9.965),
            (75.0, 9.9825), (100.0, 10.0),
        ])))
        a_ring = strip_polygon(a_top_east_west, 0.0, 100.0, ybottom=0.0)
        # B: upper strip; its bottom edge starts far to the west on a sloped
        # run, shares exactly L/P/M, then continues east slightly above 10.
        # The global chord W-E makes P a > 0.05 m deviation, so DP keeps P
        # even though the same coordinate is dropped by A under R2.
        b_bottom = densify([
            (-100.0, 10.2), (0.0, 10.0), (25.0, 9.9845), (50.0, 9.965),
            (75.0, 9.9845), (100.0, 10.0), (200.0, 10.002),
        ])
        b_ring = strip_polygon_above(b_bottom, -100.0, 200.0, ytop=20.0)
        return make_doc({"roads": [
            make_feature("pinch-lower", [[a_ring]]),
            make_feature("pinch-upper", [[b_ring]]),
        ]})

    def test_source_is_valid_disjoint_and_only_point_touching(self):
        doc = self._doc()
        ga = pack._feature_multipolygon(doc["layers"]["roads"][0]["polygons"])
        gb = pack._feature_multipolygon(doc["layers"]["roads"][1]["polygons"])
        self.assertTrue(ga.is_valid and gb.is_valid)
        self.assertEqual(ga.intersection(gb).area, 0.0)
        contact = ga.boundary.intersection(gb.boundary)
        point_parts = pack._point_parts(contact)
        lineal = pack._lineal_parts(contact)
        self.assertEqual(len(lineal), 0)
        self.assertGreaterEqual(len(point_parts), 3)

    def test_pinches_kept_no_overlap_both_features_still_simplify(self):
        doc = self._doc()
        out, measurements = packed(doc)
        stats = measurements["layers"]["roads"]
        ga = pack._feature_multipolygon(out["layers"]["roads"][0]["polygons"])
        gb = pack._feature_multipolygon(out["layers"]["roads"][1]["polygons"])
        # The R2 defect: crossing independent chords enclose new area.
        self.assertEqual(ga.intersection(gb).area, 0.0)
        for x, y in ((0.0, 10.0), (50.0, 9.965), (100.0, 10.0)):
            from shapely.geometry import Point
            p = Point(x, y)
            self.assertTrue(p.intersects(ga.boundary), f"lost {x},{y}")
            self.assertTrue(p.intersects(gb.boundary), f"lost {x},{y}")
        self.assertEqual(ga.distance(gb), 0.0)
        # The fix must not be achieved by giving up on simplification: the
        # collinear densification is removed on both features.
        self.assertEqual(stats["features_simplified"], 2)
        self.assertGreater(stats["removed_vertices"], 0)
        self.assertLessEqual(stats["max_hausdorff_m"], TOL + 1e-8)

    def test_output_vertices_remain_source_subset(self):
        doc = self._doc()
        out, _ = packed(doc)
        for bf, af in zip(doc["layers"]["roads"], out["layers"]["roads"]):
            allowed = {
                (x, y)
                for poly in bf["polygons"]
                for r in poly for x, y in r
            }
            for poly in af["polygons"]:
                for r in poly:
                    for x, y in r:
                        self.assertIn((x, y), allowed)


class NearNeighbourGapGuardTests(unittest.TestCase):
    """Nearby disjoint polygons whose independent chords bridge a real gap.

    The lower strip cuts a <= 0.05 m valley (chord moves up), the upper strip
    keeps a 0.07 m sag and cuts its shallow shoulders (chord moves down):
    each stays within its own Hausdorff budget, yet the chords overlap. There
    is no shared vertex to lock, so the only safe response is to keep BOTH
    complete original features unchanged.
    """

    def _doc(self):
        # Lower edge dips 0.03 m (within DP budget -> chord moves up).
        a_top = list(reversed(densify([
            (0.0, 0.9), (30.0, 0.87), (55.0, 0.87), (70.0, 0.89),
            (100.0, 0.9),
        ])))
        a_ring = strip_polygon(a_top, 0.0, 100.0, ybottom=-10.0)
        # Upper edge sags 0.065 m (beyond DP budget -> sag vertices survive,
        # shoulders cut -> chord moves down). Every original B point stays at
        # least 0.015 m above A, but the cut chords cross near x = 35/65.
        b_bottom = densify([
            (0.0, 0.95), (45.0, 0.885), (55.0, 0.885), (100.0, 0.95),
        ])
        b_ring = strip_polygon_above(b_bottom, 0.0, 100.0, ytop=10.95)
        return make_doc({"roads": [
            make_feature("valley-lower", [[a_ring]]),
            make_feature("sag-upper", [[b_ring]]),
        ]})

    def test_source_valid_disjoint_with_small_gap(self):
        doc = self._doc()
        ga = pack._feature_multipolygon(doc["layers"]["roads"][0]["polygons"])
        gb = pack._feature_multipolygon(doc["layers"]["roads"][1]["polygons"])
        self.assertTrue(ga.is_valid and gb.is_valid)
        self.assertGreater(ga.distance(gb), 0.0)
        self.assertLess(ga.distance(gb), 0.02)
        self.assertEqual(ga.intersection(gb).area, 0.0)

    def test_guard_keeps_both_complete_features_unchanged(self):
        doc = self._doc()
        out, measurements = packed(doc)
        stats = measurements["layers"]["roads"]
        before = doc["layers"]["roads"]
        after = out["layers"]["roads"]
        # Conservative whole-feature fallback: exact originals, no repair.
        for bf, af in zip(before, after):
            self.assertEqual(af["polygons"], bf["polygons"])
        ga = pack._feature_multipolygon(after[0]["polygons"])
        gb = pack._feature_multipolygon(after[1]["polygons"])
        self.assertEqual(ga.intersection(gb).area, 0.0)
        self.assertEqual(stats["features_fallback"], 2)
        self.assertEqual(stats["features_simplified"], 0)
        self.assertEqual(
            stats["input"]["vertices"], stats["output"]["vertices"]
        )
        reasons = stats["fallback_reasons"]
        self.assertTrue(
            any("neighbour" in key or "contact" in key
                for key in reasons),
            reasons,
        )


class MixedLineAndPointContactSyntheticTests(unittest.TestCase):
    """Shared lineal run with T-junction, then isolated pinch, then run."""

    def _doc(self):
        # A east edge (bottom -> top): exact run to y=8, shallow weave through
        # pinch (10,10), exact run again. A carries dense seam vertices.
        a_east = densify([
            (10.0, 0.0), (10.0, 4.0), (10.0, 8.0), (9.97, 9.0),
            (10.0, 10.0), (9.97, 11.0), (10.0, 12.0), (10.0, 16.0),
            (10.0, 20.0),
        ])
        a_pts = [(0.0, 0.0)]
        a_pts.extend(a_east)
        a_pts.extend([(0.0, 20.0)])
        a_ring = ring(a_pts)
        b_west = densify([
            (10.0, 0.0), (10.0, 8.0), (10.03, 9.0), (10.0, 10.0),
            (10.03, 11.0), (10.0, 12.0), (10.0, 20.0),
        ])
        b_pts = list(b_west)
        b_pts.extend([(20.0, 20.0), (20.0, 0.0)])
        b_ring = ring(b_pts)
        return make_doc({"roads": [
            make_feature("mix-a", [[a_ring]]),
            make_feature("mix-b", [[b_ring]]),
        ]})

    def test_runs_and_pinch_covered_without_overlap(self):
        doc = self._doc()
        ga0 = pack._feature_multipolygon(doc["layers"]["roads"][0]["polygons"])
        gb0 = pack._feature_multipolygon(doc["layers"]["roads"][1]["polygons"])
        self.assertEqual(ga0.intersection(gb0).area, 0.0)
        out, _ = packed(doc)
        ga = pack._feature_multipolygon(out["layers"]["roads"][0]["polygons"])
        gb = pack._feature_multipolygon(out["layers"]["roads"][1]["polygons"])
        self.assertEqual(ga.intersection(gb).area, 0.0)
        # Original lineal seam runs remain exactly covered on both sides.
        seam = ga0.boundary.intersection(gb0.boundary)
        for part in pack._lineal_parts(seam):
            if part.length >= 1e-6:
                self.assertTrue(part.difference(ga.boundary).is_empty)
                self.assertTrue(part.difference(gb.boundary).is_empty)
        # The isolated pinch contact survives on both boundaries.
        from shapely.geometry import Point
        pinch = Point(10.0, 10.0)
        self.assertTrue(pinch.intersects(ga.boundary))
        self.assertTrue(pinch.intersects(gb.boundary))
        self.assertEqual(ga.distance(gb), 0.0)


class RealMixedContactWitnessTests(unittest.TestCase):
    """Supplied public two-road source: 0 -> 0.000839872169558 m^2 in R2."""

    @classmethod
    def setUpClass(cls):
        here = HERE
        with open(os.path.join(here, "overlap-source.json"), "rb") as h:
            cls.src = json.loads(h.read().decode("utf-8"))
        with open(os.path.join(here, "overlap-packed-r2.json"), "rb") as h:
            cls.r2 = json.loads(h.read().decode("utf-8"))
        with open(os.path.join(here, "overlap-witness.json"), "rb") as h:
            cls.witness = json.loads(h.read().decode("utf-8"))
        cls.out, cls.measurements = pack.pack_document(cls.src, TOL)

    def _geoms(self, doc):
        a, b = doc["layers"]["roads"]
        return (
            pack._feature_multipolygon(a["polygons"]),
            pack._feature_multipolygon(b["polygons"]),
        )

    def test_supplied_r2_fixture_reproduces_the_confirmed_defect(self):
        # Pins the historical failure: the rejected R2 output itself carries
        # the positive overlap and the double-covered witness point.
        ga, gb = self._geoms(self.r2)
        area = ga.intersection(gb).area
        self.assertGreater(area, 1e-6)
        self.assertAlmostEqual(area, 0.0008398721695581202, places=12)
        from shapely.geometry import Point
        from shapely import wkt
        wx, wy = self.witness["witness_metres"]
        p = Point(wx, wy)
        self.assertEqual([ga.covers(p), gb.covers(p)], [True, True])
        packed_coll = wkt.loads(self.witness["packed_intersection_wkt"])
        self.assertGreater(
            sum(g.area for g in packed_coll.geoms if hasattr(g, "area")), 0.0
        )

    def test_real_pair_has_zero_intersection_area_in_output(self):
        ga0, gb0 = self._geoms(self.src)
        ga, gb = self._geoms(self.out)
        self.assertTrue(ga0.is_valid and gb0.is_valid)
        self.assertEqual(ga0.intersection(gb0).area, 0.0)
        self.assertEqual(ga.intersection(gb).area, 0.0)

    def test_real_pair_zero_area_after_translation_and_1000x_scale(self):
        # Parent methodology: rerun far from the world origin and at 1000x to
        # distinguish real overlap from large-coordinate float roundoff.
        from shapely import affinity
        ox, oy = self.witness["witness_metres"]
        ga, gb = self._geoms(self.out)
        ta = affinity.scale(
            affinity.translate(ga, -ox, -oy), xfact=1000.0, yfact=1000.0,
            origin=(0.0, 0.0),
        )
        tb = affinity.scale(
            affinity.translate(gb, -ox, -oy), xfact=1000.0, yfact=1000.0,
            origin=(0.0, 0.0),
        )
        self.assertEqual(ta.intersection(tb).area, 0.0)

    def test_witness_point_keeps_original_single_coverage(self):
        from shapely.geometry import Point
        wx, wy = self.witness["witness_metres"]
        p = Point(wx, wy)
        ga0, gb0 = self._geoms(self.src)
        ga, gb = self._geoms(self.out)
        self.assertEqual([ga0.covers(p), gb0.covers(p)], [False, True])
        self.assertEqual([ga.covers(p), gb.covers(p)], [False, True])

    def test_all_source_lineal_and_point_contacts_remain_covered(self):
        from shapely import wkt
        ga, gb = self._geoms(self.out)
        contact = wkt.loads(self.witness["source_shared_boundary_wkt"]).geoms
        n_line = n_point = 0
        for part in contact:
            kind = part.geom_type
            if kind in ("LineString", "MultiLineString"):
                if part.length >= 1e-6:
                    n_line += 1
                    self.assertTrue(
                        part.difference(ga.boundary).is_empty,
                        "lineal contact lost on road a",
                    )
                    self.assertTrue(
                        part.difference(gb.boundary).is_empty,
                        "lineal contact lost on road b",
                    )
            elif kind in ("Point", "MultiPoint"):
                pts = (part,) if kind == "Point" else part.geoms
                for p in pts:
                    n_point += 1
                    self.assertTrue(p.intersects(ga.boundary))
                    self.assertTrue(p.intersects(gb.boundary))
        self.assertGreaterEqual(n_line, 20)
        self.assertGreaterEqual(n_point, 10)
        self.assertEqual(ga.distance(gb), 0.0)

    def test_original_heights_and_identity_properties_preserved(self):
        src_props = self.witness["source_properties"]
        for feature in self.out["layers"]["roads"]:
            self.assertEqual(
                feature["properties"]["relatieve_hoogteligging"],
                src_props[feature["id"]]["relatieve_hoogteligging"],
            )
            self.assertEqual(feature["properties"], src_props[feature["id"]])
        self.assertEqual(
            [f["id"] for f in self.src["layers"]["roads"]],
            [f["id"] for f in self.out["layers"]["roads"]],
        )

    def test_output_is_deterministic_and_within_error_budget(self):
        out_b, _ = pack.pack_document(self.src, TOL)
        self.assertEqual(pack.encode_json(self.out), pack.encode_json(out_b))
        totals = pack._totals(self.measurements)
        self.assertLessEqual(totals["max_hausdorff_m"], TOL + 1e-8)
        self.assertEqual(
            totals["input"]["rings"], totals["output"]["rings"]
        )
        self.assertEqual(
            totals["input"]["polygons"], totals["output"]["polygons"]
        )
        self.assertIn("neighbour_validation", self.measurements)


if __name__ == "__main__":
    unittest.main(verbosity=2)

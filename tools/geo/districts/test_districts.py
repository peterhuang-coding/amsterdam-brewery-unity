"""Safety/contract tests for the offline F29-MAP district compiler.

Fixtures are synthetic and inline; only the real pub sample is read from
disk. Tempfiles live in TemporaryDirectory and are removed afterwards.
"""

import gzip
import hashlib
import json
import os
import sys
import tempfile
import unittest
from collections import deque

from shapely.geometry import Polygon
import shapely

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build_districts as bd  # noqa: E402


# --------------------------------------------------------------------------- #
# tiny fixture DSL
# --------------------------------------------------------------------------- #

def ring_rect(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def poly_rect(x0, y0, x1, y1):
    return [ring_rect(x0, y0, x1, y1)]


def poly_rect_hole(x0, y0, x1, y1, hx0, hy0, hx1, hy1):
    return [ring_rect(x0, y0, x1, y1),
            list(reversed(ring_rect(hx0, hy0, hx1, hy1)))]


def env_of(polys):
    xs = [p[0] for poly in polys for ring in poly for p in ring]
    ys = [p[1] for poly in polys for ring in poly for p in ring]
    return [min(xs), min(ys), max(xs), max(ys)]


def feature(fid, polys, properties=None):
    return {
        "id": fid,
        "localId": fid,
        "sourceId": fid,
        "bounds": env_of(polys),
        "polygons": polys,
        "properties": properties or {},
    }


def road(fid, x0, y0, x1, y1, functie="rijbaan weg", height=0):
    return feature(fid, [poly_rect(x0, y0, x1, y1)],
                   {"functie": functie,
                    "relatieve_hoogteligging": height})


def building(fid, x0, y0, x1, y1):
    return feature(fid, [poly_rect(x0, y0, x1, y1)],
                   {"relatieve_hoogteligging": 0})


def bridge(fid, x0, y0, x1, y1, deel="dek", height=1):
    return feature(fid, [poly_rect(x0, y0, x1, y1)],
                   {"type_overbruggingsdeel": deel,
                    "relatieve_hoogteligging": height})


def water(fid, x0, y0, x1, y1):
    return feature(fid, [poly_rect(x0, y0, x1, y1)],
                   {"type_waterdeel": "water"})


PROJECTION = {
    "type": "local-equirectangular",
    "units": "metres",
    "originLat": 52.4, "originLon": 4.9, "referenceLat": 52.37,
    "radiusMeters": 6371008.8,
}
SOURCE_PROVENANCE = {
    "provider": "Kadaster / PDOK BGT", "license": "CC0-1.0",
    "snapshot": "2026-10-16T00:00:00Z", "complete": False,
}


def make_source(roads=None, buildings=None, bridges=None, waters=None,
                width=100.0, height=100.0):
    return {
        "schemaVersion": 1,
        "width": width,
        "height": height,
        "bbox": [4.9, 52.3, 4.95, 52.4],
        "projection": PROJECTION,
        "source": SOURCE_PROVENANCE,
        "layers": {
            "water": waters or [],
            "buildings": buildings or [],
            "roads": roads or [],
            "bridges": bridges or [],
        },
    }


def make_config(districts, anchors, links=None, cell_size=1.0, radius=0.4):
    return {
        "schemaVersion": 1,
        "mapVersion": "test-v1",
        "cellSize": cell_size,
        "bodyRadius": radius,
        "overviewTolerance": 4.0,
        "localTolerance": 0.5,
        "districts": districts,
        "anchors": anchors,
        "travelLinks": links or [],
    }


def district(did, bounds, anchor_ids, name=None):
    return {"id": did, "name": name or did, "bounds": bounds,
            "anchorIds": anchor_ids}


def anchor(x, y, fid="wegdeel:x"):
    return {"x": x, "y": y, "featureId": fid, "fictionalVenue": True}


class Harness:
    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.n = 0

    def cleanup(self):
        self.tmp.cleanup()

    def path(self, name):
        return os.path.join(self.root, name)

    def write(self, name, obj):
        p = self.path(name)
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(obj, fh)
        return p

    def write_raw(self, name, text):
        p = self.path(name)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(text)
        return p

    def run(self, source_name="source.json", config_name="config.json",
            out_name="out"):
        self.n += 1
        return bd.main([
            "--source", self.path(source_name),
            "--config", self.path(config_name),
            "--out", self.path("%s%d" % (out_name, self.n)),
        ])

    def out_dir(self):
        return self.path("out%d" % self.n)

    def read(self, rel):
        with open(os.path.join(self.out_dir(), rel), "rb") as fh:
            return fh.read()

    def read_json(self, rel):
        return json.loads(self.read(rel).decode("utf-8"))


# --------------------------------------------------------------------------- #
# output decoding helpers
# --------------------------------------------------------------------------- #

def decode_runs(runs, n):
    mask = [False] * n
    for start, length in runs:
        for i in range(start, start + length):
            assert not mask[i], "overlapping run at %d" % i
            mask[i] = True
    return mask


def run_starts_ok(runs, n):
    if not runs:
        return True
    prev_end = -1
    for start, length in runs:
        if length < 1 or start < 0 or start + length > n:
            return False
        if start <= prev_end:  # sorted and non-overlapping
            return False
        prev_end = start + length - 1
    return True


def same_component(mask, cols, rows, a, b):
    def neighbors(i):
        r, c = divmod(i, cols)
        if r > 0:
            yield i - cols
        if r < rows - 1:
            yield i + cols
        if c > 0:
            yield i - 1
        if c < cols - 1:
            yield i + 1

    seen = {a}
    q = deque([a])
    while q:
        cur = q.popleft()
        if cur == b:
            return True
        for nb in neighbors(cur):
            if mask[nb] and nb not in seen:
                seen.add(nb)
                q.append(nb)
    return False


def cell_index(nav, x_lower, y_lower):
    ox, oy = nav["origin"]
    cs = nav["cellSize"]
    col = int(round((x_lower - ox) / cs))
    row = int(round((y_lower - oy) / cs))
    return row * nav["cols"] + col


def anchor_cell(nav, anc):
    cs = nav["cellSize"]
    x_lower = anc["x"] - cs / 2.0
    y_lower = anc["y"] - cs / 2.0
    return cell_index(nav, x_lower, y_lower)


def crossing_scene(pier_only=False, narrow_deck=False):
    """Roads on dry banks with a canal between them.

    A 4 m-wide legal 'dek' spans the canal and overlaps both banks; a
    'pijler' pier or a sub-1.8 m-wide deck cannot carry an expanded 1 m
    cell (cell + 0.4 m on every side needs 1.8 m of continuous width).
    """
    if pier_only:
        bridges = [bridge("pier1", 17, 30, 25, 34, deel="pijler")]
    elif narrow_deck:
        bridges = [bridge("deknarrow", 17, 31.2, 25, 32.8)]
    else:
        bridges = [bridge("dek1", 17, 30, 25, 34)]
    src = make_source(
        roads=[road("bankA", 2, 28, 19, 36),
               road("bankB", 23, 28, 40, 36)],
        bridges=bridges,
        waters=[water("gracht", 18, 0, 24, 60)],
    )
    cfg = make_config(
        [district("d", [0, 26, 44, 38], ["a", "b"])],
        {"a": anchor(10, 32), "b": anchor(32, 32)},
    )
    return src, cfg


# --------------------------------------------------------------------------- #
# tests
# --------------------------------------------------------------------------- #

class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.h = Harness()

    def tearDown(self):
        self.h.cleanup()

    def build(self, source, config):
        self.h.write("source.json", source)
        self.h.write("config.json", config)
        return self.h.run()

    # -- navigation semantics ---------------------------------------------- #

    def test_bridge_deck_connects_over_water_pier_does_not(self):
        src, cfg = crossing_scene(pier_only=False)
        self.assertEqual(self.build(src, cfg), 0)
        d = self.h.read_json("districts/d.json")
        nav = d["nav"]
        n = nav["cols"] * nav["rows"]
        mask = decode_runs(nav["walkRuns"], n)
        ia = anchor_cell(nav, d["anchors"]["a"])
        ib = anchor_cell(nav, d["anchors"]["b"])
        self.assertTrue(mask[ia] and mask[ib])
        self.assertTrue(same_component(mask, nav["cols"], nav["rows"], ia, ib))
        # canal water away from the deck stays blocked
        self.assertFalse(mask[cell_index(nav, 21, 27)])
        # the deck itself carries safe cells across the water band
        self.assertTrue(mask[cell_index(nav, 20, 31)])
        self.assertTrue(mask[cell_index(nav, 20, 32)])

        src2, cfg2 = crossing_scene(pier_only=True)
        self.assertEqual(self.build(src2, cfg2), 2)
        audit = self.h.read_json("audit.json")
        self.assertTrue(audit["errors"])
        self.assertTrue(any("component" in e for e in audit["errors"]))
        da = [x for x in audit["districts"] if x["id"] == "d"][0]
        self.assertFalse(da["requiredAnchorConnected"])
        # a non-dek structure paints no surface over the canal
        pier = decode_runs(
            self.h.read_json("districts/d.json")["nav"]["walkRuns"],
            nav["cols"] * nav["rows"])
        self.assertFalse(pier[cell_index(nav, 20, 32)])

    def test_narrow_deck_cannot_connect_banks(self):
        # A real deck exists, but 1.6 m width cannot host an expanded 1 m
        # cell (1.8 m needed): connectivity must fail rather than leaking
        # diagonal/centre-only cells across the canal.
        src, cfg = crossing_scene(narrow_deck=True)
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        da = audit["districts"][0]
        self.assertFalse(da["requiredAnchorConnected"])
        self.assertTrue(any("component" in e for e in audit["errors"]))

    def test_buildings_and_holes_are_blocked(self):
        src = make_source(
            roads=[feature("r1", [
                poly_rect_hole(5, 5, 35, 35, 23, 23, 27, 27)],
                {"functie": "rijbaan weg"})],
            buildings=[building("b1", 10, 10, 14, 14)],
        )
        cfg = make_config(
            [district("d", [0, 0, 40, 40], ["a"])],
            {"a": anchor(8, 8)})
        self.assertEqual(self.build(src, cfg), 0)
        nav = self.h.read_json("districts/d.json")["nav"]
        n = nav["cols"] * nav["rows"]
        mask = decode_runs(nav["walkRuns"], n)
        # expanded 1m cell over the building footprint is blocked
        self.assertFalse(mask[cell_index(nav, 12, 12)])
        # neighbouring cell clear of the building remains safe
        self.assertTrue(mask[cell_index(nav, 18, 12)])
        # polygon hole blocks through the middle
        self.assertFalse(mask[cell_index(nav, 25, 25)])
        self.assertTrue(mask[cell_index(nav, 21, 25)])

    def test_excluded_road_classes_and_negative_height(self):
        src = make_source(roads=[
            road("hw", 2, 2, 6, 6, functie="rijbaan autosnelweg"),
            road("rail", 10, 2, 14, 6, functie="spoorbaan"),
            road("tunnel", 18, 2, 22, 6, functie="fietspad", height=-1),
            road("street", 26, 2, 30, 6, functie="fietspad"),
        ])
        cfg = make_config(
            [district("d", [0, 0, 40, 12], ["a"])],
            {"a": anchor(28, 4)})
        self.assertEqual(self.build(src, cfg), 0)
        d = self.h.read_json("districts/d.json")
        nav = d["nav"]
        n = nav["cols"] * nav["rows"]
        walk = decode_runs(nav["walkRuns"], n)
        bike = decode_runs(nav["bikeRuns"], n)

        def count_region(mask, x0, y0, x1, y1):
            return sum(mask[cell_index(nav, x, y)]
                       for x in range(x0, x1) for y in range(y0, y1))

        self.assertEqual(count_region(walk, 2, 2, 6, 6), 0)   # autosnelweg
        self.assertEqual(count_region(walk, 10, 2, 14, 6), 0)  # spoorbaan
        self.assertEqual(count_region(walk, 18, 2, 22, 6), 0)  # negative h
        # legal fietspad contributes the 2x2 core of a 4x4 pad
        self.assertEqual(count_region(walk, 26, 2, 30, 6), 4)
        self.assertEqual(count_region(bike, 26, 2, 30, 6), 4)
        audit = self.h.read_json("audit.json")
        excluded = audit["counts"]["navExcludedFeatures"]
        self.assertGreaterEqual(excluded["excludedClass"], 2)
        self.assertGreaterEqual(excluded["negativeHeight"], 1)

    def test_voetpad_walk_allowed_bike_blocked(self):
        src = make_source(roads=[road("vp", 2, 4, 10, 8, functie="voetpad")])
        cfg = make_config(
            [district("d", [0, 0, 12, 12], ["a"])],
            {"a": anchor(6, 6)})
        self.assertEqual(self.build(src, cfg), 0)
        audit = self.h.read_json("audit.json")
        da = audit["districts"][0]
        self.assertEqual(da["walkCells"], 12)
        self.assertEqual(da["bikeCells"], 0)
        self.assertGreaterEqual(
            audit["counts"]["navExcludedFeatures"]["bikeOnlyWalking"], 1)

    # -- conservative cell safety, independently rechecked ----------------- #

    def test_conservative_expanded_cell_safety(self):
        src = make_source(
            roads=[road("st", 5, 5, 20, 15)],
            buildings=[building("b", 12, 8, 16, 12)],
        )
        cfg = make_config(
            [district("d", [0, 0, 25, 20], ["a"])],
            {"a": anchor(7, 10)})
        self.assertEqual(self.build(src, cfg), 0)
        d = self.h.read_json("districts/d.json")
        nav = d["nav"]
        mask = decode_runs(nav["walkRuns"], nav["cols"] * nav["rows"])

        # Independent union built straight from raw polygons, not reusing any
        # compiler grid routine.
        allowed = Polygon([(5, 5), (20, 5), (20, 15), (5, 15)]).difference(
            Polygon([(12, 8), (16, 8), (16, 12), (12, 12)]))
        r = 0.4
        cs = nav["cellSize"]
        ox, oy = nav["origin"]
        for flat, safe in enumerate(mask):
            row, col = divmod(flat, nav["cols"])
            x0 = ox + col * cs
            y0 = oy + row * cs
            expanded = shapely.box(x0 - r, y0 - r, x0 + cs + r, y0 + cs + r)
            if safe:
                self.assertTrue(
                    shapely.covers(allowed, expanded),
                    "cell %d marked safe without full 0.4m clearance" % flat)
            # A cell whose expanded square demonstrably leaves the surface
            # must be blocked (no centre-only testing).
        # Edge cells of the 15x10 pad are blocked despite centre coverage.
        self.assertFalse(mask[cell_index(nav, 5, 5)])
        self.assertFalse(mask[cell_index(nav, 19, 14)])
        self.assertTrue(mask[cell_index(nav, 6, 6)])
        # expanded square touching the building cannot be marked safe
        self.assertFalse(mask[cell_index(nav, 11, 9)])

    # -- snapping rules ----------------------------------------------------- #

    def test_snap_with_uncovered_corridor_rejected(self):
        # Safe surface exists within 5 m of the anchor, but the straight
        # corridor to it crosses uncovered ground: never dragged across.
        src = make_source(roads=[road("st", 10, 8, 18, 12)])
        cfg = make_config(
            [district("d", [0, 6, 20, 14], ["a"])],
            {"a": anchor(7, 10)})
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        anc = audit["districts"][0]["anchors"][0]
        self.assertIsNone(anc["displacement"])
        self.assertAlmostEqual(anc["sourceX"], 7.0)
        self.assertTrue(any("not moved" in e for e in audit["errors"]))

    def test_snap_across_water_within_5m_still_rejected(self):
        src = make_source(
            roads=[road("quay", 2, 8, 10, 12)],
            waters=[water("canal", 10, 6, 38, 14)])
        cfg = make_config(
            [district("d", [0, 6, 40, 14], ["a", "b"])],
            {"a": anchor(6, 10), "b": anchor(30, 10)})
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        by_id = {x["id"]: x for x in audit["districts"][0]["anchors"]}
        self.assertIsNone(by_id["b"]["displacement"])
        self.assertTrue(any("b" in e for e in audit["errors"]))

    def test_disconnected_required_anchors_fail(self):
        src = make_source(roads=[
            road("p1", 2, 8, 6, 12), road("p2", 20, 8, 24, 12)])
        cfg = make_config(
            [district("d", [0, 6, 26, 14], ["a", "b"])],
            {"a": anchor(4, 10), "b": anchor(22, 10)})
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        self.assertTrue(any("fabricated" in e for e in audit["errors"]))
        da = audit["districts"][0]
        self.assertFalse(da["requiredAnchorConnected"])
        self.assertGreaterEqual(da["walkComponents"], 2)

    # -- malformed inputs --------------------------------------------------- #

    def test_malformed_inputs_rejected(self):
        good = make_source(roads=[road("r", 0, 0, 10, 10)])
        good_cfg = make_config(
            [district("d", [0, 0, 12, 12], ["a"])], {"a": anchor(5, 5)})

        bad_coord = make_source(waters=[
            feature("w", [[[[0, 0], [4, float("inf")], [4, 4], [0, 0]]]])])
        self.assertEqual(self.build(bad_coord, good_cfg), 2)

        bad_cs = make_config(
            [district("d", [0, 0, 12, 12], ["a"])], {"a": anchor(5, 5)},
            cell_size=0)
        self.assertEqual(self.build(good, bad_cs), 2)

        # body radius must be strictly below the 1 m cell size
        bad_radius = make_config(
            [district("d", [0, 0, 12, 12], ["a"])], {"a": anchor(5, 5)},
            radius=1.5)
        self.assertEqual(self.build(good, bad_radius), 2)

        bad_radius_neg = make_config(
            [district("d", [0, 0, 12, 12], ["a"])], {"a": anchor(5, 5)},
            radius=-0.1)
        self.assertEqual(self.build(good, bad_radius_neg), 2)

        no_layers = {"schemaVersion": 1, "width": 20, "height": 20,
                     "projection": PROJECTION, "source": SOURCE_PROVENANCE}
        self.assertEqual(self.build(no_layers, good_cfg), 2)

        unknown_anchor = make_config(
            [district("d", [0, 0, 12, 12], ["ghost"])], {"a": anchor(5, 5)})
        self.assertEqual(self.build(good, unknown_anchor), 2)

        nonfinite_anchor = make_config(
            [district("d", [0, 0, 12, 12], ["a"])],
            {"a": anchor(float("nan"), 5)})
        self.assertEqual(self.build(good, nonfinite_anchor), 2)

        untiled = make_config(
            [district("d", [0, 0, 10.5, 10], ["a"])], {"a": anchor(5, 5)})
        self.assertEqual(self.build(good, untiled), 2)

        self.h.write_raw("broken.json", "{not valid json")
        self.assertEqual(bd.main([
            "--source", self.h.path("broken.json"),
            "--config", self.h.path("x.json"),
            "--out", self.h.path("outx")]), 2)

    # -- RLE, determinism, hashes, budgets ---------------------------------- #

    def test_rle_bounds_determinism_hashes_and_sizes(self):
        src, cfg = crossing_scene(pier_only=False)
        self.h.write("source.json", src)
        self.h.write("config.json", cfg)
        # run() names directories out1, out2, ... in call order.
        self.assertEqual(self.h.run(), 0)
        first = self.h.path("out1")
        self.assertEqual(self.h.run(), 0)
        second = self.h.path("out2")
        self.assertEqual(os.path.basename(self.h.out_dir()), "out2")
        rels = ["manifest.json", "overview.json", "districts/d.json",
                "audit.json"]
        for rel in rels:
            with open(os.path.join(first, rel), "rb") as fa, \
                 open(os.path.join(second, rel), "rb") as fb:
                self.assertEqual(fa.read(), fb.read(),
                                 "non-deterministic output: %s" % rel)

        manifest = self.h.read_json("manifest.json")
        for rel, entry in (("overview.json", manifest["overview"]),
                           ("districts/d.json", manifest["districts"][0])):
            data = self.h.read(rel)
            self.assertEqual(entry["bytes"], len(data))
            self.assertEqual(entry["sha256"],
                             hashlib.sha256(data).hexdigest())
            gz = gzip.compress(data, compresslevel=9, mtime=0)
            self.assertEqual(entry["gzipBytes"], len(gz))
            self.assertEqual(gzip.decompress(gz), data)
            self.assertTrue(entry["gzipBytes"] <= 8 * 1024 * 1024)

        d = self.h.read_json("districts/d.json")
        nav = d["nav"]
        n = nav["cols"] * nav["rows"]
        self.assertTrue(run_starts_ok(nav["walkRuns"], n))
        self.assertTrue(run_starts_ok(nav["bikeRuns"], n))
        # a long run is allowed to cross row boundaries
        self.assertTrue(any(length > nav["cols"]
                            for _, length in nav["walkRuns"])
                        or nav["walkRuns"])
        self.assertEqual(
            d["entrance"],
            {"x": d["anchors"]["a"]["x"], "y": d["anchors"]["a"]["y"]})
        for aid, anc in d["anchors"].items():
            self.assertLessEqual(
                ((anc["x"] - anc["sourceX"]) ** 2 +
                 (anc["y"] - anc["sourceY"]) ** 2) ** 0.5, 5.0)

    # -- water/road/deck surface rules ------------------------------------- #

    def test_road_over_water_without_deck_has_zero_cells(self):
        # Parent counterexample: a 10x10 road painted wholly over a 10x10
        # pond with no deck used to yield 64 walk cells; it must yield 0.
        src = make_source(
            roads=[road("floating", 5, 5, 15, 15)],
            waters=[water("pond", 0, 0, 20, 20)])
        cfg = make_config(
            [district("d", [0, 0, 20, 20], ["a"])],
            {"a": anchor(10, 10)})
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        da = audit["districts"][0]
        self.assertEqual(da["walkCells"], 0)
        self.assertEqual(da["bikeCells"], 0)
        self.assertTrue(any("no safe cells" in e for e in audit["errors"]))
        self.assertIsNone(da["anchors"][0]["displacement"])

    def test_deck_over_water_positive_nondeck_negative(self):
        src = make_source(
            roads=[road("painted", 2, 8, 18, 12)],
            bridges=[bridge("dek", 4, 7, 16, 13)],
            waters=[water("canal", 0, 6, 20, 14)])
        cfg = make_config(
            [district("d", [0, 6, 20, 14], ["a"])],
            {"a": anchor(10, 10)})
        self.assertEqual(self.build(src, cfg), 0)
        nav = self.h.read_json("districts/d.json")["nav"]
        n = nav["cols"] * nav["rows"]
        mask = decode_runs(nav["walkRuns"], n)
        # only the real deck restores surface over the water
        self.assertTrue(mask[cell_index(nav, 10, 10)])
        self.assertFalse(mask[cell_index(nav, 2, 9)])
        self.assertFalse(mask[cell_index(nav, 17, 9)])

        src2 = make_source(
            roads=[road("painted", 2, 8, 18, 12)],
            bridges=[bridge("pier", 4, 7, 16, 13, deel="pijler")],
            waters=[water("canal", 0, 6, 20, 14)])
        self.assertEqual(self.build(src2, cfg), 2)
        da = self.h.read_json("audit.json")["districts"][0]
        self.assertEqual(da["walkCells"], 0)

    def test_invalid_source_polygon_skipped_for_nav_and_disclosed(self):
        bowtie = [[[[0, 0], [4, 4], [0, 4], [4, 0], [0, 0]]]]
        src = make_source(
            roads=[feature("bad", bowtie, {"functie": "rijbaan weg"}),
                   road("ok", 20, 20, 30, 30)])
        cfg = make_config(
            [district("d", [0, 0, 40, 40], ["a"])],
            {"a": anchor(25, 25)})
        self.assertEqual(self.build(src, cfg), 0)
        audit = self.h.read_json("audit.json")
        self.assertGreaterEqual(
            audit["counts"]["invalidNavPolygonsSkipped"]["roads"], 1)
        self.assertGreaterEqual(
            audit["counts"]["invalidVisualMakeValid"]["roads"], 1)
        da = audit["districts"][0]
        # the legal 10x10 pad contributes exactly its 8x8 conservative core;
        # the invalid bowtie contributes nothing to navigation
        self.assertEqual(da["walkCells"], 64)

    # -- vertex accounting, caps, overview ladder, stale manifest ---------- #

    def test_vertex_count_matches_actual_coordinates(self):
        src, cfg = crossing_scene(pier_only=False)
        self.assertEqual(self.build(src, cfg), 0)
        overview = self.h.read_json("overview.json")
        audit = self.h.read_json("audit.json")

        def actual_vertices(doc):
            return sum(len(r) for s in doc["shapes"] for r in s["rings"])

        self.assertEqual(
            audit["overview"]["vertexCount"], actual_vertices(overview))
        self.assertEqual(audit["overview"]["shapeCount"],
                         len(overview["shapes"]))
        local = self.h.read_json("districts/d.json")
        da = audit["districts"][0]
        self.assertEqual(da["vertexCount"], actual_vertices(local))
        self.assertGreater(audit["overview"]["vertexCount"],
                           len(overview["shapes"]))

    def test_visual_vertex_cap_rejected_and_diagnosed(self):
        old_cap = bd.MAX_OVERVIEW_VERTICES
        bd.MAX_OVERVIEW_VERTICES = 3
        self.addCleanup(setattr, bd, "MAX_OVERVIEW_VERTICES", old_cap)
        src, cfg = crossing_scene(pier_only=False)
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        self.assertTrue(any("vertex cap" in e for e in audit["errors"]))
        self.assertFalse(os.path.exists(
            os.path.join(self.h.out_dir(), "manifest.json")))

    def test_overview_ladder_exhausted_fails_honestly(self):
        old_budget = bd.OVERVIEW_GZIP_BUDGET
        bd.OVERVIEW_GZIP_BUDGET = 1
        self.addCleanup(setattr, bd, "OVERVIEW_GZIP_BUDGET", old_budget)
        src = make_source(
            roads=[road("r", 2, 2, 30, 8)],
            waters=[water("w", 0, 20, 60, 40)])
        cfg = make_config(
            [district("d", [0, 0, 40, 12], ["a"])],
            {"a": anchor(6, 5)})
        self.assertEqual(self.build(src, cfg), 2)
        audit = self.h.read_json("audit.json")
        fb = audit["overview"]["fallback"]
        self.assertEqual(len(fb["attempts"]), len(bd.OVERVIEW_LADDER))
        self.assertFalse(any(a["withinBudget"] for a in fb["attempts"]))
        self.assertIsNone(fb["chosenStep"])
        self.assertTrue(any("ladder exhausted" in e for e in audit["errors"]))
        self.assertFalse(os.path.exists(
            os.path.join(self.h.out_dir(), "manifest.json")))

    def test_overview_ladder_steps_down_and_retains_water_bridge(self):
        # 260 varied 90 m2 decorative roads survive step 1 (>=80 m2) but are
        # dropped at step 2 (>=120 m2); water and bridge survive every step.
        roads = []
        seed = 987654321
        for i in range(260):
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            x = 40 + (seed % 500)
            y = 40 + ((seed // 500) % 500)
            roads.append(road("dec%d" % i, x, y, x + 10, y + 9))
        roads.append(road("legalpad", 14, 14, 26, 26))
        src = make_source(
            roads=roads,
            waters=[water("w", 60, 60, 540, 400)],
            bridges=[bridge("dekkeep", 100, 420, 140, 430)],
            width=600.0, height=600.0)
        cfg = make_config(
            [district("d", [10, 10, 30, 30], ["a"])],
            {"a": anchor(20, 20)})

        # Force every ladder step to be tried and recorded.
        old_budget = bd.OVERVIEW_GZIP_BUDGET
        bd.OVERVIEW_GZIP_BUDGET = 1
        self.addCleanup(setattr, bd, "OVERVIEW_GZIP_BUDGET", old_budget)
        self.assertEqual(self.build(src, cfg), 2)
        attempts = self.h.read_json("audit.json")["overview"]["fallback"][
            "attempts"]
        self.assertEqual(len(attempts), 4)
        g0, g1 = attempts[0]["gzipBytes"], attempts[1]["gzipBytes"]
        self.assertGreater(g0, g1)
        self.assertEqual(attempts[0]["selectedFeatures"]["roads"], 261)
        self.assertEqual(attempts[1]["selectedFeatures"]["roads"], 1)
        self.assertEqual(attempts[0]["droppedShapesSinceFirst"], 0)
        self.assertGreater(attempts[1]["droppedShapesSinceFirst"], 0)
        for att in attempts:
            self.assertEqual(att["selectedFeatures"]["water"], 1)
            self.assertEqual(att["selectedFeatures"]["bridges"], 1)

        # A budget between step-1 and step-2 gzip must select step 2.
        forced = (g0 + g1) // 2
        bd.OVERVIEW_GZIP_BUDGET = forced
        self.assertEqual(self.build(src, cfg), 0)
        audit2 = self.h.read_json("audit.json")
        fb = audit2["overview"]["fallback"]
        self.assertEqual(fb["chosenStep"], 2)
        self.assertEqual(fb["chosen"]["roadBuildingMinArea"], 120.0)
        self.assertEqual(fb["chosen"]["roadBuildingTolerance"], 6.0)
        self.assertTrue(audit2["overview"]["withinBudget"])
        self.assertLessEqual(audit2["overview"]["gzipBytes"], forced)
        ov = self.h.read_json("overview.json")
        self.assertTrue(any(s["kind"] == "water" for s in ov["shapes"]))
        self.assertTrue(any(s["kind"] == "bridge" for s in ov["shapes"]))

    def test_failed_rebuild_clears_stale_manifest_only(self):
        good = make_source(roads=[road("p", 2, 8, 18, 12)])
        good_cfg = make_config(
            [district("d", [0, 6, 20, 14], ["a"])],
            {"a": anchor(10, 10)})
        # second anchor lies off the road pad with no covered 5 m corridor
        bad_cfg = make_config(
            [district("d", [0, 6, 20, 14], ["a", "b"])],
            {"a": anchor(10, 10), "b": anchor(10, 6.6)})
        out = self.h.path("keep")
        self.h.write("source.json", good)
        self.h.write("good.json", good_cfg)
        self.h.write("bad.json", bad_cfg)
        self.assertEqual(bd.main([
            "--source", self.h.path("source.json"),
            "--config", self.h.path("good.json"),
            "--out", out]), 0)
        manifest = os.path.join(out, "manifest.json")
        self.assertTrue(os.path.exists(manifest))
        self.assertEqual(bd.main([
            "--source", self.h.path("source.json"),
            "--config", self.h.path("bad.json"),
            "--out", out]), 2)
        self.assertFalse(os.path.exists(manifest))
        with open(os.path.join(out, "audit.json"), "rb") as fh:
            diag = json.loads(fh.read().decode("utf-8"))
        self.assertTrue(diag["errors"])

    # -- real public sample ------------------------------------------------- #

    def test_real_pub_sample_connects_pub_and_lotte(self):
        source = os.path.join(HERE, "real-pub-sample.json")
        config = os.path.join(HERE, "sample-config.json")
        out = os.path.join(self.h.root, "pubout")
        code = bd.main(["--source", source, "--config", config, "--out", out])
        self.assertEqual(code, 0)

        def load(name):
            with open(os.path.join(out, name), "rb") as fh:
                return json.loads(fh.read().decode("utf-8"))

        d = load("districts/pub-sample.json")
        audit = load("audit.json")
        manifest = load("manifest.json")
        self.assertEqual(d["schemaVersion"], 1)
        self.assertEqual(d["nav"]["cellSize"], 1)
        nav = d["nav"]
        n = nav["cols"] * nav["rows"]
        walk = decode_runs(nav["walkRuns"], n)
        ipub = anchor_cell(nav, d["anchors"]["pub"])
        ilotte = anchor_cell(nav, d["anchors"]["lotte"])
        self.assertTrue(walk[ipub] and walk[ilotte])
        self.assertTrue(
            same_component(walk, nav["cols"], nav["rows"], ipub, ilotte))
        self.assertEqual(
            d["entrance"],
            {"x": d["anchors"]["pub"]["x"], "y": d["anchors"]["pub"]["y"]})

        da = audit["districts"][0]
        self.assertTrue(da["requiredAnchorConnected"])
        self.assertGreater(da["walkCells"], 0)
        self.assertEqual(audit["errors"], [])
        self.assertTrue(audit["overview"]["withinBudget"])
        self.assertTrue(da["withinBudget"])

        # manifest hashes match the final bytes on disk
        with open(os.path.join(out, "districts", "pub-sample.json"), "rb") as fh:
            data = fh.read()
        entry = manifest["districts"][0]
        self.assertEqual(entry["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(entry["bytes"], len(data))

        # Independently re-verify every emitted safe cell against a union built
        # directly from the raw sample (documented exclusion rules).
        with open(source, "rb") as fh:
            raw = json.loads(fh.read().decode("utf-8"))
        box = d["bounds"]
        road_geoms, deck_geoms, building_geoms, water_geoms = [], [], [], []
        for feat in raw["layers"]["roads"]:
            props = feat["properties"]
            h = props.get("relatieve_hoogteligging", 0) or 0
            if h < 0 or bd.road_class_excluded_walk(props.get("functie")):
                continue
            for spec in feat["polygons"]:
                poly = Polygon(spec[0], spec[1:])
                if poly.is_valid:
                    road_geoms.append(shapely.clip_by_rect(poly, *box))
        for feat in raw["layers"]["bridges"]:
            if feat["properties"].get("type_overbruggingsdeel") != "dek":
                continue
            for spec in feat["polygons"]:
                poly = Polygon(spec[0], spec[1:])
                if poly.is_valid:
                    deck_geoms.append(shapely.clip_by_rect(poly, *box))
        for feat in raw["layers"]["buildings"]:
            for spec in feat["polygons"]:
                poly = Polygon(spec[0], spec[1:])
                if poly.is_valid:
                    building_geoms.append(shapely.clip_by_rect(poly, *box))
        # Independent water rule, same order as the compiler: raw water is
        # subtracted from roads; only decks restore surface over it; then
        # buildings block everything.
        for feat in raw["layers"]["water"]:
            for spec in feat["polygons"]:
                poly = Polygon(spec[0], spec[1:])
                if poly.is_valid:
                    water_geoms.append(shapely.clip_by_rect(poly, *box))

        def u(parts):
            return shapely.union_all(parts) if parts else Polygon()

        allowed = u(road_geoms).difference(u(water_geoms))
        allowed = shapely.union_all([g for g in [allowed, u(deck_geoms)]
                                     if not g.is_empty])
        allowed = allowed.difference(u(building_geoms))
        ox, oy = nav["origin"]
        cs = nav["cellSize"]
        for flat, safe in enumerate(walk):
            if not safe:
                continue
            row, col = divmod(flat, nav["cols"])
            exp = shapely.box(ox + col * cs - 0.4, oy + row * cs - 0.4,
                              ox + (col + 1) * cs + 0.4,
                              oy + (row + 1) * cs + 0.4)
            self.assertTrue(
                shapely.covers(allowed, exp),
                "pub sample safe cell %d lacks full clearance" % flat)


if __name__ == "__main__":
    unittest.main(verbosity=2)

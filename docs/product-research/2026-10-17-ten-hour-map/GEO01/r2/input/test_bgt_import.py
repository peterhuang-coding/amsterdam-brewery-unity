"""Regression tests for import_bgt.

Covers the real public BGT sample pages named in source-manifest.json plus
synthetic fixtures for corner cases (holes, MultiPolygons, dedup, conflicts,
date validity at snapshot, malformed geometry, tampering, determinism).
"""

import hashlib
import json
import math
import os
import tempfile
import unittest

import import_bgt as ib

HERE = os.path.dirname(os.path.abspath(__file__))
REAL_MANIFEST = os.path.join(HERE, "source-manifest.json")

SNAPSHOT = "2026-10-16T00:00:00Z"
BBOX = [4.865, 52.345, 4.970, 52.405]
RADIUS = 6371008.8


# --------------------------------------------------------------------------- #
# synthetic fixture builders
# --------------------------------------------------------------------------- #

def square_ring(lon0, lat0, dlon=0.0008, dlat=0.0006):
    """Closed CCW-ish square ring around (lon0, lat0)."""
    return [
        [lon0, lat0],
        [lon0 + dlon, lat0],
        [lon0 + dlon, lat0 + dlat],
        [lon0, lat0 + dlat],
        [lon0, lat0],
    ]


def hole_ring(lon0, lat0, dlon=0.00020, dlat=0.00015):
    return [
        [lon0, lat0],
        [lon0, lat0 + dlat],
        [lon0 + dlon, lat0 + dlat],
        [lon0 + dlon, lat0],
        [lon0, lat0],
    ]


def polygon(ring_lists):
    return {"type": "Polygon", "coordinates": ring_lists}


def multipolygon(polygons):
    return {"type": "MultiPolygon", "coordinates": polygons}


def make_feature(
    feature_id,
    geometry,
    collection="waterdeel",
    lokaal_id=None,
    properties=None,
):
    props = {
        "creation_date": "2018-01-01T00:00:00Z",
        "termination_date": None,
        "status": "bestaand",
    }
    if lokaal_id is not None:
        props["lokaal_id"] = lokaal_id
    if properties:
        props.update(properties)
    return {"type": "Feature", "id": feature_id, "properties": props,
            "geometry": geometry}


def feature_collection(features, collection, override_self=None):
    self_href = override_self or (
        "https://api.pdok.nl/kadaster/bgt/ogc/v1/collections/%s/items"
        "?bbox=x&f=json" % collection
    )
    return {
        "type": "FeatureCollection",
        "timeStamp": "2026-10-16T12:00:00Z",
        "links": [
            {"rel": "self", "type": "application/geo+json", "href": self_href},
            {"rel": "next", "href": "https://example.test/next"},
        ],
        "features": features,
    }


class FixtureWorkspace:
    def __init__(self, entries, complete=False, bbox=None, snapshot=SNAPSHOT):
        """entries: list of (file_name, collection, feature_collection_dict)."""
        self.tmp = tempfile.TemporaryDirectory()
        self.base = self.tmp.name
        inputs = []
        for name, collection, doc in entries:
            path = os.path.join(self.base, name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            payload = json.dumps(doc, ensure_ascii=False).encode("utf-8")
            with open(path, "wb") as handle:
                handle.write(payload)
            inputs.append(
                {
                    "file": name,
                    "collection": collection,
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            )
        self.manifest = {
            "bbox": bbox or BBOX,
            "snapshot": snapshot,
            "complete": complete,
            "provider": "Kadaster / PDOK BGT",
            "url": "https://api.pdok.nl/kadaster/bgt/ogc/v1/",
            "license": "CC0-1.0",
            "inputs": inputs,
        }

    def close(self):
        self.tmp.cleanup()


def convert_entries(entries, **kwargs):
    workspace = FixtureWorkspace(entries, **kwargs)
    try:
        return ib.convert(workspace.manifest, workspace.base), workspace
    except Exception:
        workspace.close()
        raise


# --------------------------------------------------------------------------- #
# real public sample pages
# --------------------------------------------------------------------------- #

class RealSampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(REAL_MANIFEST, "rb") as handle:
            cls.manifest = json.loads(handle.read().decode("utf-8"))
        cls.data, cls.audit = ib.convert(cls.manifest, HERE)

    def test_layer_counts_match_actual_pages(self):
        layers = self.data["layers"]
        self.assertEqual(
            {name: len(features) for name, features in layers.items()},
            {"water": 3, "buildings": 5, "roads": 5, "bridges": 5},
        )
        self.assertEqual(self.audit["inputFeatures"], 18)
        self.assertEqual(self.audit["outputFeatures"], 18)
        self.assertEqual(self.audit["duplicates"], 0)
        self.assertEqual(self.audit["exclusions"], [])

    def test_sha_and_collection_identity_verified(self):
        by_file = {item["file"]: item for item in self.audit["inputs"]}
        self.assertEqual(set(by_file), {
            "samples/water.json",
            "samples/buildings.json",
            "samples/roads.json",
            "samples/bridges.json",
        })
        for item in self.audit["inputs"]:
            self.assertTrue(item["sha256Verified"])
            self.assertTrue(item["collectionIdentity"])
            self.assertGreater(item["bytes"], 0)
        for source_input in self.data["source"]["inputs"]:
            self.assertEqual(
                source_input["sha256"],
                by_file[source_input["file"]]["sha256"],
            )

    def test_known_building_feature_traceable_to_source(self):
        buildings = self.data["layers"]["buildings"]
        feature = next(
            f for f in buildings
            if f["sourceId"] == "93ac4f4a-2edc-5477-aa3b-975035c20894"
        )
        self.assertEqual(
            feature["id"],
            "pand:93ac4f4a-2edc-5477-aa3b-975035c20894",
        )
        self.assertEqual(
            feature["localId"],
            "G0363.0018ea2439d648a3810dd66277139cf6",
        )
        self.assertEqual(feature["properties"]["bag_pnd"], "0363100012173593")
        self.assertEqual(feature["properties"]["status"], "bestaand")
        self.assertEqual(len(feature["polygons"]), 1)

    def test_real_semantic_properties_present(self):
        bridges = self.data["layers"]["bridges"]
        self.assertTrue(
            any(f["properties"].get("type_overbruggingsdeel") == "dek"
                for f in bridges)
        )
        roads = self.data["layers"]["roads"]
        self.assertTrue(
            any(f["properties"].get("functie") == "parkeervlak" for f in roads)
        )
        water = self.data["layers"]["water"]
        self.assertTrue(
            any(f["properties"].get("type") == "waterloop" for f in water)
        )

    def test_all_real_rings_closed_finite_and_projected(self):
        for layer, features in self.data["layers"].items():
            for feature in features:
                self.assertTrue(feature["polygons"], (layer, feature["id"]))
                all_points = []
                for polygon in feature["polygons"]:
                    for ring in polygon:
                        self.assertGreaterEqual(len(ring), 4)
                        self.assertEqual(ring[0], ring[-1])
                        self.assertGreaterEqual(
                            len({(p[0], p[1]) for p in ring[:-1]}), 3
                        )
                        for x, y in ring:
                            self.assertTrue(math.isfinite(x))
                            self.assertTrue(math.isfinite(y))
                            self.assertEqual(round(x, 3), x)
                            self.assertEqual(round(y, 3), y)
                            all_points.append((x, y))
                xs = [p[0] for p in all_points]
                ys = [p[1] for p in all_points]
                self.assertEqual(
                    feature["bounds"],
                    [min(xs), min(ys), max(xs), max(ys)],
                )

    def test_projection_matches_independent_formula_on_known_point(self):
        lon, lat = 4.8837955566127995, 52.37142398394152
        ref = 52.375
        expected_x = round(
            RADIUS * math.cos(math.radians(ref)) * math.radians(lon - 4.865), 3
        )
        expected_y = round(RADIUS * math.radians(52.405 - lat), 3)
        feature = next(
            f for f in self.data["layers"]["buildings"]
            if f["sourceId"] == "93ac4f4a-2edc-5477-aa3b-975035c20894"
        )
        self.assertEqual(feature["polygons"][0][0][0], [expected_x, expected_y])

    def test_projection_block_and_dimensions(self):
        projection = self.data["projection"]
        self.assertEqual(projection["type"], "local-equirectangular")
        self.assertEqual(projection["originLon"], 4.865)
        self.assertEqual(projection["originLat"], 52.405)
        self.assertEqual(projection["referenceLat"], 52.375)
        self.assertEqual(projection["radiusMeters"], RADIUS)
        self.assertEqual(projection["units"], "metres")
        width = round(
            RADIUS * math.cos(math.radians(52.375)) * math.radians(0.105), 3
        )
        height = round(RADIUS * math.radians(0.060), 3)
        self.assertEqual(self.data["width"], width)
        self.assertEqual(self.data["height"], height)
        # physical sanity for Amsterdam: several kilometres across
        self.assertGreater(width, 6000)
        self.assertLess(width, 8000)
        self.assertGreater(height, 6000)
        self.assertLess(height, 7500)

    def test_explicit_incomplete_limitation(self):
        self.assertFalse(self.data["source"]["complete"])
        self.assertFalse(self.audit["complete"])
        joined = " ".join(self.data["source"]["limitations"])
        self.assertIn("Incomplete", joined)
        self.assertIn("next page", joined)

    def test_audit_geometry_counts_consistent(self):
        total_polygons = total_rings = total_vertices = 0
        for layer in ("water", "buildings", "roads", "bridges"):
            stats = self.audit["layers"][layer]
            polygons = rings = vertices = 0
            for feature in self.data["layers"][layer]:
                polygons += len(feature["polygons"])
                for polygon in feature["polygons"]:
                    rings += len(polygon)
                    vertices += sum(len(ring) for ring in polygon)
            self.assertEqual(stats["polygons"], polygons)
            self.assertEqual(stats["rings"], rings)
            self.assertEqual(stats["vertices"], vertices)
            self.assertIsNotNone(stats["extent"])
            total_polygons += polygons
            total_rings += rings
            total_vertices += vertices
        self.assertGreater(total_polygons, 0)
        self.assertGreaterEqual(total_rings, total_polygons)
        self.assertGreaterEqual(total_vertices, total_rings * 4)

    def test_deterministic_bytes_on_repeated_conversion(self):
        again, _ = ib.convert(self.manifest, HERE)
        self.assertEqual(
            ib.dumps_json(self.data), ib.dumps_json(again)
        )


# --------------------------------------------------------------------------- #
# synthetic geometry behaviour
# --------------------------------------------------------------------------- #

class SyntheticGeometryTests(unittest.TestCase):
    def test_polygon_hole_preserved_and_bounds(self):
        outer = square_ring(4.882, 52.371)
        inner = hole_ring(4.8823, 52.3712)
        entries = [
            ("w.json", "waterdeel", feature_collection(
                [make_feature("w-hole", polygon([outer, inner]),
                              lokaal_id="L-hole")],
                "waterdeel"))
        ]
        ((data, audit), workspace) = convert_entries(entries)
        try:
            feature = data["layers"]["water"][0]
            self.assertEqual(len(feature["polygons"]), 1)
            self.assertEqual(len(feature["polygons"][0]), 2)
            self.assertEqual(feature["polygons"][0][0][0],
                             feature["polygons"][0][0][-1])
            self.assertEqual(feature["polygons"][0][1][0],
                             feature["polygons"][0][1][-1])
            # hole ring survived with all its vertices
            self.assertEqual(len(feature["polygons"][0][1]), 5)
            self.assertEqual(audit["layers"]["water"]["rings"], 2)
        finally:
            workspace.close()

    def test_multipolygon_two_polygons_one_with_hole(self):
        poly_a = [square_ring(4.882, 52.371), hole_ring(4.8823, 52.3712)]
        poly_b = [square_ring(4.886, 52.374)]
        entries = [
            ("b.json", "pand", feature_collection(
                [make_feature("mp", multipolygon([poly_a, poly_b]),
                              collection="pand", lokaal_id="L-mp")],
                "pand"))
        ]
        ((data, audit), workspace) = convert_entries(entries)
        try:
            feature = data["layers"]["buildings"][0]
            self.assertEqual(len(feature["polygons"]), 2)
            self.assertEqual([len(p) for p in feature["polygons"]], [2, 1])
            self.assertEqual(audit["layers"]["buildings"]["polygons"], 2)
            self.assertEqual(audit["layers"]["buildings"]["rings"], 3)
        finally:
            workspace.close()

    def test_crossing_boundary_geometry_is_retained_unclipped(self):
        # Square straddles the west and north edges of the target bbox.
        ring = square_ring(4.8640, 52.4040, dlon=0.0020, dlat=0.0020)
        entries = [
            ("r.json", "wegdeel", feature_collection(
                [make_feature("cross", polygon([ring]), lokaal_id="L-cross")],
                "wegdeel"))
        ]
        ((data, _audit), workspace) = convert_entries(entries)
        try:
            feature = data["layers"]["roads"][0]
            min_x, min_y, max_x, max_y = feature["bounds"]
            # retained on both sides of the origin edges, not clamped to 0
            self.assertLess(min_x, 0.0)
            self.assertGreater(max_x, 0.0)
            self.assertLess(min_y, 0.0)  # north of originLat -> negative y
            self.assertGreater(max_y, 0.0)
            # and the width/height of the bbox were not used to clamp bounds
            self.assertLess(max_x, data["width"])
        finally:
            workspace.close()

    def test_unsupported_geometry_types_error_with_id(self):
        for geometry in (
            {"type": "Point", "coordinates": [4.88, 52.37]},
            {"type": "LineString",
             "coordinates": [[4.88, 52.37], [4.89, 52.38]]},
            {"type": "GeometryCollection", "geometries": []},
            None,
        ):
            entries = [
                ("w.json", "waterdeel", feature_collection(
                    [make_feature("bad-geom", geometry, lokaal_id="L-bad")],
                    "waterdeel"))
            ]
            with self.assertRaisesRegex(ib.BgtImportError, "bad-geom"):
                convert_entries(entries)

    def test_malformed_rings_error_with_id(self):
        open_ring = square_ring(4.882, 52.371)[:-1]  # not closed
        two_distinct = [[4.882, 52.371], [4.883, 52.371], [4.882, 52.371]]
        nan_ring = [[4.882, 52.371], [4.883, float("nan")],
                    [4.883, 52.372], [4.882, 52.371]]
        short_ring = [[4.882, 52.371], [4.882, 52.371], [4.882, 52.371]]
        for bad_ring in (open_ring, two_distinct, nan_ring, short_ring):
            entries = [
                ("w.json", "waterdeel", feature_collection(
                    [make_feature("bad-ring", polygon([bad_ring]),
                                  lokaal_id="L-ring")],
                    "waterdeel"))
            ]
            with self.assertRaisesRegex(ib.BgtImportError, "bad-ring"):
                convert_entries(entries)

    def test_three_dimensional_positions_rejected(self):
        ring = [[4.882, 52.371, 10.0], [4.883, 52.371, 10.0],
                [4.883, 52.372, 10.0], [4.882, 52.371, 10.0]]
        entries = [
            ("w.json", "waterdeel", feature_collection(
                [make_feature("z", polygon([ring]), lokaal_id="L-z")],
                "waterdeel"))
        ]
        with self.assertRaisesRegex(ib.BgtImportError, r"\b[Zz]\b"):
            convert_entries(entries)


# --------------------------------------------------------------------------- #
# dedup, conflicts, history
# --------------------------------------------------------------------------- #

class DedupConflictTests(unittest.TestCase):
    def _entry(self, name, collection, features):
        return (
            name,
            collection,
            feature_collection(features, collection),
        )

    def test_identical_repeated_feature_across_pages_deduped(self):
        feature = make_feature(
            "dup", polygon([square_ring(4.882, 52.371)]), lokaal_id="L-dup"
        )
        entries = [
            self._entry("p1.json", "waterdeel", [feature]),
            self._entry("p2.json", "waterdeel", [feature]),
        ]
        ((data, audit), workspace) = convert_entries(entries)
        try:
            self.assertEqual(len(data["layers"]["water"]), 1)
            self.assertEqual(audit["inputFeatures"], 2)
            self.assertEqual(audit["duplicates"], 1)
            self.assertEqual(audit["outputFeatures"], 1)
        finally:
            workspace.close()

    def test_same_id_different_bytes_errors(self):
        f1 = make_feature(
            "v", polygon([square_ring(4.882, 52.371)]), lokaal_id="L-v1"
        )
        f2 = make_feature(
            "v", polygon([square_ring(4.889, 52.374)]), lokaal_id="L-v2"
        )
        entries = [
            self._entry("p1.json", "waterdeel", [f1]),
            self._entry("p2.json", "waterdeel", [f2]),
        ]
        with self.assertRaisesRegex(ib.BgtImportError, "conflicting versions"):
            convert_entries(entries)

    def test_duplicate_local_id_two_current_versions_errors(self):
        f1 = make_feature(
            "id-a", polygon([square_ring(4.882, 52.371)]), lokaal_id="L-same"
        )
        f2 = make_feature(
            "id-b", polygon([square_ring(4.889, 52.374)]), lokaal_id="L-same"
        )
        entries = [self._entry("p.json", "pand", [f1, f2])]
        with self.assertRaisesRegex(ib.BgtImportError, "L-same"):
            convert_entries(entries)

    def test_historical_version_excluded_current_geometry_kept(self):
        old = make_feature(
            "id-old", polygon([square_ring(4.881, 52.370)]),
            collection="pand", lokaal_id="L-hist",
            properties={"termination_date": "2026-09-01T00:00:00Z"},
        )
        new = make_feature(
            "id-new", polygon([square_ring(4.889, 52.374)]),
            collection="pand", lokaal_id="L-hist",
            properties={"creation_date": "2026-09-01T00:00:00Z"},
        )
        entries = [self._entry("p.json", "pand", [old, new])]
        ((data, audit), workspace) = convert_entries(entries)
        try:
            buildings = data["layers"]["buildings"]
            self.assertEqual([f["sourceId"] for f in buildings], ["id-new"])
            self.assertEqual(buildings[0]["polygons"][0][0][0][0],
                             round(RADIUS * math.cos(math.radians(52.375))
                                   * math.radians(4.889 - 4.865), 3))
            self.assertEqual(audit["exclusions"][0]["reason"],
                             "terminated_before_snapshot")
            self.assertEqual(
                audit["exclusionCounts"], {"terminated_before_snapshot": 1}
            )
        finally:
            workspace.close()


# --------------------------------------------------------------------------- #
# date validity at snapshot
# --------------------------------------------------------------------------- #

class DateValidityTests(unittest.TestCase):
    def _convert_one(self, properties):
        feature = make_feature(
            "d", polygon([square_ring(4.882, 52.371)]),
            lokaal_id="L-d", properties=properties,
        )
        entries = [("w.json", "waterdeel",
                    feature_collection([feature], "waterdeel"))]
        return convert_entries(entries)

    def test_future_creation_excluded(self):
        ((data, audit), workspace) = self._convert_one(
            {"creation_date": "2026-11-01T00:00:00Z"}
        )
        try:
            self.assertEqual(data["layers"]["water"], [])
            self.assertEqual(
                audit["exclusions"][0]["reason"], "created_after_snapshot"
            )
        finally:
            workspace.close()

    def test_terminated_before_snapshot_excluded(self):
        ((data, audit), workspace) = self._convert_one(
            {"termination_date": "2026-10-15T23:59:59Z"}
        )
        try:
            self.assertEqual(data["layers"]["water"], [])
            self.assertEqual(
                audit["exclusions"][0]["reason"],
                "terminated_before_snapshot",
            )
        finally:
            workspace.close()

    def test_null_dates_kept_without_invention(self):
        ((data, _audit), workspace) = self._convert_one(
            {"creation_date": None, "termination_date": None}
        )
        try:
            feature = data["layers"]["water"][0]
            self.assertIsNone(feature["properties"]["creation_date"])
            self.assertIsNone(feature["properties"]["termination_date"])
        finally:
            workspace.close()

    def test_invalid_date_string_excluded_not_repaired(self):
        ((data, audit), workspace) = self._convert_one(
            {"creation_date": "not-a-date"}
        )
        try:
            self.assertEqual(data["layers"]["water"], [])
            self.assertEqual(
                audit["exclusions"][0]["reason"], "invalid_creation_date"
            )
            self.assertEqual(audit["exclusions"][0]["id"], "d")
        finally:
            workspace.close()

    def test_creation_exactly_at_snapshot_is_current(self):
        ((data, _audit), workspace) = self._convert_one(
            {"creation_date": SNAPSHOT}
        )
        try:
            self.assertEqual(len(data["layers"]["water"]), 1)
        finally:
            workspace.close()


# --------------------------------------------------------------------------- #
# integrity / manifest abuse
# --------------------------------------------------------------------------- #

class IntegrityTests(unittest.TestCase):
    def _workspace(self, features=()):
        return FixtureWorkspace([
            ("w.json", "waterdeel",
             feature_collection(list(features), "waterdeel"))
        ])

    def test_tampered_sha_errors(self):
        workspace = self._workspace([
            make_feature("x", polygon([square_ring(4.882, 52.371)]),
                         lokaal_id="L-x")
        ])
        try:
            workspace.manifest["inputs"][0]["sha256"] = "0" * 64
            with self.assertRaisesRegex(ib.BgtImportError, "sha256 mismatch"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()

    def test_collection_identity_mismatch_errors(self):
        doc = feature_collection(
            [make_feature("x", polygon([square_ring(4.882, 52.371)]),
                          lokaal_id="L-x")],
            "waterdeel",
            override_self=(
                "https://api.pdok.nl/kadaster/bgt/ogc/v1/collections/pand/items"
            ),
        )
        workspace = FixtureWorkspace([("w.json", "waterdeel", doc)])
        try:
            with self.assertRaisesRegex(ib.BgtImportError, "collection"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()

    def test_unknown_layer_errors(self):
        doc = feature_collection([], "groenvoorziening")
        workspace = FixtureWorkspace([
            ("g.json", "groenvoorziening", doc)
        ])
        try:
            with self.assertRaisesRegex(ib.BgtImportError, "unknown"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()

    def test_invalid_bbox_errors(self):
        workspace = self._workspace()
        try:
            workspace.manifest["bbox"] = [4.97, 52.345, 4.865, 52.405]
            with self.assertRaisesRegex(ib.BgtImportError, "west < east"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()

    def test_missing_feature_id_errors(self):
        feature = make_feature(
            "x", polygon([square_ring(4.882, 52.371)]), lokaal_id="L-x"
        )
        del feature["id"]
        workspace = FixtureWorkspace([
            ("w.json", "waterdeel", feature_collection([feature], "waterdeel"))
        ])
        try:
            with self.assertRaisesRegex(ib.BgtImportError, "string id"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()

    def test_not_feature_collection_errors(self):
        workspace = self._workspace()
        path = os.path.join(workspace.base, "w.json")
        payload = json.dumps({"type": "Feature"}).encode("utf-8")
        with open(path, "wb") as handle:
            handle.write(payload)
        workspace.manifest["inputs"][0]["sha256"] = hashlib.sha256(
            payload
        ).hexdigest()
        try:
            with self.assertRaisesRegex(ib.BgtImportError, "FeatureCollection"):
                ib.convert(workspace.manifest, workspace.base)
        finally:
            workspace.close()


# --------------------------------------------------------------------------- #
# output schema, properties, ordering
# --------------------------------------------------------------------------- #

class OutputSchemaTests(unittest.TestCase):
    def setUp(self):
        f_z = make_feature(
            "zzz-id", polygon([square_ring(4.882, 52.371)]),
            collection="wegdeel", lokaal_id="L-z",
            properties={
                "functie": "rijbaan voor fietsers",
                "fysiek_voorkomen": "open verharding",
                "tijdstip_registratie": "2018-01-02T00:00:00Z",
                "eind_registratie": None,
                "relatieve_hoogteligging": 0,
                "unexpected_field": "must be dropped",
            },
        )
        f_a = make_feature(
            "aaa-id", polygon([square_ring(4.886, 52.374)]),
            collection="wegdeel", lokaal_id="L-a",
            properties={"functie": "voetpad"},
        )
        entries = [("r.json", "wegdeel",
                    feature_collection([f_z, f_a], "wegdeel"))]
        (self.result, self.workspace) = convert_entries(entries)
        self.data, self.audit = self.result

    def tearDown(self):
        self.workspace.close()

    def test_sorted_by_source_id(self):
        ids = [f["sourceId"] for f in self.data["layers"]["roads"]]
        self.assertEqual(ids, ["aaa-id", "zzz-id"])

    def test_properties_selected_only_when_present(self):
        first = self.data["layers"]["roads"][0]["properties"]
        self.assertNotIn("unexpected_field", first)
        self.assertNotIn("fysiek_voorkomen", first)  # absent, not invented
        self.assertEqual(first["functie"], "voetpad")
        self.assertEqual(first["creation_date"], "2018-01-01T00:00:00Z")
        second = self.data["layers"]["roads"][1]["properties"]
        self.assertIsNone(second["eind_registratie"])  # present null retained
        self.assertNotIn("unexpected_field", second)
        allowed = set(ib.KEEP_PROPERTIES)
        for feature in self.data["layers"]["roads"]:
            self.assertTrue(set(feature["properties"]).issubset(allowed))

    def test_feature_shape(self):
        feature = self.data["layers"]["roads"][0]
        self.assertEqual(set(feature),
                         {"id", "sourceId", "localId", "properties",
                          "polygons", "bounds"})
        self.assertTrue(feature["id"].startswith("wegdeel:"))
        self.assertIsInstance(feature["bounds"], list)
        self.assertEqual(len(feature["bounds"]), 4)

    def test_deterministic_byte_ordering(self):
        again, _audit = ib.convert(
            self.workspace.manifest, self.workspace.base
        )
        self.assertEqual(ib.dumps_json(self.data), ib.dumps_json(again))
        self.assertEqual(ib.dumps_json(self.audit),
                         ib.dumps_json(_audit))


class CliTests(unittest.TestCase):
    def test_cli_writes_json_js_audit(self):
        feature = make_feature(
            "cli", polygon([square_ring(4.882, 52.371)]), lokaal_id="L-cli"
        )
        workspace = FixtureWorkspace([
            ("w.json", "waterdeel",
             feature_collection([feature], "waterdeel"))
        ])
        try:
            manifest_path = os.path.join(workspace.base, "manifest.json")
            with open(manifest_path, "w", encoding="utf-8") as handle:
                json.dump(workspace.manifest, handle)
            json_path = os.path.join(workspace.base, "geo-data.json")
            js_path = os.path.join(workspace.base, "geo-data.js")
            audit_path = os.path.join(workspace.base, "import-audit.json")
            code = ib.main([
                "--manifest", manifest_path,
                "--json", json_path,
                "--js", js_path,
                "--audit", audit_path,
            ])
            self.assertEqual(code, 0)
            with open(json_path, encoding="utf-8") as handle:
                data = json.load(handle)
            self.assertEqual(data["layers"]["water"][0]["sourceId"], "cli")
            with open(js_path, encoding="utf-8") as handle:
                js_text = handle.read()
            self.assertIn("AmsterdamGeoData", js_text)
            with open(audit_path, encoding="utf-8") as handle:
                audit = json.load(handle)
            self.assertEqual(audit["outputFeatures"], 1)
        finally:
            workspace.close()

    def test_cli_error_returns_nonzero(self):
        code = ib.main([
            "--manifest", os.path.join(HERE, "does-not-exist.json"),
            "--json", os.path.join(HERE, "unused.json"),
            "--js", os.path.join(HERE, "unused.js"),
            "--audit", os.path.join(HERE, "unused-audit.json"),
        ])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)

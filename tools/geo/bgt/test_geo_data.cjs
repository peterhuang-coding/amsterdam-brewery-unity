"use strict";

// Verifies the generated browser/CommonJS wrapper and the frozen
// geo-interface v1 schema against the actual converted BGT samples.
// Node built-ins only.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const here = __dirname;
const jsonPath = path.join(here, "geo-data.json");
const jsPath = path.join(here, "geo-data.js");

const data = require(jsPath);
const fromJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const jsSource = fs.readFileSync(jsPath, "utf8");

const LAYERS = ["water", "buildings", "roads", "bridges"];
const COLLECTION_BY_LAYER = {
  water: "waterdeel",
  buildings: "pand",
  roads: "wegdeel",
  bridges: "overbruggingsdeel",
};
const ALLOWED_PROPERTIES = new Set([
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
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

test("wrapper object is deep-identical to geo-data.json", () => {
  assert.deepStrictEqual(data, fromJson);
});

test("UMD wrapper exposes globalThis.AmsterdamGeoData and module.exports", () => {
  assert.strictEqual(globalThis.AmsterdamGeoData, data);
  assert.ok(jsSource.includes("AmsterdamGeoData"));
  assert.ok(jsSource.includes("module.exports"));
  // no external dependencies
  assert.ok(!jsSource.includes("require("));
});

test("top-level schema and projection block", () => {
  assert.strictEqual(data.schemaVersion, 1);
  assert.deepStrictEqual(data.bbox, [4.865, 52.345, 4.97, 52.405]);
  const projection = data.projection;
  assert.strictEqual(projection.type, "local-equirectangular");
  assert.strictEqual(projection.originLon, 4.865);
  assert.strictEqual(projection.originLat, 52.405);
  assert.strictEqual(projection.referenceLat, 52.375);
  assert.strictEqual(projection.radiusMeters, 6371008.8);
  assert.strictEqual(projection.units, "metres");
  const R = 6371008.8;
  const width = Number(
    (R * Math.cos((52.375 * Math.PI) / 180) * ((0.105 * Math.PI) / 180)).toFixed(3)
  );
  const height = Number((R * ((0.06 * Math.PI) / 180)).toFixed(3));
  assert.strictEqual(data.width, width);
  assert.strictEqual(data.height, height);
  assert.ok(data.width > 6000 && data.width < 8000);
  assert.ok(data.height > 6000 && data.height < 7500);
});

test("source metadata, shas and explicit incomplete limitation", () => {
  const source = data.source;
  assert.strictEqual(source.provider, "Kadaster / PDOK BGT");
  assert.strictEqual(source.url, "https://api.pdok.nl/kadaster/bgt/ogc/v1/");
  assert.strictEqual(source.license, "CC0-1.0");
  assert.strictEqual(source.snapshot, "2026-10-16T00:00:00Z");
  assert.strictEqual(source.complete, false);
  assert.ok(Array.isArray(source.limitations) && source.limitations.length >= 1);
  const text = source.limitations.join(" ");
  assert.match(text, /incomplete/i);
  assert.match(text, /next page/i);
  assert.strictEqual(source.inputs.length, 4);
  const seen = new Set();
  for (const input of source.inputs) {
    assert.ok(typeof input.file === "string" && input.file.length > 0);
    assert.ok(HEX64_RE.test(input.sha256));
    assert.ok(Object.values(COLLECTION_BY_LAYER).includes(input.collection));
    seen.add(input.file);
  }
  assert.deepStrictEqual(
    [...seen].sort(),
    [
      "samples/bridges.json",
      "samples/buildings.json",
      "samples/roads.json",
      "samples/water.json",
    ]
  );
});

test("exact real sample counts (no full-city claim)", () => {
  const counts = {};
  let total = 0;
  for (const layer of LAYERS) {
    counts[layer] = data.layers[layer].length;
    total += counts[layer];
  }
  assert.deepStrictEqual(counts, {
    water: 3,
    buildings: 5,
    roads: 5,
    bridges: 5,
  });
  assert.strictEqual(total, 18);
  assert.strictEqual(data.source.complete, false);
});

test("every feature has traceable source id, valid rings and bounds", () => {
  for (const layer of LAYERS) {
    const ids = new Set();
    for (const feature of data.layers[layer]) {
      assert.ok(typeof feature.id === "string");
      assert.ok(
        feature.id.startsWith(COLLECTION_BY_LAYER[layer] + ":"),
        feature.id
      );
      assert.ok(UUID_RE.test(feature.sourceId), feature.sourceId);
      assert.strictEqual(
        feature.id,
        COLLECTION_BY_LAYER[layer] + ":" + feature.sourceId
      );
      assert.ok(feature.localId === null || typeof feature.localId === "string");
      assert.ok(!ids.has(feature.id), "duplicate output id " + feature.id);
      ids.add(feature.id);

      assert.ok(feature.properties && typeof feature.properties === "object");
      for (const key of Object.keys(feature.properties)) {
        assert.ok(
          ALLOWED_PROPERTIES.has(key),
          layer + " " + feature.id + " unexpected property " + key
        );
      }

      assert.ok(Array.isArray(feature.polygons) && feature.polygons.length >= 1);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const polygon of feature.polygons) {
        assert.ok(Array.isArray(polygon) && polygon.length >= 1);
        for (const ring of polygon) {
          assert.ok(Array.isArray(ring) && ring.length >= 4);
          assert.deepStrictEqual(ring[0], ring[ring.length - 1]);
          const distinct = new Set(ring.slice(0, -1).map((p) => p.join(",")));
          assert.ok(distinct.size >= 3, feature.id + " degenerate ring");
          for (const point of ring) {
            assert.ok(Array.isArray(point) && point.length === 2);
            const [x, y] = point;
            assert.ok(isFiniteNumber(x) && isFiniteNumber(y));
            assert.strictEqual(x, Number(x.toFixed(3)));
            assert.strictEqual(y, Number(y.toFixed(3)));
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      assert.deepStrictEqual(feature.bounds, [minX, minY, maxX, maxY]);
    }
  }
});

test("known source features survive with original properties", () => {
  const buildings = data.layers.buildings;
  const known = buildings.find(
    (f) => f.sourceId === "93ac4f4a-2edc-5477-aa3b-975035c20894"
  );
  assert.ok(known);
  assert.strictEqual(known.id, "pand:93ac4f4a-2edc-5477-aa3b-975035c20894");
  assert.strictEqual(known.localId, "G0363.0018ea2439d648a3810dd66277139cf6");
  assert.strictEqual(known.properties.bag_pnd, "0363100012173593");
  assert.strictEqual(known.properties.status, "bestaand");

  assert.ok(
    data.layers.bridges.some(
      (f) => f.properties.type_overbruggingsdeel === "dek"
    )
  );
  assert.ok(
    data.layers.roads.some((f) => f.properties.functie === "parkeervlak")
  );
  assert.ok(
    data.layers.water.some((f) => f.properties.type === "waterloop")
  );
  // MultiPolygon source retained as multiple polygons for buildings
  assert.ok(
    data.layers.buildings.every((f) => f.polygons.length >= 1)
  );
});

test("features are deterministically ordered by source id", () => {
  for (const layer of LAYERS) {
    const ids = data.layers[layer].map((f) => f.sourceId);
    const sorted = [...ids].sort();
    assert.deepStrictEqual(ids, sorted);
  }
});

test("whole document is finite and JSON round-trips", () => {
  const text = fs.readFileSync(jsonPath, "utf8");
  assert.ok(!/NaN|Infinity/.test(text));
  assert.strictEqual(JSON.stringify(data), JSON.stringify(fromJson));
});

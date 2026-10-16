"use strict";

/*
 * D26 NAV01 deterministic synthetic-city benchmark for geo-navigation.js.
 *
 * The city is a 1 km x 1 km tiled grid (no randomness, no BGT data):
 *  - 11 horizontal + 11 vertical roads (6 m wide, 100 m spacing); every
 *    block interior is a building, so off-road routing is impossible;
 *  - a 20 m canal cuts the city north/south at x=540..560;
 *  - only two bridge decks ("dek") cross it, at y=300 and y=700;
 *    the y=300 approach road is "voetpad" (walk only), y=700 is open;
 *  - a "pijler" (pier) at y=500 must NOT act as a crossing;
 *  - a disconnected road island sits outside the city.
 *
 * The benchmark asserts geometric invariants (safe segments, real bridge
 * usage, mode-specific detours, bounded search, unreachable island); it does
 * not merely time an empty call. Output is one machine-readable JSON line.
 */

const assert = require("node:assert");
const Geo = require("./geo-navigation.js");

function rect(x0, y0, x1, y1) {
  return [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
}

function feature(id, collection, polygons, properties) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const c of ring) {
        if (c[0] < minX) minX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] > maxY) maxY = c[1];
      }
    }
  }
  return {
    id: collection + ":" + id,
    sourceId: String(id),
    localId: null,
    properties: properties || {},
    polygons,
    bounds: [minX, minY, maxX, maxY]
  };
}

const BLOCK = 100;
const HALF = 3;
const CITY = 1000;

const roads = [];
let rid = 0;
for (let k = 0; k <= 10; k++) {
  const c = k * BLOCK;
  // Horizontal road; the y=300 one is voetgangers-only.
  roads.push(feature("h" + k, "wegdeel",
    rect(-30, c - HALF, CITY + 30, c + HALF),
    c === 300 ? { functie: "voetpad" } : { functie: null }));
  roads.push(feature("v" + k, "wegdeel",
    rect(c - HALF, -30, c + HALF, CITY + 30),
    { functie: null }));
}

const buildings = [];
let bid = 0;
for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    buildings.push(feature("b" + (bid++), "pand",
      rect(i * BLOCK + 6, j * BLOCK + 6, i * BLOCK + 94, j * BLOCK + 94), {}));
  }
}

const water = [
  feature("canal", "waterdeel", rect(540, -30, 560, CITY + 30), { type: "waterloop" })
];

const bridges = [
  feature("deck300", "overbruggingsdeel", rect(540, 297, 560, 303),
    { type_overbruggingsdeel: "dek" }),
  feature("deck700", "overbruggingsdeel", rect(540, 697, 560, 703),
    { type_overbruggingsdeel: "dek" }),
  feature("pier500", "overbruggingsdeel", rect(540, 497, 560, 503),
    { type_overbruggingsdeel: "pijler" })
];

// Disconnected road island well outside the city.
roads.push(feature("island", "wegdeel", rect(1100, 1100, 1130, 1130),
  { functie: "fietspad" }));

const data = {
  schemaVersion: 1,
  bbox: [4.86, 52.34, 4.98, 52.41],
  projection: {
    type: "local-equirectangular",
    originLon: 4.86,
    originLat: 52.41,
    referenceLat: 52.375,
    radiusMeters: 6371008.8,
    units: "metres"
  },
  source: {
    provider: "synthetic benchmark fixture",
    url: null,
    license: null,
    snapshot: null,
    complete: false,
    inputs: [],
    limitations: ["deterministic synthetic geometry, not BGT source data"]
  },
  layers: { water, buildings, roads, bridges }
};

const t0 = process.hrtime.bigint();
const nav = Geo.createNavigator(data, { cellSize: 2, maxNodes: 250000, bucketSize: 64 });
const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;

const start = { x: 0, y: 0 };
const goal = { x: 1000, y: 650 };

// Find every y at which a polyline crosses the canal centre line x=550.
function crossingYs(points) {
  const ys = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.x <= 550 && b.x >= 550) || (b.x <= 550 && a.x >= 550)) {
      const t = (550 - a.x) / (b.x - a.x);
      ys.push(a.y + (b.y - a.y) * t);
    }
  }
  return ys;
}

function auditRoute(res, mode) {
  assert.equal(res.found, true, mode + " route found");
  assert.equal(res.reason, "ok");
  assert.ok(res.points.length >= 2);
  for (let i = 1; i < res.points.length; i++) {
    assert.ok(
      nav.segmentWalkable(res.points[i - 1], res.points[i], { mode }),
      mode + " segment " + i + " must be walkable"
    );
  }
  // Dense point audit: no building, no open water.
  for (let i = 1; i < res.points.length; i++) {
    const a = res.points[i - 1];
    const b = res.points[i];
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      assert.ok(nav.isWalkable(p, { mode }), mode + " dense route point walkable");
    }
  }
  let length = 0;
  for (let i = 1; i < res.points.length; i++) {
    length += Math.sqrt(
      (res.points[i].x - res.points[i - 1].x) ** 2 +
      (res.points[i].y - res.points[i - 1].y) ** 2
    );
  }
  assert.ok(Math.abs(length - res.length) < 1e-6);
  return length;
}

const t1 = process.hrtime.bigint();
const walk = nav.route(start, goal, { mode: "walk" });
const walkMs = Number(process.hrtime.bigint() - t1) / 1e6;
const walkLength = auditRoute(walk, "walk");
const walkCrossings = crossingYs(walk.points);

const t2 = process.hrtime.bigint();
const bike = nav.route(start, goal, { mode: "bike" });
const bikeMs = Number(process.hrtime.bigint() - t2) / 1e6;
const bikeLength = auditRoute(bike, "bike");
const bikeCrossings = crossingYs(bike.points);

// Geometric expectations: walk crosses at the y=300 deck, bike is forced to
// y=700 because the y=300 road is voetpad and the pier at 500 is not a deck.
assert.ok(walkCrossings.length >= 1, "walk crosses the canal at least once");
assert.ok(walkCrossings.every(y => y >= 295 && y <= 305),
  "walk crossing at deck300, got " + walkCrossings);
assert.ok(bikeCrossings.length >= 1, "bike crosses the canal at least once");
assert.ok(bikeCrossings.every(y => y >= 695 && y <= 705),
  "bike crossing at deck700, got " + bikeCrossings);
// Both follow road surfaces: longer than the impossible straight line
// (sqrt(1000^2+650^2) ~= 1192.7), shorter than a worst-case grid crawl.
const direct = Math.sqrt(1000 * 1000 + 650 * 650);
assert.ok(walkLength > direct && walkLength < 1700, "walk length " + walkLength);
assert.ok(bikeLength > direct && bikeLength < 1900, "bike length " + bikeLength);
// The bike exclusion of the y=300 voetpad forces a real, measured detour.
assert.ok(bikeLength > walkLength + 50,
  "bike detour longer than walk: " + bikeLength + " vs " + walkLength);

// Pier never bridges the canal for either mode.
assert.equal(nav.segmentWalkable({ x: 530, y: 500 }, { x: 570, y: 500 }, { mode: "walk" }), false);
assert.equal(nav.segmentWalkable({ x: 530, y: 500 }, { x: 570, y: 500 }, { mode: "bike" }), false);
// Open-water stretches without a deck block both modes too.
assert.equal(nav.segmentWalkable({ x: 530, y: 100 }, { x: 570, y: 100 }, { mode: "walk" }), false);
assert.equal(nav.segmentWalkable({ x: 530, y: 100 }, { x: 570, y: 100 }, { mode: "bike" }), false);
// The deck itself is the only crossing; bike physically on deck300 but unable
// to reach it over the voetpad approaches.
assert.equal(nav.isWalkable({ x: 550, y: 300 }, { mode: "bike" }), true);
assert.equal(nav.segmentWalkable({ x: 538, y: 300 }, { x: 562, y: 300 }, { mode: "bike" }), false);
assert.equal(nav.segmentWalkable({ x: 538, y: 300 }, { x: 562, y: 300 }, { mode: "walk" }), true);

// Bounded search: explicit budget terminates with reason limit.
const limited = nav.route(start, goal, { mode: "walk", maxNodes: 50 });
assert.equal(limited.found, false);
assert.equal(limited.reason, "limit");
assert.ok(limited.visited <= 51, "limited visited " + limited.visited);

// Disconnected island is unreachable and the search stays well bounded.
const island = nav.route(start, { x: 1115, y: 1115 }, { mode: "walk" });
assert.equal(island.found, false);
assert.equal(island.reason, "unreachable");
assert.ok(island.visited < 200000, "island search bounded, visited " + island.visited);

// Snap is bounded and lands on a real road surface.
const snapped = nav.snap({ x: 50, y: 50 }, { mode: "walk", maxDistance: 80 });
assert.ok(snapped && snapped.distance > 0 && snapped.distance <= 80);
assert.ok(nav.isWalkable({ x: snapped.x, y: snapped.y }, { mode: "walk" }));
assert.equal(nav.snap({ x: 50, y: 50 }, { mode: "walk", maxDistance: 20 }), null);

const stats = nav.stats();
assert.ok(walk.visited < 100000, "walk visited " + walk.visited);
assert.ok(bike.visited < 100000, "bike visited " + bike.visited);
assert.equal(stats.features.roads, roads.length);
assert.equal(stats.features.buildings, buildings.length);
assert.equal(stats.features.water, 1);
assert.equal(stats.features.bridges, 3);
assert.equal(stats.features.bridgeDeckFeatures, 2);
assert.equal(stats.features.ignoredNonDeckBridgeParts, 1);

const result = {
  ok: true,
  schemaVersion: 1,
  fixture: {
    cityMeters: CITY,
    roadSpacingMeters: BLOCK,
    roadWidthMeters: HALF * 2,
    cellSizeMeters: 2,
    deterministic: true,
    source: "synthetic"
  },
  counts: {
    roadFeatures: roads.length,
    buildingFeatures: buildings.length,
    waterFeatures: water.length,
    bridgeFeatures: bridges.length
  },
  walk: {
    found: walk.found,
    reason: walk.reason,
    length: Math.round(walk.length * 1000) / 1000,
    points: walk.points.length,
    visited: walk.visited,
    canalCrossingYs: walkCrossings.map(y => Math.round(y * 1000) / 1000),
    elapsedMs: Math.round(walkMs * 1000) / 1000
  },
  bike: {
    found: bike.found,
    reason: bike.reason,
    length: Math.round(bike.length * 1000) / 1000,
    points: bike.points.length,
    visited: bike.visited,
    canalCrossingYs: bikeCrossings.map(y => Math.round(y * 1000) / 1000),
    elapsedMs: Math.round(bikeMs * 1000) / 1000
  },
  invariants: {
    allRouteSegmentsWalkable: true,
    walkUsesDeck300: walkCrossings.every(y => y >= 295 && y <= 305),
    bikeUsesDeck700: bikeCrossings.every(y => y >= 695 && y <= 705),
    pier500NotCrossable: false === nav.segmentWalkable(
      { x: 530, y: 500 }, { x: 570, y: 500 }, { mode: "walk" }),
    searchBounded: walk.visited < 100000 && bike.visited < 100000,
    budgetTerminates: limited.reason === "limit",
    islandUnreachable: island.reason === "unreachable",
    snapBounded: snapped.distance <= 80
  },
  limits: {
    maxNodes: 50,
    islandVisited: island.visited
  },
  buildElapsedMs: Math.round(buildMs * 1000) / 1000,
  stats
};

console.log(JSON.stringify(result));

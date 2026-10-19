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
 * not merely time an empty call. A second section loads the read-only real
 * BGT public sample (2 water / 23 buildings / 36 roads / 1 deck, explicitly
 * incomplete) and reports radius 0 and radius 0.4 route safety, time and
 * nodes with the same audit standards. It also re-runs the supplied parent
 * R3 witnesses: the 0.4 m capsule/first dense unsafe centre (GEOS clearance
 * 0.39969294375176584 m), the 10001-centre dense census and the bare vs
 * "rijbaan "-prefixed motorway exclusion. Output is one machine-readable JSON
 * line; measurements describe this subset only, not the full city.
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

// ---------------------------------------------------------------------------
// Real BGT public sample (read-only fixture; explicitly NOT complete city:
// 2 water / 23 buildings / 36 roads / 1 deck selected by parent bounds).
// Same geometric audit standards as the synthetic city; measurements are
// evidence for this subset only, never a city-wide performance claim.
// ---------------------------------------------------------------------------

const realData = require("./real-pub-sample.json");
const REAL_START = { x: 1100.211, y: 3243.117 };
const REAL_GOAL = { x: 1056.057, y: 3247.41 };

function layerFeatureCount(name) {
  return Array.isArray(realData.layers[name]) ? realData.layers[name].length : 0;
}
let realPolygons = 0;
let realRings = 0;
let realCoordinates = 0;
for (const name of ["water", "buildings", "roads", "bridges"]) {
  for (const f of realData.layers[name] || []) {
    for (const polygon of f.polygons) {
      realPolygons++;
      for (const ring of polygon) {
        realRings++;
        realCoordinates += ring.length;
      }
    }
  }
}

const tr0 = process.hrtime.bigint();
const realNav = Geo.createNavigator(realData, { cellSize: 2, maxNodes: 250000, bucketSize: 64 });
const realBuildMs = Number(process.hrtime.bigint() - tr0) / 1e6;

const realStats = realNav.stats();
assert.equal(realStats.features.water, 2);
assert.equal(realStats.features.buildings, 23);
assert.equal(realStats.features.roads, 36);
assert.equal(realStats.features.bridges, 1);
assert.equal(realStats.features.bridgeDeckFeatures, 1);
assert.equal(realData.source.complete, false);

function denseAudit(nav, res, mode, radius) {
  let densePoints = 0;
  let allSegments = true;
  let allDense = true;
  for (let i = 1; i < res.points.length; i++) {
    const a = res.points[i - 1];
    const b = res.points[i];
    if (!nav.segmentWalkable(a, b, { mode, radius })) allSegments = false;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 0; k <= steps; k++) {
      densePoints++;
      const p = { x: a.x + (b.x - a.x) * k / steps, y: a.y + (b.y - a.y) * k / steps };
      if (!nav.isWalkable(p, { mode, radius })) allDense = false;
    }
  }
  return { allSegments, allDense, densePoints };
}

function measuredRoute(nav, radius) {
  const t = process.hrtime.bigint();
  const res = nav.route(REAL_START, REAL_GOAL, { mode: "walk", radius });
  const elapsedMs = Number(process.hrtime.bigint() - t) / 1e6;
  const again = nav.route(REAL_START, REAL_GOAL, { mode: "walk", radius });
  assert.equal(again.found, res.found, "radius " + radius + " determinism (found)");
  assert.equal(again.reason, res.reason, "radius " + radius + " determinism (reason)");
  assert.equal(again.visited, res.visited, "radius " + radius + " determinism (visited)");
  assert.ok(Math.abs(again.length - res.length) < 1e-9);
  const out = {
    found: res.found,
    reason: res.reason,
    length: Math.round(res.length * 1e6) / 1e6,
    points: res.points.length,
    visited: res.visited,
    anchorsPreserved: res.found
      ? res.points[0].x === REAL_START.x && res.points[0].y === REAL_START.y &&
        res.points[res.points.length - 1].x === REAL_GOAL.x &&
        res.points[res.points.length - 1].y === REAL_GOAL.y
      : null,
    startSnap: res.startSnap,
    endSnap: res.endSnap,
    elapsedMs: Math.round(elapsedMs * 1000) / 1000,
    audit: null
  };
  if (res.found) {
    const ta = process.hrtime.bigint();
    const audit = denseAudit(nav, res, "walk", radius);
    audit.elapsedMs = Math.round(Number(process.hrtime.bigint() - ta) / 1e4) / 100;
    assert.ok(audit.allSegments, "real radius " + radius + " returned segments must be safe");
    assert.ok(audit.allDense, "real radius " + radius + " dense samples must be safe");
    assert.equal(out.anchorsPreserved, true, "radius " + radius + " must not move anchors");
    assert.equal(res.startSnap, null);
    assert.equal(res.endSnap, null);
    out.audit = audit;
  } else {
    assert.ok(["unwalkable", "unreachable", "limit"].includes(res.reason));
    assert.deepEqual(res.points, []);
  }
  return out;
}

const startClear0 = realNav.isWalkable(REAL_START, { radius: 0 });
const goalClear0 = realNav.isWalkable(REAL_GOAL, { radius: 0 });
const startClear04 = realNav.isWalkable(REAL_START, { radius: 0.4 });
const goalClear04 = realNav.isWalkable(REAL_GOAL, { radius: 0.4 });
assert.equal(startClear0, true, "documented start anchor is radius-0 walkable");
assert.equal(goalClear0, true, "documented goal anchor is radius-0 walkable");

const realWalk0 = measuredRoute(realNav, 0);
const realWalk04 = measuredRoute(realNav, 0.4);
// Parent baseline for this exact packed subset.
assert.equal(realWalk0.found, true);
assert.ok(Math.abs(realWalk0.length - 49.33733834) < 1e-6,
  "real radius-0 length " + realWalk0.length);
assert.equal(realWalk0.points, 4);
assert.equal(realWalk0.visited, 70);
// An unwalkable radius-0.4 anchor must be reported, never silently snapped.
if (!startClear04 || !goalClear04) {
  assert.equal(realWalk04.found, false);
  assert.equal(realWalk04.reason, "unwalkable");
}

// Is the radius-0 polyline itself 0.4 m clear? Reported as measured evidence.
const baselineRadius04 = denseAudit(realNav,
  realNav.route(REAL_START, REAL_GOAL, { mode: "walk", radius: 0 }), "walk", 0.4);

// ---------------------------------------------------------------------------
// Parent R2/R3 witnesses on this exact 62-feature subset (sample evidence,
// never a full-city claim):
//  - the supplied capsule case (GEOS minimum clearance 0.39969294375176584 m
//    < 0.4 m; 35/10001 dense centres unsafe; first fraction 0.0368);
//  - the disclosed bare vs "rijbaan "-prefixed motorway contract gap.
// ---------------------------------------------------------------------------

const capsuleRepro = require("./parent-capsule-repro.json");
const r2Witness = require("./parent-r2-witness.json");

const wc0 = capsuleRepro.case;
const witnessCenter = {
  x: r2Witness.firstDenseWitness.center[0],
  y: r2Witness.firstDenseWitness.center[1]
};
const witnessLineR0 = realNav.segmentWalkable(wc0.start, wc0.end,
  { mode: wc0.mode, radius: 0 });
const witnessCapsuleR04 = realNav.segmentWalkable(wc0.start, wc0.end,
  { mode: wc0.mode, radius: wc0.radius });
const witnessDiskR0 = realNav.isWalkable(witnessCenter,
  { mode: wc0.mode, radius: 0 });
const witnessDiskR04 = realNav.isWalkable(witnessCenter,
  { mode: wc0.mode, radius: wc0.radius });
assert.equal(witnessLineR0, true, "witness centre line is covered at radius 0");
assert.equal(capsuleRepro.lineCovered, true);
assert.equal(witnessCapsuleR04, false, "0.4 m capsule must be rejected");
assert.equal(witnessDiskR0, true, "witness centre covered at radius 0");
assert.equal(witnessDiskR04, false, "first unsafe centre rejected at radius 0.4");

// Dense census: every centre is covered at radius 0; the unsafe set at
// radius 0.4 must match the independent GEOS sweep (35 centres, first 0.0368).
const tWitness = process.hrtime.bigint();
let witnessUnsafe = 0;
let witnessFirstFraction = null;
const DENSE_N = capsuleRepro.denseCount;
for (let k = 0; k < DENSE_N; k++) {
  const t = k / (DENSE_N - 1);
  const p = {
    x: wc0.start.x + (wc0.end.x - wc0.start.x) * t,
    y: wc0.start.y + (wc0.end.y - wc0.start.y) * t
  };
  assert.equal(realNav.isWalkable(p, { mode: wc0.mode, radius: 0 }), true,
    "witness centre line covered at fraction " + t);
  if (!realNav.isWalkable(p, { mode: wc0.mode, radius: wc0.radius })) {
    if (witnessFirstFraction === null) witnessFirstFraction = t;
    witnessUnsafe++;
  }
}
const witnessCensusMs = Math.round(Number(process.hrtime.bigint() - tWitness) / 1e4) / 100;
assert.equal(witnessUnsafe, capsuleRepro.unsafeCenters, "dense unsafe centre count");
assert.equal(capsuleRepro.unsafeCenters, 35);
assert.ok(Math.abs(witnessFirstFraction - r2Witness.firstDenseWitness.fraction) < 1e-12,
  "first unsafe fraction " + witnessFirstFraction);

// Exact highway labels: bare and prefixed forms excluded in both modes, the
// agreed carriageway classes stay open.
const highwayExcluded = {};
for (const functie of Object.keys(r2Witness.highwayContractGap)) {
  const hn = Geo.createNavigator({
    layers: {
      roads: [feature("hw-" + functie, "wegdeel", rect(-400, -400, -390, -390),
        { functie })],
      water: [], buildings: [], bridges: []
    }
  });
  const hp = { x: -395, y: -395 };
  const walk = hn.isWalkable(hp, { mode: "walk" });
  const bike = hn.isWalkable(hp, { mode: "bike" });
  highwayExcluded[functie] = { walk, bike };
  assert.equal(walk, false, "walk excludes " + functie);
  assert.equal(bike, false, "bike excludes " + functie);
}
for (const functie of ["rijbaan lokale weg", "rijbaan regionale weg", "fietspad"]) {
  const hn = Geo.createNavigator({
    layers: {
      roads: [feature("ok-" + functie, "wegdeel", rect(-400, -380, -390, -370),
        { functie })],
      water: [], buildings: [], bridges: []
    }
  });
  const hp = { x: -395, y: -375 };
  assert.equal(hn.isWalkable(hp, { mode: "walk" }), true, "walk retains " + functie);
  assert.equal(hn.isWalkable(hp, { mode: "bike" }), true, "bike retains " + functie);
}

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
  stats,
  realFixture: {
    source: "Kadaster / PDOK BGT",
    snapshot: realData.source.snapshot,
    complete: false,
    note: "bounds-selected diagnostic subset, not complete city coverage",
    anchors: { start: REAL_START, goal: REAL_GOAL },
    counts: {
      waterFeatures: layerFeatureCount("water"),
      buildingFeatures: layerFeatureCount("buildings"),
      roadFeatures: layerFeatureCount("roads"),
      bridgeFeatures: layerFeatureCount("bridges"),
      polygons: realPolygons,
      rings: realRings,
      ringCoordinates: realCoordinates
    },
    buildElapsedMs: Math.round(realBuildMs * 1000) / 1000,
    endpointWalkable: {
      radius0: { start: startClear0, goal: goalClear0 },
      radius04: { start: startClear04, goal: goalClear04 }
    },
    walkRadius0: realWalk0,
    walkRadius04: realWalk04,
    radius0PathUnderRadius04: {
      allSegmentsClear: baselineRadius04.allSegments,
      allDensePointsClear: baselineRadius04.allDense,
      densePointsAudited: baselineRadius04.densePoints
    },
    // R3 parent witnesses, re-measured on this exact subset.
    parentWitness: {
      capsule: {
        start: wc0.start,
        end: wc0.end,
        radius: wc0.radius,
        expected: wc0.expected,
        lineCoveredRadius0: witnessLineR0,
        capsuleWalkableRadius04: witnessCapsuleR04,
        parentMinimumClearance: capsuleRepro.minimumClearance,
        rejected: witnessCapsuleR04 === false
      },
      firstDenseCenter: {
        fraction: r2Witness.firstDenseWitness.fraction,
        center: witnessCenter,
        parentClearance: r2Witness.firstDenseWitness.clearance,
        walkableRadius0: witnessDiskR0,
        walkableRadius04: witnessDiskR04,
        rejected: witnessDiskR04 === false
      },
      denseCensus: {
        centers: DENSE_N,
        unsafeRadius04: witnessUnsafe,
        parentUnsafe: capsuleRepro.unsafeCenters,
        firstUnsafeFraction: witnessFirstFraction,
        elapsedMs: witnessCensusMs
      },
      highwayContractGap: highwayExcluded
    }
  }
};

console.log(JSON.stringify(result));

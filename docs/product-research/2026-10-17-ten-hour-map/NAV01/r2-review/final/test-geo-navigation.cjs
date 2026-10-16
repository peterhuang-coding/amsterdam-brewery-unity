"use strict";

/*
 * D26 NAV01 regression tests for geo-navigation.js.
 * All geometry is synthetic (no BGT data needed): it exercises the frozen
 * interface contract on purpose-built polygons, holes, multipolygons,
 * thin barriers, bridge decks/piers, radius clearance and bounded A*.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Geo = require("./geo-navigation.js");

// ---------------------------------------------------------------------------
// Synthetic fixture helpers
// ---------------------------------------------------------------------------

// One axis-aligned rectangle polygon (with one outer ring).
function rect(x0, y0, x1, y1) {
  return [[
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  ]];
}

// Build a polygon from open rings; the first is outer, rest are holes.
function poly(rings) {
  return rings.map(function (r) {
    return r.concat([r[0]]);
  });
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

function road(id, polygons, functie) {
  const props = {};
  if (functie !== undefined) props.functie = functie;
  return feature(id, "wegdeel", polygons, props);
}

function water(id, polygons) {
  return feature(id, "waterdeel", polygons, { type: "watervlakte" });
}

function building(id, polygons) {
  return feature(id, "pand", polygons, {});
}

function bridge(id, polygons, part) {
  const props = {};
  if (part !== undefined) props.type_overbruggingsdeel = part;
  return feature(id, "overbruggingsdeel", polygons, props);
}

function makeData(layers) {
  const bbox = [4.86, 52.34, 4.98, 52.41];
  const west = bbox[0], south = bbox[1], east = bbox[2], north = bbox[3];
  const R = 6371008.8;
  const refLat = (south + north) / 2;
  return {
    schemaVersion: 1,
    bbox,
    projection: {
      type: "local-equirectangular",
      originLon: west,
      originLat: north,
      referenceLat: refLat,
      radiusMeters: R,
      units: "metres"
    },
    width: R * Math.cos(refLat * Math.PI / 180) * (east - west) * Math.PI / 180,
    height: R * (north - south) * Math.PI / 180,
    source: {
      provider: "Kadaster / PDOK BGT",
      url: "https://api.pdok.nl/kadaster/bgt/ogc/v1/",
      license: "CC0-1.0",
      snapshot: "2026-10-16T00:00:00Z",
      complete: false,
      inputs: [],
      limitations: ["synthetic test fixture, not BGT geometry"]
    },
    layers: {
      water: layers.water || [],
      buildings: layers.buildings || [],
      roads: layers.roads || [],
      bridges: layers.bridges || []
    }
  };
}

function navigator(layers, options) {
  return Geo.createNavigator(makeData(layers), options);
}

// Verify the hard route contract: real endpoints, every polyline segment
// walkable, every sampled point walkable.
function assertSafeRoute(n, res, mode, radius) {
  assert.equal(res.found, true, "route should be found");
  assert.equal(res.reason, "ok");
  assert.ok(res.points.length >= 2, "route has polyline points");
  for (let i = 1; i < res.points.length; i++) {
    assert.ok(
      n.segmentWalkable(res.points[i - 1], res.points[i], { mode, radius }),
      "segment " + (i - 1) + " must be walkable"
    );
  }
  let length = 0;
  for (let i = 1; i < res.points.length; i++) {
    const a = res.points[i - 1], b = res.points[i];
    length += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    for (let t = 0; t <= 1.0000001; t += 0.25) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      assert.ok(n.isWalkable(p, { mode, radius }), "sampled route point walkable");
    }
  }
  assert.ok(Math.abs(length - res.length) < 1e-6, "reported length matches polyline");
  assert.ok(Number.isInteger(res.visited) && res.visited >= 0);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

test("project/unproject round-trips within 1e-7 degrees and uses metre axes", () => {
  const p = {
    type: "local-equirectangular",
    originLon: 4.9,
    originLat: 52.4,
    referenceLat: 52.37,
    radiusMeters: 6371008.8,
    units: "metres"
  };
  const cases = [
    [4.9, 52.4], [4.95, 52.35], [4.865, 52.405], [4.97, 52.345], [4.912345, 52.38765]
  ];
  for (const [lon, lat] of cases) {
    const xy = Geo.project(lon, lat, p);
    assert.ok(Number.isFinite(xy.x) && Number.isFinite(xy.y));
    const back = Geo.unproject(xy.x, xy.y, p);
    assert.ok(Math.abs(back.lon - lon) < 1e-7, "lon roundtrip " + lon);
    assert.ok(Math.abs(back.lat - lat) < 1e-7, "lat roundtrip " + lat);
  }
  // East and south of the north-west origin give positive local coordinates.
  const xy = Geo.project(4.91, 52.39, p);
  assert.ok(xy.x > 0 && xy.y > 0);
  // Output metres are rounded to 3 decimals (millimetres).
  assert.ok(Math.abs(xy.x * 1000 - Math.round(xy.x * 1000)) < 1e-7);
  assert.ok(Math.abs(xy.y * 1000 - Math.round(xy.y * 1000)) < 1e-7);
  // 0.01 degree longitude near Amsterdam is roughly 680 m (sanity, no claim).
  const one = Geo.project(4.91, 52.39, p);
  const zero = Geo.project(4.90, 52.39, p);
  const dx = one.x - zero.x;
  assert.ok(dx > 600 && dx < 750);

  assert.throws(() => Geo.project(NaN, 52.4, p), TypeError);
  assert.throws(() => Geo.project("4.9", 52.4, p), TypeError);
  assert.throws(() => Geo.unproject(0, 0, {}), TypeError);
  assert.throws(() => Geo.unproject(null, 0, p), TypeError);
});

// ---------------------------------------------------------------------------
// pointInPolygon: holes, boundaries, multipolygon pieces, invalid input
// ---------------------------------------------------------------------------

test("pointInPolygon honours outer boundary, hole interior, hole boundary exclusion", () => {
  const p = poly([
    [[0, 0], [10, 0], [10, 10], [0, 10]],
    [[2, 2], [8, 2], [8, 8], [2, 8]]
  ]);
  assert.equal(Geo.pointInPolygon({ x: 1, y: 1 }, p), true);
  assert.equal(Geo.pointInPolygon({ x: 5, y: 5 }, p), false); // inside hole
  assert.equal(Geo.pointInPolygon({ x: 2, y: 5 }, p), false); // hole boundary excluded
  assert.equal(Geo.pointInPolygon({ x: 8, y: 8 }, p), false);
  assert.equal(Geo.pointInPolygon({ x: 0, y: 5 }, p), true);  // outer boundary inside
  assert.equal(Geo.pointInPolygon({ x: 10, y: 10 }, p), true);
  assert.equal(Geo.pointInPolygon({ x: -1, y: 5 }, p), false);
  assert.equal(Geo.pointInPolygon({ x: 5, y: 10.01 }, p), false);
});

test("pointInPolygon supports concave rings and multiple holes", () => {
  // C-shaped concave polygon.
  const c = poly([[
    [0, 0], [10, 0], [10, 10], [6, 10], [6, 4], [4, 4], [4, 10], [0, 10]
  ]]);
  assert.equal(Geo.pointInPolygon({ x: 2, y: 8 }, c), true);
  assert.equal(Geo.pointInPolygon({ x: 5, y: 8 }, c), false); // notch
  assert.equal(Geo.pointInPolygon({ x: 5, y: 2 }, c), true);
});

test("pointInPolygon rejects invalid coordinates and malformed rings", () => {
  const good = poly([[[0, 0], [4, 0], [4, 4], [0, 4]]]);
  assert.throws(() => Geo.pointInPolygon({ x: NaN, y: 0 }, good), TypeError);
  assert.throws(() => Geo.pointInPolygon(null, good), TypeError);
  assert.throws(() => Geo.pointInPolygon({ x: 1, y: 1 }, [[[0, 0], [1, 0]]]), TypeError);
  assert.throws(() => Geo.pointInPolygon({ x: 1, y: 1 },
    [[[0, 0], [4, 0], [4, 4], [0, 4]]]), TypeError); // unclosed (raw, not via poly)
  assert.throws(() => Geo.pointInPolygon({ x: 1, y: 1 },
    [[[[0, 0], [4, 0], [0, 0]]]]), TypeError); // fewer than 3 distinct
});

test("validateRing counts unique vertices, not consecutive changes or closure", () => {
  // Only two distinct points although the ring alternates and closes: the old
  // "consecutive change" counter wrongly accepted this.
  const twoDistinct = poly([[[0, 0], [1, 0], [0, 0], [1, 0]]]);
  assert.throws(() => Geo.pointInPolygon({ x: 0, y: 0 }, twoDistinct), TypeError);
  assert.throws(() => navigator({
    roads: [feature(9, "wegdeel",
      [[[[0, 0], [1, 0], [0, 0], [1, 0], [0, 0]]]], { functie: "fietspad" })]
  }), /wegdeel:9/);
  // A repeated first coordinate (closure) plus three real vertices is valid.
  const three = poly([[[0, 0], [4, 0], [4, 4], [0, 4]]]);
  assert.equal(Geo.pointInPolygon({ x: 1, y: 1 }, three), true);
  // Non-finite coordinates still fail.
  assert.throws(() => Geo.pointInPolygon({ x: 1, y: 1 },
    poly([[[0, 0], [4, 0], [4, Infinity], [0, 0]]])), TypeError);
});

test("createNavigator rejects invalid feature geometry with the feature id", () => {
  const bad = [feature(7, "wegdeel",
    [[[[0, 0], [10, 0], [10, NaN], [0, 0]]]], { functie: "fietspad" })];
  assert.throws(() => navigator({ roads: bad }), /wegdeel:7/);
  const shortRing = [feature(8, "waterdeel", rect(0, 0, 1, 1))];
  shortRing[0].polygons = [[[[0, 0], [5, 0], [0, 0]]]];
  assert.throws(() => navigator({ water: shortRing }), /waterdeel:8/);
});

// ---------------------------------------------------------------------------
// Walkability policy
// ---------------------------------------------------------------------------

test("road functie walk/bike policy table, including both voetgangersgebied spellings", () => {
  const cases = [
    [null, true, true],
    ["rijbaan lokale weg", true, true],
    ["fietspad", true, true],
    ["woonerf", true, true],
    ["parkeervlak", true, true],
    ["inrit", true, true],
    ["voetpad", true, false],
    ["voetpad op trap", true, false],
    ["voetgangersgebied", true, false], // authoritative BGT spelling (with s)
    ["voetgangergebied", true, false],  // earlier spec spelling, also excluded
    ["ruiterpad", true, false],
    ["autosnelweg", false, false],
    ["autoweg", false, false],
    ["spoorbaan", false, false],
    ["OV-baan", false, false],
    ["baan voor vliegverkeer", false, false]
  ];
  const roads = [];
  cases.forEach(function (c, i) {
    roads.push(road(100 + i, rect(i * 20, 0, i * 20 + 10, 10), c[0]));
  });
  const n = navigator({ roads });
  cases.forEach(function (c, i) {
    const p = { x: i * 20 + 5, y: 5 };
    assert.equal(n.isWalkable(p, { mode: "walk" }), c[1],
      "walk functie=" + c[0]);
    assert.equal(n.isWalkable(p, { mode: "bike" }), c[2],
      "bike functie=" + c[0]);
  });
});

test("water blocks, bridge deck overrides water, piers and unknown parts never do", () => {
  const layers = {
    water: [water(1, rect(0, 0, 200, 10))],
    bridges: [
      bridge(1, rect(0, 0, 20, 10), "dek"),       // deck
      bridge(2, rect(30, 0, 50, 10), "pijler"),  // pier/pillar
      bridge(3, rect(60, 0, 80, 10), "landhoofd"),
      bridge(4, rect(90, 0, 110, 10), null)      // null stays non-walkable
    ]
  };
  const n = navigator(layers);
  assert.equal(n.isWalkable({ x: 10, y: 5 }), true);   // on deck
  assert.equal(n.isWalkable({ x: 40, y: 5 }), false);  // pijler over water
  assert.equal(n.isWalkable({ x: 70, y: 5 }), false);  // landhoofd
  assert.equal(n.isWalkable({ x: 100, y: 5 }), false); // null part
  assert.equal(n.isWalkable({ x: 150, y: 5 }), false); // open water
  // Deck boundary is deck.
  assert.equal(n.isWalkable({ x: 0, y: 5 }), true);
  // Water boundary belongs to water.
  assert.equal(n.isWalkable({ x: 20.0001, y: 5 }), false);
});

test("deck is walkable on its own, but buildings always win over road and deck", () => {
  const n1 = navigator({
    bridges: [bridge(1, rect(0, 0, 10, 10), "dek")]
  });
  assert.equal(n1.isWalkable({ x: 5, y: 5 }), true);

  const n2 = navigator({
    roads: [road(1, rect(0, 0, 20, 20), "rijbaan lokale weg")],
    buildings: [building(1, rect(5, 5, 15, 15))]
  });
  assert.equal(n2.isWalkable({ x: 2, y: 2 }), true);
  assert.equal(n2.isWalkable({ x: 10, y: 10 }), false); // inside building
  assert.equal(n2.isWalkable({ x: 5, y: 10 }), false);  // building edge

  const n3 = navigator({
    water: [water(1, rect(0, 0, 20, 20))],
    bridges: [bridge(1, rect(0, 0, 20, 20), "dek")],
    buildings: [building(1, rect(8, 8, 12, 12))]
  });
  assert.equal(n3.isWalkable({ x: 2, y: 2 }), true);
  assert.equal(n3.isWalkable({ x: 10, y: 10 }), false); // building over deck still blocks
});

test("multipolygon features apply to every disjoint part", () => {
  const n = navigator({
    buildings: [feature(1, "pand", rect(0, 0, 10, 10).concat(rect(40, 0, 50, 10)), {})],
    roads: [road(1, rect(-20, -20, 70, 30), "fietspad")]
  });
  assert.equal(n.isWalkable({ x: 5, y: 5 }), false);
  assert.equal(n.isWalkable({ x: 45, y: 5 }), false);
  assert.equal(n.isWalkable({ x: 25, y: 5 }), true);
});

test("water polygon with a road through its hole: hole interior and hole edge walkable", () => {
  const donut = poly([
    [[-20, -20], [20, -20], [20, 20], [-20, 20]],
    [[-5, -5], [5, -5], [5, 5], [-5, 5]]
  ]);
  const n = navigator({
    water: [feature(1, "waterdeel", [donut], { type: "watervlakte" })],
    roads: [road(1, rect(-30, -30, 30, 30), "fietspad")]
  });
  assert.equal(Geo.pointInPolygon({ x: 0, y: 0 }, donut), false);
  assert.equal(Geo.pointInPolygon({ x: 5, y: 0 }, donut), false); // hole boundary
  assert.equal(Geo.pointInPolygon({ x: 10, y: 0 }, donut), true);
  assert.equal(n.isWalkable({ x: 0, y: 0 }), true);
  assert.equal(n.isWalkable({ x: 5, y: 0 }), true);
  assert.equal(n.isWalkable({ x: 10, y: 0 }), false);
});

// ---------------------------------------------------------------------------
// Segment safety: thin barriers, corner cuts, bridge decks
// ---------------------------------------------------------------------------

function thinBarrierNavigator() {
  return navigator({
    roads: [road(1, rect(-60, -60, 60, 60), "fietspad")],
    water: [
      water(1, rect(24.9, -60, 25.1, 60)),    // 0.20 m thin canal
      water(2, rect(-40.05, -60, -39.95, 60)) // 0.10 m thin canal
    ],
    buildings: [building(1, rect(-10.1, -60, -9.9, 60))], // 0.20 m thin wall
    bridges: [bridge(1, rect(24.8, -1, 25.2, 1), "dek")]
  });
}

test("segmentWalkable catches thin barriers narrower than the 0.5 m sample spacing", () => {
  const n = thinBarrierNavigator();
  // 0.20 m water strip: pure 0.5 m sampling could miss it; crossing splits do not.
  assert.equal(n.segmentWalkable({ x: -20, y: 0 }, { x: 30, y: 0 }), false);
  // 0.10 m strip likewise.
  assert.equal(n.segmentWalkable({ x: -50, y: 0 }, { x: -30, y: 0 }), false);
  // 0.20 m building wall.
  assert.equal(n.segmentWalkable({ x: -20, y: 0 }, { x: 0, y: 0 }), false);
  // Short sub-sample-length segment that still crosses the strip.
  assert.equal(n.segmentWalkable({ x: 24.85, y: 5 }, { x: 25.15, y: 5 }), false);
  // Parallel and clear segments pass (east of the building wall, short of the canal).
  assert.equal(n.segmentWalkable({ x: -5, y: 5 }, { x: 20, y: 5 }), true);
  assert.equal(n.segmentWalkable({ x: 0, y: 20 }, { x: 0, y: 30 }), true);
  // Deck over the thin canal permits the crossing at y=0 only.
  assert.equal(n.segmentWalkable({ x: 20, y: 0 }, { x: 30, y: 0 }), true);
  assert.equal(n.segmentWalkable({ x: 20, y: 3 }, { x: 30, y: 3 }), false);
  // Invalid endpoints throw.
  assert.throws(() => n.segmentWalkable({ x: 0, y: 0 }, { x: NaN, y: 0 }), TypeError);
});

test("diagonal corner cutting between diagonal obstacles is rejected", () => {
  const n = navigator({
    roads: [road(1, rect(-20, -20, 20, 20), "fietspad")],
    buildings: [
      building(1, rect(0, 0, 20, 20)),  // north-east
      building(2, rect(-20, -20, 0, 0)) // south-west, touches at origin
    ]
  });
  const A = { x: 1, y: -1 };
  const B = { x: -1, y: 1 };
  assert.equal(n.isWalkable(A), true);
  assert.equal(n.isWalkable(B), true);
  assert.equal(n.segmentWalkable(A, B), false); // touches/crosses the blocked corner
  assert.equal(n.segmentWalkable({ x: 1, y: -1 }, { x: 1, y: 1 }), false);
  assert.equal(n.segmentWalkable({ x: 1, y: -1 }, { x: -1, y: -1 }), false);
  // A diagonal staying inside one open quadrant is fine.
  assert.equal(n.segmentWalkable({ x: 3, y: -3 }, { x: 5, y: -1 }), true);
});

test("pier never permits a water crossing while deck does", () => {
  const n = navigator({
    roads: [road(1, rect(-30, -30, 30, 5), "fietspad"),
            road(2, rect(-30, -5, 30, 30), "fietspad")],
    water: [water(1, rect(-30, -8, 30, 8))],
    bridges: [
      bridge(1, rect(-2, -8, 2, 8), "pijler"),
      bridge(2, rect(20, -8, 24, 8), "dek")
    ]
  });
  assert.equal(n.segmentWalkable({ x: -20, y: 0 }, { x: 20, y: 0 }), false);
  assert.equal(n.segmentWalkable({ x: 0, y: -20 }, { x: 0, y: 20 }), false); // through pier
  assert.equal(n.segmentWalkable({ x: 22, y: -20 }, { x: 22, y: 20 }), true);  // via deck
});

test("segment walkability distinguishes walk and bike modes", () => {
  const n = navigator({
    roads: [
      road(1, rect(0, -10, 20, 10), "voetpad"),
      road(2, rect(30, -10, 50, 10), "fietspad")
    ]
  });
  assert.equal(n.segmentWalkable({ x: 2, y: 0 }, { x: 18, y: 0 }, { mode: "walk" }), true);
  assert.equal(n.segmentWalkable({ x: 2, y: 0 }, { x: 18, y: 0 }, { mode: "bike" }), false);
  assert.equal(n.segmentWalkable({ x: 32, y: 0 }, { x: 48, y: 0 }, { mode: "bike" }), true);
});

// ---------------------------------------------------------------------------
// Radius clearance
// ---------------------------------------------------------------------------

test("positive radius enforces circle clearance against water and buildings", () => {
  const waterBoth = navigator({
    roads: [road(1, rect(-1.5, -40, 1.5, 40), "fietspad")],
    water: [water(1, rect(-40, -40, -1.5, 40)), water(2, rect(1.5, -40, 40, 40))]
  });
  assert.equal(waterBoth.isWalkable({ x: 0, y: 0 }), true);
  assert.equal(waterBoth.isWalkable({ x: 0, y: 0 }, { radius: 1.4 }), true);  // 0.1 m gap
  // Tangent contact touches the water boundary, which belongs to the water.
  assert.equal(waterBoth.isWalkable({ x: 0, y: 0 }, { radius: 1.5 }), false);
  assert.equal(waterBoth.isWalkable({ x: 0, y: 0 }, { radius: 1.6 }), false);
  assert.equal(waterBoth.segmentWalkable({ x: 0, y: -20 }, { x: 0, y: 20 }, { radius: 1 }), true);
  assert.equal(waterBoth.segmentWalkable({ x: 0, y: -20 }, { x: 0, y: 20 }, { radius: 1.5 }), false);

  const walls = navigator({
    roads: [road(1, rect(-1.5, -40, 1.5, 40), "fietspad")],
    buildings: [building(1, rect(-40, -40, -1.5, 40)), building(2, rect(1.5, -40, 40, 40))]
  });
  assert.equal(walls.isWalkable({ x: 0, y: 5 }, { radius: 1 }), true);
  assert.equal(walls.isWalkable({ x: 0, y: 5 }, { radius: 1.5 }), false);
  assert.equal(walls.isWalkable({ x: 0, y: 5 }, { radius: 2 }), false);
});

test("radius: small road hole wholly inside the disk blocks (parent repro), even filled by another legal road is allowed", () => {
  // Exact parent fixture: outer square [-3,3]^2, hole [0.6,0.7]^2, disk r=1.
  const holeRoad = function () {
    return road(1, [poly([
      [[-3, -3], [3, -3], [3, 3], [-3, 3]],
      [[0.6, 0.6], [0.7, 0.6], [0.7, 0.7], [0.6, 0.7]]
    ])], "rijbaan lokale weg");
  };
  const n1 = navigator({ roads: [holeRoad()] });
  // Centre and every sampled circumference point avoid the hole, but the whole
  // body disk still covers it.
  assert.equal(n1.isWalkable({ x: 0, y: 0 }), true);
  assert.equal(n1.isWalkable({ x: 0, y: 0 }, { radius: 1 }), false);
  // Radius smaller than the hole's nearest approach (0.6) clears.
  assert.equal(n1.isWalkable({ x: 0, y: 0 }, { radius: 0.5 }), true);
  // Swept capsule of radius 1 along y=0 covers the hole too; the centre line
  // itself never enters it.
  assert.equal(n1.segmentWalkable({ x: -2, y: 0 }, { x: 2, y: 0 }, { radius: 0 }), true);
  assert.equal(n1.segmentWalkable({ x: -2, y: 0 }, { x: 2, y: 0 }, { radius: 1 }), false);

  // A second legal road polygon that actually fills the hole makes the union
  // of permitted roads cover the whole disk.
  const n2 = navigator({
    roads: [
      holeRoad(),
      road(2, rect(0.5, 0.5, 0.8, 0.8), "fietspad")
    ]
  });
  assert.equal(n2.isWalkable({ x: 0, y: 0 }, { radius: 1 }), true);
  assert.equal(n2.segmentWalkable({ x: -2, y: 0 }, { x: 2, y: 0 }, { radius: 1 }), true);
});

test("radius: narrow notch between circumference samples blocks the whole body", () => {
  // Big road surface with a thin notch entering from the north; its tip is at
  // (0, 0.5) and on the r=1 circle the notch spans only ~0.15 rad, far narrower
  // than the old 0.5 m circumference spacing (~0.5 rad at r=1). Sound circle
  // splitting must catch it; more samples alone would not.
  const notched = poly([[
    [-20, -20], [20, -20], [20, 20], [3, 20], [0, 0.5], [-3, 20], [-20, 20]
  ]]);
  const n = navigator({ roads: [road(1, [notched], "fietspad")] });
  assert.equal(n.isWalkable({ x: 0, y: 0 }), true);
  assert.equal(n.isWalkable({ x: 0, y: 0 }, { radius: 0.4 }), true);  // short of tip
  assert.equal(n.isWalkable({ x: 0, y: 0 }, { radius: 0.6 }), false); // enters notch
  assert.equal(n.isWalkable({ x: 0, y: 0 }, { radius: 1 }), false);
  assert.equal(n.isWalkable({ x: 0, y: 1 }), false); // notch interior, r=0
});

test("radius: touching shared edges and overlapping roads keep neighbouring surfaces connected", () => {
  // Two road rectangles sharing exactly the edge x=0.
  const touching = navigator({
    roads: [
      road(1, rect(-4, -4, 0, 4), "fietspad"),
      road(2, rect(0, -4, 4, 4), "fietspad")
    ]
  });
  assert.equal(touching.isWalkable({ x: 0, y: 0 }, { radius: 1 }), true);
  assert.equal(touching.segmentWalkable({ x: -2, y: 0 }, { x: 2, y: 0 }, { radius: 1 }), true);

  // Overlapping roads whose union covers the whole disk: neither polygon edge
  // inside the disk may be treated as a barrier.
  const overlapping = navigator({
    roads: [
      road(1, rect(-4, -4, 1, 4), "fietspad"),
      road(2, rect(-1, -4, 4, 4), "fietspad")
    ]
  });
  assert.equal(overlapping.isWalkable({ x: 0, y: 0 }, { radius: 1 }), true);
  assert.equal(overlapping.segmentWalkable({ x: -3, y: 0 }, { x: 3, y: 0 }, { radius: 1 }), true);

  // Same layout with a real uncovered gap is rejected.
  const gap = navigator({
    roads: [
      road(1, rect(-4, -4, -0.4, 4), "fietspad"),
      road(2, rect(0.4, -4, 4, 4), "fietspad")
    ]
  });
  assert.equal(gap.isWalkable({ x: 0, y: 0 }, { radius: 1 }), false);
  assert.equal(gap.segmentWalkable({ x: -3, y: 0 }, { x: 3, y: 0 }, { radius: 1 }), false);
});

test("radius: swept capsule covers a hole offset from the centre line, not just blocker edges", () => {
  // Thin hole 0.22..0.28 m off the centre line: at r=0.3 the old 8-sample
  // compass circle (offsets 0, 0.212, 0.3 m) never lands in it, and the old
  // capsule loop ignored road-hole edges entirely.
  const donut = poly([
    [[-10, -10], [10, -10], [10, 10], [-10, 10]],
    [[1, 0.22], [2, 0.22], [2, 0.28], [1, 0.28]]
  ]);
  const n = navigator({ roads: [road(1, [donut], "fietspad")] });
  // Centre line y=0 never enters the hole.
  assert.equal(n.segmentWalkable({ x: -2, y: 0 }, { x: 4, y: 0 }, { radius: 0 }), true);
  assert.equal(n.segmentWalkable({ x: -2, y: 0 }, { x: 4, y: 0 }, { radius: 0.1 }), true);
  // Radius 0.3 sweeps over the hole.
  assert.equal(n.segmentWalkable({ x: -2, y: 0 }, { x: 4, y: 0 }, { radius: 0.3 }), false);
  // Endpoint disks are sound too.
  assert.equal(n.isWalkable({ x: 1.5, y: 0 }, { radius: 0.1 }), true);
  assert.equal(n.isWalkable({ x: 1.5, y: 0 }, { radius: 0.3 }), false);
});

test("radius: small blocker polygon wholly inside the disk blocks in both modes", () => {
  const n = navigator({
    roads: [road(1, rect(-3, -3, 3, 3), "fietspad")],
    buildings: [building(1, rect(0.6, 0.6, 0.7, 0.7))]
  });
  assert.equal(n.isWalkable({ x: 0, y: 0 }), true);
  assert.equal(n.isWalkable({ x: 0, y: 0 }, { radius: 1 }), false);
  assert.equal(n.isWalkable({ x: 0, y: 0 }, { radius: 1, mode: "bike" }), false);
});

// ---------------------------------------------------------------------------
// snap
// ---------------------------------------------------------------------------

test("snap performs a bounded deterministic nearest-surface search", () => {
  const n = navigator({ roads: [road(1, rect(0, 0, 10, 10), "fietspad")] });
  const on = n.snap({ x: 5, y: 5 });
  assert.deepEqual(on, { x: 5, y: 5, distance: 0 });

  const near = n.snap({ x: 15, y: 5 });
  assert.ok(near && near.distance > 0 && near.distance <= 5.6);
  assert.ok(n.isWalkable({ x: near.x, y: near.y }));
  assert.equal(near.distance, Math.sqrt((near.x - 15) ** 2 + (near.y - 5) ** 2));

  assert.equal(n.snap({ x: 15, y: 5 }, { maxDistance: 4 }), null);
  assert.equal(n.snap({ x: -100, y: 5 }, { maxDistance: 80 }), null); // bounded, no scan to road
  // Default bound is 80 m; 90 m away is not reachable.
  assert.equal(n.snap({ x: -90, y: 5 }), null);

  // Determinism: repeated calls return identical coordinates.
  const a = n.snap({ x: 13, y: 13 });
  const b = n.snap({ x: 13, y: 13 });
  assert.ok(a && b && a.x === b.x && a.y === b.y && a.distance === b.distance);
});

// ---------------------------------------------------------------------------
// route: validation, same point, blocked endpoints, junctions, disconnected
// ---------------------------------------------------------------------------

function junctionNavigator() {
  return navigator({
    roads: [
      road(1, rect(-30, -3, 30, 3), "rijbaan lokale weg"),    // horizontal
      road(2, rect(-3, -30, 3, 30), "rijbaan lokale weg"),    // vertical
      road(3, rect(-30, 17, 30, 23), "rijbaan lokale weg"),   // upper horizontal
      road(4, rect(60, -10, 80, 10), "fietspad")              // disconnected island
    ],
    water: [water(1, rect(40, -25, 55, 25))],
    buildings: []
  });
}

test("route: invalid coordinates give reason invalid", () => {
  const n = junctionNavigator();
  for (const bad of [null, undefined, { x: NaN, y: 0 }, { x: 0 }, { x: "1", y: 0 }]) {
    const r = n.route(bad, { x: 0, y: 0 });
    assert.equal(r.found, false);
    assert.equal(r.reason, "invalid");
    assert.deepEqual(r.points, []);
  }
  const r2 = n.route({ x: 0, y: 0 }, { x: Infinity, y: 0 });
  assert.equal(r2.reason, "invalid");
});

test("route: same valid point is a zero-length ok route", () => {
  const n = junctionNavigator();
  const r = n.route({ x: 5, y: 0 }, { x: 5, y: 0 });
  assert.equal(r.found, true);
  assert.equal(r.reason, "ok");
  assert.equal(r.length, 0);
  assert.equal(r.visited, 0);
  assert.equal(r.points.length, 1);
  assert.deepEqual(r.points[0], { x: 5, y: 0 });
});

test("route: blocked endpoints are unwalkable; snapDistance 0 never moves the caller", () => {
  const n = junctionNavigator();
  const r = n.route({ x: 47, y: 0 }, { x: 0, y: 0 }); // inside water
  assert.equal(r.found, false);
  assert.equal(r.reason, "unwalkable");
  const r2 = n.route({ x: 0, y: 0 }, { x: 70, y: 50 }); // off any road
  assert.equal(r2.reason, "unwalkable");
  assert.equal(r2.startSnap, null);
  assert.equal(r2.endSnap, null);
});

test("route: explicit snapDistance snaps endpoints and reports the snaps", () => {
  const n = navigator({ roads: [road(1, rect(0, 0, 10, 40), "fietspad")] });
  const noSnap = n.route({ x: 15, y: 5 }, { x: 5, y: 5 });
  assert.equal(noSnap.reason, "unwalkable");
  const r = n.route({ x: 15, y: 5 }, { x: 5, y: 5 }, { snapDistance: 10 });
  assert.equal(r.found, true);
  assert.ok(r.startSnap && r.startSnap.distance > 0);
  assert.equal(r.endSnap, null);
  assert.equal(r.points[0].x, r.startSnap.x);
  assert.equal(r.points[0].y, r.startSnap.y);
  assert.ok(n.isWalkable(r.points[0]));
  // Snapping has a bounded radius too.
  const far = n.route({ x: 100, y: 5 }, { x: 5, y: 5 }, { snapDistance: 10 });
  assert.equal(far.found, false);
  assert.equal(far.reason, "unwalkable");
});

test("route: road junction connects arms; found route is safe and length-bounded", () => {
  const n = junctionNavigator();
  const r = n.route({ x: -20, y: 0 }, { x: 0, y: 15 });
  assertSafeRoute(n, r, "walk", 0);
  assert.ok(r.length >= 24 && r.length <= 36, "length was " + r.length);
});

test("route: disconnected road component is unreachable, search stays bounded", () => {
  const n = junctionNavigator();
  const r = n.route({ x: -20, y: 0 }, { x: 70, y: 0 });
  assert.equal(r.found, false);
  assert.equal(r.reason, "unreachable");
  assert.ok(r.visited < 5000, "visited " + r.visited);
});

test("route: no straight shortcut across water; explicit deck reconnects", () => {
  function build(withDeck) {
    const layers = {
      roads: [
        road(1, rect(-30, -3, -10, 3), "fietspad"),
        road(2, rect(10, -3, 30, 3), "fietspad"),
        road(3, rect(-30, -30, -10, -20), "fietspad")
      ],
      water: [water(1, rect(-12, -40, 12, 40))]
    };
    if (withDeck) layers.bridges = [bridge(1, rect(-12, -3, 12, 3), "dek")];
    return navigator(layers);
  }
  const n0 = build(false);
  assert.equal(n0.segmentWalkable({ x: -15, y: 0 }, { x: 15, y: 0 }), false);
  assert.equal(n0.segmentWalkable({ x: -15, y: -25 }, { x: 15, y: 25 }), false);
  const r0 = n0.route({ x: -15, y: 0 }, { x: 15, y: 0 });
  assert.equal(r0.found, false);
  assert.equal(r0.reason, "unreachable");

  const n1 = build(true);
  const r1 = n1.route({ x: -15, y: 0 }, { x: 15, y: 0 });
  assertSafeRoute(n1, r1, "walk", 0);
  assert.ok(r1.length < 31);
});

test("route: explicit search budget terminates with reason limit", () => {
  const n = junctionNavigator();
  const r = n.route({ x: -20, y: 0 }, { x: 0, y: 20 }, { maxNodes: 2 });
  assert.equal(r.found, false);
  assert.equal(r.reason, "limit");
  assert.ok(r.visited <= 3);
});

test("route: chooses the shorter of two alternative corridors", () => {
  // Central blocked block; loop road around it, south side is shorter.
  const n = navigator({
    roads: [
      road(1, rect(-30, 18, 30, 26), "fietspad"),  // north
      road(2, rect(-30, -26, 30, -18), "fietspad"), // south
      road(3, rect(-30, -26, -18, 26), "fietspad"), // west
      road(4, rect(18, -26, 30, 26), "fietspad")    // east
    ],
    buildings: [building(1, rect(-18, -18, 18, 18))]
  });
  const r = n.route({ x: -24, y: 0 }, { x: 24, y: -8 });
  assertSafeRoute(n, r, "walk", 0);
  // South corridor ~88 m; north ~104 m.
  assert.ok(r.length < 100, "length " + r.length);
  assert.ok(r.points.every(p => !(p.x > -18 && p.x < 18 && p.y > -18 && p.y < 18)));
});

test("route: walk takes voetpad corridor, bike is forced to the fietspad corridor", () => {
  const n = navigator({
    roads: [
      road(1, rect(-13, 7, 13, 13), "fietspad"),       // north (bike ok)
      road(2, rect(-13, -13, 13, -7), "voetpad"),      // south (walk only)
      road(3, rect(-13, -13, -7, 13), "fietspad"),     // west connector
      road(4, rect(7, -13, 13, 13), "fietspad")        // east connector
    ],
    buildings: [building(1, rect(-7, -7, 7, 7))]
  });
  const walk = n.route({ x: -10, y: 0 }, { x: 10, y: -4 }, { mode: "walk" });
  const bike = n.route({ x: -10, y: 0 }, { x: 10, y: -4 }, { mode: "bike" });
  assertSafeRoute(n, walk, "walk", 0);
  assertSafeRoute(n, bike, "bike", 0);
  // Geometric shortest: walk hugs the south corner (~28.7 m on the voetpad),
  // bike must round the north corner (~36.4 m on the fietspad).
  assert.ok(walk.length < 32, "walk length " + walk.length);
  assert.ok(bike.length > 34 && bike.length > walk.length + 4, "bike length " + bike.length);
  // Bike never enters the south voetpad strip and visibly uses the north side.
  assert.ok(bike.points.every(p => !(Math.abs(p.x) < 7 && p.y <= -7 && p.y >= -13)));
  assert.ok(bike.points.some(p => p.y >= 7));
  assert.ok(walk.points.some(p => p.y <= -8));
});

test("route: endpoint in voetgangersgebied is walk-ok but bike-unwalkable (both spellings)", () => {
  const n = navigator({
    roads: [road(1, rect(0, 0, 20, 20), "voetgangersgebied")]
  });
  const walk = n.route({ x: 2, y: 2 }, { x: 18, y: 18 }, { mode: "walk" });
  assert.equal(walk.found, true);
  const bike = n.route({ x: 2, y: 2 }, { x: 18, y: 18 }, { mode: "bike" });
  assert.equal(bike.found, false);
  assert.equal(bike.reason, "unwalkable");

  const n2 = navigator({
    roads: [road(1, rect(0, 0, 20, 20), "voetgangergebied")]
  });
  assert.equal(n2.route({ x: 2, y: 2 }, { x: 18, y: 18 }, { mode: "bike" }).reason, "unwalkable");
});

test("route: radius is respected by the lattice and returned segments", () => {
  const n = navigator({
    roads: [road(1, rect(-2, -40, 30, 40), "fietspad")],
    water: [water(1, rect(2, -40, 40, 40))]
  });
  // Centre line x=0 keeps >=2 m from water: radius 1.5 is fine.
  const r0 = n.route({ x: 0, y: -20 }, { x: 0, y: 20 }, { radius: 1.5 });
  assertSafeRoute(n, r0, "walk", 1.5);
  // Radius 3 cannot fit between the open west edge and the waterline.
  const r1 = n.route({ x: 0, y: -20 }, { x: 0, y: 20 }, { radius: 3 });
  assert.equal(r1.found, false);
});

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

test("stats reports real observation counts without performance claims", () => {
  const n = junctionNavigator();
  n.route({ x: -20, y: 0 }, { x: 0, y: 15 });
  const s = n.stats();
  assert.equal(s.features.roads, 4);
  assert.equal(s.features.water, 1);
  assert.ok(s.features.polygonsIndexed >= 5);
  assert.ok(s.buckets >= 1);
  assert.ok(s.passabilityCacheEntries >= 1);
  assert.ok(s.cacheHits + s.cacheMisses >= 1);
  assert.equal(s.searches, 1);
  assert.equal(s.lastReason, "ok");
  assert.ok(s.lastVisited >= 0);
});

test("default navigator options match the frozen interface", () => {
  const n = navigator({});
  const s = n.stats();
  assert.equal(s.options.cellSize, 2);
  assert.equal(s.options.maxNodes, 250000);
  assert.equal(s.options.bucketSize, 64);
  assert.equal(s.options.radius, 0);
});

// ---------------------------------------------------------------------------
// Real BGT public sample (read-only fixture; explicitly NOT complete city)
// 2 water / 23 buildings / 36 roads / 1 bridge deck selected by bounds.
// ---------------------------------------------------------------------------

const realSample = require("./real-pub-sample.json");
const REAL_START = { x: 1100.211, y: 3243.117 };
const REAL_GOAL = { x: 1056.057, y: 3247.41 };
const REAL_BASELINE = { length: 49.33733834, points: 4, visited: 70 };

test("real BGT sample: loads with documented counts and explicit incompleteness", () => {
  assert.equal(realSample.source.complete, false);
  assert.equal(realSample.source.snapshot, "2026-10-16T00:00:00Z");
  const n = Geo.createNavigator(realSample);
  const s = n.stats();
  assert.equal(s.features.water, 2);
  assert.equal(s.features.buildings, 23);
  assert.equal(s.features.roads, 36);
  assert.equal(s.features.bridges, 1);
  assert.equal(s.features.bridgeDeckFeatures, 1);
  assert.ok(s.features.polygonsIndexed >= 62);
  // Both documented anchors are radius-0 walkable surfaces.
  assert.equal(n.isWalkable(REAL_START), true);
  assert.equal(n.isWalkable(REAL_GOAL), true);
  // The single deck is real geometry: points off every surface still reject.
  assert.equal(n.isWalkable({ x: 0, y: 0 }), false);
});

test("real BGT sample: radius-0 route matches the measured parent baseline", () => {
  const n = Geo.createNavigator(realSample);
  const r = n.route(REAL_START, REAL_GOAL, { mode: "walk" });
  assert.equal(r.found, true);
  assert.equal(r.reason, "ok");
  assert.equal(r.points.length, REAL_BASELINE.points);
  assert.equal(r.visited, REAL_BASELINE.visited);
  assert.ok(Math.abs(r.length - REAL_BASELINE.length) < 1e-6,
    "length " + r.length + " vs baseline " + REAL_BASELINE.length);
  // Real caller anchors are preserved exactly; no silent snap.
  assert.deepEqual(r.points[0], REAL_START);
  assert.deepEqual(r.points[r.points.length - 1], REAL_GOAL);
  assert.equal(r.startSnap, null);
  assert.equal(r.endSnap, null);
  // Every returned segment and dense 0.25 m sample is genuinely walkable.
  assertSafeRoute(n, r, "walk", 0);
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1], b = r.points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let k = 0; k <= steps; k++) {
      const p = { x: a.x + (b.x - a.x) * k / steps, y: a.y + (b.y - a.y) * k / steps };
      assert.equal(n.isWalkable(p, { mode: "walk" }), true);
    }
  }
});

test("real BGT sample: radius 0.4 clearance is reported honestly with safe geometry", () => {
  const n = Geo.createNavigator(realSample);
  const startOk = n.isWalkable(REAL_START, { radius: 0.4 });
  const goalOk = n.isWalkable(REAL_GOAL, { radius: 0.4 });
  const r = n.route(REAL_START, REAL_GOAL, { mode: "walk", radius: 0.4 });
  // Deterministic repeat: same verdict and search shape.
  const r2 = n.route(REAL_START, REAL_GOAL, { mode: "walk", radius: 0.4 });
  assert.equal(r2.found, r.found);
  assert.equal(r2.reason, r.reason);
  assert.equal(r2.visited, r.visited);
  assert.ok(Math.abs(r2.length - r.length) < 1e-9);
  // snapDistance defaults to 0: anchors are never moved silently.
  assert.equal(r.startSnap, null);
  assert.equal(r.endSnap, null);
  if (r.found) {
    assert.equal(startOk, true);
    assert.equal(goalOk, true);
    assert.deepEqual(r.points[0], REAL_START);
    assert.deepEqual(r.points[r.points.length - 1], REAL_GOAL);
    assertSafeRoute(n, r, "walk", 0.4);
  } else {
    // An honest negative: no points, and a documented reason. An unwalkable
    // anchor must surface as "unwalkable", never as a snapped-but-different
    // route.
    assert.deepEqual(r.points, []);
    assert.ok(["unwalkable", "unreachable", "limit"].includes(r.reason));
    if (!startOk || !goalOk) assert.equal(r.reason, "unwalkable");
  }
});

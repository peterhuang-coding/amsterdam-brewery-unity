// MAP02 factual baseline probe (standalone, trusted).
// Allowed modules: node:fs, node:path, node:assert plus the supplied game
// modules only. No network, no subprocess, no packages, no filesystem scans.
// It references the real City/FlowerNetwork modules for collision, routing,
// ferry and restore semantics instead of reimplementing them, and writes
// exactly one file: baseline.json in the probe's own directory (cwd when run
// via the authorized command `node baseline-probe.js`).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const C = require(path.join(__dirname, 'tools', 'prototype', 'reopening-city.js'));
const F = require(path.join(__dirname, 'tools', 'prototype', 'flower-network.js'));

const BASELINE_HASH = 'dad6b38c54fda94f541764242f61820d8177bd19';

// --- sanity: the real supplied modules expose what the source excerpts show ---
assert.strictEqual(C.WIDTH, 1800, 'C.WIDTH must match reopening-city.js:9');
assert.strictEqual(C.HEIGHT, 1120, 'C.HEIGHT must match reopening-city.js:10');
for (const name of ['walkable', 'rideable', 'onFerry', 'route', 'move', 'moveAlong', 'near', 'create', 'restore', 'parkBike', 'toggleBike']) {
  assert.strictEqual(typeof C[name], 'function', 'City.' + name + ' must be exported');
}
assert.strictEqual(F.ENTRY.id, 'garden', 'flower-network.js:8');
assert.strictEqual(F.ENTRY.x, 1510);
assert.strictEqual(F.ENTRY.y, 690);
assert.strictEqual(F.CART.x, 1310);
assert.strictEqual(F.CART.y, 1040);
assert.strictEqual('id' in F.CART, false, 'CART has no id and is not a place (flower-network.js:9)');

// --- 9 anchors: 7 City places in source order + garden ENTRY + cart anchor ---
const placeIds = Object.keys(C.PLACES);
assert.deepStrictEqual(placeIds, ['pub', 'lotte', 'coffee', 'noord', 'market', 'flowers', 'lab']);
assert.strictEqual(placeIds.length, 7, 'brief: all 7 City.PLACES');
assert.strictEqual(Object.prototype.hasOwnProperty.call(C.PLACES, 'garden'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(C.PLACES, 'cart'), false);

const anchors = [
  ...placeIds.map(id => ({ id, x: C.PLACES[id].x, y: C.PLACES[id].y, kind: 'place' })),
  { id: 'garden', x: F.ENTRY.x, y: F.ENTRY.y, kind: 'garden-entry' },
  { id: 'cart', x: F.CART.x, y: F.CART.y, kind: 'flower-cart-anchor' }
];
assert.strictEqual(anchors.length, 9);
assert.strictEqual(new Set(anchors.map(a => a.id)).size, 9);

// Every anchor is measured against the real collision map.
for (const a of anchors) {
  a.walkable = Boolean(C.walkable(a.x, a.y));
  a.rideable = a.walkable && Boolean(C.rideable(a.x, a.y));
  a.on_ferry = Boolean(C.onFerry(a.x, a.y));
  assert.ok(a.walkable, 'anchor ' + a.id + ' must be walkable for an honest 9x9 matrix');
}

const round6 = v => Math.round(v * 1e6) / 1e6;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const clone = v => JSON.parse(JSON.stringify(v));
function arrayEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((item, i) => item === b[i]);
}
function bikeEqual(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.mounted === b.mounted &&
    Boolean(a.pushing) === Boolean(b.pushing);
}

// Mirror the <=4 world-unit sampling used by City.safeSegment
// (reopening-city.js:120-129). Returns samples excluding the segment start so
// chaining segments never double-counts a junction.
function segmentSamples(from, to) {
  const distance = dist(from, to);
  const steps = Math.max(1, Math.ceil(distance / 4));
  const out = [];
  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps;
    out.push({ x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount });
  }
  return out;
}

// --- 81 ordered pairs (including self): real C.route results only ---
const routes = [];
for (const from of anchors) {
  for (const to of anchors) {
    const points0 = C.route({ x: from.x, y: from.y }, { x: to.x, y: to.y });
    assert.ok(Array.isArray(points0));
    const points = points0.map(p => ({ x: p.x, y: p.y }));
    const selfRow = from.id === to.id;
    if (selfRow) assert.strictEqual(points.length, 0, 'self route must be empty (city:202)');

    // Polyline length and sampling include the starting anchor (brief).
    const polyline = [{ x: from.x, y: from.y }, ...points];
    let lengthWorld = 0;
    const samples = [polyline[0]];
    for (let i = 1; i < polyline.length; i += 1) {
      lengthWorld += dist(polyline[i - 1], polyline[i]);
      for (const p of segmentSamples(polyline[i - 1], polyline[i])) samples.push(p);
    }
    const walkableSamplesOk = samples.every(p => C.walkable(p.x, p.y));
    const rideableCount = samples.filter(p => C.rideable(p.x, p.y)).length;
    const ferryCount = samples.filter(p => C.onFerry(p.x, p.y)).length;

    // Empty routes between different points are reported honestly: endpoint
    // distance is the from->to gap and the direct straight line is sampled.
    let endpointDistance;
    let directLineWalkable = null;
    if (points.length) {
      endpointDistance = dist(points[points.length - 1], to);
      assert.ok(endpointDistance === 0, 'walkable target is appended exactly (city:211-234)');
    } else {
      endpointDistance = dist(from, to);
      if (!selfRow) {
        const direct = [{ x: from.x, y: from.y }, ...segmentSamples(from, to)];
        directLineWalkable = direct.every(p => C.walkable(p.x, p.y));
      }
    }

    routes.push({
      from: from.id,
      to: to.id,
      points,
      length_world: round6(lengthWorld),
      endpoint_distance: round6(endpointDistance),
      walkable_samples_ok: walkableSamplesOk,
      rideable_sample_count: rideableCount,
      ferry_sample_count: ferryCount,
      total_sample_count: samples.length,
      self: selfRow,
      empty_route: points.length === 0,
      direct_segment: points.length === 1,
      direct_line_walkable_when_empty: directLineWalkable
    });
  }
}
assert.strictEqual(routes.length, 81);
assert.strictEqual(new Set(routes.map(r => r.from + '>' + r.to)).size, 81);

// --- 9 synthetic C.restore checks at valid anchors ---
// Existing visited IDs only (the seven C.PLACES ids; garden/cart would be
// rejected by city:353) and one valid unmounted, co-located bicycle.
const allVisited = placeIds.slice();
const restoreChecks = anchors.map(a => {
  const input = { x: a.x, y: a.y, visited: allVisited.slice(), bike: { x: a.x, y: a.y, mounted: false } };
  const inputSnapshot = clone(input);
  const output = C.restore(input);
  const preserved = {
    x: output.x === inputSnapshot.x,
    y: output.y === inputSnapshot.y,
    visited: arrayEqual(output.visited, inputSnapshot.visited),
    bike: bikeEqual(output.bike, inputSnapshot.bike),
    all: false
  };
  preserved.all = preserved.x && preserved.y && preserved.visited && preserved.bike;
  return {
    anchor: a.id,
    input: inputSnapshot,
    output: clone(output),
    fields_preserved: preserved,
    input_unmutated: JSON.stringify(input) === JSON.stringify(inputSnapshot)
  };
});
for (const check of restoreChecks) {
  assert.ok(check.fields_preserved.all, 'synthetic restore must preserve every field at ' + check.anchor);
  assert.ok(check.input_unmutated, 'restore must not mutate its input');
}

// Extra, clearly synthetic probes documenting the reset behavior and the
// single flower-facade exception at reopening-city.js:357-362.
const pub = C.PLACES.pub;
function probeRestore(name, x, y) {
  const input = { x, y, visited: allVisited.slice(), bike: { x: C.PLACES.coffee.x, y: C.PLACES.coffee.y, mounted: false } };
  const output = C.restore(input);
  return {
    case: name,
    input: clone(input),
    output: clone(output),
    position_reset_to_pub: output.x === pub.x && output.y === pub.y,
    visited_reset: arrayEqual(output.visited, ['pub']),
    visited_preserved_all_seven: arrayEqual(output.visited, allVisited),
    bike_reset_to_pub: bikeEqual(output.bike, { x: pub.x, y: pub.y, mounted: false }),
    bike_preserved_at_coffee: bikeEqual(output.bike, input.bike)
  };
}
const restoreProbes = [
  probeRestore('invalid_open_water_at_300_380_full_create', 300, 380),
  probeRestore('inside_decorative_block_02_at_415_130_full_create', 415, 130),
  probeRestore('inside_flowers_facade_at_1240_970_relocate_only', 1240, 970)
];
assert.ok(restoreProbes[0].position_reset_to_pub && restoreProbes[0].visited_reset && restoreProbes[0].bike_reset_to_pub,
  'water position must fully reset (city:357-360)');
assert.ok(restoreProbes[1].position_reset_to_pub && restoreProbes[1].visited_reset,
  'non-flower building position must fully reset (city:360)');
assert.ok(restoreProbes[2].position_reset_to_pub && restoreProbes[2].visited_preserved_all_seven &&
  restoreProbes[2].bike_preserved_at_coffee, 'flower facade keeps visits/bike, relocates point (city:358-362)');

// --- derived facts (measured through the exported module) ---
const offDiagonal = routes.filter(r => !r.self);
const emptyRoutes = offDiagonal.filter(r => r.empty_route);
const lengths = offDiagonal.map(r => r.length_world);
const gridNodes = (() => {
  let n = 0;
  for (let y = 50; y <= 1070; y += 20) {
    for (let x = 90; x <= 1710; x += 20) if (C.walkable(x, y)) n += 1;
  }
  return n;
})();

const facts = {
  generated_by: 'baseline-probe.js',
  baseline_source: 'tools/prototype/reopening-city.js + tools/prototype/flower-network.js at dad6b38',
  units: 'logical game world units only; not metres, not travel time',
  module_constants_measured: {
    WIDTH: C.WIDTH,
    HEIGHT: C.HEIGHT,
    LAND: C.LAND,
    waters: C.WATERS,
    crossings: C.CROSSINGS,
    buildings: C.BUILDINGS
  },
  source_constants_documented: {
    radius: 8, grid: 20, speed_walk: 240, speed_bike: 420,
    source_lines: 'reopening-city.js:11-14'
  },
  counts: {
    places: placeIds.length,
    anchors_total: anchors.length,
    waters: C.WATERS.length,
    crossings: C.CROSSINGS.length,
    bridges: C.CROSSINGS.filter(c => c.kind === 'bridge').length,
    ferries: C.CROSSINGS.filter(c => c.kind === 'ferry').length,
    narrow_no_ride_bridges_h_lt_80: C.CROSSINGS.filter(c => c.kind === 'bridge' && c.h < 80).length,
    buildings_total: C.BUILDINGS.length,
    building_facades: C.BUILDINGS.filter(b => b.kind === 'facade').length,
    building_decorative: C.BUILDINGS.filter(b => b.kind === 'decorative').length,
    walkable_grid_nodes_measured_via_C_walkable: gridNodes
  },
  garden_semantics: {
    entry: { id: F.ENTRY.id, x: F.ENTRY.x, y: F.ENTRY.y },
    cart_anchor: { x: F.CART.x, y: F.CART.y },
    cart_is_place_id: false,
    fresh_garden_keys: Object.keys(F.fresh()),
    source_lines: 'flower-network.js:8-10'
  },
  documented_interaction_radii: [
    { name: 'C.near default radius', value: 60, source: 'reopening-city.js:325-338' },
    { name: 'enterCityPlace max distance', value: 65, source: 'reopening-ui.js:417-422' },
    { name: 'travelTo empty-route auto enter', value: 60, source: 'reopening-ui.js:412-413' },
    { name: 'garden prep proximity (core validation)', value: 60, source: 'reopening-core.js:299-302' },
    { name: 'garden walk-by auto entry', value: 45, source: 'reopening-ui.js:430,437' },
    { name: 'bike mount / parked proximity', value: 42, source: 'reopening-city.js:261-263; reopening-ui.js:139' },
    { name: 'canvas click C.near radius', value: 85, source: 'reopening-ui.js:704' },
    { name: 'cart follow prompt radius', value: 150, source: 'reopening-ui.js:376' },
    { name: 'cart follow leash (pause avatar)', value: 55, source: 'reopening-ui.js:433' },
    { name: 'save localStorage key', value: 'ab_reopening_v1', source: 'reopening-ui.js:6,37-38' }
  ],
  routes_summary: {
    ordered_pairs: 81,
    self_pairs_empty: routes.filter(r => r.self).length,
    off_diagonal_pairs: 72,
    empty_off_diagonal_routes: emptyRoutes.length,
    empty_pair_labels: emptyRoutes.map(r => r.from + '>' + r.to),
    direct_single_segment_routes: offDiagonal.filter(r => r.direct_segment).length,
    grid_routes: offDiagonal.filter(r => r.points.length >= 2).length,
    all_polyline_samples_walkable: routes.every(r => r.walkable_samples_ok),
    max_endpoint_distance_when_empty: round6(Math.max(0, ...emptyRoutes.map(r => r.endpoint_distance))),
    min_length_off_diagonal: round6(Math.min(...lengths)),
    max_length_off_diagonal: round6(Math.max(...lengths)),
    total_length_off_diagonal: round6(lengths.reduce((a, b) => a + b, 0)),
    pairs_touching_ferry_samples: offDiagonal.filter(r => r.ferry_sample_count > 0).map(r => r.from + '>' + r.to),
    total_rideable_samples: routes.reduce((n, r) => n + r.rideable_sample_count, 0),
    total_ferry_samples: routes.reduce((n, r) => n + r.ferry_sample_count, 0)
  },
  restore_summary: {
    checks: restoreChecks.length,
    all_fields_preserved: restoreChecks.every(c => c.fields_preserved.all),
    reset_rule: 'non-finite point, non-array/invalid visited id, or non-walkable position returns C.create(); the sole exception is a point hit-testing the flowers facade footprint, which relocates to the pub point but keeps visited and bike',
    reset_source_lines: 'reopening-city.js:349-370',
    synthetic_extra_probes: restoreProbes
  }
};

const limitations = [
  'All distances are logical game world units on an 1800x1120 canvas; no real-world metres, geographic scale or Amsterdam survey data is implied.',
  'Routes are produced by the real C.route: axis-aligned BFS over a fixed 20-unit grid with FIFO tie order and <=4-unit safeSegment gating (reopening-city.js:120-236). They are grid-hop outputs, not cycle-optimal paths, human playtime, fun measures or traffic routes.',
  'Rideable/ferry counts are static samples (<=4 unit spacing, endpoints included) along the returned polyline; they describe that polyline only, not the dynamic move/moveAlong stepping with speeds 240/420 (reopening-city.js:272-323). No seconds are estimated.',
  'Sampling mirrors the shipped safeSegment test; it is the game’s own discrete collision gate, not a continuous geometric proof.',
  'restore_checks are synthetic: each anchor uses all seven existing place IDs as visited and one co-located valid unmounted bike. Equality here does not prove anything about naturally accumulated saves, parked/carried bikes elsewhere, or any future migration.',
  'The cart anchor (1310,1040) is not a destination or place ID; garden ENTRY is only enterable during the prep phase through UI/core rules (reopening-ui.js:409,419-423; reopening-core.js:298-302), which the phase-free probe does not exercise.',
  'Rendering-only coordinates in reopening-scene.js (paths, parks, lamps, moorings, musician, awnings) and UI thresholds are documented from source but are not part of the City collision module and were not collision-sampled.',
  'Legacy point-only callers are migrated through movementState (reopening-city.js:243-246); the probe always passes full city-shaped objects.'
];

const baseline = {
  baseline: BASELINE_HASH,
  generated_at_note: 'deterministic probe output; no timestamps, Math.random or network used',
  anchors,
  routes,
  restore_checks: restoreChecks,
  facts,
  limitations
};

const outPath = path.join(__dirname, 'baseline.json');
fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');

console.log('baseline ' + BASELINE_HASH);
console.log('anchors=9 (7 places + garden ENTRY ' + F.ENTRY.x + ',' + F.ENTRY.y + ' + cart ' + F.CART.x + ',' + F.CART.y + ')');
console.log('routes=81: self-empty=' + facts.routes_summary.self_pairs_empty +
  ', off-diagonal empty=' + emptyRoutes.length +
  ', direct=' + facts.routes_summary.direct_single_segment_routes +
  ', grid=' + facts.routes_summary.grid_routes);
console.log('all polyline samples walkable=' + facts.routes_summary.all_polyline_samples_walkable +
  '; walkable grid nodes=' + gridNodes +
  '; ferry pairs=' + facts.routes_summary.pairs_touching_ferry_samples.length);
console.log('restore checks=9, all fields preserved=' + facts.restore_summary.all_fields_preserved +
  '; flower-facade fallback and full-reset probes asserted');
console.log('wrote ' + path.relative(process.cwd(), outPath) + ' (' + fs.statSync(outPath).size + ' bytes)');
// Compact deterministic metric ledger (lengths rounded to 2 decimals for
// transcription; baseline.json retains 6-decimal values).
console.log('from\tto\tpoints\tlength\tendpoint\twalk_ok\trideable\tferry\tsamples');
for (const r of routes) {
  console.log([r.from, r.to, r.points.length, r.length_world.toFixed(2), r.endpoint_distance.toFixed(2),
    r.walkable_samples_ok ? 1 : 0, r.rideable_sample_count, r.ferry_sample_count, r.total_sample_count].join('\t'));
}
console.log('anchor\twalkable\trideable\ton_ferry');
for (const a of anchors) console.log([a.id, a.walkable ? 1 : 0, a.rideable ? 1 : 0, a.on_ferry ? 1 : 0].join('\t'));

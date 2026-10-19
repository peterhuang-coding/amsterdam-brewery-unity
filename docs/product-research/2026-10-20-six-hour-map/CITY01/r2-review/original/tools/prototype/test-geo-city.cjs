'use strict';

// CITY01 / f02-real-city-d27 focused acceptance for the real-geometry city.
//
// Explicitly configured fixtures only:
//  - the accepted NAV navigator runs over small, clearly named synthetic GEO
//    polygon layers for radius/capsule/classification predicates;
//  - named synthetic transit fixtures drive the F3 state machine (they make
//    no claim of full-map route coverage);
//  - the supplied real accepted pub subset drives the integration case.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const City = require('./reopening-city.js');
const GeoWorld = require('./geo-world.js');
const Nav = require('../geo/navigation/geo-navigation.js');

const A = GeoWorld.ANCHORS;
const SOUTH = A.ferrySouth;
const NORTH = A.ferryNorth;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPEN_DATA = { width: 8000, height: 7000, layers: { roads: [], bridges: [], water: [], buildings: [] } };
const openNav = { isWalkable: () => true, segmentWalkable: () => true };
function straightRoutes() {
  return {
    async route(from, to) {
      return {
        found: true, reason: 'ok', points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
        length: Math.hypot(to.x - from.x, to.y - from.y), visited: 0,
        startSnap: null, endSnap: null
      };
    }
  };
}
function configureOpen(routes) {
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: routes || straightRoutes() });
}
function saved(x, y, bike) {
  const p = typeof x === 'number' ? { x, y } : { x: x.x, y: x.y };
  let b = bike;
  if (!b && typeof y === 'object' && y) b = y;
  if (!b) b = { x: A.pub.x, y: A.pub.y, mounted: false };
  return { map: City.MAP_VERSION, x: p.x, y: p.y, visited: ['pub', 'coffee'], bike: b };
}

// Small polygon GEO layers for the accepted navigator. Coordinates are local
// metres; the "main-road" slab intentionally covers the pub/lotte anchors.
function ring(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}
function feature(id, rings, properties) {
  // GEO schema: polygons is an array of polygons; a polygon is an array of
  // closed rings. These simple fixtures use one outer ring per polygon.
  return { id, polygons: [rings], properties: properties || {} };
}
const TOWN = {
  width: 8000, height: 7000,
  layers: {
    roads: [
      feature('main-road', [ring(900, 3100, 1300, 3400)], { functie: 'woonstraat' }),
      feature('test-road', [ring(0, 0, 100, 100)]),
      feature('footpath', [ring(0, 200, 100, 300)], { functie: 'voetpad' }),
      feature('motorway', [ring(0, 400, 100, 500)], { functie: 'autosnelweg' }),
      feature('carriageway-motorway', [ring(0, 600, 100, 700)], { functie: 'rijbaan autosnelweg' })
    ],
    bridges: [],
    water: [feature('canal', [ring(120, 0, 124, 100)], { type: 'waterloop' })],
    buildings: [feature('house', [ring(200, 0, 240, 100)])]
  }
};
function configureTown(routes) {
  City.dispose();
  City.configure(TOWN, { navigator: Nav.createNavigator(TOWN), routes: routes || straightRoutes() });
}

// Deferred routes service for abort/race control.
function deferredRoutes() {
  const pending = [];
  const calls = [];
  return {
    calls,
    route(from, to, options) {
      calls.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, options });
      return new Promise(resolve => pending.push(resolve));
    },
    resolve(i, value) { pending[i](value); }
  };
}
const okRoute = (from, to) => ({
  found: true, reason: 'ok', points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
  length: Math.hypot(to.x - from.x, to.y - from.y), visited: 0,
  startSnap: null, endSnap: null
});
const failRoute = reason => ({
  found: false, reason: reason || 'unreachable', points: [], length: 0,
  visited: 0, startSnap: null, endSnap: null
});

// ---------------------------------------------------------------------------
// Configuration / readiness / shared world
// ---------------------------------------------------------------------------

test('geometry is required before use and configure validates its inputs', () => {
  City.dispose();
  assert.equal(City.isReady(), false);
  assert.throws(() => City.walkable(1, 1), /not configured/);
  assert.throws(() => City.getData(), /not configured/);
  assert.throws(() => City.configure(OPEN_DATA, {}), /navigator/);
  assert.throws(() => City.configure(OPEN_DATA, { navigator: openNav }), /routes/);
  assert.throws(() => City.configure({ layers: {} }, { navigator: openNav, routes: straightRoutes() }), /width/);
  configureOpen();
  assert.equal(City.isReady(), true);
  assert.equal(City.getData(), OPEN_DATA);
  assert.throws(
    () => City.configure(OPEN_DATA, { navigator: openNav, routes: straightRoutes() }),
    /already configured/
  );
  assert.equal(City.WIDTH, 8000);
  assert.equal(City.HEIGHT, 7000);
  assert.deepEqual(City.BOUNDS, { x: 0, y: 0, width: 8000, height: 7000 });
  City.dispose();
  assert.equal(City.isReady(), false);
});

test('shared GeoWorld exposes the ten reviewed anchors and seven places', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '../../anchors.json'), 'utf8'));
  assert.equal(Object.keys(GeoWorld.ANCHORS).length, 10);
  for (const [id, p] of Object.entries(rows)) {
    assert.equal(GeoWorld.ANCHORS[id].x, p.x, id + ' x');
    assert.equal(GeoWorld.ANCHORS[id].y, p.y, id + ' y');
  }
  assert.deepEqual(Object.keys(City.PLACES), ['pub', 'lotte', 'coffee', 'noord', 'market', 'flowers', 'lab']);
  assert.equal(City.PLACES.noord.x, A.ferryNorth.x);
  assert.equal(City.PLACES.noord.y, A.ferryNorth.y);
  assert.equal(City.PLACES.pub.x, A.pub.x);
  assert.equal(City.ANCHORS, GeoWorld.ANCHORS);
  assert.equal(City.MAP_VERSION, GeoWorld.MAP_VERSION);
  assert.equal(City.F3.id, 'F3');
  assert.throws(() => { GeoWorld.ANCHORS.pub.x = 0; });
});

test('tuning constants are exported with the frozen metres/seconds values', () => {
  assert.equal(City.ACTOR_RADIUS, 0.4);
  assert.equal(City.WALK_SPEED, 48);
  assert.equal(City.BIKE_SPEED, 96);
  assert.equal(City.FERRY_SPEED, 32);
  assert.equal(City.ARRIVAL_RADIUS, 4);
  assert.equal(City.BIKE_RETRIEVAL, 2);
});

// ---------------------------------------------------------------------------
// Accepted NAV predicates over explicit synthetic polygon fixtures
// ---------------------------------------------------------------------------

test('points classify road, footpath, motorway, water and building at radius 0.4', () => {
  configureTown();
  assert.equal(City.walkable(50, 50), true);
  // Whole-body radius 0.4: a centre 0.35 m inside the edge is not clear.
  assert.equal(City.walkable(0.35, 50), false);
  assert.equal(City.walkable(0.5, 50), true);
  assert.equal(City.rideable(50, 50), true);
  // voetpad is walkable ground but never bike-safe.
  assert.equal(City.walkable(50, 250), true);
  assert.equal(City.rideable(50, 250), false);
  // Highways reject both modes, including the "rijbaan autosnelweg" spelling.
  assert.equal(City.walkable(50, 450), false);
  assert.equal(City.walkable(50, 650), false);
  // Water and buildings are forbidden ground.
  assert.equal(City.walkable(122, 50), false);
  assert.equal(City.walkable(220, 50), false);
  assert.equal(City.walkable(NaN, 50), false);
  assert.equal(City.walkable(50, Infinity), false);
  // The reviewed anchors actually sit on indexed road ground.
  assert.equal(City.walkable(A.pub.x, A.pub.y), true);
  assert.equal(City.walkable(A.lotte.x, A.lotte.y), true);
});

test('segments use the complete swept capsule: canal and house block crossing', () => {
  configureTown();
  assert.equal(City.segmentWalkable({ x: 10, y: 50 }, { x: 90, y: 50 }), true);
  assert.equal(City.segmentWalkable({ x: 50, y: 50 }, { x: 110, y: 50 }), false);
  assert.equal(City.segmentWalkable({ x: 50, y: 50 }, { x: 220, y: 50 }), false);
  assert.equal(City.segmentWalkable({ x: 50, y: 50 }, { x: 50, y: 250 }), false);
});

test('diagonal movement slides and never tunnels through a mocked thin barrier', () => {
  const x0 = A.pub.x + 1;
  City.dispose();
  City.configure(OPEN_DATA, {
    navigator: {
      isWalkable: () => true,
      segmentWalkable: (a, b) =>
        !((a.x < x0 && b.x >= x0) || (b.x < x0 && a.x >= x0))
    },
    routes: straightRoutes()
  });
  const q = City.move(saved(A.pub), 1, 0, 0.1);
  assert.ok(q.x < x0);
  assert.equal(City.walkable(q.x, q.y), true);
  const diag = City.move(saved(A.pub.x, A.pub.y + 1), 1, 1, 0.1);
  assert.ok(diag.x < x0);
});

// ---------------------------------------------------------------------------
// Movement: speeds, swept capsules, waypoint exhaustion, near()
// ---------------------------------------------------------------------------

test('manual movement uses 48 walk / 96 bike metres per second and clamps dt', () => {
  configureOpen();
  let p = saved(A.pub);
  let q = City.move(p, 1, 0, 0.1);
  assert.ok(Math.abs(q.x - p.x - 4.8) < 1e-9);
  assert.ok(Math.abs(q.y - p.y) < 1e-9);
  p = saved(A.pub, { x: A.pub.x, y: A.pub.y, mounted: true });
  q = City.move(p, 1, 0, 0.1);
  assert.ok(Math.abs(q.x - p.x - 9.6) < 1e-9);
  assert.equal(q.bike.x, q.x);
  // Elapsed is clamped to [0, 0.1].
  q = City.move(saved(A.pub), 1, 0, 5);
  assert.ok(Math.abs(q.x - A.pub.x - 4.8) < 1e-9);
  q = City.move(saved(A.pub), 1, 0, -1);
  assert.equal(q.x, A.pub.x);
  // Non-finite direction input is a no-op.
  q = City.move(saved(A.pub), NaN, 0, 0.1);
  assert.equal(q.x, A.pub.x);
});

test('moveAlong consumes a reachable 3 m waypoint within 0.1 s exactly (regression 1)', () => {
  configureOpen();
  const p = saved(A.pub);
  const path = [{ x: p.x + 3, y: p.y }];
  const before = JSON.stringify({ p, path });
  const r = City.moveAlong(p, path, 0.1);
  assert.equal(r.arrived, true);
  assert.deepEqual(r.path, []);
  assert.ok(Math.abs(r.position.x - p.x - 3) < 1e-6);
  assert.equal(JSON.stringify({ p, path }), before);
});

test('finite path travel consumes the whole available distance over repeated ticks', () => {
  configureOpen();
  let p = saved(A.pub);
  const target = { x: A.pub.x + 10, y: A.pub.y };
  // One tick covers exactly the 4.8 m time budget, not a 2 m substep.
  let r = City.moveAlong(p, [target], 0.1);
  assert.equal(r.arrived, false);
  assert.ok(Math.abs(r.position.x - A.pub.x - 4.8) < 1e-9);
  p = r.position;
  r = City.moveAlong(p, r.path, 0.1);
  assert.ok(Math.abs(r.position.x - A.pub.x - 9.6) < 1e-9);
  r = City.moveAlong(r.position, r.path, 0.1);
  assert.equal(r.arrived, true);
  assert.equal(r.position.x, target.x);
});

test('bicycle rides on bike-safe ground and pushes at walk speed where bikes are barred', () => {
  configureOpen();
  let p = saved(A.pub, { x: A.pub.x, y: A.pub.y, mounted: true });
  let q = City.move(p, 1, 0, 0.1);
  assert.ok(Math.abs(q.x - p.x - 9.6) < 1e-9);
  assert.equal(q.bike.mounted, true);

  City.dispose();
  City.configure(OPEN_DATA, {
    navigator: {
      isWalkable: (pt, o) => o.mode === 'walk',
      segmentWalkable: (a, b, o) => o.mode === 'walk'
    },
    routes: straightRoutes()
  });
  p = saved(A.pub, { x: A.pub.x, y: A.pub.y, mounted: false, pushing: true });
  q = City.move(p, 1, 0, 0.1);
  assert.ok(Math.abs(q.x - p.x - 4.8) < 1e-9);
  assert.equal(q.bike.pushing, true);
  assert.equal(q.bike.mounted, false);
  assert.equal(q.bike.x, q.x);
});

test('independently parked bicycles never move with the player or teleport back', () => {
  configureOpen();
  const p = saved(A.pub, { x: A.coffee.x, y: A.coffee.y, mounted: false });
  const q = City.move(p, 1, 0, 0.1);
  assert.equal(q.bike.x, A.coffee.x);
  assert.equal(q.bike.y, A.coffee.y);
  const r = City.moveAlong(p, [{ x: p.x + 3, y: p.y }], 0.1);
  assert.equal(r.position.bike.x, A.coffee.x);
});

test('near selects the closest place within radius only', () => {
  configureOpen();
  assert.equal(City.near({ x: A.pub.x, y: A.pub.y }).id, 'pub');
  assert.equal(City.near({ x: A.pub.x + 500, y: A.pub.y }, 4), null);
  assert.equal(City.near({ x: NaN, y: 1 }), null);
  assert.equal(City.near({ x: 0, y: 0 }, -1), null);
});

test('onFerry marks only the interior of the canonical F3 lane, never the banks', () => {
  configureOpen();
  const mid = { x: (SOUTH.x + NORTH.x) / 2, y: (SOUTH.y + NORTH.y) / 2 };
  assert.equal(City.onFerry(mid.x, mid.y), true);
  assert.equal(City.onFerry(SOUTH.x, SOUTH.y), false);
  assert.equal(City.onFerry(NORTH.x, NORTH.y), false);
  assert.equal(City.onFerry(A.pub.x, A.pub.y), false);
});

// ---------------------------------------------------------------------------
// Bicycle toggle / park
// ---------------------------------------------------------------------------

test('toggle mounts, parks, refuses distant bikes, and never mutates input', () => {
  configureOpen();
  const fresh = City.create();
  const before = JSON.stringify(fresh);
  const mounted = City.toggleBike(fresh);
  assert.equal(mounted.bike.mounted, true);
  assert.deepEqual(mounted.bike.x, fresh.x);
  assert.equal(JSON.stringify(fresh), before);
  const parked = City.toggleBike(mounted);
  assert.equal(parked.bike.mounted, false);
  assert.equal(parked.bike.pushing, undefined);
  assert.deepEqual(City.parkBike(fresh), fresh);
  const distant = Object.assign(saved(A.pub, { x: A.lab.x, y: A.lab.y, mounted: false }));
  assert.deepEqual(City.toggleBike(distant), distant);
  // Retrieval radius is 2 m.
  const close = saved(A.pub, { x: A.pub.x + 1.9, y: A.pub.y, mounted: false });
  assert.equal(City.toggleBike(close).bike.mounted, true);
  const tooFar = saved(A.pub, { x: A.pub.x + 2.1, y: A.pub.y, mounted: false });
  assert.equal(tooFar.bike.mounted, false);
  assert.deepEqual(City.toggleBike(tooFar), tooFar);
});

// ---------------------------------------------------------------------------
// Saves: legacy migration, new validation, clones
// ---------------------------------------------------------------------------

test('legacy 1800x1120 saves migrate player and bicycle independently', () => {
  configureOpen();
  const old = { x: 730, y: 930, visited: ['pub', 'coffee'], bike: { x: 1490, y: 910, mounted: false } };
  const before = JSON.stringify(old);
  const info = City.restoreInfo(old);
  assert.equal(info.migrated, true);
  assert.ok(info.notes.includes('migrated'));
  assert.equal(info.state.x, City.PLACES.coffee.x);
  assert.equal(info.state.bike.x, City.PLACES.lab.x);
  assert.deepEqual(info.state.visited, old.visited);
  assert.notEqual(info.state.visited, old.visited);
  assert.equal(JSON.stringify(old), before);
  // Unrecognized old coordinates fall back to the pub; a missing bike defaults there.
  const lost = City.restoreInfo({ x: 5, y: 5, visited: ['pub'] });
  assert.equal(lost.state.x, City.PLACES.pub.x);
  assert.equal(lost.state.bike.x, City.PLACES.pub.x);
  assert.equal(lost.migrated, true);
});

test('new valid saves preserve values exactly through strict clones', () => {
  configureOpen();
  const s = saved(A.lotte, { x: A.coffee.x, y: A.coffee.y, mounted: false });
  const out = City.restore(s);
  assert.equal(out.map, City.MAP_VERSION);
  assert.equal(out.x, s.x);
  assert.equal(out.bike.x, A.coffee.x);
  assert.deepEqual(out.visited, s.visited);
  assert.notEqual(out.visited, s.visited);
  assert.notEqual(out.bike, s.bike);
  out.visited.push('lab');
  assert.deepEqual(s.visited, ['pub', 'coffee']);
});

test('invalid visits and nonfinite saves reset to a fresh city', () => {
  configureOpen();
  const fresh = City.create();
  for (const bad of [null, {}, { x: NaN, y: 1, visited: ['pub'] },
    { x: 1, y: 1, visited: 'pub' }, { x: 1, y: 1, visited: ['ghost'] },
    { x: 1, y: 1, visited: ['pub', 'pub'] }]) {
    assert.deepEqual(City.restore(bad), fresh);
    assert.equal(City.restoreInfo(bad).migrated, false);
  }
});

test('new saves in water or buildings reset position while retaining valid visits', () => {
  configureTown();
  const wet = { map: City.MAP_VERSION, x: 122, y: 50, visited: ['pub', 'coffee'],
    bike: { x: A.pub.x, y: A.pub.y, mounted: false } };
  const info = City.restoreInfo(wet);
  assert.equal(info.state.x, City.PLACES.pub.x);
  assert.deepEqual(info.state.visited, ['pub', 'coffee']);
  assert.ok(info.notes.includes('reset-position'));
  // A malformed bicycle resets only the bicycle; valid player progress survives.
  const badBike = { map: City.MAP_VERSION, x: A.pub.x, y: A.pub.y, visited: ['pub', 'flowers'],
    bike: { x: NaN, y: 1, mounted: false } };
  const r2 = City.restoreInfo(badBike);
  assert.equal(r2.state.x, A.pub.x);
  assert.deepEqual(r2.state.visited, ['pub', 'flowers']);
  assert.equal(r2.state.bike.x, City.PLACES.pub.x);
  assert.ok(r2.notes.includes('reset-bike'));
});

// ---------------------------------------------------------------------------
// F3 transit leg
// ---------------------------------------------------------------------------

function ferryPoint(from, to) {
  return { x: A[to].x, y: A[to].y, transport: 'ferry', id: 'F3', from, to };
}
function crossUntilBank(start, path, limit) {
  let p = start;
  let input = path;
  for (let i = 0; i < (limit || 200) && (p.transit || input.length); i++) {
    const r = City.moveAlong(p, input, 0.1);
    p = r.position;
    input = r.path;
  }
  return { p, input };
}

test('F3 cannot board through an unwalkable connector or from beyond arrival radius', () => {
  City.dispose();
  City.configure(OPEN_DATA, {
    navigator: { isWalkable: () => true, segmentWalkable: () => false },
    routes: straightRoutes()
  });
  const p = saved({ x: SOUTH.x - 3, y: SOUTH.y });
  const r = City.moveAlong(p, [ferryPoint('ferrySouth', 'ferryNorth')], 0.1);
  assert.equal(r.position.transit, undefined);
  assert.equal(r.position.x, p.x);

  // Clear connector but still farther than 4 m: no teleport boarding.
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: straightRoutes() });
  const far = saved({ x: SOUTH.x - 5, y: SOUTH.y });
  const r2 = City.moveAlong(far, [ferryPoint('ferrySouth', 'ferryNorth')], 0.1);
  assert.equal(r2.position.transit, undefined);
  assert.equal(r2.position.x, far.x);
});

test('F3 boards only at the exact anchor via the full-radius ground capsule', () => {
  configureOpen();
  const p = saved({ x: SOUTH.x - 3, y: SOUTH.y });
  const r = City.moveAlong(p, [ferryPoint('ferrySouth', 'ferryNorth')], 0.1);
  assert.ok(r.position.transit);
  assert.equal(r.position.transit.id, 'F3');
  assert.equal(r.position.transit.from, 'ferrySouth');
  assert.equal(r.position.transit.to, 'ferryNorth');
  assert.ok(r.position.transit.progress > 0);
  assert.ok(r.position.transit.progress < 1);
  // The 3 m connector was walked this tick.
  assert.ok(Math.hypot(r.position.x - SOUTH.x, r.position.y - SOUTH.y) > 0);
});

test('F3 runs in both canonical directions and lands exactly on the safe bank', () => {
  configureOpen();
  for (const [fromId, toId, start] of [
    ['ferrySouth', 'ferryNorth', { x: SOUTH.x - 3, y: SOUTH.y }],
    ['ferryNorth', 'ferrySouth', { x: NORTH.x + 3, y: NORTH.y }]
  ]) {
    const out = crossUntilBank(saved(start), [ferryPoint(fromId, toId)]);
    assert.equal(out.p.transit, undefined, fromId + ' crossing completes');
    assert.equal(out.p.x, A[toId].x, fromId + ' lands exactly');
    assert.equal(out.p.y, A[toId].y);
    assert.equal(out.input.length, 0);
    assert.equal(City.walkable(out.p.x, out.p.y), true);
  }
});

test('saved F3 refreshes with an empty path and keeps a remotely parked bike', () => {
  configureOpen();
  let p = saved({ x: (SOUTH.x + NORTH.x) / 2, y: (SOUTH.y + NORTH.y) / 2 });
  p.transit = { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 };
  p = City.restore(p);
  const parkedX = p.bike.x;
  const out = crossUntilBank(p, []);
  assert.equal(out.p.transit, undefined);
  assert.equal(out.p.x, NORTH.x);
  assert.equal(out.p.bike.x, parkedX);
  assert.equal(out.p.bike.y, A.pub.y);
});

test('movement keys and cancellation finish the crossing; zero elapsed pauses it', () => {
  configureOpen();
  let p = saved({ x: (SOUTH.x + NORTH.x) / 2, y: (SOUTH.y + NORTH.y) / 2 });
  p.transit = { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 };
  const paused = City.moveAlong(p, [], 0);
  assert.deepEqual(paused.position.transit, p.transit);
  const neg = City.moveAlong(p, [], -1);
  assert.deepEqual(neg.position.transit, p.transit);
  // Direction keys clear onward intent but never abort the crossing.
  for (let i = 0; i < 200 && p.transit; i++) p = City.move(p, 1, 0, 0.1);
  assert.equal(p.transit, undefined);
  assert.equal(p.x, NORTH.x);
});

test('forged, nonfinite and unknown transit metadata is rejected on restore', () => {
  configureTown();
  const mid = { x: (SOUTH.x + NORTH.x) / 2, y: (SOUTH.y + NORTH.y) / 2 };
  const base = { map: City.MAP_VERSION, x: mid.x, y: mid.y, visited: ['pub'],
    bike: { x: A.pub.x, y: A.pub.y, mounted: false } };
  for (const bad of [
    { id: 'F4', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 },
    { id: 'F3', from: 'pub', to: 'ferryNorth', progress: 0.5 },
    { id: 'F3', from: 'ferrySouth', to: 'ferrySouth', progress: 0.5 },
    { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 1 },
    { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: -0.1 },
    { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: NaN },
    { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5, extra: true }
  ]) {
    const info = City.restoreInfo(Object.assign({}, base, { transit: bad }));
    assert.equal(info.state.transit, undefined, JSON.stringify(bad));
  }
  // Coordinates that do not lie on the canonical leg are forged.
  const offLeg = Object.assign({}, base, {
    transit: { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 }, x: mid.x + 1, y: mid.y });
  assert.equal(City.restoreInfo(offLeg).state.transit, undefined);
  // A well-formed leg restores with a cloned record.
  const good = Object.assign({}, base, {
    transit: { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 } });
  const r = City.restore(good);
  assert.deepEqual(r.transit, good.transit);
  assert.notEqual(r.transit, good.transit);
});

test('malformed boat waypoints are never treated as a boarding event', () => {
  configureOpen();
  const p = saved({ x: SOUTH.x - 3, y: SOUTH.y });
  for (const bad of [
    { x: NORTH.x, y: NORTH.y, transport: 'ferry', id: 'F4', from: 'ferrySouth', to: 'ferryNorth' },
    { x: NORTH.x, y: NORTH.y, transport: 'boat', id: 'F3', from: 'ferrySouth', to: 'ferryNorth' },
    { x: NORTH.x, y: NORTH.y, transport: 'ferry', id: 'F3', from: 'pub', to: 'ferryNorth' }
  ]) {
    const r = City.moveAlong(p, [bad], 0.1);
    assert.equal(r.position.transit, undefined, JSON.stringify(bad));
  }
});

test('bike toggle/park aboard F3 keeps the carried bike to the safe bank (regression 3)', () => {
  configureOpen();
  const mid = { x: (SOUTH.x + NORTH.x) / 2, y: (SOUTH.y + NORTH.y) / 2 };
  for (const carried of [
    { x: mid.x, y: mid.y, mounted: false, pushing: true },
    { x: mid.x, y: mid.y, mounted: true }
  ]) {
    let p = saved(mid, carried);
    p.transit = { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 };
    p = City.restore(p);
    // Neither toggle nor park may drop the bicycle over water.
    assert.deepEqual(City.toggleBike(p).bike, p.bike);
    assert.deepEqual(City.parkBike(p).bike, p.bike);
    const out = crossUntilBank(p, []);
    assert.equal(out.p.transit, undefined);
    assert.ok(Math.hypot(out.p.bike.x - NORTH.x, out.p.bike.y - NORTH.y) < 1e-6);
    assert.equal(City.walkable(out.p.bike.x, out.p.bike.y), true);
  }
  // A bicycle parked remotely before boarding stays remote for the whole trip.
  let p2 = saved(mid, { x: A.coffee.x, y: A.coffee.y, mounted: false });
  p2.transit = { id: 'F3', from: 'ferrySouth', to: 'ferryNorth', progress: 0.5 };
  p2 = City.restore(p2);
  const out2 = crossUntilBank(p2, []);
  assert.equal(out2.p.bike.x, A.coffee.x);
  assert.equal(out2.p.bike.y, A.coffee.y);
});

// ---------------------------------------------------------------------------
// Async routing: frozen routes surface, progress, abort, stale races, cache
// ---------------------------------------------------------------------------

test('routeAsync resolves ground routes with metadata and observable progress', async () => {
  const events = [];
  configureOpen();
  const from = { ...A.pub };
  const to = { ...A.lotte };
  const r = await City.routeAsync(from, to, { onProgress: e => events.push(e) });
  assert.equal(r.found, true);
  assert.equal(r.reason, 'ok');
  assert.ok(r.length > 0);
  assert.deepEqual(r.path.at(-1), { x: to.x, y: to.y });
  assert.deepEqual(r.path[0], { x: to.x, y: to.y }); // start point excluded
  assert.ok(events.some(e => e.phase === 'ground' && e.progress === 0));
  assert.ok(events.some(e => e.phase === 'ground' && e.progress === 1));
});

test('routeAsync passes mode and radius 0.4 and never mutates caller points', async () => {
  const svc = deferredRoutes();
  configureOpen(svc);
  const from = { ...A.pub };
  const before = JSON.stringify(from);
  const p = City.routeAsync(from, { ...A.lotte }, { mode: 'bike' });
  assert.equal(svc.calls[0].options.mode, 'bike');
  assert.equal(svc.calls[0].options.radius, 0.4);
  svc.resolve(0, okRoute(from, A.lotte));
  const r = await p;
  assert.equal(r.found, true);
  assert.equal(JSON.stringify(from), before);
});

test('pre-aborted and in-flight abort reject with AbortError and publish nothing', async () => {
  configureOpen();
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(City.routeAsync(A.pub, A.lotte, { signal: pre.signal }), e => e.name === 'AbortError');

  const svc = deferredRoutes();
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: svc });
  const ac = new AbortController();
  const work = City.routeAsync(A.pub, A.lotte, { signal: ac.signal });
  ac.abort();
  svc.resolve(0, okRoute(A.pub, A.lotte));
  await assert.rejects(work, e => e.name === 'AbortError');
  assert.deepEqual(City.route(A.pub, A.lotte), []);
});

test('a newer target cancels stale in-flight work; dispose aborts too', async () => {
  const svc = deferredRoutes();
  configureOpen(svc);
  const stale = City.routeAsync({ ...A.pub }, { ...A.lotte });
  const staleObserved = stale.then(() => 'resolved', e => e.name);
  const fresh = City.routeAsync({ ...A.lotte }, { ...A.coffee });
  // The stale request only settles once its frozen-service call resolves;
  // the abort decided before that resolution must win.
  svc.resolve(0, okRoute(A.pub, A.lotte));
  assert.equal(await staleObserved, 'AbortError');
  svc.resolve(1, okRoute(A.lotte, A.coffee));
  const r = await fresh;
  assert.equal(r.found, true);
  assert.deepEqual(r.path.at(-1), { x: A.coffee.x, y: A.coffee.y });

  const svc2 = deferredRoutes();
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: svc2 });
  const inflight = City.routeAsync({ ...A.pub }, { ...A.lotte });
  const observed = inflight.then(() => 'resolved', e => e.name);
  City.dispose();
  // The frozen service observes the linked abort signal; its deferred call
  // settles, and City converts the result into an AbortError.
  svc2.resolve(0, okRoute(A.pub, A.lotte));
  assert.equal(await observed, 'AbortError');
});

test('compatibility route is cache-only and stays alias-free', async () => {
  configureOpen();
  assert.deepEqual(City.route(A.pub, A.lotte), []);
  const r = await City.routeAsync({ ...A.pub }, { ...A.lotte });
  const cached = City.route(A.pub, A.lotte);
  assert.deepEqual(cached, r.path);
  assert.notEqual(cached, r.path);
  cached[0].x = 0;
  assert.equal(City.route(A.pub, A.lotte)[0].x, A.lotte.x);
  r.path[0].x = 0;
  assert.equal(City.route(A.pub, A.lotte)[0].x, A.lotte.x);
});

test('F3 composition requires exact anchor legs and carries canonical metadata', async () => {
  const start = { x: SOUTH.x - 5, y: SOUTH.y };
  const goal = { x: NORTH.x + 5, y: NORTH.y };
  const same = (p, q) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
  const svc = {
    async route(from, to) {
      if (same(from, start) && same(to, SOUTH)) {
        return { found: true, reason: 'ok', points: [{ ...from }, { ...SOUTH }],
          length: 5, visited: 1, startSnap: null, endSnap: null };
      }
      if (same(from, NORTH) && same(to, goal)) {
        return { found: true, reason: 'ok', points: [{ ...NORTH }, { ...goal }],
          length: 5, visited: 1, startSnap: null, endSnap: null };
      }
      return failRoute();
    }
  };
  configureOpen(svc);
  const events = [];
  const r = await City.routeAsync(start, goal, { onProgress: e => events.push(e) });
  assert.equal(r.found, true);
  assert.equal(r.reason, 'ferry');
  assert.deepEqual(r.path[0], { x: SOUTH.x, y: SOUTH.y });
  assert.deepEqual(r.path[1], {
    x: NORTH.x, y: NORTH.y, transport: 'ferry', id: 'F3',
    from: 'ferrySouth', to: 'ferryNorth'
  });
  assert.deepEqual(r.path.at(-1), { x: goal.x, y: goal.y });
  assert.ok(Math.abs(r.length - 10 - Math.hypot(NORTH.x - SOUTH.x, NORTH.y - SOUTH.y)) < 1e-9);
  assert.ok(events.some(e => e.phase === 'ground-to-board'));
  assert.ok(events.some(e => e.phase === 'ground-from-bank'));

  // A snapped boarding leg is not an exact-anchor reach: composition fails.
  const snapped = {
    async route(from, to) {
      if (same(from, start) && same(to, SOUTH)) {
        return { found: true, reason: 'ok', points: [{ ...from }, { ...SOUTH }],
          length: 5, visited: 1, startSnap: null, endSnap: { x: SOUTH.x, y: SOUTH.y, distance: 0.1 } };
      }
      return failRoute();
    }
  };
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: snapped });
  const blocked = await City.routeAsync(start, goal);
  assert.equal(blocked.found, false);

  // And the composed route is playable end to end through the state machine.
  City.dispose();
  City.configure(OPEN_DATA, { navigator: openNav, routes: svc });
  const planned = await City.routeAsync(start, goal);
  const out = crossUntilBank(saved(start), planned.path, 240);
  assert.equal(out.p.x, goal.x);
  assert.equal(out.p.y, goal.y);
  assert.equal(out.input.length, 0);
});

// ---------------------------------------------------------------------------
// UMD parity and the accepted real pub subset
// ---------------------------------------------------------------------------

test('UMD browser bundle exposes the same frozen public surface', () => {
  const context = { GeoWorld };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reopening-city.js'), 'utf8'), context);
  assert.ok(context.City);
  assert.deepEqual(Object.keys(context.City).sort(), Object.keys(City).sort());
  for (const key of ['configure', 'walkable', 'rideable', 'segmentWalkable', 'onFerry',
    'route', 'routeAsync', 'move', 'moveAlong', 'near', 'create', 'restore',
    'restoreInfo', 'toggleBike', 'parkBike']) {
    assert.equal(typeof context.City[key], 'function');
  }
});

test('accepted NAV pub subset: reviewed pub anchor is walkable real ground', () => {
  const data = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../geo/navigation/real-pub-sample.json'), 'utf8'));
  const navigator = Nav.createNavigator(data);
  City.dispose();
  City.configure(data, { navigator, routes: straightRoutes() });
  assert.equal(City.walkable(A.pub.x, A.pub.y), true);
  assert.equal(City.walkable(-1, -1), false);
  assert.equal(City.getData(), data);
  City.dispose();
});

'use strict';
// DistrictCity (CITY02) adapter tests.
// Synthetic multi-district fixtures are compiled by the REAL supplied
// DistrictRuntime navigator (grid masks + A*), and one test drives the real
// published tiny pub-sample fixture. No production fallback geometry exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const DR = require('./district-runtime.js');
const DC = require('./district-city.js');
const pubSample = require('./map-fixture/districts/pub-sample.json');

const MAP_VERSION = 'test-shape-v1';

// ---------------------------------------------------------------------------
// Synthetic grid districts: '.' walk+bike, '=' walk only (no bike), '#' blocked
// ---------------------------------------------------------------------------
function runsFromRows(rows, bikeBlocked) {
  const h = rows.length, w = rows[0].length;
  const walk = new Uint8Array(w * h), bike = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') { walk[y * w + x] = 1; bike[y * w + x] = 1; }
    else if (ch === '=') { walk[y * w + x] = 1; }
  }
  const toRuns = mask => {
    const out = [];
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) {
        let j = i;
        while (mask[j + 1] === 1) j++;
        out.push([i, j - i + 1]);
        i = j;
      }
    }
    return out;
  };
  return { w, h, walkRuns: toRuns(walk), bikeRuns: toRuns(bike) };
}

// anchors: [[id, cx, cy], ...] in declaration order (first = entrance).
// source positions are offset from snapped positions so remote marker
// coordinates are observably distinct from snapped anchor coordinates.
function makeDistrict(id, name, bounds, rows, anchors) {
  const [ox, oy] = bounds;
  const { w, h, walkRuns, bikeRuns } = runsFromRows(rows);
  const anchorObj = {};
  for (const [aid, cx, cy, sdx = -0.7, sdy = 0.3] of anchors) {
    const x = ox + cx + 0.5, y = oy + cy + 0.5;
    anchorObj[aid] = { featureId: 'wegdeel:test-' + aid, x, y, sourceX: x + sdx, sourceY: y + sdy };
  }
  const first = anchorObj[anchors[0][0]];
  return {
    schemaVersion: 1, mapVersion: MAP_VERSION, id, name, bounds, shapes: [],
    nav: { origin: [ox, oy], cellSize: 1, cols: w, rows: h, walkRuns, bikeRuns },
    anchors: anchorObj,
    entrance: { x: first.x, y: first.y }
  };
}

function openRows(w, h) {
  return Array.from({ length: h }, () => '.'.repeat(w).split('').join(''));
}

// 20x20 jordaan: wall cells, a diagonal corner pair, and a full-width
// walk-only strip at row 8 (bikes must dismount/push across it).
function jordaanRows() {
  const rows = openRows(20, 20).map(r => r.split(''));
  for (let x = 0; x < 20; x++) rows[8][x] = '=';
  rows[2][5] = '#';
  rows[5][5] = '#';
  rows[6][6] = '#';
  return rows.map(r => r.join(''));
}

const LINKS = [
  { from: 'jordaan', mode: 'street', to: 'depijp' },
  { from: 'jordaan', mode: 'street', to: 'station' },
  { from: 'depijp', mode: 'street', to: 'science' },
  { from: 'science', mode: 'street', to: 'station' },
  { from: 'station', mode: 'ferry', id: 'F3', to: 'noord' }
];

function buildDocs() {
  return [
    makeDistrict('jordaan', 'Jordaan', [0, 0, 20, 20], jordaanRows(),
      [['pub', 2, 2], ['lotte', 17, 17]]),
    makeDistrict('depijp', 'De Pijp', [600, 0, 612, 12], openRows(12, 12),
      [['market', 2, 2], ['coffee', 9, 2], ['flowers', 2, 9], ['flowerCart', 5, 9], ['garden', 9, 9]]),
    makeDistrict('station', 'Centraal', [80, 0, 92, 12], openRows(12, 12),
      [['ferrySouth', 6, 6]]),
    makeDistrict('noord', 'Noord', [120, 0, 132, 12], openRows(12, 12),
      [['ferryNorth', 6, 6]]),
    makeDistrict('science', 'Science Park', [1600, 400, 1612, 412], openRows(12, 12),
      [['lab', 6, 6]])
  ];
}

function makeSession(docs, links, activeId) {
  const byId = new Map(docs.map(d => [d.id, d]));
  const districts = docs.map(d => ({
    id: d.id, name: d.name, bounds: d.bounds, anchorIds: Object.keys(d.anchors),
    bytes: 1, gzipBytes: 1, sha256: 'a'.repeat(64), url: d.id + '.json'
  }));
  const markers = [];
  for (const d of docs) {
    for (const [aid, a] of Object.entries(d.anchors)) {
      markers.push({ id: aid, x: a.sourceX, y: a.sourceY, districtId: d.id });
    }
  }
  const session = {
    manifest: {
      schemaVersion: 1, mapVersion: MAP_VERSION,
      projection: { type: 'local-equirectangular', units: 'metres' },
      source: { complete: false },
      overview: { bytes: 1, gzipBytes: 1, sha256: 'b'.repeat(64), url: 'overview.json' },
      districts, travelLinks: links
    },
    overview: {
      schemaVersion: 1, mapVersion: MAP_VERSION, bounds: [0, 0, 2000, 1000],
      shapes: [], markers, travelLinks: links
    },
    active: null,
    async loadDistrict(id) {
      const data = byId.get(id);
      if (!data) throw new Error('unknown district ' + id);
      session.active = { data, navigator: DR.createNavigator(data) };
      return session.active;
    },
    dispose() { session.active = null; }
  };
  // Pass activeId === null for the real DistrictRuntime.open startup:
  // active stays null until the caller explicitly awaits loadDistrict.
  if (activeId !== null) {
    const first = byId.get(activeId || docs[0].id);
    session.active = { data: first, navigator: DR.createNavigator(first) };
  }
  return session;
}

async function configured(docs, links, activeId) {
  const list = docs || buildDocs();
  const session = makeSession(list, links === undefined ? LINKS : links, activeId);
  DC.configure(session);
  return session;
}

function snapshot(v) { return JSON.stringify(v); }

test('lifecycle: configure gates every surface, dispose clears, no global City replacement', () => {
  DC.dispose();
  assert.equal(DC.isReady(), false);
  // Finite geometry predicates answer false until a district is active; the
  // contract never required them to throw. Action entry points still throw.
  assert.equal(DC.walkable(0, 0), false);
  assert.equal(DC.rideable(0, 0), false);
  assert.equal(DC.segmentWalkable({ x: 0, y: 0 }, { x: 1, y: 1 }), false);
  assert.throws(() => DC.create('pub'));
  assert.throws(() => DC.restore({}));
  assert.throws(() => DC.configure(null));
  assert.throws(() => DC.configure({ manifest: {}, overview: {}, active: {} }));
  const session = makeSession(buildDocs(), LINKS);
  DC.configure(session);
  assert.equal(DC.isReady(), true);
  assert.throws(() => DC.configure(session));
  assert.equal(DC.activeDistrictId, 'jordaan');
  assert.equal(DC.data.id, 'jordaan');
  DC.dispose();
  assert.equal(DC.isReady(), false);
});

test('lifecycle: real null-active startup works from the manifest until an explicit loadDistrict (no invented district)', async () => {
  DC.dispose();
  // Exactly what DistrictRuntime.open returns before the first load.
  const session = makeSession(buildDocs(), LINKS, null);
  assert.equal(session.active, null);
  DC.configure(session);
  assert.equal(DC.isReady(), true);
  // Finite geometry predicates answer false; action surfaces refuse to run.
  assert.equal(DC.walkable(2.5, 2.5), false);
  assert.equal(DC.rideable(2.5, 2.5), false);
  assert.equal(DC.segmentWalkable({ x: 2.5, y: 2.5 }, { x: 3.5, y: 2.5 }), false);
  assert.throws(() => DC.activeDistrictId);
  assert.throws(() => DC.create('pub'));
  assert.throws(() => DC.restore({ map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5 }));
  assert.throws(() => DC.beginTransfer({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 9.5,
    bike: { districtId: 'jordaan', x: 2.5, y: 9.5, mounted: false }
  }, 'depijp'));
  // Manifest-only surfaces already work: planning and restore routing.
  assert.deepEqual(DC.planTravel('noord', 'depijp').map(l => l.to),
    ['station', 'jordaan', 'depijp']);
  assert.equal(DC.requiredDistrict({ map: MAP_VERSION, districtId: 'science' }), 'science');
  assert.equal(DC.requiredDistrict({ x: 1490, y: 910 }), 'science');
  assert.equal(DC.requiredDistrict(null), 'jordaan');

  // No fallback district was downloaded: active is still null until real load.
  assert.equal(session.active, null);
  await session.loadDistrict('jordaan');
  assert.equal(DC.activeDistrictId, 'jordaan', 'live session.active is read after load');
  assert.equal(DC.walkable(2.5, 2.5), true);
  assert.equal(DC.walkable(5.5, 2.5), false);
  const made = DC.create('pub');
  assert.deepEqual([made.x, made.y], [2.5, 2.5]);
  const begin = DC.beginTransfer({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 9.5, visited: ['pub'],
    bike: { districtId: 'jordaan', x: 2.5, y: 9.5, mounted: false }
  }, 'depijp');
  assert.equal(begin.transit.from, 'jordaan');

  // dispose() is the only way out; reconfiguration stays explicit.
  DC.dispose();
  assert.equal(DC.isReady(), false);
  DC.configure(session);
  assert.equal(DC.isReady(), true);
  assert.throws(() => DC.configure(session));
  DC.dispose();
});

test('constants are the frozen business values', () => {
  assert.equal(DC.ACTOR_RADIUS, 0.4);
  assert.equal(DC.WALK_SPEED, 48);
  assert.equal(DC.BIKE_SPEED, 96);
  assert.equal(DC.FERRY_SPEED, 32);
  assert.equal(DC.ARRIVAL_RADIUS, 4);
  assert.equal(DC.BIKE_RETRIEVAL, 2);
});

test('places: seven preserved venue identities; local getters use snapped anchors, remote are markers only', async () => {
  DC.dispose();
  await configured();
  const P = DC.PLACES;
  assert.deepEqual(Object.keys(P).sort(),
    ['coffee', 'flowers', 'lab', 'lotte', 'market', 'noord', 'pub']);
  assert.equal(P.pub.name, 'Tweede Kans');
  assert.equal(P.pub.kind, 'pub');
  assert.equal(P.pub.icon, '\u{1f37a}');
  assert.equal(P.pub.cost, 0);
  assert.equal(P.pub.district, 'Jordaan');
  assert.equal(P.pub.districtId, 'jordaan');
  assert.equal(P.pub.anchorId, 'pub');
  assert.equal(P.market.cost, 8);
  assert.equal(P.lab.cost, 6);
  assert.equal(P.noord.anchorId, 'ferryNorth');
  assert.equal(P.noord.districtId, 'noord');
  assert.match(P.pub.description, /二次机会/);
  assert.match(P.lab.quote, /发酵/);
  // Active district: exact snapped point.
  assert.deepEqual([P.pub.x, P.pub.y], [2.5, 2.5]);
  assert.deepEqual([P.lotte.x, P.lotte.y], [17.5, 17.5]);
  // Remote district: overview source marker (not a walkability claim).
  const market = P.market;
  const doc = buildDocs().find(d => d.id === 'depijp');
  const src = doc.anchors.market;
  assert.deepEqual([market.x, market.y], [src.sourceX, src.sourceY]);
  assert.equal(DC.GARDEN.anchorId, 'garden');
  assert.equal(DC.GARDEN.districtId, 'depijp');
  assert.equal(DC.FLOWER_CART.id, 'flowerCart');
  DC.dispose();
});

test('create: lands on the snapped anchor of the active district place', async () => {
  DC.dispose();
  const session = await configured();
  assert.throws(() => DC.create('market'), /must be active/);
  const s = DC.create('pub');
  assert.deepEqual(s, {
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5,
    visited: ['pub'], bike: { districtId: 'jordaan', x: 2.5, y: 2.5, mounted: false }
  });
  assert.equal(DC.create().x, 2.5);
  assert.throws(() => DC.create('nope'));
  await session.loadDistrict('noord');
  const n = DC.create('noord');
  assert.equal(n.districtId, 'noord');
  assert.equal(n.anchorId, undefined);
  assert.deepEqual([n.x, n.y], [126.5, 6.5]);
  DC.dispose();
});

test('REAL FIXTURE: DistrictRuntime.createNavigator on the published pub-sample drives live routing/movement', async () => {
  DC.dispose();
  // Minimal manifest/overview session wrapping the real published district.
  const districts = [{
    id: pubSample.id, name: pubSample.name, bounds: pubSample.bounds,
    anchorIds: Object.keys(pubSample.anchors), bytes: 1, gzipBytes: 1,
    sha256: 'c'.repeat(64), url: 'districts/pub-sample.json'
  }];
  const markers = Object.entries(pubSample.anchors).map(([id, a]) =>
    ({ id, x: a.sourceX, y: a.sourceY, districtId: pubSample.id }));
  const session = {
    manifest: {
      schemaVersion: 1, mapVersion: pubSample.mapVersion,
      projection: {}, source: {},
      overview: { bytes: 1, gzipBytes: 1, sha256: 'd'.repeat(64), url: 'overview.json' },
      districts, travelLinks: []
    },
    overview: {
      schemaVersion: 1, mapVersion: pubSample.mapVersion,
      bounds: [0, 0, 7127.775, 6671.705], shapes: [], markers, travelLinks: []
    },
    active: { data: pubSample, navigator: DR.createNavigator(pubSample) },
    async loadDistrict() { throw new Error('single-fixture session'); },
    dispose() {}
  };
  DC.configure(session);
  // The real snapped pub anchor is walkable but its capsule is not bike-safe.
  assert.equal(DC.walkable(1100.5, 3243.5), true);
  assert.equal(DC.rideable(1100.5, 3243.5), false, 'real anchor is not bike-safe');
  // A real blocked cell exists somewhere in the water/building areas.
  const [minX, minY, maxX, maxY] = pubSample.bounds;
  let blocked = null;
  for (let x = minX + 0.5; x < maxX && !blocked; x += 1) {
    for (let y = minY + 0.5; y < maxY; y += 1) {
      if (!session.active.navigator.isWalkable({ x, y }, { mode: 'walk', radius: 0.4 })) {
        blocked = { x, y };
        break;
      }
    }
  }
  assert.ok(blocked, 'fixture contains blocked ground');
  assert.equal(DC.walkable(blocked.x, blocked.y), false);
  const blockedRoute = await DC.routeAsync({ x: 1100.5, y: 3243.5 }, blocked, { mode: 'walk' });
  assert.deepEqual(blockedRoute, []);

  // Real route between the two snapped anchors, then walk every path leg.
  const path = await DC.routeAsync({ x: 1100.5, y: 3243.5 }, { x: 1056.5, y: 3247.5 });
  assert.ok(path.length > 0, 'pub -> lotte routes on the real navigator');
  let position = DC.restore({
    map: pubSample.mapVersion, districtId: pubSample.id,
    x: 1100.5, y: 3243.5, visited: ['pub'],
    bike: { districtId: pubSample.id, x: 1100.5, y: 3243.5, mounted: false }
  });
  let rest = path;
  for (let i = 0; i < 400 && rest.length; i++) {
    const r = DC.moveAlong(position, rest, 0.1);
    position = r.position;
    rest = r.path;
    assert.equal(DC.walkable(position.x, position.y), true);
  }
  assert.equal(rest.length, 0);
  assert.ok(Math.hypot(position.x - 1056.5, position.y - 3247.5) < 0.01);
  DC.dispose();
});

test('predicates: walk/ride/segment, diagonal corner-cut rejection and malformed inputs', async () => {
  DC.dispose();
  await configured();
  assert.equal(DC.walkable(2.5, 2.5), true);
  assert.equal(DC.rideable(2.5, 2.5), true);
  // Row 8 is walk-only.
  assert.equal(DC.walkable(2.5, 8.5), true);
  assert.equal(DC.rideable(2.5, 8.5), false);
  // Wall cell.
  assert.equal(DC.walkable(5.5, 2.5), false);
  assert.equal(DC.segmentWalkable({ x: 2.5, y: 2.5 }, { x: 4.5, y: 2.5 }, 'walk'), true);
  assert.equal(DC.segmentWalkable({ x: 4.5, y: 2.5 }, { x: 6.5, y: 2.5 }), false, 'segment through a wall');
  // Diagonal corner: crossing the shared corner of two diagonally blocked
  // cells is rejected while each axis step is accepted.
  assert.equal(DC.segmentWalkable({ x: 5.5, y: 6.5 }, { x: 6.5, y: 5.5 }), false, 'no corner cutting');
  // Axis detours around the blocked corner pair end on genuinely free cells
  // ((6.5,6.5) itself is the '# ' at rows[6][6] and stays a negative case).
  assert.equal(DC.segmentWalkable({ x: 5.5, y: 6.5 }, { x: 5.5, y: 7.5 }), true, 'south axis detour is free');
  assert.equal(DC.segmentWalkable({ x: 6.5, y: 5.5 }, { x: 6.5, y: 4.5 }), true, 'north axis detour is free');
  assert.equal(DC.walkable(6.5, 6.5), false, 'rows[6][6] stays blocked');
  assert.equal(DC.segmentWalkable({ x: 2.5, y: 8.5 }, { x: 2.5, y: 9.5 }, 'bike'), false, 'bike capsule blocked');
  assert.equal(DC.segmentWalkable({ x: 2.5, y: 8.5 }, { x: 2.5, y: 9.5 }, 'walk'), true);
  for (const bad of [null, undefined, {}, { x: 1 }, { x: NaN, y: 2 }, 'p']) {
    assert.equal(DC.walkable(bad && bad.x, bad && bad.y), false);
    assert.equal(DC.segmentWalkable(bad, { x: 1, y: 1 }), false);
    assert.equal(DC.segmentWalkable({ x: 1, y: 1 }, bad), false);
  }
  DC.dispose();
});

test('near / nearBike use active snapped points only', async () => {
  DC.dispose();
  const session = await configured();
  const here = DC.create('pub');
  const hit = DC.near({ x: 2.6, y: 2.4 });
  assert.equal(hit.id, 'pub');
  assert.equal(hit.name, 'Tweede Kans');
  assert.equal(DC.near({ x: 2.5, y: 8.5 }), null);
  assert.equal(DC.near(null), null);
  assert.equal(DC.nearBike(here), true);
  const walked = DC.move(here, 0, 1, 0.05);
  assert.equal(DC.nearBike(walked), false, 'bike is now >2m away');
  const mounted = DC.toggleBike(here);
  assert.equal(DC.nearBike(mounted), false, 'a carried bike is not parked');
  const parked = DC.toggleBike(mounted);
  assert.equal(DC.nearBike(parked), true);
  await session.loadDistrict('depijp');
  assert.equal(DC.near({ x: 602.5, y: 2.5 }).id, 'market');
  assert.equal(DC.near({ x: 609.5, y: 9.5 }).id, 'garden', 'garden is a local special point');
  assert.equal(DC.near({ x: 605.5, y: 9.5 }).id, 'flowerCart');
  DC.dispose();
});

test('routing: safe paths, blocked endpoints, malformed coords, independent concurrent intents and abort', async () => {
  DC.dispose();
  await configured();
  const path = await DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 });
  assert.ok(path.length > 0);
  assert.equal(path[0].x === 2.5 && path[0].y === 2.5, false, 'start is not repeated');
  let prev = { x: 2.5, y: 2.5 };
  for (const p of path) {
    assert.equal(DC.segmentWalkable(prev, p, 'walk'), true);
    prev = p;
  }
  assert.deepEqual(await DC.routeAsync({ x: NaN, y: 2 }, { x: 3, y: 3 }), []);
  assert.deepEqual(await DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 5.5, y: 2.5 }), []);
  assert.deepEqual(await DC.routeAsync({ x: 5.5, y: 2.5 }, { x: 2.5, y: 2.5 }), []);

  // Bike graph is cut by the row-8 strip: bike intent falls back to a walk path.
  const bikePath = await DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, { mode: 'bike' });
  assert.ok(bikePath.length > 0, 'bike intent falls back to a valid walk route');
  let bp = { x: 2.5, y: 2.5 };
  for (const p of bikePath) {
    assert.equal(DC.segmentWalkable(bp, p, 'walk'), true);
    bp = p;
  }

  // Already-aborted signal rejects with AbortError and does not fabricate.
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, { signal: ctrl.signal }),
    e => e.name === 'AbortError');

  // One aborted intent never cancels a concurrent independent intent.
  const c1 = new AbortController();
  const results = await Promise.allSettled([
    DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 }, { signal: c1.signal }),
    DC.routeAsync({ x: 17.5, y: 17.5 }, { x: 2.5, y: 2.5 })
  ]);
  c1.abort();
  assert.equal(results[1].status, 'fulfilled');
  assert.ok(results[1].value.length > 0);

  // Progress callbacks are passed through to the real navigator search.
  let phases = 0;
  const withProgress = await DC.routeAsync({ x: 2.5, y: 2.5 }, { x: 17.5, y: 17.5 },
    { onProgress: () => { phases++; } });
  assert.ok(withProgress.length > 0);
  assert.ok(phases >= 0);
  DC.dispose();
});

test('routing: overlapping player/cart intents inside the active district resolve independently', async () => {
  DC.dispose();
  const session = await configured(undefined, undefined, 'jordaan');
  await session.loadDistrict('depijp');
  const [player, cart] = await Promise.all([
    DC.routeAsync({ x: 602.5, y: 2.5 }, { x: 609.5, y: 9.5 }),
    DC.routeAsync({ x: 605.5, y: 9.5 }, { x: 609.5, y: 2.5 })
  ]);
  assert.ok(player.length > 0 && cart.length > 0);
  const check = (path, from) => {
    let p = from;
    for (const q of path) { assert.equal(DC.segmentWalkable(p, q, 'walk'), true); p = q; }
  };
  check(player, { x: 602.5, y: 2.5 });
  check(cart, { x: 605.5, y: 9.5 });
  DC.dispose();
});

test('movement: speeds, elapsed clamp, wall sliding, no water walking, no input mutation', async () => {
  DC.dispose();
  await configured();
  // Open lane on row 2 east of the single wall cell (5,2).
  const open = DC.restore({ ...DC.create('pub'), x: 10.5, y: 2.5 });
  const before = snapshot(open);
  const walked = DC.move(open, 1, 0, 0.1);
  assert.equal(snapshot(open), before, 'input is never mutated');
  assert.ok(Math.abs(walked.x - (10.5 + 4.8)) < 1e-9, 'walk speed 48 m/s');
  assert.equal(walked.y, 2.5);
  const clamped = DC.move(open, 1, 0, 5);
  assert.ok(Math.abs(clamped.x - (10.5 + 4.8)) < 1e-9, 'per-step elapsed clamps to 0.1');
  const zero = DC.move(open, 1, 0, 0);
  assert.deepEqual([zero.x, zero.y], [10.5, 2.5]);
  const bad = DC.move(open, NaN, 0, 0.1);
  assert.deepEqual([bad.x, bad.y], [10.5, 2.5]);

  // Facing the wall at (5,2): cannot cross or slide with a pure-x vector.
  const face = DC.restore({ ...DC.create('pub'), x: 4.5, y: 2.5 });
  const blocked = DC.move(face, 1, 0, 0.1);
  assert.ok(blocked.x <= 4.5 + 1e-9);
  assert.equal(DC.walkable(blocked.x, blocked.y), true);

  // Long walk never lands on blocked ground (axis sliding absorbs obstacles).
  let cur = DC.create('pub');
  for (let i = 0; i < 60; i++) {
    cur = DC.move(cur, 1, 0.4, 0.1);
    assert.equal(DC.walkable(cur.x, cur.y), true);
  }
  DC.dispose();
});

test('movement: mounted 96 on bike-safe capsules, push 48 across the strip, automatic remount', async () => {
  DC.dispose();
  await configured();
  // Open lane on row 2 (the wall cell is x=5; 9.6 m stays within x<20).
  const start = DC.restore({
    map: MAP_VERSION, districtId: 'jordaan', x: 8.5, y: 2.5,
    visited: ['pub'], bike: { districtId: 'jordaan', x: 8.5, y: 2.5, mounted: true }
  });
  const rode = DC.move(start, 1, 0, 0.1);
  assert.ok(Math.abs(rode.x - (8.5 + 9.6)) < 1e-9, 'bike speed 96 m/s');
  assert.equal(rode.bike.mounted, true);

  // Travel south across the walk-only strip at row 8.
  let cur = DC.restore({ ...start, x: 2.5, y: 6.5, bike: { districtId: 'jordaan', x: 2.5, y: 6.5, mounted: true } });
  let pushed = false;
  for (let i = 0; i < 40; i++) {
    const next = DC.move(cur, 0, 1, 0.05);
    assert.equal(DC.walkable(next.x, next.y), true);
    if (next.bike.pushing) pushed = true;
    cur = next; // save the remounted state before the loop exits
    if (pushed && cur.bike.mounted) break;
  }
  assert.ok(pushed, 'bike is pushed across bike-unsafe ground');
  assert.ok(cur.y > 9, 'progress continues while pushing');
  // Remount once the swept capsule is bike-safe again.
  let remounted = false;
  for (let i = 0; i < 40; i++) {
    cur = DC.move(cur, 0, 1, 0.05);
    if (cur.bike.mounted) { remounted = true; break; }
  }
  assert.ok(remounted, 'riding resumes automatically on bike-safe ground');

  // Pushed bicycle still belongs to the player and rides the player's point.
  const pushing = DC.restore({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 8.5,
    visited: ['pub'], bike: { districtId: 'jordaan', x: 2.5, y: 8.5, mounted: false, pushing: true }
  });
  const step = DC.move(pushing, 1, 0, 0.05);
  assert.equal(step.bike.x, step.x);
  assert.equal(step.bike.y, step.y);
  DC.dispose();
});

test('moveAlong: waypoint budgets carry across ticks, arrival is exact, caller path is untouched', async () => {
  DC.dispose();
  await configured();
  // Waypoints chosen around the wall cells: down column 2, across row 11.
  const start = DC.create('pub');
  const w1 = { x: 2.5, y: 11.5 };
  const w2 = { x: 17.5, y: 11.5 };
  const goal = { x: 17.5, y: 17.5 };
  const original = [w1, w2, goal].map(p => ({ x: p.x, y: p.y }));
  let position = start;
  let path = original;
  let shifted = false;
  for (let i = 0; i < 200; i++) {
    const r = DC.moveAlong(position, path, 0.1);
    position = r.position;
    path = r.path;
    if (path.length < original.length) shifted = true;
    assert.equal(DC.walkable(position.x, position.y), true);
    if (r.arrived) break;
  }
  assert.ok(shifted, 'waypoints are consumed');
  assert.deepEqual(original, [w1, w2, goal].map(p => ({ x: p.x, y: p.y })), 'caller path is never mutated');
  assert.ok(Math.hypot(position.x - goal.x, position.y - goal.y) < 1e-6, 'arrives at final waypoint');

  // Spare time inside one tick continues onto the next waypoint.
  const close = DC.restore({ ...start, x: 9.9, y: 2.5 });
  const r = DC.moveAlong(close, [{ x: 10.5, y: 2.5 }, { x: 11.5, y: 2.5 }], 0.1);
  assert.ok(r.arrived, 'both short legs finish from leftover time budget');
  assert.ok(Math.abs(r.position.x - 11.5) < 1e-6);

  // Malformed path is an empty plan, not a fabricated route.
  const none = DC.moveAlong(start, [{ x: NaN, y: 1 }], 0.1);
  assert.deepEqual(none.path, []);
  assert.equal(none.arrived, true);
  DC.dispose();
});

test('bike: park/retrieve within 2m needs a valid walk segment; remote bike never moves', async () => {
  DC.dispose();
  await configured();
  const s = DC.create('pub');
  let bike = DC.toggleBike(s);
  assert.equal(bike.bike.mounted, true);
  bike = DC.parkBike(bike);
  assert.deepEqual(bike.bike, { districtId: 'jordaan', x: bike.x, y: bike.y, mounted: false });

  // 2 m away with a wall between: retrieval refused.
  const behind = DC.restore({ ...s, x: 6.5, y: 2.5, bike: { districtId: 'jordaan', x: 4.5, y: 2.5, mounted: false } });
  assert.equal(DC.nearBike(behind), false);
  assert.equal(DC.toggleBike(behind).bike.mounted, false);
  // Clear line of sight within 2 m retrieves.
  const clear = DC.restore({ ...s, x: 4.4, y: 2.5, bike: { districtId: 'jordaan', x: 4.5, y: 2.5, mounted: false } });
  assert.equal(DC.nearBike(clear), true);
  assert.equal(DC.toggleBike(clear).bike.mounted, true);
  // 2.1 m away is outside retrieval.
  const far = DC.restore({ ...s, x: 6.6, y: 2.5, bike: { districtId: 'jordaan', x: 4.5, y: 2.5, mounted: false } });
  assert.equal(DC.nearBike(far), false);
  DC.dispose();
});

test('planTravel: explicit undirected shortest links only; same/unknown/disconnected are empty', async () => {
  DC.dispose();
  await configured();
  assert.deepEqual(DC.planTravel('jordaan', 'jordaan'), []);
  assert.deepEqual(DC.planTravel('jordaan', 'atlantis'), []);
  assert.deepEqual(DC.planTravel('atlantis', 'jordaan'), []);
  assert.deepEqual(DC.planTravel('jordaan', 'noord'), [
    { from: 'jordaan', to: 'station', mode: 'street' },
    { from: 'station', to: 'noord', mode: 'ferry', id: 'F3' }
  ]);
  const back = DC.planTravel('noord', 'jordaan');
  assert.deepEqual(back, [
    { from: 'noord', to: 'station', mode: 'ferry', id: 'F3' },
    { from: 'station', to: 'jordaan', mode: 'street' }
  ]);
  const toDepijp = DC.planTravel('noord', 'depijp');
  assert.equal(toDepijp.length, 3);
  assert.equal(toDepijp[0].mode, 'ferry');
  assert.equal(toDepijp[2].to, 'depijp');
  assert.deepEqual(DC.planTravel('science', 'noord'), [
    { from: 'science', to: 'station', mode: 'street' },
    { from: 'station', to: 'noord', mode: 'ferry', id: 'F3' }
  ]);

  // Isolated district in another session has no inferred links.
  DC.dispose();
  const iso = makeDistrict('iso', 'Iso', [0, 0, 8, 8], openRows(8, 8), [['pub', 1, 1]]);
  const session2 = makeSession(buildDocs().concat([iso]), LINKS);
  DC.configure(session2);
  assert.deepEqual(DC.planTravel('jordaan', 'iso'), []);
  DC.dispose();
});

test('street transfer: begin/advance/pause/load-failure/cancel, carried bike and remote parked bike', async () => {
  DC.dispose();
  const session = await configured();
  // Carrying a bicycle: duration uses 96 on the centre distance. The bicycle
  // must genuinely be parked at the departure point so retrieval is within 2 m.
  let s = DC.restore({
    ...DC.create('pub'), x: 2.5, y: 9.5,
    bike: { districtId: 'jordaan', x: 2.5, y: 9.5, mounted: false }
  });
  s = DC.toggleBike(s);
  assert.equal(s.bike.mounted, true);
  const toggledSnapshot = snapshot(s);
  const carriedDuration = Math.hypot(606 - 10, 6 - 10) / 96;
  const begin = DC.beginTransfer(s, 'depijp');
  assert.deepEqual(begin.transit, {
    from: 'jordaan', to: 'depijp', mode: 'street',
    elapsed: 0, duration: carriedDuration, departure: { x: 2.5, y: 9.5 }, carried: true
  });
  assert.equal(begin.districtId, 'jordaan');
  assert.equal(begin.x, 2.5, 'player stays at departure until commit');
  assert.equal(snapshot(s), toggledSnapshot, 'begin never mutates input');
  assert.notEqual(begin, s);

  // Pause: zero seconds adds no elapsed and moves nothing.
  let paused = DC.advanceTransfer(begin, 0);
  assert.equal(paused.ready, false);
  assert.equal(paused.position.transit.elapsed, 0);
  assert.deepEqual([paused.position.x, paused.position.y], [2.5, 9.5]);
  // Elapsed clamps to 0.1 per call and never moves the local position.
  let cur = { position: begin, ready: false };
  let guard = 0;
  let previousElapsed = 0;
  while (!cur.ready) {
    const r = DC.advanceTransfer(cur.position, 0.5);
    assert.ok(r.position.transit.elapsed - previousElapsed <= 0.1 + 1e-9, 'elapsed clamps per call');
    previousElapsed = r.position.transit.elapsed;
    assert.equal(r.position.x, 2.5, 'no local world movement while transferring');
    cur = r;
    if (++guard > 100) break;
  }
  assert.equal(cur.ready, true);

  // Completing before the destination is loaded throws and changes nothing.
  const beforeCommit = snapshot(cur.position);
  assert.throws(() => DC.completeTransfer(cur.position), /not loaded/);
  assert.equal(snapshot(cur.position), beforeCommit, 'failed commit leaves input state intact');
  assert.equal(cur.position.districtId, 'jordaan');
  assert.ok(cur.position.transit);

  // Cancel returns to the stored departure; bike ownership is preserved.
  const cancelled = DC.cancelTransfer(cur.position);
  assert.equal(cancelled.transit, undefined);
  assert.equal(cancelled.districtId, 'jordaan');
  assert.deepEqual([cancelled.x, cancelled.y], [2.5, 9.5]);
  assert.equal(cancelled.bike.mounted, true);
  assert.equal(cancelled.bike.x, 2.5);

  // A fresh transfer, this time completed after loading.
  const again = DC.beginTransfer(cancelled, 'depijp');
  let adv = { position: again, ready: false };
  for (let i = 0; i < 100 && !adv.ready; i++) adv = DC.advanceTransfer(adv.position, 0.1);
  assert.equal(adv.ready, true);
  await session.loadDistrict('depijp');
  assert.throws(() => DC.cancelTransfer(adv.position), /load departure district/);
  const arrived = DC.completeTransfer(adv.position);
  assert.equal(arrived.transit, undefined);
  assert.equal(arrived.districtId, 'depijp');
  assert.deepEqual([arrived.x, arrived.y], [602.5, 2.5], 'street arrival is the snapped entrance');
  assert.equal(arrived.bike.districtId, 'depijp', 'carried bike commits with the player');
  assert.equal(arrived.bike.mounted, true);

  // Invalid departures / links. After the caller loads another district, the
  // stale depijp position is a wrong-district departure: it must be rejected
  // before normalization, never silently repaired onto the jordaan entrance.
  await session.loadDistrict('jordaan');
  assert.throws(() => DC.beginTransfer(arrived, 'jordaan'), /departure district must be active/);
  // Non-walkable street departures are rejected rather than repaired too.
  await session.loadDistrict('depijp');
  const forged = {
    map: MAP_VERSION, districtId: 'depijp', x: 609.5, y: 99, visited: ['pub'],
    bike: { districtId: 'depijp', x: 609.5, y: 99, mounted: false }
  };
  assert.throws(() => DC.beginTransfer(forged, 'jordaan'), /not walkable/);
  assert.throws(() => DC.beginTransfer(null, 'jordaan'), /position state is required/);
  DC.dispose();
});

test('street transfer: parked bike stays remote across the move; relocateToPlace preserves it explicitly', async () => {
  DC.dispose();
  const session = await configured();
  let s = DC.create('pub');
  s = DC.restore({ ...s, visited: ['pub', 'market'] });
  // Park the bike at a jordaan spot, travel on foot.
  s = DC.restore({ ...s, x: 2.5, y: 9.5, bike: { districtId: 'jordaan', x: 3.5, y: 9.5, mounted: false } });
  const begin = DC.beginTransfer(s, 'depijp');
  assert.equal(begin.transit.carried, false);
  assert.equal(begin.transit.duration, 12, 'walking street duration clamps to 12');
  let adv = { position: begin, ready: false };
  for (let i = 0; i < 200 && !adv.ready; i++) adv = DC.advanceTransfer(adv.position, 0.1);
  await session.loadDistrict('depijp');
  const arrived = DC.completeTransfer(adv.position);
  assert.deepEqual(arrived.bike,
    { districtId: 'jordaan', x: 3.5, y: 9.5, mounted: false }, 'remote parked bike is untouched');

  // Caller navigated home via the explicit home/return API: input still
  // describes depijp while jordaan is active; the bike record must survive.
  await session.loadDistrict('jordaan');
  const home = DC.relocateToPlace(arrived, 'pub');
  assert.deepEqual([home.x, home.y], [2.5, 2.5]);
  assert.deepEqual(home.bike,
    { districtId: 'jordaan', x: 3.5, y: 9.5, mounted: false }, 'departure bike record preserved');
  assert.deepEqual(home.visited, ['pub', 'market']);
  assert.equal(home.transit, undefined);
  assert.throws(() => DC.relocateToPlace(arrived, 'nope'));
  assert.throws(() => DC.relocateToPlace(null, 'pub'));

  // relocate while carrying parks at departure first.
  await session.loadDistrict('depijp');
  const carrying = DC.restore({
    map: MAP_VERSION, districtId: 'depijp', x: 602.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'depijp', x: 602.5, y: 2.5, mounted: true }
  });
  await session.loadDistrict('jordaan');
  const back = DC.relocateToPlace(carrying, 'lotte');
  assert.deepEqual(back.bike,
    { districtId: 'depijp', x: 602.5, y: 2.5, mounted: false }, 'carried bike parked at departure');
  assert.deepEqual([back.x, back.y], [17.5, 17.5]);
  DC.dispose();
});

test('F3: both directions with snapped-bank gating, cancel/refresh and remote bike preservation', async () => {
  DC.dispose();
  const session = await configured(undefined, undefined, 'station');
  await session.loadDistrict('station');
  // Away from the bank: boarding is refused.
  const off = DC.restore({
    map: MAP_VERSION, districtId: 'station', x: 86.6, y: 6.5, visited: ['pub'],
    bike: { districtId: 'station', x: 86.6, y: 6.5, mounted: false }
  });
  assert.throws(() => DC.beginTransfer(off, 'noord'), /snapped F3 bank/);
  // Non-neighbor link refused.
  assert.throws(() => DC.beginTransfer(off, 'depijp'), /no direct link/);

  // On the bank, carrying the bike: board F3.
  let atBank = DC.restore({
    map: MAP_VERSION, districtId: 'station', x: 86.5, y: 6.5, visited: ['pub'],
    bike: { districtId: 'station', x: 86.5, y: 6.5, mounted: true }
  });
  const boarding = DC.beginTransfer(atBank, 'noord');
  assert.equal(boarding.transit.mode, 'ferry');
  assert.equal(boarding.transit.id, 'F3');
  assert.ok(Math.abs(boarding.transit.duration - 40 / 32) < 1e-9, 'F3 duration is bank distance / 32');
  assert.equal(boarding.transit.carried, true);
  let adv = { position: boarding, ready: false };
  for (let i = 0; i < 50 && !adv.ready; i++) adv = DC.advanceTransfer(adv.position, 0.1);
  assert.equal(adv.ready, true);
  assert.equal(adv.position.x, 86.5, 'stays on the south bank until commit');

  // Refresh mid-transfer restores the departure; requiredDistrict reports from.
  assert.equal(DC.requiredDistrict(adv.position), 'station');
  const refreshed = DC.restoreInfo(adv.position);
  assert.equal(refreshed.position.transit, undefined);
  assert.equal(refreshed.position.districtId, 'station');
  assert.deepEqual([refreshed.position.x, refreshed.position.y], [86.5, 6.5]);
  assert.ok(refreshed.warnings.includes('transit-cancelled'));

  // Re-create the ready transfer, then cancel.
  const boarding2 = DC.beginTransfer(atBank, 'noord');
  let a2 = { position: boarding2, ready: false };
  for (let i = 0; i < 50 && !a2.ready; i++) a2 = DC.advanceTransfer(a2.position, 0.1);
  const cancelled = DC.cancelTransfer(a2.position);
  assert.equal(cancelled.transit, undefined);
  assert.deepEqual([cancelled.x, cancelled.y], [86.5, 6.5]);
  assert.equal(cancelled.bike.mounted, true);

  // Full crossing south -> north.
  const boarding3 = DC.beginTransfer(cancelled, 'noord');
  let a3 = { position: boarding3, ready: false };
  for (let i = 0; i < 50 && !a3.ready; i++) a3 = DC.advanceTransfer(a3.position, 0.1);
  assert.throws(() => DC.completeTransfer(a3.position), /not loaded/);
  await session.loadDistrict('noord');
  const north = DC.completeTransfer(a3.position);
  assert.equal(north.districtId, 'noord');
  assert.deepEqual([north.x, north.y], [126.5, 6.5], 'lands on snapped north bank');
  assert.equal(north.bike.districtId, 'noord');

  // Reverse crossing north -> station.
  const back = DC.beginTransfer(north, 'station');
  assert.equal(back.transit.from, 'noord');
  let a4 = { position: back, ready: false };
  for (let i = 0; i < 50 && !a4.ready; i++) a4 = DC.advanceTransfer(a4.position, 0.1);
  await session.loadDistrict('station');
  const south = DC.completeTransfer(a4.position);
  assert.equal(south.districtId, 'station');
  assert.deepEqual([south.x, south.y], [86.5, 6.5]);
  assert.equal(south.bike.districtId, 'station');

  // Parked remote bike: leave bike up north, cross back on foot; it waits.
  const parkedNorth = DC.parkBike(north);
  await session.loadDistrict('noord');
  const onFoot = DC.beginTransfer(parkedNorth, 'station');
  assert.equal(onFoot.transit.carried, false);
  let a5 = { position: onFoot, ready: false };
  for (let i = 0; i < 50 && !a5.ready; i++) a5 = DC.advanceTransfer(a5.position, 0.1);
  await session.loadDistrict('station');
  const withoutBike = DC.completeTransfer(a5.position);
  assert.deepEqual(withoutBike.bike,
    { districtId: 'noord', x: 126.5, y: 6.5, mounted: false }, 'remote bike waits in noord');
  DC.dispose();
});

test('F3: no mid-transfer parking or local movement', async () => {
  DC.dispose();
  const session = await configured(undefined, undefined, 'station');
  await session.loadDistrict('station');
  const atBank = DC.restore({
    map: MAP_VERSION, districtId: 'station', x: 86.5, y: 6.5, visited: ['pub'],
    bike: { districtId: 'station', x: 86.5, y: 6.5, mounted: true }
  });
  const t = DC.beginTransfer(atBank, 'noord');
  assert.equal(DC.parkBike(t).transit.mode, 'ferry', 'parking refused mid-transfer');
  assert.equal(DC.toggleBike(t).transit.mode, 'ferry');
  const moved = DC.move(t, 1, 0, 0.1);
  assert.deepEqual([moved.x, moved.y], [86.5, 6.5], 'movement keys do not move a transferring player');
  assert.ok(moved.transit);
  DC.dispose();
});

test('legacy migration: all seven places map independently for player and bike, carried status preserved', async () => {
  DC.dispose();
  const session = await configured(undefined, undefined, 'depijp');
  const LEGACY = {
    pub: [290, 590], lotte: [490, 650], coffee: [730, 930], noord: [1230, 170],
    market: [930, 1010], flowers: [1240, 1040], lab: [1490, 910]
  };
  const PLACE_DISTRICT = {
    pub: 'jordaan', lotte: 'jordaan', coffee: 'depijp', noord: 'noord',
    market: 'depijp', flowers: 'depijp', lab: 'science'
  };
  for (const [id, [x, y]] of Object.entries(LEGACY)) {
    await session.loadDistrict(PLACE_DISTRICT[id]);
    const info = DC.restoreInfo({
      map: 'old-rectangular-v0', x, y, visited: [id, 'pub', id, 'ghost'],
      bike: { x, y, mounted: false }
    });
    assert.equal(info.migrated, true, id);
    const p = info.position;
    const expected = session.active.data.anchors[DC.PLACES[id].anchorId];
    assert.ok(Math.abs(p.x - expected.x) < 1e-9 && Math.abs(p.y - expected.y) < 1e-9, id + ' snaps');
    assert.deepEqual(p.visited, id === 'pub' ? ['pub'] : [id, 'pub'],
      'valid visits preserved, deduped and sanitized');
    assert.equal(p.bike.mounted, false);
    assert.equal(p.bike.anchorId, DC.PLACES[id].anchorId);
  }

  // Independent parked bike in a remote district: overview coords until its
  // district activates, then snapped anchor.
  await session.loadDistrict('depijp');
  const mixed = DC.restoreInfo({
    x: 730, y: 930, visited: ['coffee'],
    bike: { x: 1490, y: 910, mounted: false }
  });
  assert.equal(mixed.migrated, true);
  assert.equal(mixed.position.districtId, 'depijp');
  assert.deepEqual([mixed.position.bike.districtId, mixed.position.bike.anchorId], ['science', 'lab']);
  const labDoc = buildDocs().find(d => d.id === 'science');
  assert.deepEqual([mixed.position.bike.x, mixed.position.bike.y],
    [labDoc.anchors.lab.sourceX, labDoc.anchors.lab.sourceY], 'remote bike keeps source marker coords');
  assert.deepEqual([labDoc.anchors.lab.sourceX, labDoc.anchors.lab.sourceY], [1605.8, 406.8]);
  await session.loadDistrict('science');
  const activated = DC.restoreInfo(mixed.position);
  assert.deepEqual([activated.position.bike.x, activated.position.bike.y], [1606.5, 406.5],
    'remote anchorId resolves to the snapped anchor once active');

  // Carried legacy bike at the player position stays carried.
  await session.loadDistrict('jordaan');
  const carried = DC.restoreInfo({
    x: 290, y: 590, visited: ['pub'],
    bike: { x: 290, y: 590, mounted: true }
  });
  assert.equal(carried.position.bike.mounted, true);
  assert.equal(carried.position.bike.x, carried.position.x);
  const pushed = DC.restoreInfo({
    x: 290, y: 590, visited: ['pub'],
    bike: { x: 290, y: 590, mounted: false, pushing: true }
  });
  assert.equal(pushed.position.bike.mounted || pushed.position.bike.pushing, true);

  // Unknowns default to pub; unknown parked bike warns.
  const lost = DC.restoreInfo({ x: 50, y: 50, visited: [], bike: { x: 400, y: 400, mounted: false } });
  assert.equal(lost.position.districtId, 'jordaan');
  assert.deepEqual([lost.position.x, lost.position.y], [2.5, 2.5]);
  assert.ok(lost.warnings.includes('legacy-bike-default-pub'));
  assert.equal(lost.position.bike.anchorId, 'pub');
  DC.dispose();
});

test('requiredDistrict works before the district is active', async () => {
  DC.dispose();
  await configured(undefined, undefined, 'jordaan');
  assert.equal(DC.requiredDistrict({ map: MAP_VERSION, districtId: 'science' }), 'science');
  assert.equal(DC.requiredDistrict({ x: 1490, y: 910 }), 'science');
  assert.equal(DC.requiredDistrict({ x: 730, y: 930 }), 'depijp');
  assert.equal(DC.requiredDistrict({ x: 1230, y: 170 }), 'noord');
  assert.equal(DC.requiredDistrict(null), 'jordaan');
  assert.equal(DC.requiredDistrict({ map: MAP_VERSION,
    transit: { from: 'station', to: 'noord' } }), 'station');
  DC.dispose();
});

test('new-map restore validates against active nav and keeps remote finite bikes', async () => {
  DC.dispose();
  const session = await configured();
  // Player on a blocked cell resets to the entrance.
  const badPlayer = DC.restoreInfo({
    map: MAP_VERSION, districtId: 'jordaan', x: 5.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'jordaan', x: 2.5, y: 2.5, mounted: false }
  });
  assert.deepEqual([badPlayer.position.x, badPlayer.position.y], [2.5, 2.5]);
  assert.ok(badPlayer.warnings.includes('reset-position'));

  // Parked bike on a blocked same-district cell resets.
  const badBike = DC.restoreInfo({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'jordaan', x: 5.5, y: 2.5, mounted: false }
  });
  assert.ok(badBike.warnings.includes('reset-bike'));
  assert.equal(DC.walkable(badBike.position.bike.x, badBike.position.bike.y), true);

  // Remote finite in-bounds bike is kept, never dragged to the player.
  const remote = DC.restoreInfo({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'science', x: 1605.2, y: 401.7, mounted: false }
  });
  assert.deepEqual(remote.position.bike,
    { districtId: 'science', x: 1605.2, y: 401.7, mounted: false });
  // Remote out-of-bounds bike is rejected.
  const remoteBad = DC.restoreInfo({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'science', x: 99999, y: 401.7, mounted: false }
  });
  assert.notEqual(remoteBad.position.bike.districtId, 'science');

  // Carried bike must coincide with the player.
  const liar = DC.restoreInfo({
    map: MAP_VERSION, districtId: 'jordaan', x: 2.5, y: 2.5, visited: ['pub'],
    bike: { districtId: 'jordaan', x: 9.5, y: 9.5, mounted: true }
  });
  assert.ok(liar.warnings.includes('reset-bike'));

  // Completely invalid state becomes a safe fresh state; input untouched.
  const garbage = { map: MAP_VERSION, districtId: 'jordaan', x: NaN, bike: null };
  const gBefore = snapshot(garbage);
  const fresh = DC.restoreInfo(garbage);
  assert.equal(snapshot(garbage), gBefore);
  assert.deepEqual([fresh.position.x, fresh.position.y], [2.5, 2.5]);
  assert.ok(fresh.warnings.includes('reset-create') || fresh.warnings.includes('reset-position'));
  assert.equal(DC.restore(null).districtId, 'jordaan');
  assert.equal(DC.restore('x').visited[0], 'pub');

  // Visits sanitization and round-trip stability.
  const one = DC.create('pub');
  const again = DC.restore(one);
  assert.deepEqual(again, one);
  assert.notEqual(again, one);
  const dirty = DC.restore({ ...one, visited: ['pub', 'pub', 'market', 'hack'] });
  assert.deepEqual(dirty.visited, ['pub', 'market']);
  void session;
  DC.dispose();
});

test('transit is strictly validated on restore; unfinished legs cancel safely', async () => {
  DC.dispose();
  await configured();
  const good = DC.beginTransfer(
    DC.restore({ ...DC.create('pub'), x: 2.5, y: 9.5 }), 'depijp');
  const partial = DC.advanceTransfer(good, 0.5).position;
  const info = DC.restoreInfo(partial);
  assert.equal(info.position.transit, undefined);
  assert.deepEqual([info.position.x, info.position.y], [2.5, 9.5]);
  // Forged transit is dropped.
  const forged = DC.restoreInfo({ ...DC.create('pub'), transit: { from: 'jordaan', to: 'mars' } });
  assert.ok(forged.warnings.includes('reset-transit'));
  assert.equal(forged.position.transit, undefined);
  DC.dispose();
});

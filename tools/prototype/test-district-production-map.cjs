'use strict';
// Production-map gate: real packaged BGT bytes, real runtime validation and
// navigator. Unlike map-fixture/, these tests prove the shipped city geometry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const DR = require('./district-runtime.js');
const DC = require('./district-city.js');

const D29 = 'amsterdam-shape-d29-v1';
const D30 = 'amsterdam-shape-d30-v1';
const INPUT_SHA256 = '3a18d70c3dd6e77e10af71b71ab54ca0fb59b74e8287d2c358933475dcf199f5';
const NEW_LOTTE_FEATURE = 'wegdeel:efcc66b2-c61e-5f1e-a74b-7dca858058fe';

async function openProduction(version) {
  const root = path.resolve(__dirname, 'map-data', version);
  assert.ok(fs.existsSync(path.join(root, 'manifest.json')),
    version + ' must be compiled and packaged from the verified full BGT source');
  const fetch = async url => {
    const relative = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    assert.ok(file.startsWith(root + path.sep), 'resource stays inside its versioned map directory');
    return new Response(fs.readFileSync(file), { status: 200 });
  };
  return DR.open('https://maps.test/manifest.json', { fetch });
}

async function withJordaan(fn) {
  const session = await openProduction(D30);
  try {
    await session.loadDistrict('jordaan');
    DC.configure(session);
    await fn(session);
  } finally {
    DC.dispose();
    session.dispose();
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function follow(position, path) {
  let rest = path;
  for (let i = 0; i < 400 && rest.length; i++) {
    const before = position;
    const previousRest = rest;
    const result = DC.moveAlong(position, rest, 0.1);
    position = result.position;
    rest = result.path;
    assert.equal(DC.walkable(position.x, position.y), true);
    // One update may consume several grid waypoints. Check the actual turned
    // polyline, not a straight chord that can cut across a blocked corner.
    const consumed = previousRest.length - rest.length;
    const traversed = [before, ...previousRest.slice(0, consumed), position];
    let previous = traversed[0];
    for (const point of traversed.slice(1)) {
      if (point.x === previous.x && point.y === previous.y) continue;
      assert.equal(DC.segmentWalkable(previous, point, 'walk'), true,
        JSON.stringify({ previous, point, rest }));
      previous = point;
    }
  }
  assert.equal(rest.length, 0, 'real movement consumes the complete navigator route');
  return position;
}

test('d30 package changes only the Lotte anchor/marker and preserves d29 geography and navigation', async () => {
  const next = await openProduction(D30);
  const previous = await openProduction(D29);
  try {
    assert.equal(next.manifest.mapVersion, D30);
    assert.equal(next.manifest.source.complete, true);
    assert.equal(next.manifest.source.inputSha256, INPUT_SHA256);
    assert.deepEqual(next.manifest.projection, previous.manifest.projection);
    assert.deepEqual(next.manifest.travelLinks, previous.manifest.travelLinks);
    assert.deepEqual(next.overview.bounds, previous.overview.bounds);
    assert.equal(digest(next.overview.shapes), digest(previous.overview.shapes), 'overview shapes are unchanged');
    assert.deepEqual(next.overview.markers.filter(m => m.id !== 'lotte'),
      previous.overview.markers.filter(m => m.id !== 'lotte'));
    assert.deepEqual(next.overview.markers.find(m => m.id === 'lotte'),
      { id: 'lotte', districtId: 'jordaan', x: 1059.5, y: 3256.5 });

    for (const entry of next.manifest.districts) {
      await next.loadDistrict(entry.id);
      await previous.loadDistrict(entry.id);
      const a = next.active.data, b = previous.active.data;
      assert.equal(a.mapVersion, D30, entry.id);
      assert.deepEqual(a.bounds, b.bounds, entry.id + ' bounds');
      assert.deepEqual(a.entrance, b.entrance, entry.id + ' entrance');
      assert.deepEqual(a.nav, b.nav, entry.id + ' walk/bike runs must not change');
      assert.equal(digest(a.shapes), digest(b.shapes), entry.id + ' local shapes are unchanged');
      for (const [id, anchor] of Object.entries(a.anchors)) {
        if (id !== 'lotte') assert.deepEqual(anchor, b.anchors[id], entry.id + '/' + id);
      }
    }
    const lotte = next.active.data.id === 'jordaan'
      ? next.active.data.anchors.lotte
      : (await next.loadDistrict('jordaan')).data.anchors.lotte;
    assert.deepEqual(lotte, {
      x: 1059.5, y: 3256.5, sourceX: 1059.5, sourceY: 3256.5,
      featureId: NEW_LOTTE_FEATURE
    });
  } finally {
    next.dispose();
    previous.dispose();
  }
});

test('d30 Lotte is walkable/rideable and pub routes arrive exactly in both directions', async () => {
  await withJordaan(async session => {
    const { pub, lotte } = session.active.data.anchors;
    assert.equal(lotte.featureId, NEW_LOTTE_FEATURE);
    assert.equal(DC.walkable(lotte.x, lotte.y), true);
    assert.equal(DC.rideable(lotte.x, lotte.y), true);

    for (const [from, to] of [[pub, lotte], [lotte, pub]]) {
      const route = await DC.routeAsync(from, to, { mode: 'walk' });
      assert.ok(route.length > 0, 'required anchors share a real walking route');
      let previous = from;
      for (const point of route) {
        assert.equal(DC.segmentWalkable(previous, point, 'walk'), true);
        previous = point;
      }
      const position = await follow(DC.restore({
        map: D30, districtId: 'jordaan', x: from.x, y: from.y, visited: ['pub'],
        bike: { districtId: 'jordaan', x: from.x, y: from.y, mounted: false }
      }), route);
      assert.ok(Math.hypot(position.x - to.x, position.y - to.y) < 0.01,
        'movement arrives at the exact snapped anchor');
    }
  });
});

test('d30 Lotte supports visible two-second cardinal walks and safe bicycle pushing without collision changes', async () => {
  await withJordaan(async session => {
    const lotte = session.active.data.anchors.lotte;
    const fresh = () => ({
      map: D30, districtId: 'jordaan', x: lotte.x, y: lotte.y, visited: ['pub', 'lotte'],
      bike: { districtId: 'jordaan', x: lotte.x, y: lotte.y, mounted: false }
    });
    for (const [name, dx, dy] of [['east', 1, 0], ['west', -1, 0], ['north', 0, -1], ['south', 0, 1]]) {
      let position = fresh();
      const start = { x: position.x, y: position.y };
      for (let i = 0; i < 20; i++) {
        const before = position;
        position = DC.move(position, dx, dy, 0.1);
        assert.equal(DC.walkable(position.x, position.y), true, name + ' stays on walkable ground');
        assert.equal(DC.segmentWalkable(before, position, 'walk'), true, name + ' never crosses a blocked cell');
      }
      assert.ok(Math.hypot(position.x - start.x, position.y - start.y) >= 3.5,
        name + ' has visible, controllable displacement from the bridgehead');
    }
    let cyclist = DC.toggleBike(fresh());
    assert.equal(cyclist.bike.mounted, true, 'the new ground-road anchor is bike-safe');
    cyclist = DC.move(cyclist, 1, 0, 0.1);
    assert.equal(DC.walkable(cyclist.x, cyclist.y), true);
    assert.equal(cyclist.bike.pushing, true, 'existing narrow-ground automatic pushing is preserved');
    assert.equal(DC.WALK_SPEED, 48);
    assert.equal(DC.BIKE_SPEED, 96);
    assert.equal(DC.ACTOR_RADIUS, 0.4);
  });
});

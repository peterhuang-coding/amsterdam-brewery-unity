'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const City = require('./reopening-city.js');

const origin = City.PLACES.pub;
const destinations = ['lotte', 'coffee', 'noord', 'market', 'flowers', 'lab'];
const waterTarget = Object.freeze({ x: 820, y: 380 });
const MAX_STEPS = 300;
const STEP_SECONDS = 0.25;

function start(bike) {
  const p = City.create();
  return bike ? City.toggleBike(p) : p;
}

function point(v) {
  return { x: v.x, y: v.y };
}

function samePoint(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
}

function interpolatedSamples(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(1, Math.ceil(distance / 5));
  const samples = [];
  for (let i = 0; i <= count; i++) {
    const amount = i / count;
    samples.push({
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount
    });
  }
  return samples;
}

function checkPath(route, expectedFrom = origin, expectedTo = null) {
  const from = point(expectedFrom);
  assert.ok(Array.isArray(route), 'route must be an array');
  assert.ok(route.length > 0, 'route must contain waypoints');

  for (const p of route) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'non-finite route point');
    assert.equal(City.walkable(p.x, p.y), true, JSON.stringify(p));
  }

  route.forEach((end, index) => {
    const begin = index === 0 ? from : route[index - 1];
    const samples = interpolatedSamples(begin, end);
    samples.forEach((sample, sampleIndex) => {
      assert.equal(City.walkable(sample.x, sample.y), true, JSON.stringify({
        index,
        sampleIndex,
        from: begin,
        to: end,
        sample
      }));
    });
  });

  if (expectedTo && City.walkable(expectedTo.x, expectedTo.y)) {
    assert.deepEqual(route[route.length - 1], point(expectedTo),
      JSON.stringify({ expectedTo, end: route[route.length - 1] }));
  }
}

function checkBikeState(pos, context) {
  if (!pos.bike) return;
  assert.deepEqual({ x: pos.bike.x, y: pos.bike.y }, { x: pos.x, y: pos.y },
    JSON.stringify({ ...context, bike: pos.bike, pos }));
  assert.equal(typeof pos.bike.mounted, 'boolean', JSON.stringify({ ...context, bike: pos.bike }));

  if (pos.bike.pushing) {
    assert.equal(pos.bike.mounted, false, JSON.stringify({ ...context, bike: pos.bike }));
    assert.equal(City.rideable(pos.x, pos.y), false,
      JSON.stringify({ ...context, bike: pos.bike, reason: 'pushing bicycle must be on a non-rideable crossing' }));
  }

  if (pos.bike.mounted) {
    assert.equal(pos.bike.pushing, undefined, JSON.stringify({ ...context, bike: pos.bike }));
    assert.equal(City.rideable(pos.x, pos.y), true,
      JSON.stringify({ ...context, bike: pos.bike, reason: 'mounted bicycle must be on rideable ground' }));
  }
}

function traverse(route, useBike) {
  let pos = start(useBike);
  let path = route.map(point);
  let pushed = false;
  let save = null;
  let remainingAtSave = null;
  let savedPoint = null;
  let completedAfterSave = false;

  for (let step = 0; step < MAX_STEPS && path.length; step++) {
    const result = City.moveAlong(pos, path, STEP_SECONDS);
    pos = result.position;
    path = result.path;

    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y),
      JSON.stringify({ useBike, step, pos }));
    assert.equal(City.walkable(pos.x, pos.y), true,
      JSON.stringify({ useBike, step, pos }));
    assert.deepEqual(City.restore(pos), pos,
      JSON.stringify({ useBike, step, pos }));

    if (useBike) {
      checkBikeState(pos, { useBike, step });
      if (pos.bike.pushing) pushed = true;
    }

    if (!save && step === 3 && path.length) {
      const json = JSON.stringify(pos);
      save = City.restore(JSON.parse(json));
      assert.deepEqual(save, pos, 'step-three JSON restore changed state');
      assert.ok(!samePoint(save, origin),
        JSON.stringify({ step, pos: save, origin, reason: 'midpath restore point must have moved from origin' }));
      savedPoint = point(save);
      remainingAtSave = path.map(point);
      pos = save;
    }
  }

  if (save) {
    const continuation = traverseRemaining(save, remainingAtSave, useBike);
    assert.equal(continuation.path.length, 0,
      JSON.stringify({ remainingAtSave, pos: continuation.pos }));
    assert.deepEqual(point(continuation.pos), point(pos),
      JSON.stringify({ savedPoint, continued: continuation.pos, direct: pos }));
    completedAfterSave = true;
    pos = continuation.pos;
  }

  assert.equal(path.length, 0,
    JSON.stringify({ useBike, remaining: path.length, pos }));
  return { pos, path, pushed, restoredMidpath: Boolean(save), completedAfterSave };
}

function traverseRemaining(pos, path, useBike) {
  let current = pos;
  let remaining = path.map(point);

  for (let step = 0; step < MAX_STEPS && remaining.length; step++) {
    const out = City.moveAlong(current, remaining, STEP_SECONDS);
    current = out.position;
    remaining = out.path;

    assert.ok(Number.isFinite(current.x) && Number.isFinite(current.y),
      JSON.stringify({ step, current }));
    assert.equal(City.walkable(current.x, current.y), true, JSON.stringify({ step, pos: current }));
    assert.deepEqual(City.restore(current), current, JSON.stringify({ step, pos: current }));
    if (useBike) checkBikeState(current, { step, phase: 'remaining' });
  }

  return { pos: current, path: remaining };
}

for (const id of destinations) {
  const place = City.PLACES[id];

  test(`route from pub to ${id} has walkable continuous endpoints and segments`, () => {
    const route = City.route(point(origin), point(place));
    checkPath(route, origin, place);
    assert.equal(City.near(route[route.length - 1], 60).id, id);
  });

  test(`on foot reaches ${id} by the public route within bounded steps`, () => {
    const route = City.route(point(origin), point(place));
    checkPath(route, origin, place);
    const result = traverse(route, false);
    assert.equal(result.path.length, 0,
      JSON.stringify({ target: id, remaining: result.path.length, pos: result.pos }));
    assert.ok(samePoint(result.pos, place),
      JSON.stringify({ target: id, pos: result.pos }));
    assert.equal(City.near(result.pos, 60).id, id);
  });

  test(`bicycle reaches ${id}, follows ride/push constraints, and survives JSON restore`, () => {
    const route = City.route(point(origin), point(place));
    checkPath(route, origin, place);
    const result = traverse(route, true);

    assert.equal(result.path.length, 0,
      JSON.stringify({ origin, target: id, remaining: result.path.length, pos: result.pos, bike: result.pos.bike }));
    assert.ok(samePoint(result.pos, place),
      JSON.stringify({ origin, target: id, pos: result.pos, bike: result.pos.bike }));
    assert.equal(City.near(result.pos, 60).id, id);
    assert.equal(result.restoredMidpath, true);
    assert.equal(result.completedAfterSave, true);

    checkBikeState(result.pos, { target: id, phase: 'destination' });

    if (City.rideable(place.x, place.y)) {
      assert.equal(result.pos.bike.mounted, true,
        JSON.stringify({ target: id, bike: result.pos.bike, reason: 'target is rideable' }));
      assert.equal(result.pos.bike.pushing, undefined,
        JSON.stringify({ target: id, bike: result.pos.bike }));
    } else {
      assert.equal(result.pos.bike.mounted, false,
        JSON.stringify({ target: id, bike: result.pos.bike, reason: 'target is not rideable' }));
      assert.equal(result.pos.bike.pushing, true,
        JSON.stringify({ target: id, bike: result.pos.bike, reason: 'bicycle should be pushed onto a constrained destination' }));
    }

    if (id === 'noord') {
      assert.equal(result.pushed, true, 'ferry must be crossed while walking/pushing the bike');
    }
  });
}

test('all named destinations are mutually reachable through finite walkable routes', () => {
  const ids = Object.keys(City.PLACES);
  for (const from of ids) {
    for (const to of ids) {
      if (from === to) continue;
      const source = City.PLACES[from];
      const target = City.PLACES[to];
      const route = City.route(point(source), point(target));

      assert.ok(Array.isArray(route) && route.length > 0, JSON.stringify({ from, to, route }));
      checkPath(route, source, target);
      assert.equal(City.near(route[route.length - 1], 60).id, to,
        JSON.stringify({ from, to, end: route[route.length - 1] }));
    }
  }
});

test('route to open water snaps to the nearest reachable node only when origin is valid', () => {
  assert.equal(City.walkable(waterTarget.x, waterTarget.y), false,
    JSON.stringify({ waterTarget, reason: 'test target must remain open water' }));

  const outbound = City.route(point(origin), waterTarget);
  assert.ok(Array.isArray(outbound) && outbound.length > 0,
    'an open-water destination should resolve to the nearest reachable routing node');
  checkPath(outbound, origin, null);

  const snapped = outbound[outbound.length - 1];
  assert.equal(City.walkable(snapped.x, snapped.y), true, JSON.stringify({ snapped }));
  assert.ok(!samePoint(snapped, waterTarget), JSON.stringify({ snapped, waterTarget }));

  const inbound = City.route(waterTarget, point(origin));
  assert.deepEqual(inbound, [], 'an invalid walkable origin cannot produce a route');
});

test('moveAlong uses a restored midpath position and then completes the remaining route', () => {
  const target = City.PLACES.lab;
  const full = City.route(point(origin), point(target));
  checkPath(full, origin, target);

  let pos = start(true);
  let path = full.map(point);
  for (let step = 0; step < 3 && path.length; step++) {
    const out = City.moveAlong(pos, path, STEP_SECONDS);
    pos = out.position;
    path = out.path;
  }

  assert.ok(path.length > 0, 'three movement steps should leave a genuinely remaining route');
  assert.ok(!samePoint(pos, origin), 'three movement steps should move from the origin');
  assert.ok(!samePoint(pos, target), 'three movement steps should not already be at the target');

  const restored = City.restore(JSON.parse(JSON.stringify(pos)));
  assert.deepEqual(restored, pos);
  checkBikeState(restored, { phase: 'restored midpath' });

  const finish = traverseRemaining(restored, path, true);
  assert.equal(finish.path.length, 0, JSON.stringify({ target, pos: finish.pos }));
  assert.ok(samePoint(finish.pos, target), JSON.stringify({ target, pos: finish.pos }));
  assert.equal(City.near(finish.pos, 60).id, 'lab');
  checkBikeState(finish.pos, { phase: 'lab finish' });
});

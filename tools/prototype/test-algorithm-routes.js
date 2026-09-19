'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./backstage-core.js');
const A = require('./backstage-auto.js');

const SEEDS = [1, 42, 99];
const DAYS = [1, 2, 3];
const KITS = ['hook', 'cart', 'foam'];

const ROUTE_MATRIX = [
  {name: 'market then exit', actions: ['market', 'exit']},
  {name: 'noor then sorting stop then exit', actions: ['noor', 'sorting', 'sorting-stop', 'exit']},
  {name: 'sorting take via each advertised approach then garden valve and exit', actions: ['sorting', 'APPROACH', 'garden', 'GATE', 'garden-valve', 'exit']},
  {name: 'garden harvest then return to sorting reverse and exit', actions: ['garden', 'GATE', 'garden-harvest', 'sorting', 'sorting-reverse', 'exit']}
];

function fresh(seed, day, kit) {
  const r = B.create(seed, day, kit);
  assert.ok(A.enable(r), 'enable auto route');
  return r;
}

function choiceIds(r) {
  return A.view(r).choices.map(choice => choice.id);
}

function hasChoice(r, id) {
  return choiceIds(r).includes(id);
}

function diag(r, extra = {}) {
  return {
    ...extra,
    lastAction: r.auto?.history?.at(-1) ?? null,
    seed: r.seed,
    day: r.day,
    kit: r.kit,
    time: Number(r.time.toFixed(3)),
    status: r.status,
    goal: r.auto?.goal ?? null,
    event: r.auto?.event ?? null,
    approach: r.auto?.approach ?? null,
    position: {x: Math.round(r.p.x), y: Math.round(r.p.y)},
    parcel: r.parcel,
    opened: Boolean(r.opened),
    bag: [...r.bag],
    load: B.load(r),
    belt: r.district?.belt,
    irrigation: r.district?.irrigation,
    repaired: Boolean(r.district?.repaired),
    choices: r.auto?.event ? choiceIds(r) : []
  };
}

function requireChoice(r, id, label) {
  assert.ok(hasChoice(r, id), JSON.stringify(diag(r, {label, id, reason: 'missing choice'})));
}

function advance(r, label, maxSeconds = 28) {
  const deadline = r.time + maxSeconds;
  let iterations = 0;
  const maxIterations = Math.ceil(maxSeconds / 0.05) + 20;

  while (r.status === 'active' && !r.auto.event && r.time < deadline && iterations < maxIterations) {
    A.step(r, 0.05);
    iterations++;
  }

  if (r.status === 'active') {
    assert.ok(r.auto.event, JSON.stringify(diag(r, {label, reason: 'advance timed out without an event'})));
    assert.notEqual(r.auto.event, 'stuck', JSON.stringify(diag(r, {label, reason: 'natural route became stuck'})));
  }
  return r;
}

function choose(r, id, label = id, options = {}) {
  requireChoice(r, id, label);
  assert.ok(A.choose(r, id), JSON.stringify(diag(r, {label, reason: 'choose returned false'})));
  if (!r.auto.event) advance(r, label, options.maxSeconds ?? 28);
  return r;
}

function continueGlimpses(r, label) {
  while (r.status === 'active' && r.auto.event === 'glimpse') {
    assert.ok(A.choose(r, 'continue'), JSON.stringify(diag(r, {label, reason: 'glimpse continue failed'})));
    advance(r, label + ' after glimpse');
  }
}

function chooseWithGlimpse(r, id, label = id, options = {}) {
  choose(r, id, label, options);
  continueGlimpses(r, label);
  return r;
}

function gate(r, label) {
  if (r.status !== 'active' || r.auto.event !== 'gate') return;
  if (hasChoice(r, 'open-hook')) choose(r, 'open-hook', label + ' open-hook');
  else choose(r, 'open-hand', label + ' open-hand');
}

function performMatrixRoute(seed, day, kit, route, restoreAfter) {
  let r = fresh(seed, day, kit);
  const taken = [];

  for (let i = 0; i < route.actions.length; i++) {
    let id = route.actions[i];
    if (id === 'GATE') {
      gate(r, route.name + ' gate');
      continue;
    }
    if (id === 'APPROACH') id = kit === 'cart' ? 'sorting-take' : 'sorting-' + kit;

    requireChoice(r, id, route.name);
    assert.ok(A.choose(r, id), JSON.stringify(diag(r)));

    if (restoreAfter && i === 0) {
      A.step(r, 0.1);
      const restored = B.restore(r);
      assert.ok(restored, JSON.stringify(diag(r, {route: route.name, reason: 'B.restore failed'})));
      r = restored;
      assert.ok(A.valid(r), JSON.stringify(diag(r, {route: route.name, reason: 'A.valid failed after restore'})));
    }

    if (!r.auto.event) advance(r, route.name + ' / ' + id);
    continueGlimpses(r, route.name + ' / ' + id);
    taken.push(id);
  }

  return {r, taken};
}

test('deterministic bounded route matrix: seeds x days x kits x natural routes', () => {
  for (const seed of SEEDS) {
    for (const day of DAYS) {
      for (const kit of KITS) {
        for (const route of ROUTE_MATRIX) {
          for (const restoreAfter of [false, true]) {
            const label = [seed, day, kit, route.name, restoreAfter ? 'restore' : 'no-restore'].join(' / ');
            const {r, taken} = performMatrixRoute(seed, day, kit, route, restoreAfter);

            if (taken.at(-1) === 'exit') {
              assert.equal(r.status, 'extracted', JSON.stringify(diag(r, {label, taken, reason: 'exit route did not extract'})));
            }
            assert.ok(r.time > 0, JSON.stringify(diag(r, {label, taken, reason: 'no simulation time elapsed'})));
          }
        }
      }
    }
  }
});

test('natural routes really collect or operate physical district targets without teleporting', () => {
  for (const seed of SEEDS) {
    for (const day of DAYS) {
      for (const kit of KITS) {
        const approach = kit === 'cart' ? 'take' : kit;
        const r0 = fresh(seed, day, kit);

        chooseWithGlimpse(r0, 'sorting', 'sorting');
        chooseWithGlimpse(r0, 'sorting-' + approach, approach);
        assert.equal(r0.auto.event, 'sorting', JSON.stringify(diag(r0, {approach})));
        assert.ok(r0.bag.includes('item10'), JSON.stringify(diag(r0, {approach})));
        assert.equal(r0.items[10].state, 'bag', JSON.stringify(diag(r0, {approach})));

        const r1 = B.restore(r0);
        assert.ok(r1, JSON.stringify(diag(r0, {reason: 'restore after sorting loot'})));
        assert.ok(A.valid(r1), JSON.stringify(diag(r1, {reason: 'valid after sorting restore'})));

        chooseWithGlimpse(r1, 'garden', 'garden');
        gate(r1, 'greenhouse gate');
        assert.equal(r1.auto.event, 'garden', JSON.stringify(diag(r1)));

        chooseWithGlimpse(r1, 'garden-harvest', 'garden harvest');
        assert.ok(r1.bag.includes('item11'), JSON.stringify(diag(r1)));
        assert.equal(r1.items[11].state, 'bag', JSON.stringify(diag(r1)));

        choose(r1, 'exit', 'exit');
        assert.equal(r1.status, 'extracted', JSON.stringify(diag(r1)));
      }
    }
  }
});

test('mid-travel restore preserves route state and can continue to a completion', () => {
  for (const seed of SEEDS) {
    for (const day of DAYS) {
      const r0 = fresh(seed, day, 'hook');
      assert.ok(A.choose(r0, 'noor'), JSON.stringify(diag(r0, {reason: 'choose noor'})));
      A.step(r0, 0.1);

      const r1 = B.restore(r0);
      assert.ok(r1, JSON.stringify(diag(r0, {reason: 'restore during noor travel'})));
      assert.ok(A.valid(r1), JSON.stringify(diag(r1, {reason: 'valid during noor travel'})));
      advance(r1, 'to noor');
      continueGlimpses(r1, 'to noor');
      assert.equal(r1.auto.event, 'noor', JSON.stringify(diag(r1)));

      chooseWithGlimpse(r1, 'sorting', 'to sorting');
      chooseWithGlimpse(r1, 'sorting-stop', 'stop belt');
      assert.equal(r1.district.belt, 'off', JSON.stringify(diag(r1)));

      const r2 = B.restore(r1);
      assert.ok(r2, JSON.stringify(diag(r1, {reason: 'restore after stop'})));
      assert.ok(A.valid(r2), JSON.stringify(diag(r2, {reason: 'valid after stop'})));

      choose(r2, 'exit', 'exit');
      assert.equal(r2.status, 'extracted', JSON.stringify(diag(r2)));
    }
  }
});

test('SYNTHETIC: avoidable dynamic barrel reroutes and completes', () => {
  for (const seed of SEEDS) {
    for (const day of DAYS) {
      const r = fresh(seed, day, 'hook');
      assert.ok(A.choose(r, 'sorting'), JSON.stringify(diag(r, {reason: 'choose sorting'})));
      A.step(r, 0.1);
      assert.ok(r.auto.goal === 'sorting' && !r.auto.event, JSON.stringify(diag(r)));

      let placed = false;
      for (let i = 0; i < 180 && r.status === 'active' && !r.auto.event; i++) {
        A.step(r, 0.05);
        if (!placed && r.p.x > 700 && r.p.x < 1500 && !B.solid(r,r.p.x+60,r.p.y,22,r.street.barrels[0].id)) {
          r.street.barrels[0].x = r.p.x + 60;
          r.street.barrels[0].y = r.p.y;
          placed = true;
        }
      }

      assert.ok(placed, JSON.stringify(diag(r, {reason: 'barrel obstruction was not placed'})));
      assert.notEqual(r.auto.event, 'stuck', JSON.stringify(diag(r, {reason: 'avoidable barrel caused stuck'})));
      advance(r, 'reroute around barrel to sorting');
      continueGlimpses(r, 'reroute around barrel to sorting');
      assert.equal(r.auto.event, 'sorting', JSON.stringify(diag(r)));
    }
  }
});

test('SYNTHETIC: near-target line-of-sight obstruction keeps loot world, then hook route can complete', () => {
  const r = fresh(42, 1, 'hook');
  chooseWithGlimpse(r, 'sorting', 'sorting');
  assert.equal(r.auto.event, 'sorting');

  r.p.x = 1620;
  r.p.y = 900;
  r.items[10].x = 1680;
  r.items[10].y = 980;
  r.items[10].vx = 0;
  r.items[10].vy = 0;
  r.items[10].state = 'world';
  r.items[10].lock = 0;
  r.patches.length = 0;

  assert.equal(B.clear(r, r.p, r.items[10]), false, JSON.stringify(diag(r, {reason: 'test fixture is not blocking LOS'})));
  requireChoice(r, 'sorting-hook', 'sorting hook with blocked LOS');
  assert.ok(A.choose(r, 'sorting-hook'), JSON.stringify(diag(r)));
  A.step(r, 0.025);

  assert.equal(r.items[10].state, 'world', JSON.stringify(diag(r)));
  assert.ok(!r.bag.includes('item10'), JSON.stringify(diag(r)));
  assert.ok(!r.auto.visited.includes('sorting-hook'), JSON.stringify(diag(r)));

  advance(r, 'hook approach routes around conveyor', 30);
  assert.equal(r.auto.event, 'sorting', JSON.stringify(diag(r)));
  assert.equal(r.items[10].state, 'bag', JSON.stringify(diag(r)));
  assert.ok(r.bag.includes('item10'), JSON.stringify(diag(r)));

  const restored = B.restore(r);
  assert.ok(restored, JSON.stringify(diag(r, {reason: 'restore failed'})));
  assert.ok(A.valid(restored), JSON.stringify(diag(restored, {reason: 'valid failed after restore'})));
});

test('SYNTHETIC: full cargo produces an explicit capacity event and requires an explicit resolution', () => {
  for (const kit of KITS) {
    for (const day of DAYS) {
      const r = fresh(42, day, kit);
      const capacity = B.KITS[kit].capacity;
      for (const item of r.items) {
        if (item.kind !== 'parcel' && B.load(r) + B.TYPES[item.kind].weight <= capacity) {
          item.state = 'bag'; r.bag.push(item.id);
        }
      }
      assert.equal(B.load(r), capacity, JSON.stringify(diag(r, {capacity})));
      // Synthetic paused club choice isolates capacity from encounters on the road.
      r.auto.event = 'club';
      assert.equal(r.auto.event, 'club', JSON.stringify(diag(r)));
      requireChoice(r, 'take-foam', 'take parcel with full cargo');
      assert.ok(A.choose(r, 'take-foam'), JSON.stringify(diag(r)));

      assert.equal(r.auto.event, 'capacity', JSON.stringify(diag(r, {capacity})));
      assert.equal(r.parcel, 'ground', JSON.stringify(diag(r)));
      assert.ok(!r.bag.includes('item6'), JSON.stringify(diag(r)));
      assert.notEqual(r.auto.event, 'stuck', JSON.stringify(diag(r)));

      const ids = choiceIds(r);
      assert.ok(ids.includes('leave-box') || ids.some(id => id.startsWith('drop-')), JSON.stringify(diag(r)));

      choose(r, 'leave-box', 'leave box');
      assert.equal(r.auto.event, 'route', JSON.stringify(diag(r)));
    }
  }
});

test('SYNTHETIC: unavailable target after midtravel state change returns to a retryable location event', () => {
  const r = fresh(42, 1, 'hook');
  r.opened = true;
  if (!r.discovered.includes('greenhouse')) r.discovered.push('greenhouse');

  r.p.x = 1800;
  r.p.y = 495;
  r.items[3].state = 'bag';
  r.bag = ['item3'];
  r.auto.event = 'garden';
  r.auto.goal = null;

  assert.ok(A.choose(r, 'garden-repair'), JSON.stringify(diag(r)));
  assert.ok(B.command(r, 'drop', {x: 2000, y: 495, itemId: 'item3'}), JSON.stringify(diag(r)));
  const sequence = r.sequence;
  const message = r.message;

  advance(r, 'repair with spare removed');
  assert.equal(r.auto.event, 'garden', JSON.stringify(diag(r)));
  assert.equal(r.district.repaired, false, JSON.stringify(diag(r)));
  assert.ok(!r.auto.visited.includes('garden-repair'), JSON.stringify(diag(r)));
  assert.ok(r.sequence > sequence, JSON.stringify(diag(r)));
  assert.notEqual(r.message, message, JSON.stringify(diag(r)));

  const restored = B.restore(r);
  assert.ok(restored, JSON.stringify(diag(r, {reason: 'restore failed'})));
  assert.ok(A.valid(restored), JSON.stringify(diag(restored, {reason: 'valid failed after restore'})));
});

test('explicit recoverable events are distinguished from navigation stuck', () => {
  const recoverable = new Set([
    'route', 'market', 'club', 'parcel', 'noor', 'gate', 'garden', 'sorting', 'capacity', 'glimpse'
  ]);

  for (const seed of SEEDS) {
    for (const day of DAYS) {
      const r = fresh(seed, day, 'foam');
      chooseWithGlimpse(r, 'market', 'market');
      assert.ok(recoverable.has(r.auto.event), JSON.stringify(diag(r)));
      assert.notEqual(r.auto.event, 'stuck', JSON.stringify(diag(r)));

      choose(r, 'exit', 'exit from market event');
      assert.equal(r.status, 'extracted', JSON.stringify(diag(r)));
    }
  }
});
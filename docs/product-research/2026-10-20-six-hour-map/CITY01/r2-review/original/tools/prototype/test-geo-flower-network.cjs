'use strict';

// CITY01 / f02-real-city-d27 FlowerNetwork acceptance.
//
// Only the ENTRY/CART coordinates moved to shared reviewed GeoWorld anchors;
// every economic/story rule (Ada introduction, visits, provenance, validity)
// is unchanged and is tested directly here without depending on sibling game
// modules owned by other packages.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const Flower = require('./flower-network.js');
const GeoWorld = require('./geo-world.js');
const City = require('./reopening-city.js');

function state(day, garden, discovered) {
  return {
    phase: 'prep',
    day,
    garden: garden || Flower.fresh(),
    backstage: { discovered: discovered || [] }
  };
}

test('ENTRY and CART are the reviewed shared anchors and frozen', () => {
  assert.equal(Flower.ENTRY.id, 'garden');
  assert.equal(Flower.ENTRY.x, GeoWorld.ENTRY.x);
  assert.equal(Flower.ENTRY.y, GeoWorld.ENTRY.y);
  assert.equal(Flower.ENTRY.x, GeoWorld.ANCHORS.garden.x);
  assert.equal(Flower.CART.x, GeoWorld.CART.x);
  assert.equal(Flower.CART.y, GeoWorld.CART.y);
  assert.equal(Flower.CART.x, GeoWorld.ANCHORS.flowerCart.x);
  // Coordinate import is the only difference from the legacy module.
  assert.equal(City.ANCHORS.garden.x, Flower.ENTRY.x);
  assert.ok(Math.hypot(Flower.CART.x - Flower.ENTRY.x, Flower.CART.y - Flower.ENTRY.y) > 1);
  assert.throws(() => { Flower.ENTRY.x = 0; });
  assert.throws(() => { Flower.CART.x = 0; });
  assert.throws(() => { Flower.fresh = null; });
});

test('fresh network starts unknown; night discovery seeds provenance', () => {
  assert.deepEqual(Flower.fresh(), { known: false, source: null, introduced: false, visits: [] });
  const seeded = Flower.fresh(['greenhouse']);
  assert.deepEqual(seeded, { known: true, source: 'night', introduced: false, visits: [] });
  // Every fresh state owns its own arrays.
  const a = Flower.fresh();
  const b = Flower.fresh();
  assert.notEqual(a.visits, b.visits);
});

test('Ada route is free: introduction is granted but never counts as a visit', () => {
  const s = state(1);
  const r1 = Flower.ask(s);
  assert.equal(r1.ok, true);
  assert.equal(s.garden.known, true);
  assert.equal(s.garden.source, 'ada');
  assert.equal(s.garden.introduced, true);
  assert.deepEqual(s.garden.visits, []);
  // The unchanged offer wording: €2 material fee waived, still 8 seconds.
  assert.match(r1.message, /€2/);
  assert.match(r1.message, /8 秒/);
  // Asking again remains free and never records a visit.
  const r2 = Flower.ask(s);
  assert.equal(r2.ok, true);
  assert.deepEqual(s.garden.visits, []);
  assert.equal(s.backstage.discovered.includes('greenhouse'), false);
  assert.match(Flower.notes(s)[0], /Ada/);
  // Ada only leaves the introduction during prep.
  const evening = state(1);
  evening.phase = 'open';
  const denied = Flower.ask(evening);
  assert.equal(denied.ok, false);
  assert.equal(evening.garden.known, false);
  // First provenance wins: an Ada introduction is never overwritten.
  Flower.visit(s, 'cart');
  assert.equal(s.garden.source, 'ada');
});

test('visits record each day at most once and physical discovery accrues', () => {
  const s = state(1);
  Flower.visit(s, 'self');
  assert.equal(s.garden.known, true);
  assert.equal(s.garden.source, 'self');
  assert.deepEqual(s.garden.visits, [1]);
  assert.deepEqual(s.backstage.discovered, ['greenhouse']);
  Flower.visit(s, 'self');
  assert.deepEqual(s.garden.visits, [1]);
  s.day = 2;
  Flower.visit(s, 'cart');
  assert.deepEqual(s.garden.visits, [1, 2]);
  assert.equal(s.garden.source, 'self'); // first physical provenance is retained
  assert.deepEqual(Flower.context(s), { known: true, introduced: false, pump: false });
});

test('notes explain provenance, actual visits, and the repaired pump', () => {
  const unknown = state(1);
  assert.deepEqual(Flower.notes(unknown), []);
  const s = state(1);
  Flower.visit(s, 'self');
  s.day = 2;
  Flower.visit(s, 'cart');
  s.day = 3;
  const lines = Flower.notes(s);
  assert.match(lines[0], /侧门/);
  assert.ok(lines.some(l => /第 1、2 天/.test(l)));
  // Pump discovery surfaces the unchanged no-slowdown note.
  const pumped = state(3, s.garden, ['greenhouse', 'greenhouse-pump']);
  assert.deepEqual(Flower.context(pumped).pump, true);
  assert.ok(Flower.notes(pumped).some(l => /不再减速/.test(l)));
});

test('valid accepts canonical states and rejects every invented/contradictory one', () => {
  const good = state(1);
  Flower.ask(good);
  assert.equal(Flower.valid(good), true);
  const visited = state(2);
  Flower.visit(visited, 'self');
  visited.day = 2;
  assert.equal(Flower.valid(visited), true);

  // Exactly the contradictions guarded by the unchanged validator.
  const patches = [
    { known: true },                                   // known without a source
    { introduced: true },                             // introduction without knowledge
    { visits: [1] },                                  // visit without discovery/knowledge
    { source: 'unknown' },                            // invented provenance
    { visits: [2] },                                  // visit in the future (day = 1)
    { extra: true },                                  // invented field
    { known: false, source: 'ada' },                  // source without knowledge
    { visits: [1, 1] }                                // visits must strictly ascend
  ];
  for (const patch of patches) {
    const s = state(1);
    Object.assign(s.garden, patch);
    assert.equal(Flower.valid(s), false, JSON.stringify(patch));
  }
  // Visit without the night/physical backstage discovery is inconsistent.
  const noDiscovery = state(1, {
    known: true, source: 'self', introduced: false, visits: [1]
  }, []);
  assert.equal(Flower.valid(noDiscovery), false);
});

test('night-seeded networks validate and remain economic no-ops until visited', () => {
  const seeded = state(1, Flower.fresh(['greenhouse']), ['greenhouse']);
  assert.equal(Flower.valid(seeded), true);
  assert.deepEqual(seeded.garden.visits, []);
  assert.match(Flower.notes(seeded)[0], /夜探/);
});

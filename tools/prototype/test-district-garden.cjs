'use strict';
// CITY02 garden coordinate boundary tests.
// FlowerNetwork runs in legacy 1800x1120 mode for standalone economy play and
// switches ONLY to a snapped district entry after configureMap(). Every test
// resets the global map configuration so suites never leak state.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const F = require('./flower-network.js');

const MAP = 'amsterdam-shape-d29-v1';
// Accepted DistrictRuntime snapped anchors for the real depijp district.
const ENTRY = { x: 1810.5, y: 5802.5 };
const CART = { x: 1797.5, y: 5870.5 };
const LEGACY_ENTRY = { x: 1510, y: 690 };

const prep = () => R.act(R.createGame(7), { type: 'start' }).state;
function visit(state, position, source) {
  const before = structuredClone(state);
  const out = R.act(state, { type: 'gardenVisit', position, source });
  return { out, before };
}

test('garden boundary: reopening-core shares the one FlowerNetwork module', () => {
  F.resetMap();
  assert.equal(R.garden, F);
  assert.equal(F.isMapConfigured(), false);
});

test('garden boundary: unconfigured legacy mode accepts the 1800x1120 entry through the real economy action', () => {
  F.resetMap();
  assert.equal(F.isMapConfigured(), false);
  assert.equal(F.isAtEntry({ x: 1510, y: 690 }), true);
  assert.equal(F.isAtEntry({ x: 1560, y: 690 }), true, '60-unit legacy radius');
  assert.equal(F.isAtEntry({ x: 1571, y: 690 }), false);
  assert.equal(F.isAtEntry({ x: -1, y: 690 }), false);
  assert.equal(F.isAtEntry({ x: 900, y: 1200 }), false);
  assert.equal(F.isAtEntry(null), false);
  assert.deepEqual({ x: F.ENTRY.x, y: F.ENTRY.y, id: F.ENTRY.id },
    { x: 1510, y: 690, id: 'garden' });
  assert.deepEqual({ x: F.CART.x, y: F.CART.y, id: F.CART.id },
    { x: 1310, y: 1040, id: 'flowerCart' });

  // Real core action: accepted, grants the visit record but no economy gain.
  const s = prep();
  const { out, before } = visit(s, LEGACY_ENTRY);
  assert.equal(out.ok, true, out.message);
  assert.equal(out.state.cash, 45);
  assert.equal(out.state.actions, 2);
  assert.deepEqual(out.state.batches, before.batches);
  assert.deepEqual(out.state.garden.visits, [1]);
  assert.equal(out.state.garden.source, 'self');
  assert.ok(out.state.backstage.discovered.includes('greenhouse'));
  // Repeat visit grants nothing extra.
  const again = R.act(out.state, { type: 'gardenVisit', position: LEGACY_ENTRY });
  assert.equal(again.ok, true);
  assert.deepEqual(again.state.garden.visits, [1]);
  assert.equal(again.state.cash, 45);
  // Distant / malformed visits are rejected without mutation.
  for (const position of [null, { x: 0, y: 0 }, { x: Infinity, y: 690 }, { x: 1510 }]) {
    const rejected = R.act(prep(), { type: 'gardenVisit', position });
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.state.garden.visits, []);
  }
  F.resetMap();
});

test('garden boundary: configured mode requires matching map+district and a 4 m arrival', () => {
  F.resetMap();
  F.configureMap({ mapVersion: MAP, districtId: 'depijp', entry: ENTRY, cart: CART });
  assert.equal(F.isMapConfigured(), true);

  const at = { map: MAP, districtId: 'depijp', x: ENTRY.x, y: ENTRY.y };
  assert.equal(F.isAtEntry(at), true);
  assert.equal(F.isAtEntry({ ...at, x: ENTRY.x + 4, y: ENTRY.y }), true, '4 m is the inclusive edge');
  assert.equal(F.isAtEntry({ ...at, x: ENTRY.x + 4.1, y: ENTRY.y }), false);
  assert.equal(F.isAtEntry({ ...at, x: ENTRY.x + 3, y: ENTRY.y - 2.7 }), false);

  // The legacy invented coordinates can never satisfy the district boundary.
  assert.equal(F.isAtEntry(LEGACY_ENTRY), false, 'legacy coords have no map claim');
  assert.equal(F.isAtEntry({ ...at, map: 'old-rectangular-v0' }), false, 'wrong map');
  assert.equal(F.isAtEntry({ ...at, districtId: 'jordaan' }), false, 'wrong district');
  assert.equal(F.isAtEntry({ map: MAP, districtId: 'depijp', x: NaN, y: ENTRY.y }), false);
  assert.equal(F.isAtEntry({ x: ENTRY.x, y: ENTRY.y }), false, 'missing map/district claims');
  assert.equal(F.isAtEntry(null), false);

  // Getters expose snapped points while retaining venue metadata.
  assert.equal(F.ENTRY.x, ENTRY.x);
  assert.equal(F.ENTRY.y, ENTRY.y);
  assert.equal(F.ENTRY.id, 'garden');
  assert.match(F.ENTRY.name, /温室/);
  assert.equal(F.ENTRY.map, MAP);
  assert.equal(F.CART.x, CART.x);
  assert.equal(F.CART.districtId, undefined);
  assert.equal(F.CART.map, MAP);
  F.resetMap();
});

test('garden boundary: real gardenVisit action enforces the configured snapped entry and stays byte-identical economically', () => {
  F.resetMap();
  F.configureMap({ mapVersion: MAP, districtId: 'depijp', entry: ENTRY, cart: CART });

  const s = prep();
  // Old coordinates are now rejected by the real action.
  const oldTry = R.act(s, { type: 'gardenVisit', position: LEGACY_ENTRY });
  assert.equal(oldTry.ok, false);
  assert.equal(s.garden.known, false, 'rejected action does not mutate');
  assert.equal(s.cash, 45);

  // Walking up to the snapped side door (source: cart route).
  const onFoot = { map: MAP, districtId: 'depijp', x: ENTRY.x - 1.2, y: ENTRY.y + 0.4 };
  const out1 = R.act(s, { type: 'gardenVisit', position: onFoot });
  assert.equal(out1.ok, true, out1.message);
  assert.equal(out1.state.cash, 45);
  assert.equal(out1.state.actions, 2);
  assert.deepEqual(out1.state.garden.visits, [1]);
  assert.equal(out1.state.garden.source, 'self');

  const s2 = prep();
  const byCart = { map: MAP, districtId: 'depijp', x: ENTRY.x, y: ENTRY.y };
  const out2 = R.act(s2, { type: 'gardenVisit', position: byCart, source: 'cart' });
  assert.equal(out2.ok, true, out2.message);
  assert.equal(out2.state.garden.source, 'cart');
  assert.equal(out2.state.cash, 45);
  assert.equal(out2.state.actions, 2);
  // Duplicate visit adds no record, no resources.
  const out3 = R.act(out2.state, { type: 'gardenVisit', position: byCart, source: 'cart' });
  assert.equal(out3.ok, true);
  assert.deepEqual(out3.state.garden.visits, [1]);

  // Wrong map / district / distant snapped claims all fail through the action.
  for (const position of [
    { map: 'other-map', districtId: 'depijp', x: ENTRY.x, y: ENTRY.y },
    { map: MAP, districtId: 'noord', x: ENTRY.x, y: ENTRY.y },
    { map: MAP, districtId: 'depijp', x: ENTRY.x + 50, y: ENTRY.y }
  ]) {
    const rejected = R.act(prep(), { type: 'gardenVisit', position });
    assert.equal(rejected.ok, false, JSON.stringify(position));
    assert.deepEqual(rejected.state.garden.visits, []);
  }

  // Other source kinds are still rejected.
  const badSource = R.act(prep(),
    { type: 'gardenVisit', position: byCart, source: 'ferry' });
  assert.equal(badSource.ok, false);

  // Outside prep phase the action is rejected regardless of position.
  const opened = R.act(prep(), { type: 'open' });
  const atNight = R.act(opened.state, { type: 'gardenVisit', position: byCart });
  assert.equal(atNight.ok, false);
  F.resetMap();
});

test('garden boundary: configureMap is atomic and resetMap restores legacy mode', () => {
  F.resetMap();
  // Invalid configuration before any setup leaves legacy mode intact.
  for (const bad of [null, {}, { mapVersion: '', districtId: 'depijp', entry: ENTRY, cart: CART },
    { mapVersion: MAP, districtId: '', entry: ENTRY, cart: CART },
    { mapVersion: MAP, districtId: 'depijp', entry: { x: 0 }, cart: CART },
    { mapVersion: MAP, districtId: 'depijp', entry: ENTRY, cart: { x: 1, y: NaN } }]) {
    assert.throws(() => F.configureMap(bad));
  }
  assert.equal(F.isMapConfigured(), false);
  assert.equal(F.isAtEntry(LEGACY_ENTRY), true);

  // A valid config takes effect; a later invalid config cannot partially replace it.
  F.configureMap({ mapVersion: MAP, districtId: 'depijp', entry: ENTRY, cart: CART });
  assert.throws(() => F.configureMap({ mapVersion: 'NEW', districtId: 42, entry: ENTRY, cart: CART }));
  assert.equal(F.isMapConfigured(), true);
  assert.equal(F.isAtEntry({ map: MAP, districtId: 'depijp', x: ENTRY.x, y: ENTRY.y }), true);
  assert.equal(F.ENTRY.x, ENTRY.x, 'previous valid config survived the rejected call');

  F.resetMap();
  assert.equal(F.isMapConfigured(), false);
  assert.equal(F.isAtEntry(LEGACY_ENTRY), true, 'legacy mode returns after reset');
  assert.equal(F.ENTRY.x, 1510);
  assert.equal(F.CART.x, 1310);
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const corePath = path.join(__dirname, 'reopening-core.js');
assert.ok(fs.existsSync(corePath), 'The reopening rules module must exist');
const R = require(corePath);
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('✓ ' + name); }
function doAct(state, action) {
  const before = JSON.stringify(state);
  const result = R.act(state, action);
  assert.equal(JSON.stringify(state), before, 'act must not mutate its input');
  assert.equal(result.ok, true, result.message + ': ' + JSON.stringify(action));
  assert.ok(R.restore(result.state), 'Every reachable state must be restorable');
  return result.state;
}
function reject(state, action) {
  const before = JSON.stringify(state);
  const result = R.act(state, action);
  assert.equal(result.ok, false, 'Action must be rejected: ' + JSON.stringify(action));
  assert.equal(result.state, state, 'Rejected action returns the unchanged original');
  assert.equal(JSON.stringify(state), before);
  assert.equal(typeof result.message, 'string');
}
function prep(seed = 42) { return doAct(R.createGame(seed), { type: 'start' }); }
function brew(state, beer, scores = [1, 1, 1]) {
  state = doAct(state, { type: 'prepare', kind: 'brew', beer });
  for (const score of scores) state = doAct(state, { type: 'brewHit', score });
  return state;
}
function forage(seed = 42) { return doAct(prep(seed), { type: 'prepare', kind: 'surf' }); }
function drift(state, seconds) {
  while (seconds > 1e-7 && state.phase === 'forage') {
    const step = Math.min(1, seconds);
    state = doAct(state, { type: 'forageTick', seconds: step });
    seconds -= step;
  }
  return state;
}
function catchItem(state, item) {
  const until = item.arrival + 3.5 - state.forage.elapsed;
  assert.ok(until >= 0, 'Requested item has not passed its catch window');
  state = drift(state, until);
  while (state.forage.lane !== item.lane)
    state = doAct(state, { type: 'forageMove', direction: Math.sign(item.lane - state.forage.lane) });
  return doAct(state, { type: 'forageCatch' });
}
function resolveEvent(state) {
  if (state.phase === 'night' && state.night.event && state.night.event.status === 'pending')
    return doAct(state, { type: 'event', choice: state.night.event.id === 'inspector' ? 'tasting' : 'refuse' });
  return state;
}
function advance(state, seconds) {
  while (seconds > 1e-7 && state.phase === 'night') {
    state = resolveEvent(state);
    const step = Math.min(1, seconds);
    state = doAct(state, { type: 'tick', seconds: step });
    seconds -= step;
  }
  return resolveEvent(state);
}
function servePerfect(state, order, options = {}) {
  state = doAct(state, { type: 'pour', customerId: order.id, beer: options.beer || order.beer,
    price: options.price || R.BEERS[order.beer].price });
  const pour = state.night.pours.find(p => p.customerId === order.id);
  state = advance(state, pour.duration * 0.72);
  return doAct(state, { type: 'serve', customerId: order.id });
}
function playNight(state, choose = () => 'serve') {
  if (state.phase === 'prep') state = doAct(state, { type: 'open' });
  let guard = 0;
  while (state.phase === 'night' && guard++ < 1000) {
    state = resolveEvent(state);
    const customer = R.customers(state)[0];
    if (!customer) state = advance(state, 1);
    else if (choose(customer) === 'water' || R.stock(state, customer.beer) === 0)
      state = doAct(state, { type: 'water', customerId: customer.id });
    else state = servePerfect(state, customer);
  }
  assert.equal(state.phase, 'summary');
  return state;
}

test('CommonJS and browser expose the same public contract', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(corePath, 'utf8'), context);
  assert.deepEqual(Object.keys(context.Reopening).sort(), Object.keys(R).sort());
  for (const key of ['createGame', 'act', 'stock', 'customers', 'pourProgress', 'restore'])
    assert.equal(typeof R[key], 'function');
  assert.deepEqual(Object.keys(R.BEERS).sort(), ['blond', 'stout']);
  assert.deepEqual(Object.keys(R.UPGRADES).sort(), ['cellar', 'doubleTap', 'stage']);
  assert.deepEqual(Object.keys(R.PEOPLE).sort(), ['bram', 'lotte', 'marta']);
});

test('new game starts with bounded resources and deterministic fresh state', () => {
  const state = R.createGame(123);
  assert.equal(state.version, 1);
  assert.equal(state.phase, 'welcome');
  assert.equal(state.cash, 45);
  assert.equal(state.actions, 2);
  assert.equal(R.stock(state, 'blond'), 6);
  assert.equal(R.stock(state, 'stout'), 2);
  assert.deepEqual(state, R.createGame(123));
  assert.notEqual(state.batches, R.createGame(123).batches);
  assert.ok(R.restore(state));
  assert.ok(R.restore(R.createGame(NaN)));
  assert.ok(R.restore(R.createGame('canal')));
});

test('phase gates and invalid inputs cannot change resources or time', () => {
  const welcome = R.createGame(4);
  for (const action of [{ type: 'open' }, { type: 'tick', seconds: 1 }, { type: 'finish' }, null, {},
    { type: 'prepare', kind: 'coffee' }, { type: 'constructor' }]) reject(welcome, action);
  const state = prep();
  for (const action of [{ type: 'start' }, { type: 'prepare', kind: 'unknown' },
    { type: 'prepare', kind: 'brew', beer: '__proto__' }, { type: 'prepare', kind: 'brew', beer: 'water' },
    { type: 'brewHit', score: 1 }, { type: 'upgrade', id: 'cellar' }]) reject(state, action);
});

test('preparation is finite and each non-brewing activity is once per day', () => {
  let state = doAct(prep(), { type: 'prepare', kind: 'coffee' });
  assert.equal(state.cash, 63);
  assert.equal(state.actions, 1);
  assert.ok(state.friends.bram > 0);
  reject(state, { type: 'prepare', kind: 'coffee' });
  state = doAct(state, { type: 'prepare', kind: 'visit' });
  assert.equal(state.actions, 0);
  assert.equal(state.promises.lotte, true);
  for (const kind of ['brew', 'coffee', 'surf', 'visit']) reject(state, { type: 'prepare', kind, beer: 'blond' });
  state = doAct(state, { type: 'open' });
  assert.equal(state.actions, 0);
});

test('brewing pays once, requires three valid hits, and retains batch quality', () => {
  let state = doAct(prep(), { type: 'prepare', kind: 'brew', beer: 'stout' });
  assert.equal(state.cash, 33);
  assert.equal(state.actions, 1);
  assert.equal(R.stock(state, 'stout'), 2);
  for (const score of [-1, 2, NaN, Infinity, '1', undefined]) reject(state, { type: 'brewHit', score });
  state = doAct(state, { type: 'brewHit', score: 1 });
  state = doAct(state, { type: 'brewHit', score: 1 });
  assert.equal(state.phase, 'brew');
  state = doAct(state, { type: 'brewHit', score: 1 });
  assert.equal(state.phase, 'prep');
  assert.equal(R.stock(state, 'stout'), 8);
  assert.equal(state.batches.at(-1).quality, 3);
  assert.equal(state.batches[1].quality, 1);
  state = brew(state, 'blond', [0, 0, 0]);
  assert.equal(state.batches.at(-1).quality, 1);
  reject(state, { type: 'prepare', kind: 'brew', beer: 'blond' });
});

test('salvaged hops improve the next completed batch and cancellation forfeits its cost', () => {
  let state = forage();
  assert.equal(state.phase, 'forage');
  state = catchItem(state, state.forage.items.find(item => item.kind === 'hops'));
  state = doAct(state, { type: 'dock' });
  assert.equal(state.hops, 1);
  state = brew(state, 'blond', [0, 0, 0]);
  assert.equal(state.batches.at(-1).quality, 2);
  assert.equal(state.hops, 0);
  let canceled = doAct(prep(), { type: 'prepare', kind: 'brew', beer: 'stout' });
  canceled = doAct(canceled, { type: 'cancelBrew' });
  assert.equal(canceled.cash, 33);
  assert.equal(canceled.actions, 1);
  assert.equal(R.stock(canceled, 'stout'), 2);
  const poor = { ...prep(), cash: 11 };
  reject(poor, { type: 'prepare', kind: 'brew', beer: 'blond' });
});

test('surf spends one finite daily action and creates a deterministic three-lane salvage route', () => {
  const a = forage(88);
  const b = forage(88);
  const c = forage(89);
  assert.equal(a.phase, 'forage');
  assert.equal(a.actions, 1);
  assert.equal(a.cash, 45);
  assert.equal(a.hops, 0);
  assert.equal(a.forage.lane, 1);
  assert.equal(a.forage.duration, 30);
  assert.equal(a.forage.items.length, 10);
  assert.deepEqual(a.forage, b.forage);
  assert.notDeepEqual(a.forage.items, c.forage.items);
  assert.deepEqual(a.forage.items.map(item => item.arrival), [0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);
  for (const action of [{ type: 'open' }, { type: 'prepare', kind: 'surf' }, { type: 'tick', seconds: 1 },
    { type: 'forageMove', direction: 0 }, { type: 'forageMove', direction: 2 },
    { type: 'forageTick', seconds: -1 }, { type: 'forageTick', seconds: NaN },
    { type: 'forageTick', seconds: 1.1 }, { type: 'forageCatch' }]) reject(a, action);
  let docked = doAct(a, { type: 'dock' });
  assert.equal(docked.phase, 'prep');
  assert.equal(docked.forage, null);
  assert.equal(docked.actions, 1);
  assert.equal(docked.hops, 0);
  reject(docked, { type: 'prepare', kind: 'surf' });
  reject(docked, { type: 'dock' });
  reject(docked, { type: 'forageMove', direction: 1 });
});

test('boat movement clamps to canal lanes and hooks only catch once inside the floating window', () => {
  let state = forage(8);
  state = doAct(state, { type: 'forageMove', direction: -1 });
  state = doAct(state, { type: 'forageMove', direction: -1 });
  assert.equal(state.forage.lane, 0);
  for (let i = 0; i < 3; i++) state = doAct(state, { type: 'forageMove', direction: 1 });
  assert.equal(state.forage.lane, 2);
  const item = state.forage.items[0];
  assert.equal(R.forageProgress(state, item), 0);
  state = drift(state, 2);
  assert.equal(R.forageProgress(state, item), 0.4);
  reject(state, { type: 'forageCatch' });
  state = catchItem(state, item);
  assert.equal(state.forage.items[0].status, 'caught');
  assert.equal(state.hops, 1);
  assert.equal(state.forage.haul, 1);
  reject(state, { type: 'forageCatch' });
  assert.equal(state.actions, 1);
});

test('salvage bottles become actual two-cup quality-one batches and junk costs at most €2', () => {
  let state = forage(5);
  const bottle = state.forage.items.find(item => item.kind === 'bottle');
  state = catchItem(state, bottle);
  const batch = state.batches.at(-1);
  assert.equal(batch.cups, 2);
  assert.equal(batch.quality, 1);
  assert.equal(batch.aged, false);
  assert.equal(batch.madeDay, 1);
  assert.ok(batch.id.includes('漂流瓶'));
  assert.equal(R.stock(state, 'blond') + R.stock(state, 'stout'), 10);
  assert.equal(state.forage.haul, 1);
  const junk = state.forage.items.find(item => item.kind === 'junk' && item.arrival > state.forage.elapsed);
  state = catchItem({ ...state, cash: 1 }, junk);
  assert.equal(state.cash, 0);
  assert.equal(state.forage.haul, 1);
  const docked = doAct(state, { type: 'dock' });
  assert.equal(R.stock(docked, 'blond') + R.stock(docked, 'stout'), 10);
});

test('salvage misses expire, three useful catches auto-dock, and a full thirty seconds always ends', () => {
  let missed = drift(forage(), 5.1);
  assert.equal(missed.forage.items[0].status, 'missed');
  assert.equal(R.forageProgress(missed, missed.forage.items[0]), 1);
  const timedOut = drift(missed, 30);
  assert.equal(timedOut.phase, 'prep');
  assert.equal(timedOut.forage, null);
  assert.equal(timedOut.actions, 1);
  let caught = forage(3);
  const goods = caught.forage.items.filter(item => item.kind !== 'junk').slice(0, 3);
  for (const item of goods) caught = catchItem(caught, item);
  assert.equal(caught.phase, 'prep');
  assert.equal(caught.forage, null);
  assert.equal(caught.hops, 2);
  assert.equal(R.stock(caught, 'blond') + R.stock(caught, 'stout'), 10);
  caught = brew(caught, 'blond', [0, 0, 0]);
  assert.equal(caught.batches.at(-1).quality, 2);
  assert.equal(caught.hops, 1, 'Only one saved hop is consumed per completed brew');
});

test('forage saves validate lanes, item states, haul, duration, and phase consistency', () => {
  const state = forage();
  assert.deepEqual(R.restore(state), state);
  for (const field of [{ lane: 3 }, { elapsed: NaN }, { elapsed: 31 }, { duration: 300 }, { haul: 3 },
    { haul: 1 }, { items: [{ ...state.forage.items[0], status: 'unknown' }] },
    { items: [{ ...state.forage.items[0], lane: -1 }] }])
    assert.equal(R.restore({ ...state, forage: { ...state.forage, ...field } }), null);
  assert.equal(R.restore({ ...state, phase: 'prep' }), null);
  assert.equal(R.restore({ ...prep(), forage: state.forage }), null);
  assert.equal(R.forageProgress(prep(), state.forage.items[0]), 0);
});

test('three days of bottle salvage preserve valid batch bounds and finite resources', () => {
  let state = prep(19);
  for (let day = 1; day <= 3; day++) {
    state = doAct(state, { type: 'prepare', kind: 'surf' });
    const bottles = state.forage.items.filter(item => item.kind === 'bottle');
    for (const item of bottles) state = catchItem(state, item);
    assert.equal(state.phase, 'prep');
    state = brew(state, 'blond');
    assert.equal(state.batches.length, 2 + 4 * day);
    state = playNight(state);
    if (day < 3) state = doAct(state, { type: 'next' });
  }
  state = doAct(state, { type: 'finish' });
  assert.equal(state.phase, 'ending');
  assert.ok(R.restore(state));
});

test('seeded arrivals start with Marta and place Lotte late in the night', () => {
  const a = doAct(prep(42), { type: 'open' });
  const b = doAct(prep(42), { type: 'open' });
  const c = doAct(prep(43), { type: 'open' });
  assert.deepEqual(a.night.orders, b.night.orders);
  assert.notDeepEqual(a.night.orders, c.night.orders);
  assert.equal(a.night.duration, 165);
  assert.equal(a.night.orders.length, 8);
  assert.equal(R.customers(a)[0].person, 'marta');
  assert.equal(R.customers(a)[0].arrival, 0);
  assert.ok(a.night.orders.find(o => o.person === 'lotte').arrival > 100);
  assert.ok(a.night.orders.at(-1).arrival > 130);
});

test('later nights include a simultaneous pair so the second tap has a real use', () => {
  let state = prep(88);
  for (let day = 1; day <= 3; day++) {
    state = doAct(state, { type: 'open' });
    if (day > 1) {
      const orders = state.night.orders;
      const pairIndex = orders.findIndex((order, i) => i > 0 && order.arrival === orders[i - 1].arrival);
      assert.ok(pairIndex > 0, 'Day ' + day + ' needs a two-customer burst');
      assert.ok(orders[pairIndex + 1].arrival - orders[pairIndex].arrival >= 15, 'Leave a clear recovery gap');
    }
    state = doAct(state, { type: 'close' });
    if (day < 3) state = doAct(state, { type: 'next' });
  }
});

test('guest budgets include both price-sensitive and premium customers across seeds', () => {
  let priceSensitive = 0;
  let premium = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const state = doAct(prep(seed), { type: 'open' });
    for (const order of state.night.orders) {
      const base = R.BEERS[order.beer].price;
      if (order.budget < base + 4) priceSensitive++;
      if (order.budget >= base + 4) premium++;
      assert.ok(order.budget >= base && order.budget <= base + 5);
    }
  }
  assert.ok(priceSensitive > 0, 'Some guests prefer the standard price');
  assert.ok(premium > 0, 'Some guests can afford the UI premium of +€4');
});

test('ordinary fractional ticks remain valid through a complete unattended night', () => {
  let state = doAct(prep(31), { type: 'open' });
  let steps = 0;
  while (state.phase === 'night' && steps++ < 12000) {
    state = resolveEvent(state);
    const before = state.night.elapsed;
    state = doAct(state, { type: 'tick', seconds: 1 / 60 });
    assert.ok(state.night.elapsed >= before);
    assert.ok(Number.isFinite(state.night.elapsed));
  }
  assert.equal(state.phase, 'summary');
  assert.ok(state.night.elapsed <= state.night.duration);
  assert.equal(state.night.served + state.night.lost, 8);
});

function atDilemma(day = 1, seed = 42) {
  let state = prep(seed);
  for (let d = 1; d < day; d++) {
    state = doAct(doAct(state, { type: 'open' }), { type: 'close' });
    state = doAct(state, { type: 'next' });
  }
  state = doAct(state, { type: 'open' });
  for (let i = 0; i < 35; i++) state = doAct(state, { type: 'tick', seconds: 1 });
  return state;
}

test('one deterministic nightly dilemma freezes service and time until a valid choice', () => {
  assert.ok(R.NIGHT_EVENTS, 'Nightly dilemmas need exported metadata');
  assert.deepEqual(Object.keys(R.NIGHT_EVENTS).sort(), ['influencer', 'inspector', 'landlord']);
  for (let day = 1; day <= 3; day++) {
    let state = atDilemma(day);
    const id = ['landlord', 'influencer', 'inspector'][day - 1];
    assert.deepEqual(state.night.event, { id, status: 'pending', choice: null });
    assert.equal(state.night.elapsed, 35);
    assert.equal(state.night.rentAdjustment, 0);
    reject(state, { type: 'tick', seconds: 1 });
    reject(state, { type: 'event', choice: 'unknown' });
    const order = R.customers(state)[0];
    if (order) for (const action of [{ type: 'pour', customerId: order.id, beer: order.beer, price: 8 },
      { type: 'water', customerId: order.id }, { type: 'serve', customerId: order.id }]) reject(state, action);
    state = resolveEvent(state);
    assert.equal(state.night.event.status, 'resolved');
    reject(state, { type: 'event', choice: 'refuse' });
    state = advance(state, 5);
    assert.equal(state.night.event.status, 'resolved');
  }
  reject(doAct(prep(), { type: 'open' }), { type: 'event', choice: 'refuse' });
});

test('a dilemma freezes an already-reserved pour and consumes only remaining stock', () => {
  let state = advance(doAct(prep(), { type: 'open' }), 34);
  const order = R.customers(state)[0];
  state = doAct(state, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  state = doAct(state, { type: 'tick', seconds: 1 });
  assert.equal(state.night.event.status, 'pending');
  const progress = R.pourProgress(state, state.night.pours[0]);
  reject(state, { type: 'serve', customerId: order.id });
  reject(state, { type: 'tick', seconds: 1 });
  state = doAct(state, { type: 'event', choice: 'comp' });
  assert.equal(R.pourProgress(state, state.night.pours[0]), progress);
  assert.equal(R.stock(state, 'blond'), 4);
  state = advance(state, (0.72 - progress) * 4);
  state = doAct(state, { type: 'serve', customerId: order.id });
  assert.equal(state.night.satisfied, 1);
});

test('landlord comp consumes a real cup and reduces rent; refusal adds a service fee', () => {
  const pending = atDilemma();
  let comp = doAct(pending, { type: 'event', choice: 'comp' });
  assert.equal(R.stock(comp, 'blond'), R.stock(pending, 'blond') - 1);
  assert.equal(comp.night.rentAdjustment, -6);
  comp = doAct(comp, { type: 'close' });
  assert.equal(comp.reports[0].rent, 12);
  assert.equal(comp.cash, 33);
  let refused = doAct(pending, { type: 'event', choice: 'refuse' });
  assert.equal(R.stock(refused, 'blond'), 6);
  refused = doAct(refused, { type: 'close' });
  assert.equal(refused.reports[0].rent, 21);
  assert.equal(refused.cash, 24);
  const noBlond = { ...pending, batches: pending.batches.map(b => ({ ...b, cups: b.beer === 'blond' ? 0 : b.cups })) };
  assert.equal(R.stock(doAct(noBlond, { type: 'event', choice: 'comp' }), 'stout'), 1);
  const empty = { ...pending, batches: pending.batches.map(b => ({ ...b, cups: 0 })) };
  reject(empty, { type: 'event', choice: 'comp' });
});

test('influencer samples consume exactly two cups and change only the next three future budgets', () => {
  const pending = atDilemma(2);
  const future = pending.night.orders.filter(o => o.status === 'future').slice(0, 3).map(o => o.id);
  const mixed = { ...pending, batches: pending.batches.map(b => ({ ...b, cups: 1 })) };
  const sampled = doAct(mixed, { type: 'event', choice: 'samples' });
  assert.equal(R.stock(sampled, 'blond') + R.stock(sampled, 'stout'), 0);
  for (const order of sampled.night.orders) {
    const before = pending.night.orders.find(o => o.id === order.id);
    assert.equal(order.budget, before.budget + (future.includes(order.id) ? 4 : 0));
    assert.equal(order.patience, before.patience);
  }
  const refused = doAct(pending, { type: 'event', choice: 'refuse' });
  for (const order of refused.night.orders) {
    const before = pending.night.orders.find(o => o.id === order.id);
    assert.equal(order.patience, before.patience - (future.includes(order.id) ? 4 : 0));
  }
  const short = { ...pending, batches: pending.batches.map((b, i) => ({ ...b, cups: i === 0 ? 1 : 0 })) };
  reject(short, { type: 'event', choice: 'samples' });
});

test('inspector paperwork buys patience while tasting honestly increases the nightly rent', () => {
  const pending = { ...atDilemma(3), cash: 20 };
  const paid = doAct(pending, { type: 'event', choice: 'paperwork' });
  assert.equal(paid.cash, 10);
  assert.equal(paid.night.rentAdjustment, 0);
  for (const order of paid.night.orders) {
    const before = pending.night.orders.find(o => o.id === order.id);
    assert.equal(order.patience, before.patience + (['waiting', 'future'].includes(before.status) ? 12 : 0));
  }
  reject({ ...pending, cash: 9 }, { type: 'event', choice: 'paperwork' });
  const tasted = doAct(doAct(pending, { type: 'event', choice: 'tasting' }), { type: 'close' });
  assert.equal(tasted.reports[2].rent, 24);
  assert.equal(tasted.cash, 0);
});

test('nightly event saves reject wrong event identities, choices, and rent adjustments', () => {
  const pending = atDilemma();
  assert.deepEqual(R.restore(pending), pending);
  for (const event of [{ id: 'inspector', status: 'pending', choice: null },
    { id: 'landlord', status: 'pending', choice: 'comp' },
    { id: 'landlord', status: 'resolved', choice: 'samples' },
    { id: 'landlord', status: 'unknown', choice: null }])
    assert.equal(R.restore({ ...pending, night: { ...pending.night, event } }), null);
  assert.equal(R.restore({ ...pending, night: { ...pending.night, rentAdjustment: -999 } }), null);
  const resolved = resolveEvent(pending);
  assert.equal(R.restore({ ...resolved, night: { ...resolved.night, rentAdjustment: 0 } }), null);
});

test('pour reserves exactly one cup, keeps batch quality, and rejects duplicate or invalid prices', () => {
  let state = doAct(brew(prep(), 'blond'), { type: 'open' });
  const order = R.customers(state)[0];
  for (const price of [0, -1, 1.5, NaN, Infinity, '8']) reject(state, { type: 'pour', customerId: order.id, beer: 'blond', price });
  reject(state, { type: 'pour', customerId: 'missing', beer: 'blond', price: 8 });
  const before = R.stock(state, 'blond');
  state = doAct(state, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  assert.equal(R.stock(state, 'blond'), before - 1);
  assert.equal(state.night.pours[0].quality, 1, 'Oldest stock is sold first');
  assert.equal(R.pourProgress(state, state.night.pours[0]), 0);
  reject(state, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  state = advance(state, state.night.pours[0].duration * 0.72);
  assert.ok(Math.abs(R.pourProgress(state, state.night.pours[0]) - 0.72) < 1e-8);
  state = doAct(state, { type: 'serve', customerId: order.id });
  assert.equal(R.stock(state, 'blond'), before - 1);
  assert.equal(state.night.satisfied, 1);
  assert.ok(state.night.earned > 8);
  reject(state, { type: 'serve', customerId: order.id });
});

test('wrong beer, unaffordable prices, and early pours do not satisfy customers', () => {
  for (const mode of ['wrong', 'expensive', 'early']) {
    let state = doAct(prep(), { type: 'open' });
    const order = R.customers(state)[0];
    state = doAct(state, { type: 'pour', customerId: order.id, beer: mode === 'wrong' ? 'stout' : order.beer,
      price: mode === 'expensive' ? 100 : R.BEERS[order.beer].price });
    if (mode !== 'early') state = advance(state, state.night.pours[0].duration * 0.72);
    state = doAct(state, { type: 'serve', customerId: order.id });
    assert.equal(state.night.satisfied, 0);
    assert.equal(state.night.served, 1);
    if (mode === 'expensive') assert.equal(state.night.earned, 0);
  }
});

test('tick validates its bound, expires customers, and spills overfilled pours without refunds', () => {
  let state = doAct(prep(), { type: 'open' });
  for (const seconds of [-1, 1.1, NaN, Infinity, '1']) reject(state, { type: 'tick', seconds });
  const order = R.customers(state)[0];
  state = doAct(state, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  state = advance(state, state.night.pours[0].duration + 0.1);
  assert.equal(state.night.pours.length, 0);
  assert.equal(state.night.orders[0].status, 'lost');
  assert.equal(R.stock(state, 'blond'), 5);
  state = advance(state, 50);
  assert.ok(state.night.lost > 1);
  assert.ok(R.customers(state).length <= 3);
});

test('water is a free fallback and closing settles unresolved customers once with rent', () => {
  let state = doAct(prep(), { type: 'open' });
  const order = R.customers(state)[0];
  state = doAct(state, { type: 'water', customerId: order.id });
  assert.equal(state.cash, 45);
  assert.equal(state.night.satisfied, 0);
  assert.equal(state.night.lost, 1);
  assert.equal(R.stock(state, order.beer), R.BEERS[order.beer].id === 'blond' ? 6 : 2);
  state = doAct(state, { type: 'close' });
  assert.equal(state.phase, 'summary');
  assert.equal(state.cash, 27);
  assert.equal(state.reports[0].lost, 8);
  assert.equal(state.reports[0].rent, 18);
  reject(state, { type: 'close' });
  const low = doAct({ ...prep(), cash: 2 }, { type: 'open' });
  assert.equal(doAct(low, { type: 'close' }).cash, 0);
  assert.equal(doAct(low, { type: 'close' }).reports[0].rent, 18, 'Report the nightly charge even when cash floors at zero');
});

test('closing during a pour consumes its cup and sold-out stock cannot be reserved', () => {
  let state = doAct(prep(), { type: 'open' });
  const order = R.customers(state)[0];
  const empty = { ...state, batches: state.batches.map(b => ({ ...b, cups: 0 })) };
  reject(empty, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  state = doAct(state, { type: 'pour', customerId: order.id, beer: 'blond', price: 8 });
  state = doAct(state, { type: 'close' });
  assert.equal(R.stock(state, 'blond'), 5);
  assert.equal(state.night.pours.length, 0);
  assert.equal(state.night.lost, 8);
});

test('a promised stout rewards Lotte and gives music next night; skipping her breaks the promise', () => {
  let state = doAct(prep(), { type: 'prepare', kind: 'visit' });
  state = playNight(brew(state, 'stout'));
  assert.equal(state.reports[0].promiseKept, true);
  assert.equal(state.reports[0].promiseBroken, false);
  assert.ok(state.friends.lotte > 0);
  state = doAct(state, { type: 'next' });
  assert.equal(state.promises.lotte, false);
  assert.equal(state.music, true);
  assert.deepEqual(state.prepared, []);
  const musicNight = doAct(state, { type: 'open' });
  let failed = doAct(prep(), { type: 'prepare', kind: 'visit' });
  failed = doAct(doAct(failed, { type: 'open' }), { type: 'close' });
  assert.equal(failed.reports[0].promiseBroken, true);
  failed = doAct(failed, { type: 'next' });
  assert.equal(failed.music, false);
  const silentNight = doAct(failed, { type: 'open' });
  assert.ok(musicNight.night.orders[0].patience > silentNight.night.orders[0].patience);
});

test('all upgrades apply a real tradeoff while moving to the next preparation day', () => {
  const summary = doAct(doAct(prep(), { type: 'open' }), { type: 'close' });
  reject(summary, { type: 'upgrade', id: 'unknown' });
  for (const id of Object.keys(R.UPGRADES)) {
    const state = doAct(summary, { type: 'upgrade', id });
    assert.equal(state.day, 2);
    assert.equal(state.actions, 2);
    assert.equal(state.phase, 'prep');
    assert.ok(state.upgrades.includes(id));
    if (id === 'cellar') assert.ok(state.batches.every(b => b.aged));
    reject(state, { type: 'upgrade', id });
  }
});

function clusteredNight(upgrade) {
  let state = doAct(doAct(prep(), { type: 'open' }), { type: 'close' });
  state = doAct(state, upgrade ? { type: 'upgrade', id: upgrade } : { type: 'next' });
  state = doAct(state, { type: 'open' });
  // A valid saved arrival plan lets tests exercise simultaneous patrons without real-time waiting.
  state.night.orders.forEach((order, index) => { order.arrival = index < 3 ? 0 : order.arrival; order.status = 'future'; });
  return doAct(state, { type: 'tick', seconds: 0 });
}
test('double tap has two independent reservations and stage reduces seating to two', () => {
  let double = clusteredNight('doubleTap');
  const orders = R.customers(double);
  assert.equal(orders.length, 3);
  double = doAct(double, { type: 'pour', customerId: orders[0].id, beer: 'blond', price: 8 });
  double = doAct(double, { type: 'pour', customerId: orders[1].id, beer: 'blond', price: 8 });
  assert.equal(double.night.pours.length, 2);
  reject(double, { type: 'pour', customerId: orders[2].id, beer: 'blond', price: 8 });
  const base = clusteredNight();
  let single = doAct(base, { type: 'pour', customerId: R.customers(base)[0].id, beer: 'blond', price: 8 });
  reject(single, { type: 'pour', customerId: R.customers(single)[1].id, beer: 'blond', price: 8 });
  const stage = clusteredNight('stage');
  assert.equal(R.customers(stage).length, 2);
  assert.equal(stage.night.lost, 1);
  assert.ok(stage.night.orders[0].patience > base.night.orders[0].patience);
  const servedStage = servePerfect(stage, R.customers(stage)[0]);
  const servedBase = servePerfect(base, R.customers(base)[0]);
  assert.ok(servedStage.night.earned > servedBase.night.earned);
});

test('cellar bonus is paid on aged stock and newly brewed stock stays fresh', () => {
  const base = clusteredNight();
  let aged = clusteredNight('cellar');
  const servedBase = servePerfect(base, R.customers(base)[0]);
  aged = servePerfect(aged, R.customers(aged)[0]);
  assert.ok(aged.night.earned > servedBase.night.earned);
  let prepAged = doAct(doAct(doAct(prep(), { type: 'open' }), { type: 'close' }), { type: 'upgrade', id: 'cellar' });
  prepAged = brew(prepAged, 'blond');
  assert.equal(prepAged.batches.at(-1).aged, false);
});

test('three-day seeded play reaches success with earned cash and satisfied regulars', () => {
  let state = prep(2026);
  for (let day = 1; day <= 3; day++) {
    state = brew(state, 'blond');
    state = brew(state, 'stout');
    state = playNight(state);
    assert.equal(state.reports.length, day);
    assert.equal(state.night.duration, 150 + 15 * day);
    assert.equal(state.night.orders.length, 6 + 2 * day);
    if (day < 3) state = doAct(state, { type: 'upgrade', id: day === 1 ? 'cellar' : 'doubleTap' });
  }
  reject(state, { type: 'next' });
  reject(state, { type: 'upgrade', id: 'stage' });
  state = doAct(state, { type: 'finish' });
  assert.equal(state.phase, 'ending');
  assert.equal(state.result.won, true);
  assert.ok(state.cash >= 100);
  assert.ok(state.totalSatisfied >= 12);
  assert.equal(state.totalServed, state.reports.reduce((sum, r) => sum + r.served, 0));
  reject(state, { type: 'finish' });
});

test('three-day failure has a real ending, resets daily flags, and cannot farm upgrades', () => {
  let state = prep(99);
  for (let day = 1; day <= 3; day++) {
    state = doAct(doAct(state, { type: 'open' }), { type: 'close' });
    if (day < 3) {
      if (day === 2) reject(state, { type: 'upgrade', id: 'stage' });
      state = doAct(state, day === 1 ? { type: 'upgrade', id: 'stage' } : { type: 'next' });
    }
  }
  state = doAct(state, { type: 'finish' });
  assert.equal(state.result.won, false);
  assert.equal(state.cash, 0);
  assert.equal(state.totalSatisfied, 0);
  assert.equal(state.reports.reduce((sum, r) => sum + r.lost, 0), 30);
});

test('restore clones normal snapshots and rejects malformed, infinite, or polluted data', () => {
  const state = doAct(prep(), { type: 'open' });
  const restored = R.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  restored.batches[0].cups = 0;
  assert.equal(state.batches[0].cups, 6);
  const invalid = [null, {}, [], 'text', { ...state, version: 2 }, { ...state, day: 4 },
    { ...state, cash: NaN }, { ...state, actions: -1 }, { ...state, phase: 'unknown' },
    { ...state, hops: Infinity }, { ...state, friends: {} }, { ...state, batches: [{}] },
    { ...state, totalSatisfied: 12, totalServed: 12 },
    { ...state, promises: { lotte: 'yes' } }, { ...state, upgrades: ['unknown'] },
    { ...state, prepared: ['coffee', 'coffee'] }, { ...state, night: { ...state.night, elapsed: -1 } },
    { ...state, night: { ...state.night, pours: [{ customerId: 'fake' }] } },
    { ...state, batches: [{ ...state.batches[0], quality: 5 }] },
    { ...state, batches: [{ ...state.batches[0], cups: -1 }] },
    { ...state, night: { ...state.night, orders: [{ ...state.night.orders[0], status: 'invalid' }] } },
    JSON.parse(JSON.stringify(state).replace('"friends":{', '"friends":{"__proto__":{},')),
    Object.assign(Object.create({ polluted: true }), state)];
  for (const value of invalid) assert.equal(R.restore(value), null);
  const cyclic = { ...state }; cyclic.extra = cyclic;
  assert.equal(R.restore(cyclic), null);
  assert.equal({}.polluted, undefined);
});

test('restoring rejects forged cumulative scores and contradictory completed reports', () => {
  const state = playNight(prep());
  assert.equal(R.restore({ ...state, totalSatisfied: state.totalSatisfied + 1 }), null);
  assert.equal(R.restore({ ...state, reports: [{ ...state.reports[0], earned: state.reports[0].earned + 1 }] }), null);
  assert.equal(R.restore({ ...state, reports: [{ ...state.reports[0], cash: state.cash + 1 }] }), null);
  let accessed = false;
  const withGetter = { ...state };
  Object.defineProperty(withGetter, 'cash', { enumerable: true, get() { accessed = true; return 45; } });
  assert.equal(R.restore(withGetter), null);
  assert.equal(accessed, false, 'Save validation never invokes getters');
});

test('sparse arrays and hidden array properties cannot enter a restored game', () => {
  const state = prep();
  const sparseLog = new Array(1);
  assert.equal(R.restore({ ...state, log: sparseLog }), null);
  const decoratedLog = [];
  decoratedLog.extra = 'unexpected';
  assert.equal(R.restore({ ...state, log: decoratedLog }), null);
});

test('market crate trades one action and €8 for exactly two ales and one stout once a day', () => {
  const initial = prep();
  const state = doAct(initial, { type: 'prepare', kind: 'market' });
  assert.equal(state.cash, 37);
  assert.equal(state.actions, 1);
  assert.equal(R.stock(state, 'blond'), 8);
  assert.equal(R.stock(state, 'stout'), 3);
  assert.ok(state.batches.slice(-2).every(b => b.quality === 1 && !b.aged));
  reject(state, { type: 'prepare', kind: 'market' });
  reject({ ...initial, cash: 7 }, { type: 'prepare', kind: 'market' });
});

test('lab supplies two stored hops for €6 once a day without bypassing preparation', () => {
  const initial = prep();
  let state = doAct(initial, { type: 'prepare', kind: 'lab' });
  assert.equal(state.cash, 39);
  assert.equal(state.hops, 2);
  assert.equal(state.actions, 1);
  reject(state, { type: 'prepare', kind: 'lab' });
  reject({ ...initial, cash: 5 }, { type: 'prepare', kind: 'lab' });
  state = brew(state, 'stout', [0, 0, 0]);
  assert.equal(state.hops, 1);
  assert.equal(state.batches.at(-1).quality, 2);
  reject(state, { type: 'prepare', kind: 'market' });
});

test('three days of lab and salvage can retain fifteen hops and remain restorable', () => {
  let state = prep();
  for (let day = 1; day <= 3; day++) {
    state = doAct(state, { type: 'prepare', kind: 'lab' });
    state = doAct(state, { type: 'prepare', kind: 'surf' });
    const hops = state.forage.items.filter(item => item.kind === 'hops').slice(0, 3);
    for (const item of hops) state = catchItem(state, item);
    state = playNight(state);
    if (day < 3) state = doAct(state, { type: 'next' });
  }
  assert.equal(state.hops, 15);
  assert.ok(R.restore(state));
});

test('three days of market plus sealed bottles fit valid batch bounds', () => {
  let state = prep();
  for (let day = 1; day <= 3; day++) {
    state = doAct(state, { type: 'prepare', kind: 'market' });
    state = doAct(state, { type: 'prepare', kind: 'surf' });
    const bottles = state.forage.items.filter(item => item.kind === 'bottle').slice(0, 3);
    for (const item of bottles) state = catchItem(state, item);
    state = playNight(state);
    if (day < 3) state = doAct(state, { type: 'next' });
  }
  assert.equal(state.batches.length, 17);
  assert.ok(R.restore(state));
});

console.log('\n' + tests + ' reopening behavioral tests passed.');

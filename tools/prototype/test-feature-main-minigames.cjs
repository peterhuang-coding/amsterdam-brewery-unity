'use strict';
// F29-LOOP combined real-action coverage.
// Every positive state transition below comes from public R.act actions or
// B/J simulation steps on the actual current run. No phase/cash/position is
// assigned directly to fake progress; the only direct reads are public state.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const B = require('./backstage-core.js');
const J = require('./journey-core.js');

function check(cond, msg) { assert.ok(cond, msg); }
function eq(a, b, msg) { assert.equal(a, b, msg); }

// Immutable-action helper: inputs never mutate, every result is a restorable save.
function act(state, action) {
  const before = JSON.stringify(state);
  const out = R.act(state, action);
  eq(out.ok, true, (out.message || 'blocked') + ' :: ' + JSON.stringify(action));
  eq(JSON.stringify(state), before, 'act must not mutate its input: ' + action.type);
  check(R.restore(out.state), 'result must restore after ' + action.type);
  return out.state;
}
function deny(state, action) {
  const before = JSON.stringify(state);
  const out = R.act(state, action);
  eq(out.ok, false, 'action must be rejected: ' + JSON.stringify(action));
  eq(out.state, state, 'rejected action returns the same state');
  eq(JSON.stringify(state), before, 'rejected action must not mutate');
  return state;
}
const startGame = (seed = 42) => act(R.createGame(seed), { type: 'start' });
function brew(s, beer = 'blond', scores = [1, 1, 1]) {
  s = act(s, { type: 'prepare', kind: 'brew', beer });
  for (const score of scores) s = act(s, { type: 'brewHit', score });
  return s;
}
function ja(s, verb, value) { return act(s, { type: 'journeyAction', verb, value }); }
function roadUntil(s, predicate, max = 8000) {
  let n = 0;
  while (!predicate(s.journeys.run) && n++ < max) s = ja(s, 'tick', { seconds: 0.1 });
  check(predicate(s.journeys.run), 'journey must progress, stage=' + s.journeys.run.stage);
  return s;
}
// Real backstage walking: repeated physical simulation steps toward a goal,
// bounded, with no position assignment.
function walkRun(s, goal, reach) {
  const r = s.backstage.run;
  let n = 0;
  const dist = () => Math.hypot(r.p.x - goal.x, r.p.y - goal.y);
  while (dist() > reach && r.status === 'active' && n++ < 4000) {
    const dx = goal.x - r.p.x, dy = goal.y - r.p.y, m = Math.hypot(dx, dy);
    B.step(r, { dx: dx / m, dy: dy / m }, 0.1);
  }
  check(dist() <= reach, 'actual walk reaches ' + goal.x + ',' + goal.y + ' in ' + n + ' ticks');
  check(R.restore(s), 'exploration save stays valid while walking');
  return s;
}
function catchFlotsam(s, index) {
  const lane = s.forage.items[index].lane;
  while (s.forage.lane !== lane)
    s = act(s, { type: 'forageMove', direction: Math.sign(lane - s.forage.lane) });
  const arrival = s.forage.items[index].arrival;
  const target = arrival + 2.6;
  while (s.forage.elapsed < target - 1e-9 && s.phase === 'forage')
    s = act(s, { type: 'forageTick', seconds: Math.min(1, target - s.forage.elapsed) });
  eq(s.forage.items[index].status, 'floating', 'item is inside its hook window');
  s = act(s, { type: 'forageCatch' });
  eq(s.forage.items[index].status, 'caught');
  return s;
}
function rideTrain(s, leg) {
  s = ja(s, 'auto');
  let n = 0, fine = 0;
  while (!['arrival', 'receipt'].includes(s.journeys.run.stage) && n++ < 9000) {
    const r = s.journeys.run;
    if (r.stage === 'inspection') {
      const cash = s.cash;
      s = ja(s, 'inspect');
      fine += cash - s.cash;
    } else if (!r.eventDone && r.travel >= 5) {
      s = ja(s, 'help', false);
    } else {
      s = ja(s, 'tick', { seconds: 0.1 });
    }
  }
  check(['arrival', 'receipt'].includes(s.journeys.run.stage), 'train leg finishes');
  eq(fine, leg === 0 ? 12 : 0, leg === 0
    ? 'fare €4 plus surcharge €8 collected once on the unpaid leg'
    : 'the tabbed return ticket is valid, no second fine');
  return s;
}
function servePerfect(s, order) {
  s = act(s, { type: 'pour', customerId: order.id, beer: order.beer, price: R.BEERS[order.beer].price });
  const pour = s.night.pours.find(p => p.customerId === order.id);
  let left = pour.duration * 0.72; // land on the real perfect-pour marker
  while (left > 1e-9 && s.phase === 'night') {
    s = resolveNightEvent(s); // a dilemma may appear while the pour is running
    const d = Math.min(1, left);
    s = act(s, { type: 'tick', seconds: d });
    left -= d;
  }
  s = resolveNightEvent(s);
  return act(s, { type: 'serve', customerId: order.id });
}
function resolveNightEvent(s) {
  if (s.phase === 'night' && s.night.event && s.night.event.status === 'pending')
    return act(s, { type: 'event', choice: s.night.event.id === 'inspector' ? 'tasting' : 'refuse' });
  return s;
}
function playFullNight(s) {
  if (s.phase === 'prep') s = act(s, { type: 'open' });
  let guard = 0;
  while (s.phase === 'night' && guard++ < 8000) {
    s = resolveNightEvent(s);
    const customer = R.customers(s)[0];
    if (!customer) s = act(s, { type: 'tick', seconds: 1 });
    else if (R.stock(s, customer.beer) === 0) s = act(s, { type: 'water', customerId: customer.id });
    else s = servePerfect(s, customer);
  }
  eq(s.phase, 'summary', 'a full played night settles');
  return s;
}

test('F29-1 mainline: brew by real hits, pour+serve first cup, close, night pickup via real movement banks once, next day keeps reward', () => {
  let s = startGame(42);
  eq(s.cash, 45); eq(s.actions, 2);

  // Brew through three actual hit-timing actions.
  s = act(s, { type: 'prepare', kind: 'brew', beer: 'stout' });
  eq(s.phase, 'brew'); eq(s.cash, 33, 'stout ingredients cost €12');
  s = act(s, { type: 'brewHit', score: 1 });
  eq(s.brew.hits.length, 1);
  s = act(s, { type: 'brewHit', score: 1 });
  s = act(s, { type: 'brewHit', score: 1 });
  eq(s.phase, 'prep'); eq(s.actions, 1);
  eq(R.stock(s, 'stout'), 8, 'six new stout cups join the two starter cups');

  // Open and serve the first arrival with a genuinely timed pour.
  s = act(s, { type: 'open' });
  eq(s.phase, 'night');
  const first = R.customers(s)[0];
  eq(first.person, 'marta'); eq(first.beer, 'blond');
  const blondBefore = R.stock(s, 'blond');
  s = act(s, { type: 'pour', customerId: first.id, beer: 'blond', price: R.BEERS.blond.price });
  eq(R.stock(s, 'blond'), blondBefore - 1, 'pour consumes one real cup');
  eq(s.night.pours.length, 1);
  s = act(s, { type: 'tick', seconds: 1 });
  s = act(s, { type: 'tick', seconds: 1 });
  s = act(s, { type: 'tick', seconds: 0.9 });
  const cashAtServe = s.cash;
  s = act(s, { type: 'serve', customerId: first.id });
  eq(s.night.served, 1); eq(s.night.satisfied, 1);
  eq(s.night.earned, 10, 'list price €8 plus the real perfect-pour €2 tip');
  eq(s.cash, cashAtServe + 10);

  // Close: remaining guests settle once and real rent is paid.
  s = act(s, { type: 'close' });
  eq(s.phase, 'summary'); eq(s.reports.length, 1);
  eq(s.reports[0].served, 1); eq(s.reports[0].lost, 7);
  eq(s.reports[0].rent, 18);
  const closedCash = s.cash;
  eq(closedCash, 25);
  const closedCups = R.stock(s, 'blond') + R.stock(s, 'stout');

  // Optional after-hours expedition driven only by physical steps and commands.
  s = act(s, { type: 'explore', kit: 'hook', mode: 'manual' });
  eq(s.phase, 'explore'); eq(s.backstage.run.auto, undefined);
  const r = s.backstage.run;
  walkRun(s, { x: 405, y: 990 }, 26); // market returns shelf, stationary item0
  check(r.bag.includes('item0'), 'walking onto the shelf really stows the sealed ale');
  walkRun(s, B.EXIT, 60);
  eq(B.command(r, 'interact'), true);
  eq(r.status, 'extracted', 'reach the safe exit for a full reward');
  const loot = B.rewards(r);
  eq(loot.status, 'extracted'); check(loot.cups >= 2, 'at least the sealed bottle is in the bag');

  // Return banks rewards exactly once.
  s = act(s, { type: 'returnExplore' });
  eq(s.phase, 'summary'); eq(s.backstage.run, null); eq(s.backstage.trips, 1);
  eq(s.cash, closedCash + loot.cash, 'after-hours cash banked once');
  eq(R.stock(s, 'blond') + R.stock(s, 'stout'), closedCups + loot.cups, 'salvage cups enter stock once');
  eq(s.backstage.cashAfterClose, loot.cash);
  deny(s, { type: 'returnExplore' });
  deny(s, { type: 'explore', kit: 'hook' });
  eq(s.market.history.length, 1);
  check(s.market.history[0].stockTaken && s.market.history[0].safe, 'real market removal is dated and safe');

  // Next day preserves the reward and refills daily actions.
  s = act(s, { type: 'next' });
  eq(s.day, 2); eq(s.actions, 2); eq(s.phase, 'prep');
  eq(R.stock(s, 'blond') + R.stock(s, 'stout'), closedCups + loot.cups, 'loot survives into day two');
  eq(s.cash, closedCash + loot.cash, 'after-hours cash survives into day two');
  eq(s.backstage.cashAfterClose, 0);
  check(s.life.morning.length > 0, 'dated morning receipt is retained');
  eq(R.marketInfo(s).price, 10, 'genuine stock removal raises the next-day crate price');
});

test('F29-2 forage: real success catches, a junk fee, natural 30s end, and inventory accounting', () => {
  let s = startGame(42);
  s = act(s, { type: 'prepare', kind: 'surf' });
  eq(s.phase, 'forage'); eq(s.actions, 1);
  deny(s, { type: 'forageCatch' }); // empty hook before the floating window fails

  s = catchFlotsam(s, 0); // hops
  eq(s.forage.haul, 1); eq(s.hops, 1);

  s = catchFlotsam(s, 1); // sealed bottle
  const bottle = s.batches.at(-1);
  check(String(bottle.id).includes('漂流瓶'), 'bottle becomes a real batch');
  eq(bottle.cups, 2); eq(bottle.quality, 1);
  eq(s.forage.haul, 2);

  const cashBeforeJunk = s.cash;
  s = catchFlotsam(s, 2); // junk
  eq(s.cash, cashBeforeJunk - 2, 'junk charges the €2 handling fee');
  eq(s.forage.haul, 2, 'junk never counts as useful haul');

  let guard = 0;
  while (s.phase === 'forage' && guard++ < 1000) s = act(s, { type: 'forageTick', seconds: 1 });
  eq(s.phase, 'prep', 'the full thirty seconds ends the forage naturally');
  eq(s.forage, null); eq(s.actions, 1);
  eq(R.stock(s, 'blond') + R.stock(s, 'stout'), 10, 'eight starter cups plus the sealed 2-cup bottle');
  eq(s.hops, 1); eq(s.cash, 43);
  deny(s, { type: 'prepare', kind: 'surf' }); // one salvage outing per day
});

test('F29-3 flowers: cancel free, finish charges once, store/retrieve/use settles once', () => {
  let s = startGame(42);
  s = act(s, { type: 'flowerStart' });
  s = act(s, { type: 'flowerPick', stem: 0 });
  s = act(s, { type: 'flowerCancel' });
  eq(s.cash, 45); eq(s.actions, 2); eq(s.life.arrangement, null, 'cancel refunds everything');

  s = act(s, { type: 'flowerStart' });
  for (const stem of [0, 1, 2]) s = act(s, { type: 'flowerPick', stem });
  s = act(s, { type: 'flowerWrap', wrap: 'ribbon' });
  const batchesBefore = JSON.stringify(s.batches);
  s = act(s, { type: 'flowerFinish' });
  eq(s.cash, 41, 'one bouquet costs €4 exactly once'); eq(s.actions, 1);
  eq(s.life.flowersDay, 1); eq(s.life.bouquet.palette, 'warm');
  deny(s, { type: 'flowerStart' }); // one arrangement per day

  s = act(s, { type: 'flowerStore', stored: true });
  eq(s.life.bouquet.stored, true);
  deny(s, { type: 'flowerUse', target: 'lotte' }); // stored bouquet cannot be gifted
  s = act(s, { type: 'flowerStore', stored: false });
  s = act(s, { type: 'flowerUse', target: 'lotte' });
  eq(s.friends.lotte, 2, 'warm ribbon bouquet is the matching Lotte gift');
  eq(s.life.gifts, 1); eq(s.life.bouquet, null);
  deny(s, { type: 'flowerUse', target: 'lotte' });
  deny(s, { type: 'flowerUse', target: 'display' });
  eq(JSON.stringify(s.batches), batchesBefore, 'flowers never become brewing stock');
});

test('F29-4a delivery: go/packing/parcel dropoff/cargo/return, then offered-accepted-fulfilled supply contract pays once', () => {
  let s = startGame(42);
  s = act(s, { type: 'journeyStart', kind: 'delivery' });
  eq(s.actions, 1); eq(s.phase, 'journey');
  s = ja(s, 'pack', 'capacity');
  s = ja(s, 'depart', 'smooth');
  s = ja(s, 'speed');

  s = roadUntil(s, r => r.stage === 'dropoff');
  s = ja(s, 'parcel', 'take');
  s = ja(s, 'parcel', 'deliver');
  eq(s.journeys.run.load.parcel, 'delivered');
  eq(s.journeys.run.load.onTime, true, 'rush parcel reaches the studio on time');

  s = roadUntil(s, r => r.stage === 'arrival');
  s = ja(s, 'cargo');
  s = ja(s, 'deliver', 'accept');
  s = roadUntil(s, r => r.stage === 'receipt');
  const reward = s.journeys.run.reward;
  eq(reward, 18, '€14 intact delivery plus €4 on-time parcel');
  eq(s.journeys.run.paid, 0, 'delivery runs charge no train fares');
  s = act(s, { type: 'journeyReturn' });
  eq(s.phase, 'prep'); eq(s.actions, 1); eq(s.journeys.run, null);
  eq(s.journeys.history.length, 1);
  eq(s.journeys.history[0].kind, 'delivery');
  eq(s.journeys.history[0].reward, reward);
  eq(s.cash, 45 + reward, 'delivery reward settles into business cash');
  deny(s, { type: 'journeyReturn' });
  deny(s, { type: 'journeyStart', kind: 'delivery' }); // one commission per day

  const c0 = s.trade.contracts[0];
  eq(c0.status, 'offered'); eq(c0.dueDay, 2);
  s = act(s, { type: 'contract', id: c0.id, choice: 'accept' });

  s = brew(s, 'stout'); // quality 3, meets the q2/€14 terms
  eq(s.actions, 0);
  const batchId = s.batches.at(-1).id;
  s = act(s, { type: 'contract', id: c0.id, choice: 'reserve', batchId });

  s = act(s, { type: 'open' });
  s = act(s, { type: 'close' });
  eq(s.trade.contracts[0].status, 'accepted', 'day-two contract is untouched by night one');
  s = act(s, { type: 'next' });
  eq(s.day, 2); eq(s.actions, 2);

  s = act(s, { type: 'open' });
  const contractId = s.trade.contracts[0].id;
  const managerId = s.trade.contracts[0].customerId;
  s = act(s, { type: 'water', customerId: R.customers(s)[0].id });
  let guard = 0;
  while (!R.customers(s).some(o => o.id === managerId) && guard++ < 120)
    s = act(s, { type: 'tick', seconds: 1 });
  const guest = s.night.orders.find(o => o.id === managerId);
  check(guest && guest.status === 'waiting', 'the rehearsal manager really arrives');
  eq(guest.name, '排练室管理员');
  const cupsBefore = s.batches.find(b => b.id === batchId).cups;
  const cashBefore = s.cash;
  deny(s, { type: 'pour', customerId: guest.id, beer: 'stout', price: 10, batchId }); // fixed €14 terms
  s = act(s, { type: 'pour', customerId: guest.id, beer: 'stout', price: 14, batchId });
  eq(s.batches.find(b => b.id === batchId).cups, cupsBefore - 1, 'reserved cup is really consumed');
  s = act(s, { type: 'tick', seconds: 1 });
  s = act(s, { type: 'tick', seconds: 1 });
  s = act(s, { type: 'tick', seconds: 1 });
  s = act(s, { type: 'serve', customerId: guest.id });
  eq(s.cash - cashBefore, 20, '€14 agreed price + €2 contract bonus + €4 real quality/perfect tips');
  eq(s.trade.contracts[0].status, 'fulfilled');
  deny(s, { type: 'serve', customerId: guest.id });
  deny(s, { type: 'contract', id: contractId, choice: 'accept' });
  s = act(s, { type: 'close' });
  eq(s.reports[1].earned, 20, 'the contract fee appears once in the night report');
});

test('F29-4b supply contract accepted then cancelled once, for free, never settles again', () => {
  let s = startGame(7);
  s = act(s, { type: 'journeyStart', kind: 'delivery' });
  s = ja(s, 'pack', 'padding');
  s = ja(s, 'depart', 'smooth');
  s = roadUntil(s, r => r.stage === 'arrival');
  s = ja(s, 'cargo');
  s = ja(s, 'deliver', 'accept');
  s = roadUntil(s, r => r.stage === 'receipt');
  s = act(s, { type: 'journeyReturn' });
  eq(s.trade.contracts[0].status, 'offered');
  const cash = s.cash;
  const id = s.trade.contracts[0].id;
  s = act(s, { type: 'contract', id, choice: 'accept' });
  s = act(s, { type: 'contract', id, choice: 'cancel' });
  eq(s.trade.contracts[0].status, 'cancelled');
  eq(s.cash, cash, 'mutual cancellation is free');
  eq(s.trade.contracts[0].settledDay, 1);
  deny(s, { type: 'contract', id, choice: 'cancel' });
  deny(s, { type: 'contract', id, choice: 'accept' });
});

test('F29-5 rail: unpaid ticket incurs the real inspection fine once, return fare tabs and settles, economy closes at zero debt', () => {
  let seed = 0;
  for (let n = 1; n < 80; n++) if (J.create(n, 1, 'rail', 1).willCheck) { seed = n; break; }
  check(seed > 0, 'a deterministic seed with an outbound inspection exists');

  let s = startGame(seed);
  s = act(s, { type: 'journeyStart', kind: 'rail' });
  s = ja(s, 'pack', 'capacity');
  s = ja(s, 'depart', 'smooth');
  s = roadUntil(s, r => r.stage === 'ticket');
  eq(s.journeys.run.willCheck, true);

  s = ja(s, 'ticket', 'unpaid'); // board first; inspection settles the fare
  eq(s.cash, 45, 'boarding unpaid spends nothing at the gate');
  s = rideTrain(s, 0);
  eq(s.journeys.run.stage, 'arrival');
  eq(s.cash, 33, 'inspection charged €4 fare + €8 surcharge exactly once');

  s = ja(s, 'deliver', 'accept');
  eq(s.journeys.run.leg, 1);
  s = ja(s, 'ticket', 'credit'); // return fare goes onto the tab
  eq(s.journeys.run.fee, 4);
  s = rideTrain(s, 1);
  eq(s.journeys.run.stage, 'receipt');
  s = act(s, { type: 'journeyReturn' });
  eq(s.journeys.debt, 0, 'the €16 reward clears the €4 tab');
  eq(s.cash, 45, 'economy: 45 - 12 fine + 16 reward - 4 tab = 45');
  eq(s.journeys.history[0].paid, 12);
  eq(s.journeys.history[0].reward, 16);
  deny(s, { type: 'journeyReturn' });
  deny(s, { type: 'journeyStart', kind: 'rail' });
});

test('F29-6a restore inside the timed forage minigame completes without duplicated salvage', () => {
  let s = startGame(42);
  s = act(s, { type: 'prepare', kind: 'surf' });
  s = catchFlotsam(s, 0); // hops
  eq(s.hops, 1);
  const snapshot = JSON.parse(JSON.stringify(s));
  assert.deepEqual(R.restore(snapshot), s, 'mid-forage save round-trips');
  s = R.restore(snapshot);

  s = catchFlotsam(s, 1); // one sealed bottle
  let guard = 0;
  while (s.phase === 'forage' && guard++ < 1000) s = act(s, { type: 'forageTick', seconds: 1 });
  eq(s.phase, 'prep');
  eq(s.hops, 1, 'the restored hop is counted once, not twice');
  eq(s.batches.filter(b => String(b.id).includes('漂流瓶')).length, 1, 'exactly one bottle batch exists');
});

test('F29-6b restore during the modal street-choice minigame completes the trip with a single reward', () => {
  let s = startGame(42);
  s = act(s, { type: 'journeyStart', kind: 'delivery' });
  s = ja(s, 'pack', 'padding');
  s = ja(s, 'depart', 'short');
  s = roadUntil(s, r => r.stage === 'conflict' && r.conflict.mode === 'choice');
  const elapsedAtChoice = s.journeys.run.elapsed;
  s = ja(s, 'tick', { seconds: 0.1 });
  eq(s.journeys.run.elapsed, elapsedAtChoice, 'a modal choice freezes expedition time');

  const snapshot = JSON.parse(JSON.stringify(s));
  assert.deepEqual(R.restore(snapshot), s, 'mid-choice save round-trips');
  s = R.restore(snapshot);
  s = ja(s, 'street', 'detour');
  s = ja(s, 'auto');
  s = roadUntil(s, r => r.stage === 'arrival');
  s = ja(s, 'cargo');
  s = ja(s, 'deliver', 'accept');
  s = roadUntil(s, r => r.stage === 'receipt');
  const reward = s.journeys.run.reward;
  s = act(s, { type: 'journeyReturn' });
  eq(s.journeys.history.length, 1, 'restored trip settles exactly once');
  eq(s.cash, 45 + reward);
  eq(s.phase, 'prep', 'no softlock after restoring in the modal minigame');
});

test('F29-6c restore mid brew finishes one batch and consumes its inputs once', () => {
  let s = startGame(42);
  s = act(s, { type: 'prepare', kind: 'brew', beer: 'blond' });
  s = act(s, { type: 'brewHit', score: 1 });
  s = act(s, { type: 'brewHit', score: 1 });
  const count = s.batches.length;
  const snapshot = JSON.parse(JSON.stringify(s));
  assert.deepEqual(R.restore(snapshot), s);
  s = R.restore(snapshot);
  s = act(s, { type: 'brewHit', score: 1 });
  eq(s.batches.length, count + 1, 'one completed batch');
  eq(s.batches.at(-1).cups, 6);
  eq(s.phase, 'prep');
});

test('F29-7 the three-day ending is reachable on the main loop without optional minigames, and there is no day four', () => {
  let s = startGame(2026);
  for (let day = 1; day <= 3; day++) {
    s = brew(s, 'blond');
    s = brew(s, 'stout');
    s = playFullNight(s);
    eq(s.reports.length, day);
    eq(s.night.orders.length, 6 + 2 * day);
    if (day < 3) s = act(s, { type: 'upgrade', id: day === 1 ? 'cellar' : 'doubleTap' });
  }
  deny(s, { type: 'next' });
  deny(s, { type: 'upgrade', id: 'stage' });
  s = act(s, { type: 'finish' });
  eq(s.phase, 'ending'); eq(s.day, 3, 'nothing mutates into a day four');
  eq(s.result.won, true);
  check(s.cash - s.journeys.debt >= 100, 'winning cash threshold earned through trade');
  check(s.totalSatisfied >= 12, 'satisfied-guest threshold earned through service');
  eq(s.totalServed, s.reports.reduce((sum, r) => sum + r.served, 0));
  eq(s.reports.length, 3);
  eq(s.backstage.trips, 0, 'no expeditions were required');
  eq(s.journeys.history.length, 0, 'no commissions were required');
  eq(s.life.gifts, 0, 'no flower minigame was required');
  deny(s, { type: 'finish' });
  deny(s, { type: 'open' });
});

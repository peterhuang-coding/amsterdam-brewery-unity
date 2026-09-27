'use strict';
// Consequence-quality audit: every test drives real Reopening actions (no source
// edits, no forged state) and checks restore validity the way the live UI does.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const copy = x => JSON.parse(JSON.stringify(x));

function act(s, a) {
  const before = copy(s);
  const out = R.act(s, a);
  assert.equal(out.ok, true, out.message);
  assert.deepEqual(s, before);
  assert.ok(R.restore(out.state), 'restore after ' + a.type + ' ' + (a.choice || a.verb || ''));
  return out.state;
}
function reject(s, a) {
  const before = copy(s);
  const out = R.act(s, a);
  assert.equal(out.ok, false, 'expected reject: ' + a.type);
  assert.deepEqual(s, before);
  return s;
}
const untilStage = (s, stage) => {
  for (let i = 0; i < 4000 && s.journeys.run.stage !== stage; i++)
    s = act(s, { type: 'journeyAction', verb: 'tick', value: { seconds: .1 } });
  assert.equal(s.journeys.run.stage, stage);
  return s;
};
// Standard v4 delivery journey with a clean delivered outcome.
function delivery(s) {
  s = act(s, { type: 'journeyStart', kind: 'delivery' });
  s = act(s, { type: 'journeyAction', verb: 'pack', value: 'padding' });
  s = act(s, { type: 'journeyAction', verb: 'depart', value: 'smooth' });
  s = untilStage(s, 'arrival');
  s = act(s, { type: 'journeyAction', verb: 'cargo' });
  s = act(s, { type: 'journeyAction', verb: 'deliver', value: 'accept' });
  s = untilStage(s, 'receipt');
  return act(s, { type: 'journeyReturn' });
}
function brewStout(s) {
  s = act(s, { type: 'prepare', kind: 'brew', beer: 'stout' });
  for (let i = 0; i < 3; i++) s = act(s, { type: 'brewHit', score: 1 });
  return s;
}
function batchCups(s, id) { return s.batches.find(b => b.id === id).cups; }
// Serve one waiting guest from an explicitly acceptable batch at list price.
function pourGuest(s, o) {
  const batch = s.batches.find(b => b.beer === o.beer && R.trade.available(s, b, o.id) > 0);
  if (!batch) return act(s, { type: 'water', customerId: o.id });
  return act(s, { type: 'pour', customerId: o.id, beer: o.beer, price: R.BEERS[o.beer].price, batchId: batch.id });
}
function finishPours(s) {
  for (let k = 0; k < 8; k++) {
    const pour = s.night.pours[0];
    if (!pour) break;
    const p = R.pourProgress(s, pour);
    if (p >= .5 && p <= .9) s = act(s, { type: 'serve', customerId: pour.customerId });
    else s = act(s, { type: 'tick', seconds: 1 });
  }
  return s;
}
// Generic deterministic night: serve every arrival its requested beer at list
// price; resolve the pause event with the supplied choice. Returns after close.
function runNight(s, eventChoice, skip = null) {
  let guard = 0;
  while (s.phase === 'night' && guard++ < 4000) {
    if (s.night.event && s.night.event.status === 'pending') {
      s = act(s, { type: 'event', choice: eventChoice });
      continue;
    }
    const pour = s.night.pours[0];
    if (pour) {
      const p = R.pourProgress(s, pour);
      if (p >= .5 && p <= .9) { s = act(s, { type: 'serve', customerId: pour.customerId }); continue; }
    }
    const tapFull = s.night.pours.length >= (s.upgrades.includes('doubleTap') ? 2 : 1);
    const guest = !tapFull && R.customers(s).find(o =>
      !s.night.pours.some(p => p.customerId === o.id) && (!skip || !skip(o)));
    if (guest) { s = pourGuest(s, guest); continue; }
    s = act(s, { type: 'tick', seconds: .5 });
  }
  return s;
}
const waitFor = (s, predicate, ticks = 200, label = '') => {
  for (let i = 0; i < ticks && !predicate(s); i++) s = act(s, { type: 'tick', seconds: .5 });
  if (!predicate(s)) assert.fail('timeout waiting for ' + label + ' phase ' + s.phase +
    ' elapsed ' + (s.night ? s.night.elapsed : '-') + ' orders ' + (s.night
      ? s.night.orders.map(o => o.name + ':' + o.status + ':' + o.beer).join('|') : ''));
  return s;
};
const adminOf = s => R.customers(s).find(o => o.name === '排练室管理员');

test('city consequence quality', async t => {
  await t.test('low reserved stout batch stays restorable while the contract cup pours and settles once', () => {
    let s = act(R.createGame(42), { type: 'start' });
    s = brewStout(s);                       // q3 stout, 6 cups (hops start at 0)
    const B = s.batches.at(-1).id;
    s = delivery(s);                        // offered bridge-d1, due night 2
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'reserve', batchId: B });
    s = act(s, { type: 'open' });
    // Night 1: serve every generic guest; landlord gets the comped drink so the
    // maximum blond stock leaves, keeping the protected stout batch untouched.
    s = runNight(s, 'comp');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    assert.equal(batchCups(s, 'starter-stout'), 0);
    const bAfterN1 = batchCups(s, B);
    assert.ok(bAfterN1 >= 4, 'only Lotte pours from reserved batch on night 1');
    s = act(s, { type: 'next' });

    // Night 2: clear any non-stout guest, then wait for the influencer event.
    s = act(s, { type: 'open' });
    const g0 = R.customers(s)[0];
    if (g0) s = pourGuest(s, g0);
    s = finishPours(s);
    s = waitFor(s, x => x.night.event && x.night.event.status === 'pending', 200, 'event');
    // Samples may consume only unreserved cups; the reserved cup must survive.
    const reservedBefore = batchCups(s, B);
    assert.ok(s.batches.reduce((sum, b) => sum + R.trade.available(s, b), 0) >= 2);
    const cashBeforeSamples = s.cash;
    s = act(s, { type: 'event', choice: 'samples' });
    assert.equal(s.cash, cashBeforeSamples);
    assert.ok(batchCups(s, B) <= reservedBefore); // samples may use unreserved cups of B

    // One generic stout guest after the event drops the reserved batch to its
    // final pre-pour level; the administrator keeps waiting (patience 45).
    const genericStout = x => R.customers(x).find(o => o.beer === 'stout' && o.name !== '排练室管理员');
    s = waitFor(s, x => Boolean(genericStout(x)), 200, 'generic stout');
    const gs = genericStout(s);
    s = act(s, { type: 'pour', customerId: gs.id, beer: 'stout', price: 10, batchId: B });
    s = finishPours(s);

    // Administrator pours the last protected cup: reservation must clear BEFORE
    // the cup leaves the batch, so a save made mid-pour stays restorable.
    const admin = adminOf(s);
    assert.ok(admin);
    const cupsAtPour = batchCups(s, B);
    assert.ok(cupsAtPour >= 1 && cupsAtPour <= 2, 'reserved batch is at its last cup(s): ' + cupsAtPour);
    const contract = s.trade.contracts[0];
    const cashAtPour = s.cash;
    s = act(s, { type: 'pour', customerId: admin.id, beer: 'stout', price: 14, batchId: B });
    assert.equal(s.trade.contracts[0].reservedBatch, null, 'reference cleared at pour start');
    assert.equal(batchCups(s, B), cupsAtPour - 1);
    // Explicit mid-pour save round-trip: this is the unrestorable-state window.
    assert.ok(R.restore(copy(s)), 'mid-pour save must restore');
    assert.equal(R.trade.brief(s, contract).pouring, true);
    for (let i = 0; i < 3; i++) s = act(s, { type: 'tick', seconds: 1 });
    s = act(s, { type: 'serve', customerId: admin.id });
    assert.equal(s.trade.contracts[0].status, 'fulfilled');
    assert.equal(s.trade.contracts[0].settledDay, 2);
    // price 14 + kept-promise bonus 2 + q3 tips 2 + perfect timing 2 = 20, once.
    assert.equal(s.cash - cashAtPour, 20);
    if (s.phase === 'night') s = act(s, { type: 'close' });
    assert.equal(s.trade.contracts[0].status, 'fulfilled');
    assert.match(s.reports.at(-1).note, /已兑现/);
  });

  await t.test('a fulfilled contract can never settle a second time', () => {
    let s = act(R.createGame(7), { type: 'start' });
    s = brewStout(s);
    const B = s.batches.at(-1).id;
    s = delivery(s);
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'reserve', batchId: B });
    s = act(s, { type: 'open' });
    s = runNight(s, 'refuse');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    s = act(s, { type: 'next' });
    s = act(s, { type: 'open' });
    const ready = waitFor(s, x => Boolean(adminOf(x)), 200, 'admin'), o = adminOf(ready);
    s = act(ready, { type: 'pour', customerId: o.id, beer: 'stout', price: 14, batchId: B });
    for (let i = 0; i < 3; i++) s = act(s, { type: 'tick', seconds: 1 });
    const cash = s.cash;
    s = act(s, { type: 'serve', customerId: o.id });
    assert.equal(s.trade.contracts[0].status, 'fulfilled');
    const gain = s.cash - cash;
    reject(s, { type: 'serve', customerId: o.id });
    reject(s, { type: 'pour', customerId: o.id, beer: 'stout', price: 14 });
    reject(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'cancel' });
    reject(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    const earnedBeforeClose = s.night.earned;
    s = act(s, { type: 'close' });
    assert.equal(s.night.earned, earnedBeforeClose, 'closing the night grants no second reward');
    assert.equal(s.cash - cash, gain - (18 + s.night.rentAdjustment), 'only rent moves cash at close');
    assert.equal(s.trade.contracts[0].status, 'fulfilled');
  });

  await t.test('day-3 same-day delivery order fulfils that night and the ending restores', () => {
    let s = act(R.createGame(42), { type: 'start' });
    s = brewStout(s);
    const B = s.batches.at(-1).id;
    // Let nights 1-2 pass; at most one cup of B is needed on night 1 (starter
    // stout covers two guests) and three on night 2, so B keeps at least 2 cups.
    s = act(s, { type: 'open' });
    s = runNight(s, 'refuse');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    s = act(s, { type: 'next' });
    s = act(s, { type: 'open' });
    s = runNight(s, 'refuse');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    s = act(s, { type: 'next' });
    assert.equal(s.day, 3);
    assert.ok(batchCups(s, B) >= 1);
    s = delivery(s);
    assert.equal(s.trade.contracts[0].dueDay, 3);
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'reserve', batchId: B });
    s = act(s, { type: 'open' });
    const ready = waitFor(s, x => Boolean(adminOf(x)), 200, 'admin'), admin = adminOf(ready);
    s = act(ready, { type: 'pour', customerId: admin.id, beer: 'stout', price: 14, batchId: B });
    for (let i = 0; i < 3; i++) s = act(s, { type: 'tick', seconds: 1 });
    s = act(s, { type: 'serve', customerId: admin.id });
    assert.equal(s.trade.contracts[0].status, 'fulfilled');
    assert.equal(s.trade.contracts[0].settledDay, 3);
    s = act(s, { type: 'close' });
    s = act(s, { type: 'finish' });
    assert.equal(s.phase, 'ending');
    assert.ok(R.restore(copy(s)));
  });

  await t.test('prep cancel releases the reserved cup and no contract guest is ever attached', () => {
    let s = act(R.createGame(42), { type: 'start' });
    s = brewStout(s);
    const B = s.batches.at(-1).id, cupsBefore = batchCups(s, B);
    s = delivery(s);
    const cashAfterDelivery = s.cash;
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'reserve', batchId: B });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'cancel' });
    assert.equal(s.trade.contracts[0].status, 'cancelled');
    assert.equal(s.trade.contracts[0].reservedBatch, null);
    assert.equal(s.trade.contracts[0].customerId, null);
    assert.equal(batchCups(s, B), cupsBefore);
    assert.equal(s.cash, cashAfterDelivery, 'cancel is free');
    s = act(s, { type: 'open' });
    assert.equal(s.night.orders.some(o => o.name === '排练室管理员'), false);
    // Released cup is sellable to a generic guest: nothing was lost.
    s = runNight(s, 'refuse');
    if (s.phase === 'night') s = act(s, { type: 'close' });
  });

  await t.test('missed administrator marks the contract missed and releases the cup at night end', () => {
    let s = act(R.createGame(42), { type: 'start' });
    s = brewStout(s);
    const B = s.batches.at(-1).id;
    s = delivery(s);
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'accept' });
    s = act(s, { type: 'contract', id: s.trade.contracts[0].id, choice: 'reserve', batchId: B });
    s = act(s, { type: 'open' });
    s = runNight(s, 'refuse');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    s = act(s, { type: 'next' });
    s = act(s, { type: 'open' });
    // Never serve the administrator; run the whole night and close it out.
    const dueDay = s.day;
    s = runNight(s, 'refuse', o => o.name === '排练室管理员');
    if (s.phase === 'night') s = act(s, { type: 'close' });
    const c = s.trade.contracts[0];
    assert.equal(c.status, 'missed');
    assert.equal(c.settledDay, dueDay);
    assert.equal(c.reservedBatch, null);
    assert.match(s.reports.at(-1).note, /未兑现/);
  });
});
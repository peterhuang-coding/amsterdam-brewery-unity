'use strict';
// Daytime obligation summary: Lotte's promise and the supply contract must
// share the same real stout stock, with the reserved cup visible before opening.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const City = require('./reopening-city.js');
const { harness } = require('./district-ui-test-fixture.cjs');

function act(state, action) {
  const result = R.act(state, action);
  assert.ok(result.ok, result.message || JSON.stringify(action));
  assert.ok(R.restore(result.state), 'reachable state stays restorable');
  return result.state;
}
function journey(state, verb, value) { return act(state, { type: 'journeyAction', verb, value }); }
function until(state, condition) {
  for (let i = 0; i < 2000 && !condition(state); i++) state = journey(state, 'tick', { seconds: .1 });
  assert.ok(condition(state));
  return state;
}
function deliver(state) {
  state = act(state, { type: 'journeyStart', kind: 'delivery' });
  state = journey(state, 'pack', 'padding');
  state = journey(state, 'depart', 'smooth');
  state = until(state, s => s.journeys.run.stage === 'arrival');
  state = journey(state, 'cargo');
  state = journey(state, 'deliver', 'accept');
  state = until(state, s => s.journeys.run.stage === 'receipt');
  return act(state, { type: 'journeyReturn' });
}
function dayTwoWithContractAndPromise() {
  let state = act(R.createGame(42), { type: 'start' });
  state = deliver(state);
  const contract = state.trade.contracts.at(-1);
  state = act(state, { type: 'contract', id: contract.id, choice: 'accept' });
  state = act(state, { type: 'open' });
  state = act(state, { type: 'close' });
  state = act(state, { type: 'next' });
  state = act(state, { type: 'prepare', kind: 'visit' });
  assert.equal(state.phase, 'prep');
  assert.equal(state.day, 2);
  assert.equal(state.promises.lotte, true);
  assert.equal(state.trade.contracts[0].status, 'accepted');
  assert.equal(state.trade.contracts[0].dueDay, 2);
  return state;
}
function board(state) { return harness({ version: 1, game: state, city: City.create(), tutorialSeen: true, sound: false }); }

test('the daytime street view reconciles Lotte and the supply order against real stout stock', async () => {
  let state = dayTwoWithContractAndPromise();
  const h = await board(state);
  assert.match(h.board(), /今晚的酒去了哪里/);
  assert.match(h.board(), /Lotte 留酒 1 杯/);
  assert.match(h.board(), /供酒单 1 杯 · 品质≥2/);
  assert.match(h.board(), /现有黑啤 2 杯/);
  assert.match(h.board(), /供酒单没有达标黑啤/);
  assert.match(h.board(), /市场品质 1 现货不满足/);
  h.close();

  state = act(state, { type: 'prepare', kind: 'brew', beer: 'stout' });
  for (let i = 0; i < 3; i++) state = act(state, { type: 'brewHit', score: 1 });
  const brewed = await board(state);
  assert.match(brewed.board(), /现有黑啤 8 杯/);
  assert.match(brewed.board(), /其中达标 6 杯/);
  assert.match(brewed.board(), /够今晚两件事/);
  assert.match(brewed.board(), /散客还剩 6 杯黑啤可用/);
  brewed.close();

  const contract = state.trade.contracts[0];
  const batch = state.batches.at(-1);
  state = act(state, { type: 'contract', id: contract.id, choice: 'reserve', batchId: batch.id });
  const reserved = await board(state);
  assert.match(reserved.board(), /供酒单 1 杯 · 品质≥2 · 已预留/);
  assert.match(reserved.board(), /散客还剩 6 杯黑啤可用/);
  reserved.close();
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const B = require('./backstage-core.js');
const A = require('./backstage-auto.js');

const clone = value => JSON.parse(JSON.stringify(value));

function act(state, action) {
  const before = clone(state);
  const out = R.act(state, action);
  assert.ok(out.ok, out.message || String(action && action.type));
  assert.deepEqual(state, before, 'R.act must not mutate its input');
  return out.state;
}

function closeShortcut(state) {
  return act(act(state, { type: 'open' }), { type: 'close' });
}

function settleNight(state) {
  let s = act(state, { type: 'open' });
  for (let n = 0; n < 4000 && s.phase === 'night'; n++) {
    if (s.night && s.night.event && s.night.event.status === 'pending') {
      const id = R.NIGHT_EVENTS[s.night.event.id].choices[0].id;
      s = act(s, { type: 'event', choice: id });
    }
    s = act(s, { type: 'tick', seconds: 1 });
  }
  assert.equal(s.phase, 'summary');
  return s;
}

function advance(run) {
  for (let n = 0; n < 8000 && run.status === 'active' && !run.auto.event; n++) {
    A.step(run, 0.05);
  }
  assert.notEqual(run.auto.event, 'stuck', JSON.stringify({ goal: run.auto.goal, p: run.p, time: run.time }));
  return run;
}

function choose(run, id) {
  assert.equal(A.choose(run, id), true, 'available choice ' + id);
  advance(run);
  if (run.auto.event === 'glimpse') {
    assert.equal(A.choose(run, 'continue'), true);
    advance(run);
  }
  return run;
}

function autoExplore(state) {
  let s = act(state, { type: 'explore', kit: 'hook', mode: 'auto' });
  assert.equal(s.phase, 'explore');

  const run = s.backstage.run;
  assert.equal(A.valid(run), true);
  advance(run);

  choose(run, 'sorting');
  choose(run, 'sorting-take');
  choose(run, 'garden');
  if (run.auto.event === 'gate') choose(run, 'open-hook');
  assert.equal(run.auto.event, 'garden');
  if (A.view(run).choices.some(choice => choice.id === 'garden-repair')) {
    choose(run, 'garden-repair');
  }
  assert.equal(run.district.repaired, true, 'pump repair persists before extraction');
  choose(run, 'exit');
  assert.equal(run.status, 'extracted');

  const completed = clone(run);
  assert.deepEqual(B.restore(clone(run)), completed, 'completed backstage run must JSON roundtrip');

  s = R.restore(clone({ ...s, backstage: { ...s.backstage, run: clone(run) } }));
  assert.ok(s);
  assert.deepEqual(s.backstage.run, completed, 'R.restore must return an equal completed run');
  assert.notEqual(s.backstage.run, run);

  return act(s, { type: 'returnExplore' });
}

test('start/open/close, choice-pause roundtrip, replay, settlement, and reports', () => {
  let s = act(R.createGame('save-seed'), { type: 'start' });
  assert.equal(s.phase, 'prep');
  assert.equal(R.act(s, { type: 'start' }).ok, false);

  s = settleNight(s);
  assert.equal(s.reports.length, 1);
  const report = clone(s.reports[0]);
  assert.equal(R.act(s, { type: 'close' }).ok, false);

  const paused = clone(s);
  s = act(s, { type: 'explore', kit: 'hook', mode: 'manual' });
  const run = s.backstage.run;
  A.enable(run);
  advance(run);
  assert.ok(run.auto.event);

  const pausedRun = clone(run);
  const json = clone(s);
  const restored = R.restore(json);
  assert.ok(restored);
  assert.deepEqual(restored.backstage.run, pausedRun);
  assert.notEqual(restored.backstage.run, json.backstage.run);
  assert.equal(A.valid(restored.backstage.run), true);

  choose(restored.backstage.run, 'exit');
  assert.equal(restored.backstage.run.status, 'extracted');

  const direct = B.restore(pausedRun);
  assert.ok(direct.auto.event);
  choose(direct, 'exit');
  assert.equal(direct.status, 'extracted');

  assert.deepEqual(restored.backstage.run, direct, 'choice-pause continuation must survive JSON');

  s = act(restored, { type: 'returnExplore' });
  assert.equal(s.backstage.trips, 1);
  assert.equal(R.act(s, { type: 'returnExplore' }).ok, false);
  assert.deepEqual(s.reports[0], report, 'reports must remain unchanged by real exploration settlement');
  assert.deepEqual(clone(s).reports, s.reports);

  const afterPausedRoute = clone(s);
  const replayed = R.restore(clone(paused));
  assert.ok(replayed);
  assert.deepEqual(R.restore(clone(afterPausedRoute)), afterPausedRoute);
});

test('midtravel save continues identically in the original and restored runs', () => {
  let s = closeShortcut(act(R.createGame(314), { type: 'start' }));
  s = act(s, { type: 'explore', kit: 'hook', mode: 'auto' });

  const run = s.backstage.run;
  advance(run);
  assert.ok(A.choose(run, 'sorting'));
  A.step(run, .1);
  assert.equal(run.auto.goal, 'sorting');
  assert.equal(run.auto.event, null);
  assert.equal(run.status, 'active');

  const snapshot = clone(run);
  const restoredRun = B.restore(clone(run));
  assert.ok(restoredRun);
  assert.equal(A.valid(restoredRun), true);

  for (let i = 0; i < 25 && run.status === 'active'; i++) A.step(run, 0.05);
  for (let i = 0; i < 25 && restoredRun.status === 'active'; i++) A.step(restoredRun, 0.05);
  assert.deepEqual(clone(restoredRun), clone(run), 'JSON continuation must match (JSON normalizes signed zero)');
  assert.deepEqual(clone(run), B.restore(clone(restoredRun)));

  const restoredState = R.restore(clone({ ...s, backstage: { ...s.backstage, run: clone(restoredRun) } }));
  assert.ok(restoredState);
  assert.deepEqual(restoredState.backstage.run, clone(run));

  const finish = clone(run);
  assert.deepEqual(B.restore(clone(finish)), finish);
});

test('three-day automatic route collects a real sorting spare then permanently repairs garden', () => {
  let s = act(R.createGame(77), { type: 'start' });

  for (let day = 1; day <= 3; day++) {
    s = settleNight(s);
    s = autoExplore(s);

    const entry = s.backstage.journal.at(-1);
    assert.equal(entry.day, day);
    assert.ok(entry.visited.includes('sorting'));
    assert.ok(entry.visited.includes('greenhouse'));
    assert.equal(entry.status, 'extracted');

    if (day < 3) {
      s = act(s, { type: 'next' });
      assert.equal(s.day, day + 1);
    }
  }

  assert.equal(s.backstage.journal.length, 3);
  assert.ok(s.backstage.discovered.includes('greenhouse-pump'));
  assert.ok(s.backstage.journal.some(entry => entry.outcomes.includes('greenhouse-repaired')));

  assert.equal(R.act(s, {type:'explore', kit:'hook'}).ok, false, 'no fourth expedition');
  assert.ok(R.restore(s));
});

test('legitimate capacity, expiration rescue, exit extraction, and malformed nested saves fail without mutation', () => {
  const capacity = B.create(42, 1, 'hook');
  A.enable(capacity);
  capacity.bag = ['item0', 'item1', 'item2', 'item3'];
  for (const id of capacity.bag) capacity.items.find(item => item.id === id).state = 'bag';
  capacity.auto.event = 'capacity';
  capacity.auto.goal = null;

  const capChoices = A.view(capacity).choices.filter(choice => choice.id.startsWith('drop-'));
  assert.ok(capChoices.length >= 2);
  assert.equal(A.choose(capacity, capChoices[0].id), true);
  assert.equal(capacity.bag.length, 3);
  assert.ok(B.restore(capacity));

  const rescue = B.create(42, 1, 'hook');
  rescue.time = rescue.duration - .05;
  B.step(rescue, {}, .1);
  assert.equal(rescue.status, 'rescued');

  const exitRun = B.create(42, 1, 'hook');
  A.enable(exitRun);
  advance(exitRun);
  choose(exitRun, 'exit');
  assert.equal(exitRun.status, 'extracted');

  let s = settleNight(act(R.createGame(42), { type: 'start' }));
  s = act(s, { type: 'explore', kit: 'hook', mode: 'auto' });
  const good = clone(s);

  const malformedRun = clone(s.backstage.run);
  malformedRun.bag = ['not-an-item'];
  const badRun = clone(s);
  badRun.backstage.run = malformedRun;
  assert.equal(R.restore(badRun), null);
  assert.deepEqual(badRun.backstage.run, malformedRun);
  assert.deepEqual(s, good);

  const badJournal = clone(s);
  assert.equal(B.command(badJournal.backstage.run, 'bail'), true);
  let closed = R.act(badJournal, { type: 'returnExplore' }).state;
  const originalJournal = clone(closed.backstage.journal);

  closed.backstage.journal[0].cash = 999999;
  closed.backstage.journal[0].visited = ['market', 'market'];
  assert.equal(R.restore(closed), null);
  assert.deepEqual(closed.backstage.journal[0].visited, ['market', 'market']);
  assert.equal(R.restore(clone(closed)), null);

  const repairedRun = B.restore(clone(good.backstage.run));
  assert.ok(repairedRun);
  const goodWithRestoredRun = clone({ ...good, backstage: { ...good.backstage, run: repairedRun } });
  assert.ok(R.restore(goodWithRestoredRun));
  assert.deepEqual(originalJournal.length, 1);
});
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./backstage-core.js');
const A = require('./backstage-auto.js');
const R = require('./reopening-core.js');

const dir = path.join(__dirname, 'fixtures', 'algorithms');
const files = ['v1.json', 'v2.json', 'v3.json'];
const clone = v => JSON.parse(JSON.stringify(v));
const load = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const snapshot = v => JSON.stringify(v);

function publicRun(r) {
  const keep = [
    'version', 'seed', 'day', 'kit', 'time', 'duration', 'status',
    'p', 'items', 'actors', 'bag', 'discovered', 'opened', 'parcel',
    'patches', 'fx', 'sequence', 'log', 'message', 'hits', 'auto',
    'street', 'location', 'district'
  ];
  return Object.fromEntries(keep.filter(k => k in r).map(k => [k, clone(r[k])]));
}

test('historical algorithm fixtures restore and continue deterministically', () => {
  for (const file of files) {
    const fx = load(file);
    const originalText = snapshot(fx);

    assert.equal(fx.game.seed, 42, `${file}: seed`);
    assert.equal(fx.game.day, 1, `${file}: day`);
    assert.ok(fx.game.backstage, `${file}: backstage save`);

    const savedRun = clone(fx.game.backstage.run);
    const restoredGame = R.restore(fx.game);
    assert.ok(restoredGame);
    const run = restoredGame.backstage.run;
    assert.ok(run, `${file}: restore accepts historical run`);

    if (file === 'v1.json') {
      assert.equal(run.version, 2, `${file}: legacy run migrates to restorable version`);
      assert.deepEqual(run.street, {
        situation: 'legacy',
        baits: 3,
        lureCooldown: 0,
        noise: null,
        barrels: [],
        dragging: null
      }, `${file}: legacy street is migrated`);
    } else {
      assert.equal(run.version, savedRun.version, `${file}: version retained`);
      assert.deepEqual(run.street, clone(savedRun.street), `${file}: actual street retained`);
    }

    const game = R.restore(clone(fx.game));
    assert.ok(game, `${file}: R.restore accepts fixture game`);

    const fromPrep = game.backstage.from === 'prep';
    const fromSummary = game.backstage.from === 'summary';
    if (file === 'v1.json') {
      assert.equal(fromPrep, true, `${file}: v1 original run starts from prep`);
      assert.equal(fromSummary, false, `${file}: v1 is not a summary continuation`);
    } else {
      assert.equal(fromSummary, true, `${file}: v2/v3 original run starts from summary`);
      assert.equal(fromPrep, false, `${file}: v2/v3 is not a prep continuation`);
    }

    assert.equal(A.valid(run), true, `${file}: restored auto state validates`);

    // The saved fixture is already ten steps into the chosen market trip.
    assert.ok(run.auto.enabled, `${file}: auto is enabled`);
    assert.equal(run.auto.event, null, `${file}: fixture is mid-travel`);
    assert.equal(run.auto.goal, 'market', `${file}: fixture is travelling to market`);
    for (let i = 0; i < fx.continuation.steps; i++) {
      A.step(run, fx.continuation.dt);
    }

    const expected = B.restore(clone(fx.expectedRun));
    assert.ok(expected, `${file}: expected run restores`);
    assert.deepEqual(publicRun(run), publicRun(expected), `${file}: only continuation steps reproduce expected run`);
    assert.equal(A.valid(run), true, `${file}: continued auto state validates`);

    assert.equal(snapshot(fx), originalText, `${file}: fixture remains immutable`);
  }
});

test('active market travel reaches the market event, exit advances, and return settles once', () => {
  for (const file of files) {
    const fx = load(file);
    const originalText = snapshot(fx);

    const game = R.restore(clone(fx.game));
    assert.ok(game, `${file}: R.restore accepts fixture game`);
    const run = game.backstage.run;

    assert.ok(run.auto.enabled, `${file}: auto enabled`);
    assert.equal(run.auto.event, null, `${file}: no prompt before continuation`);
    assert.equal(run.auto.goal, 'market', `${file}: active goal is market`);

    let event = null;
    for (let i = 0; i < 2000 && run.status === 'active'; i++) {
      A.step(run, 0.05);
      if (run.auto.event) {
        event = run.auto.event;
        break;
      }
    }
    assert.equal(event, 'market', `${file}: active travel reaches market event`);

    const prompt = A.view(run);
    assert.ok(prompt?.choices.some(c => c.id === 'exit'), `${file}: exit choice is offered at market event`);
    assert.equal(A.choose(run, 'exit'), true, `${file}: exit is selected`);
    assert.equal(run.auto.goal, 'exit', `${file}: auto heads for exit`);
    assert.equal(run.auto.event, null, `${file}: market prompt clears`);

    for (let i = 0; i < 2000 && run.status === 'active'; i++) {
      A.step(run, 0.05);
    }
    assert.notEqual(run.status, 'active', `${file}: run reaches terminal state at exit`);

    const before = R.restore(clone(game));
    assert.ok(before, `${file}: terminal game restores before settlement`);
    const cashBefore = before.cash;
    const actionsBefore = before.actions;
    const batchesBefore = snapshot(before.batches);
    const tripsBefore = before.backstage.trips;
    const runBeforeReturn = snapshot(before.backstage.run);

    const result = R.act(before, { type: 'returnExplore' });
    assert.equal(result.ok, true, `${file}: returnExplore settles terminal exploration`);

    const reward = B.rewards(run), after = result.state;
    assert.equal(after.cash, cashBefore + reward.cash, `${file}: cash settled once`);
    assert.equal(after.actions, actionsBefore);
    assert.equal(after.backstage.trips, tripsBefore + 1);
    assert.equal(after.phase, before.backstage.from);
    assert.equal(after.backstage.run, null);
    assert.equal(after.backstage.from, null);
    assert.equal(snapshot(before.backstage.run), runBeforeReturn, 'input run unchanged');
    assert.equal(snapshot(before.batches), batchesBefore, 'input batches unchanged');
    const added = after.batches.slice(before.batches.length);
    assert.equal(added.reduce((n,b)=>n+b.cups,0), reward.cups);
    const settled = snapshot(after);
    assert.equal(R.act(after,{type:'returnExplore'}).ok, false);
    assert.equal(snapshot(after), settled, 'repeated settlement is inert');
    assert.ok(R.restore(after));

    assert.equal(snapshot(fx), originalText, `${file}: fixture remains immutable`);
  }
});

test('restore rejects malformed nested historical auto and player data', () => {
  const fx = load('v2.json');
  const variants = [
    r => { r.p = null; },
    r => { r.auto.speed = 3; },
    r => { r.items[0].state='bag'; r.bag=['item0','item0']; }
  ];

  for (const [n, mutate] of variants.entries()) {
    const malformed = clone(fx.game.backstage.run);
    mutate(malformed);


    const game = clone(fx.game);
    game.backstage.run = malformed;
    assert.equal(R.restore(game), null, `R.restore rejects malformed variant ${n}`);
  }

  // An ordinary world item moved into a bag, with bag references kept consistent,
  // is legal inventory state rather than a malformed fixture.
  const legal = clone(fx.game.backstage.run);
  const looseItem = legal.items.find(i => i.state === 'world' && B.TYPES[i.kind].weight + B.load(legal) <= B.KITS[legal.kit].capacity);
  assert.ok(looseItem, 'test fixture has a light loose item');
  looseItem.state = 'bag';
  legal.bag.push(looseItem.id);

  assert.ok(B.restore(legal), 'consistent bag reference restores');
  assert.equal(A.valid(legal), true, 'consistent bag reference validates');

  const legalGame = clone(fx.game);
  legalGame.backstage.run = legal;
  assert.ok(R.restore(legalGame), 'R.restore accepts a legal bagged item');
});
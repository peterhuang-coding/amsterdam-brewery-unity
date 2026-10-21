'use strict';
// PLAY10 night loadout: real-module VM harness tests for the after-hours
// tool-choice modal. Every test executes the real reopening-ui module against
// states built with genuine R.act actions (start/open/close/next/explore/
// returnExplore) — there are no source-substring searches and no forged runs.
// Lifecycle states restored via harness() are real R.act states fed through the
// real localStorage restore path; they are technical fixtures, NOT natural
// playthrough saves. Browser-native details toggling and the 390px layout are
// parent GUI gates: this VM proves rendered markup, real callbacks and the real
// keyboard branch, not the browser's native <details> behaviour.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const City = require('./reopening-city.js');
const Backstage = require('./backstage-core.js');

const noop = () => {};
function act(s, a) {
  const r = R.act(s, a);
  assert.ok(r.ok, (r.message || '') + ' :: ' + JSON.stringify(a));
  assert.ok(R.restore(r.state), 'result stays a valid save after ' + a.type);
  return r.state;
}

// ---------------------------------------------------------------------------
// Full UI VM harness (same sandbox module chain as test-first-street-ui.js),
// extended with a real focus model for the overlay dialog: the summary element
// and parsed modal buttons participate in the document keydown focus trap.
// ---------------------------------------------------------------------------
const { harness } = require('./district-ui-test-fixture.cjs');

// Drives the real UI to after-hours on night 1 with genuine clicks only:
// start -> enter pub -> open (real confirm) -> early close (real confirm).
async function nightLoadout() {
  const h = await harness(null);
  await h.click({ action: 'start' });
  await h.click({ action: 'city-enter' });
  await h.click({ action: 'open' });
  await h.clickModal(1); // confirm opening despite remaining preparations
  assert.equal(h.save().game.phase, 'night');
  await h.click({ action: 'close-night' });
  await h.clickModal(1); // confirm early close via the real 'close' action
  assert.equal(h.save().game.phase, 'summary', 'real night settles into after-hours');
  h.setActive(h.launcher);
  await h.click({ action: 'expedition-launch' });
  assert.equal(h.overlay().hidden, false, 'launcher opens the loadout choice');
  return h;
}

// Technical fixture (NOT a natural save): real R.act lifecycle through whole
// days, returned at the after-hours summary of the requested night.
function summaryAt(day, seed = 42) {
  let s = act(R.createGame(seed), { type: 'start' });
  for (let d = 1; d <= day; d++) {
    s = act(s, { type: 'open' });
    s = act(s, { type: 'close' });
    if (d < day) s = act(s, { type: 'next' });
  }
  assert.equal(s.phase, 'summary');
  assert.equal(s.day, day);
  return s;
}

// ===========================================================================
// 1. Concise visible essentials, tonight title, closed native disclosure with
//    every old road/place fact, and verbatim KITS cards.
// ===========================================================================
test('loadout dialog shows short essentials, tonight title, closed details with full facts and verbatim kit cards', async () => {
  const h = await nightLoadout();
  assert.equal(h.kicker(), '出门前 · 工具免费借用');
  assert.equal(h.dialogTitle(), '今晚带哪一套？');
  const body = h.dialogBody();

  // Tonight's real street title stays visible; the disclosure starts closed.
  const street = Backstage.streetInfo(Backstage.create(42, 1));
  assert.match(body, new RegExp('今晚 · ' + street.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(body, /<details>/);
  assert.doesNotMatch(body, /<details[^>]*\sopen/);
  const summaryMatch = body.match(/<summary>([^<]+)<\/summary>/);
  assert.ok(summaryMatch, 'native summary names the optional detail');
  assert.match(summaryMatch[1], /路线/);
  assert.match(summaryMatch[1], /地点/);

  // Essentials (everything outside the disclosure except the tonight title)
  // stay at or under 100 Chinese characters and name every essential fact.
  const outside = body
    .replace(/<details>[\s\S]*?<\/details>/, '')
    .replace(/<p><b>今晚[\s\S]*?<\/b><\/p>/, '');
  const hanzi = (outside.replace(/<[^>]+>/g, '').match(/[一-鿿]/g) || []).length;
  assert.ok(hanzi <= 100, 'essentials fit in 100 hanzi, got ' + hanzi);
  for (const token of ['免费', '每夜', '180', '暂停', '自动', '2×', '手动', '出口', '瞬移']) {
    assert.ok(outside.includes(token), 'visible essential missing: ' + token);
  }

  // The closed disclosure preserves the complete original factual meaning.
  const detail = body.match(/<details>[\s\S]*?<\/details>/)[0];
  assert.ok(detail.includes(street.description), 'real street description moved into detail');
  assert.ok(detail.includes(street.hint), 'real street hint moved into detail');
  for (const token of ['货架', '冷库', '卸货捷径', '六秒鼓点', '停带', '反转', '钩货',
    '关阀', '修', '干路', '3 只空瓶', '引声', '拖', '自动探索',
    'NO SIGNAL', 'Noor', '进口酵母', '2× 播放', '手动操作', '时间暂停', '3 分钟', '出口']) {
    assert.ok(detail.includes(token), 'optional fact missing: ' + token);
  }

  // Three real kit cards verbatim, in KITS order, then the secondary stay.
  const acts = h.dialogActions();
  const tags = [...acts.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.equal(tags.length, 4, 'three tools plus stay');
  const kitIds = Object.keys(Backstage.KITS);
  kitIds.forEach((id, i) => {
    const k = Backstage.KITS[id];
    assert.ok(acts.includes(k.name), 'verbatim kit name: ' + id);
    assert.ok(acts.includes(k.detail), 'verbatim kit detail: ' + id);
    assert.ok(!/class="secondary"/.test(tags[i][1]), id + ' is a primary tool choice');
    const nameAt = acts.indexOf(k.name), prev = i === 0 ? -1 : acts.indexOf(Backstage.KITS[kitIds[i - 1]].name);
    assert.ok(nameAt > prev, 'KITS order preserved at ' + id);
  });
  assert.match(tags[3][1], /class="secondary"/);
  assert.match(tags[3][2], /先留在酒馆/);

  // First actual tool keeps initial focus; the summary precedes it in the trap.
  const ctrls = h.controls();
  assert.equal(ctrls[0].tag, 'summary');
  assert.equal(h.active(), ctrls[1], 'first tool (hook) is the initial focus');
  assert.equal(ctrls[1].label, Backstage.KITS.hook.name);
});

// ===========================================================================
// 2. Each of the three real buttons launches the actual explore action with
//    the real kit/capacity, auto mode and timing — no tool fact changes.
// ===========================================================================
test('each kit button starts a real explore run with its actual kit, capacity, auto mode and 180s', async () => {
  const expected = { hook: 8, cart: 12, foam: 7 };
  for (const [i, [id, kit]] of Object.entries(Backstage.KITS).entries()) {
    const h = await nightLoadout();
    const before = h.save().game;
    await h.clickModal(i);
    const g = h.save().game;
    assert.equal(g.phase, 'explore', id + ' really leaves after-hours');
    assert.deepEqual(g.prepared, ['explore']);
    assert.equal(g.backstage.run.kit, id);
    assert.equal(Backstage.KITS[g.backstage.run.kit].capacity, expected[id]);
    assert.equal(Backstage.KITS[g.backstage.run.kit].detail, kit.detail);
    assert.equal(g.backstage.run.duration, 180, 'actual action time stays 180 seconds');
    assert.equal(g.backstage.run.seed, g.seed);
    assert.equal(g.backstage.run.day, g.day);
    assert.equal(g.backstage.run.auto.enabled, true, 'default launch is the real auto mode');
    assert.equal(g.cash, before.cash, 'tools remain free');
    assert.ok(R.restore(g), 'launched run is a valid save');
  }
});

// ===========================================================================
// 3. Stay and Escape cancel without launching or touching resources, restore
//    launcher focus, and the dialog can reopen and then really launch.
// ===========================================================================
test('stay and Escape cancel the loadout with no trip/resource change, restore focus, and reopen still launches', async () => {
  let h = await nightLoadout();
  const snapshot = JSON.stringify(h.save().game);

  await h.clickModal(3); // 先留在酒馆
  assert.equal(h.overlay().hidden, true);
  assert.equal(JSON.stringify(h.save().game), snapshot, 'stay changes no game state');
  assert.equal(h.active(), h.launcher, 'stay restores launcher focus');

  await h.click({ action: 'expedition-launch' });
  assert.equal(h.overlay().hidden, false);
  h.key('Escape');
  assert.equal(h.overlay().hidden, true, 'Escape closes the loadout');
  assert.equal(h.save().game.phase, 'summary', 'Escape never launches the first tool');
  assert.deepEqual(h.save().game.prepared, []);
  assert.equal(h.save().game.backstage.run, null);
  assert.equal(JSON.stringify(h.save().game), snapshot, 'Escape changes no game state');
  assert.equal(h.active(), h.launcher, 'Escape restores launcher focus');

  // Reopen after cancelling: the real kit still launches with real capacity.
  await h.click({ action: 'expedition-launch' });
  await h.clickModal(1); // cart
  const g = h.save().game;
  assert.equal(g.phase, 'explore');
  assert.equal(g.backstage.run.kit, 'cart');
  assert.equal(Backstage.KITS[g.backstage.run.kit].capacity, 12);
  assert.equal(g.backstage.run.auto.enabled, true);
});

// ===========================================================================
// 4. Keyboard: native summary joins the trap; Tab/ShiftTab never leave the
//    dialog; Enter/Space on the summary are not intercepted or rebuilt on.
// ===========================================================================
test('loadout focus trap cycles summary, three tools and stay; Enter/Space on summary stay native', async () => {
  const h = await nightLoadout();
  const ctrls = h.controls();
  assert.deepEqual(ctrls.map(c => c.tag === 'summary' ? 'summary' : c.label),
    ['summary', Backstage.KITS.hook.name, Backstage.KITS.cart.name, Backstage.KITS.foam.name, '先留在酒馆']);
  assert.equal(h.active(), ctrls[1], 'first tool is focused first, so Shift+Tab reaches the summary');

  // Enter/Space on summary: no preventDefault (native toggle), no rebuild,
  // no launch, focus retained on the summary.
  h.setActive(ctrls[0]);
  const bodyBefore = h.dialogBody();
  for (const k of ['Enter', ' ']) {
    const ev = h.key(k);
    assert.equal(ev.defaultPrevented, undefined, k + ' stays native on summary');
    assert.equal(h.overlay().hidden, false);
    assert.equal(h.save().game.phase, 'summary');
    assert.equal(h.dialogBody(), bodyBefore, 'no JS rebuild on native toggle');
    assert.equal(h.active(), ctrls[0]);
  }

  // Full backward cycle: JS wraps only at the summary; middle moves are the
  // browser's native order; focus never escapes to BODY.
  h.setActive(ctrls[1]); // hook: Shift+Tab moves natively to summary
  let ev = h.key('Tab', true);
  assert.equal(ev.defaultPrevented, undefined);
  assert.equal(h.active(), ctrls[1]);
  h.nativeMove(true);
  assert.equal(h.active(), ctrls[0]);
  ev = h.key('Tab', true); // summary -> wrap to stay
  assert.equal(ev.defaultPrevented, true);
  assert.equal(h.active(), ctrls[4]);

  // Full forward cycle with native moves between; only the last->first wrap
  // is handled by JS, and it lands on the summary.
  for (let i = 0; i < ctrls.length; i++) {
    assert.ok(ctrls.includes(h.active()), 'focus stays inside the dialog');
    const atLast = h.active() === ctrls[ctrls.length - 1];
    ev = h.key('Tab');
    if (atLast) {
      assert.equal(ev.defaultPrevented, true);
      assert.equal(h.active(), ctrls[0]);
    } else {
      assert.equal(ev.defaultPrevented, undefined);
      h.nativeMove(false);
    }
  }
});

// ===========================================================================
// 5. Nights 2 and 3 render that night's real street title/description/hint.
//    (Real R.act lifecycle fixture, explicitly not a natural playthrough.)
// ===========================================================================
test('day 2 and day 3 loadouts show the real current-night street title, description and hint', async () => {
  for (const day of [1, 2, 3]) {
    const game = summaryAt(day);
    const h = await harness({ version: 1, game, city: City.create(), sound: true });
    h.setActive(h.launcher);
    await h.click({ action: 'expedition-launch' });
    assert.equal(h.overlay().hidden, false, 'day ' + day + ' choice opens');
    const body = h.dialogBody();
    const street = Backstage.streetInfo(Backstage.create(game.seed, day));
    assert.ok(body.includes('今晚 · ' + street.title), 'day ' + day + ' title');
    const detail = body.match(/<details>[\s\S]*?<\/details>/)[0];
    assert.ok(detail.includes(street.description), 'day ' + day + ' description');
    assert.ok(detail.includes(street.hint), 'day ' + day + ' hint');
  }
});

// ===========================================================================
// 6. Guards: no modal when already out tonight, and no modal outside summary.
//    (Used-run state is reached with real explore/bail/returnExplore actions.)
// ===========================================================================
test('used-run and non-summary guards never open the choice', async () => {
  // Technical fixture: real launch, real bail command, real return.
  let s = summaryAt(1);
  s = act(s, { type: 'explore', kit: 'hook' });
  assert.equal(Backstage.command(s.backstage.run, 'bail'), true);
  s = act(s, { type: 'returnExplore' });
  assert.equal(s.phase, 'summary');
  assert.deepEqual(s.prepared, ['explore']);
  const h = await harness({ version: 1, game: s, city: City.create(), sound: true });
  assert.match(h.board(), /data-action="expedition-launch"[^>]*\bdisabled\b/, 'launcher is disabled after a trip');
  // Even a synthetic non-dispatched click is stopped by the chooseExpedition guard.
  await h.click({ action: 'expedition-launch' }, false);
  assert.equal(h.overlay().hidden, true, 'no second trip modal tonight');

  // Not in after-hours: guard returns before building any dialog.
  const h2 = await harness(null);
  await h2.click({ action: 'start' });
  await h2.click({ action: 'expedition-launch' });
  assert.equal(h2.overlay().hidden, true, 'no loadout during daytime prep');
});

// ===========================================================================
// 7. Other dialog kinds keep their existing Escape semantics: pause resumes,
//    a normal confirm Escape only cancels, and event Escape stays open.
// ===========================================================================
test('pause and normal-confirm Escape keep old behaviour; event Escape still does not close', async () => {
  // Real natural night 1 through the real open confirm.
  const h = await harness(null);
  await h.click({ action: 'start' });
  await h.click({ action: 'city-enter' });
  await h.click({ action: 'open' });
  await h.clickModal(1);
  assert.equal(h.save().game.phase, 'night');

  // Pause (kind normal): Escape resumes play.
  h.key('p');
  assert.equal(h.overlay().hidden, false);
  assert.match(h.kicker(), /PAUSED/);
  h.key('Escape');
  assert.equal(h.overlay().hidden, true, 'pause Escape resumes');
  assert.equal(h.save().game.phase, 'night');

  // Early-close confirm: Escape dismisses the question, never closes the pub.
  await h.click({ action: 'close-night' });
  assert.equal(h.overlay().hidden, false);
  h.key('Escape');
  assert.equal(h.overlay().hidden, true);
  assert.equal(h.save().game.phase, 'night', 'confirm Escape is not a confirm');

  // Technical fixture: a genuinely pending UNINVITED night event (real tick).
  let s = act(act(R.createGame(42), { type: 'start' }), { type: 'open' });
  for (let t = 0; t < 35; t++) s = act(s, { type: 'tick', seconds: 1 }); // real 1s ticks; the UNINVITED event pauses at 35s
  assert.equal(s.night.event.status, 'pending');
  const h2 = await harness({ version: 1, game: s, city: City.create(), tutorialSeen: true, sound: true });
  assert.match(h2.kicker(), /PAUSED/, 'restored night opens paused');
  await h2.clickModal(0); // resume; syncEvent opens the real event dialog
  assert.match(h2.kicker(), /UNINVITED/);
  h2.key('Escape');
  assert.equal(h2.overlay().hidden, false, 'event Escape keeps the story modal open');
  assert.match(h2.kicker(), /UNINVITED/, 'event Escape leaves the same story modal in place');
});

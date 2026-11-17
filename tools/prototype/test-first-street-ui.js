'use strict';
// PLAY02 / D22 presentation packet: real-module VM harness tests.
// Every test below executes the real reopening-ui / reopening-scene modules
// against states built with genuine actions and city movement. There are no
// source-substring searches and no forged rewards or auto-actions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const R = require('./reopening-core.js');
const City = require('./reopening-city.js');

const noop = () => {};
function act(s, a) {
  const before = JSON.stringify(s);
  const r = R.act(s, a);
  assert.equal(JSON.stringify(s), before, 'act must not mutate its input');
  assert.ok(r.ok, (r.message || '') + ' :: ' + JSON.stringify(a));
  assert.ok(R.restore(r.state), 'result stays a valid save after ' + a.type);
  return r.state;
}
const start = (seed = 42) => act(R.createGame(seed), { type: 'start' });
const skipToNight = (seed = 42) => act(start(seed), { type: 'open' });

// ---------------------------------------------------------------------------
// Full daytime UI VM harness (executes the real reopening-ui in a sandbox).
// ---------------------------------------------------------------------------
const { harness } = require('./district-ui-test-fixture.cjs');

// ---------------------------------------------------------------------------
// LEGACY COMPATIBILITY ONLY: real PubScene renderer with a recording 2D context (no source inspection).
// ---------------------------------------------------------------------------
function sceneRig() {
  const marks = [];
  const transform = { scale: 1, tx: 0, ty: 0 };
  const target = {
    translate(x, y) { transform.tx = x; transform.ty = y; },
    scale(s) { transform.scale = s; }
  };
  const ctx = new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      return (...args) => marks.push([k, ...args]);
    },
    set: () => true
  });
  const sandbox = { window: { City }, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'reopening-scene.js'), 'utf8'), sandbox);
  const scene = new sandbox.window.PubScene({ width: 0, height: 0, getContext: () => ctx });
  const cityView = (position, extra) => ({ position, path: [], target: null, mode: 'map', notes: [], ...extra });
  const render = (position, extra) => scene.drawCity(cityView(position, extra), 0);
  const texts = () => marks.filter(m => m[0] === 'fillText').map(m => m[1]);
  return { scene, render, transform, texts, marks };
}
const cityAt = (x, y) => ({ ...City.create(), x, y });

// The day-one recommendation card and the real datasets of its rendered buttons.
// Tests click the datasets parsed from the card markup rather than assuming one.
function walkCard(html) {
  const match = html.match(/<div class="first-walk">[\s\S]*?<\/div>/);
  assert.ok(match, 'first-walk recommendation card is rendered');
  return match[0];
}
const cardButtons = card => [...card.matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
const buttonDataset = tag => ({
  action: (tag.match(/data-action="([^"]+)"/) || [])[1],
  place: (tag.match(/data-place="([^"]+)"/) || [])[1],
  kind: (tag.match(/data-kind="([^"]+)"/) || [])[1]
});
const countPrimary = card => (card.match(/class="primary"/g) || []).length;
const PUB_HEADING = '<h2>Tweede Kans</h2>';

// ===========================================================================
// 1. Welcome: one CTA, brief premise, seed behind a native details element.
// ===========================================================================
test('welcome offers one start CTA and keeps the seed in an accessible native disclosure', async () => {
  const h = await harness(null);
  const html = h.board();
  assert.equal((html.match(/data-action="start"/g) || []).length, 1, 'exactly one start CTA');
  assert.match(html, /<details[\s\S]*?id="seed-input"[\s\S]*?<\/details>/, 'seed sits inside native details');
  assert.ok(!/class="rule-list"/.test(html), 'welcome carries no legacy long rule list');
});

// ===========================================================================
// 2. Close street is the default; overview keeps every destination reachable.
// ===========================================================================
test('day starts in a close following street view; pub/Lotte lead and the overview is one action away', async () => {
  const h = await harness(null);
  await h.click({ action: 'start' });
  const save = h.save();
  assert.equal(save.game.phase, 'prep');
  // Conspicuous overview toggle in the street toolbar.
  assert.match(h.toolbar(), /data-action="city-overview"/);
  assert.match(h.toolbar(), /全城地图/);
  // Close-view list prioritises the pub and Lotte's bridge.
  const q = h.queue();
  const pubAt = q.indexOf('data-place="pub"');
  const lotteAt = q.indexOf('data-place="lotte"');
  assert.ok(pubAt >= 0 && lotteAt > pubAt, 'pub comes before Lotte');
  for (const id of ['coffee', 'noord', 'market', 'flowers', 'lab']) {
    assert.ok(!q.includes('data-place="' + id + '"'), id + ' waits behind the explicit overview action');
  }
  // Short movement / interact cue is present on the street board.
  assert.match(h.board(), /WASD|方向键|点击/);
  // One explicit action reveals the whole city, and it offers the way back.
  await h.click({ action: 'city-overview' });
  assert.match(h.toolbar(), /data-action="city-street"/);
  assert.match(h.toolbar(), /回到街头/);
  const overview = h.queue();
  for (const id of Object.keys(City.PLACES)) assert.match(overview, new RegExp('data-place="' + id + '"'));
});

test('all seven destinations stay genuinely reachable through the overview, and every arrival is recorded', async () => {
  const h = await harness({ version: 1, game: start(), city: City.create(), sound: true });
  await h.click({ action: 'city-overview' });
  // Real City routing + movement walks the avatar to each named destination.
  for (const id of ['lotte', 'coffee', 'flowers', 'market', 'lab', 'noord']) {
    await h.travel(id);
    await h.click({ action: 'city-map' });
  }
  const visited = h.save().city.visited.slice().sort();
  assert.deepEqual(visited, Object.keys(City.PLACES).sort());
});

// ===========================================================================
// 3. Optional Lotte promise: real route, real one-preparation cost.
// ===========================================================================
test('first street recommends the optional Lotte walk whose promise spends exactly one preparation and no cash', async () => {
  const h = await harness(null);
  await h.click({ action: 'start' });
  // The recommendation states the actual cost before anything happens.
  const street = h.board();
  assert.match(street, /Lotte/);
  assert.match(street, /1\s*次准备/);
  const before = h.save().game;
  assert.equal(before.promises.lotte, false);
  assert.deepEqual(before.prepared, []);
  // Walk to the bridge: real movement, no teleport and no auto-promise.
  await h.travel('lotte');
  const walking = h.save().game;
  assert.equal(walking.promises.lotte, false, 'arriving never auto-accepts the promise');
  assert.equal(walking.actions, 2);
  assert.match(h.board(), /1\s*次准备/, 'the actual promise button labels its preparation cost');
  await h.click({ action: 'prepare', kind: 'visit' });
  const after = h.save().game;
  assert.equal(after.promises.lotte, true);
  assert.deepEqual(after.prepared, ['visit']);
  assert.equal(after.actions, 1, 'one preparation is consumed');
  assert.equal(after.cash, before.cash, 'the promise is free in cash');
  assert.equal(after.music, false, 'no fake reward: music is not granted before service night');
  // One-shot: the real core rejects a second promise the same day.
  const r = R.act(after, { type: 'prepare', kind: 'visit' });
  assert.equal(r.ok, false);
});

// ===========================================================================
// 4. Skip path: straight into the pub and opening keeps its real warning.
// ===========================================================================
test('the recommendation can be skipped: the pub door works immediately and opening keeps the preparations warning', async () => {
  const h = await harness(null);
  await h.click({ action: 'start' });
  // Direct pub entry from the spawn point, no Lotte detour.
  await h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Tweede Kans<\/h2>/);
  assert.equal(h.save().game.promises.lotte, false);
  await h.click({ action: 'open' });
  // The preparation-ended-on-open warning is preserved and blocks nothing.
  assert.equal(h.overlay().hidden, false);
  assert.match(h.dialogBody(), /2\s*次准备/);
  await h.clickModal(0); // go back, nothing happens
  assert.equal(h.save().game.phase, 'prep');
  await h.click({ action: 'open' });
  await h.clickModal(1); // confirm opening
  const save = h.save();
  assert.equal(save.game.phase, 'night');
  assert.equal(save.game.actions, 0, 'opening really ends preparations');
  assert.equal(save.game.promises.lotte, false, 'skipping stays skipped');
  // No mandatory modal tutors the first customer.
  assert.equal(h.overlay().hidden, true, 'service starts without a blocking tutorial');
});

// ===========================================================================
// 5. Short local first-guest cue instead of a mandatory modal.
// ===========================================================================
test('first night shows a short local select/pour/stop cue that can be dismissed once', async () => {
  const h = await harness(null);
  await h.click({ action: 'start' });
  await h.click({ action: 'city-enter' });
  await h.click({ action: 'open' });
  await h.clickModal(1);
  assert.equal(h.overlay().hidden, true);
  const cue = h.board();
  assert.match(cue, /选中/);
  assert.match(cue, /开始倒酒/);
  assert.match(cue, /收杯/);
  assert.match(cue, /data-action="tutorial-dismiss"/);
  await h.click({ action: 'tutorial-dismiss' });
  const save = h.save();
  assert.equal(save.tutorialSeen, true);
  assert.doesNotMatch(h.board(), /data-action="tutorial-dismiss"/);
});

// ===========================================================================
// 6. Restore-to-pause is maintained.
// ===========================================================================
test('restoring a saved night keeps the auto-pause; resuming returns to play', async () => {
  const night = skipToNight();
  const h = await harness({ version: 1, game: night, city: City.create(), tutorialSeen: true, sound: true });
  assert.equal(h.overlay().hidden, false, 'a restored run opens paused');
  assert.match(h.kicker(), /PAUSED/);
  await h.clickModal(0);
  assert.equal(h.overlay().hidden, true);
  assert.match(h.board(), /开始倒酒|倒酒/);
});

// ===========================================================================
// 7. Camera transforms invert at the pub and far boundary in every mode.
// ===========================================================================
test('legacy PubScene compatibility: camera follows at close scale, and clicks invert the real transform at pub and far boundary', async () => {
  const rig = sceneRig();
  const points = { pub: { x: 290, y: 590 }, corner: { x: 1722, y: 1072 } };
  const modes = [
    { name: 'overview', zoom: 1 },
    { name: 'zoomed', zoom: 2 },
    { name: 'street', camera: 'street' }
  ];
  const scales = {};
  for (const mode of modes) {
    for (const [label, p] of Object.entries(points)) {
      const position = cityAt(p.x, p.y);
      const snapshot = JSON.stringify(position);
      rig.render(position, mode);
      assert.equal(JSON.stringify(position), snapshot, 'rendering never mutates its input');
      const t = rig.scene.cityTransform;
      if (label === 'pub') scales[mode.name] = t.scale;
      const sx = p.x * t.scale + t.tx, sy = p.y * t.scale + t.ty;
      assert.ok(sx >= 0 && sx <= 1100, mode.name + ' avatar x on screen at ' + label + ': ' + sx);
      assert.ok(sy >= 0 && sy <= 640, mode.name + ' avatar y on screen at ' + label + ': ' + sy);
      const world = rig.scene.cityWorldPoint(sx, sy);
      assert.ok(Math.hypot(world.x - p.x, world.y - p.y) < 1e-6, mode.name + ' inverse at ' + label);
    }
  }
  assert.ok(scales.street / scales.overview >= 2.5 && scales.street / scales.overview <= 3,
    'close view is roughly 2.5-3x overview: ' + scales.street / scales.overview);
  assert.ok(scales.overview * City.WIDTH <= 1100 + 1e-9 && scales.overview * City.HEIGHT <= 640 + 1e-9, 'overview fits the full city');
});

// ===========================================================================
// 8. Close view labels only nearby / selected destinations.
// ===========================================================================
test('legacy PubScene compatibility: street view labels the pub door and Lotte bridge but not distant destinations; overview labels all seven', async () => {
  const rig = sceneRig();
  rig.render(cityAt(290, 590), { camera: 'street' });
  const close = rig.texts();
  assert.ok(close.includes(City.PLACES.pub.name));
  assert.ok(close.includes(City.PLACES.lotte.name));
  for (const id of ['coffee', 'noord', 'market', 'flowers', 'lab']) {
    assert.ok(!close.includes(City.PLACES[id].name), 'distant ' + id + ' is unlabelled in street view');
  }
  assert.ok(close.some(t => /♪|琴/.test(t)), 'Lotte is identified as the bridge musician');
  rig.render(cityAt(900, 600), { zoom: 1 });
  const overview = rig.texts();
  for (const place of Object.values(City.PLACES)) assert.ok(overview.includes(place.name), place.id + ' labelled in overview');
});

// ===========================================================================
// 10. The card's pub route uses real City travel from every location; the
//     generic E key still enters the nearest place (the D22 Lotte regression).
// ===========================================================================
test('pub route from the card really reaches the pub from the pub, Lotte bridge and a distant place, while E stays nearest', async () => {
  // From the spawn point at the pub, the card's pub control opens the real pub.
  let h = await harness(null);
  await h.click({ action: 'start' });
  let card = walkCard(h.board());
  assert.doesNotMatch(card, /data-action="city-enter"/, 'the card never advertises E as a pub shortcut');
  assert.doesNotMatch(card, /直接进酒馆/, 'no fake "straight into the pub" label');
  let pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.ok(pubTag, 'card offers a pub route');
  await h.click(buttonDataset(pubTag));
  await h.frames(1);
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'at the pub the route enters the pub flow');

  // From Lotte's bridge: the old primary "直接进酒馆 · E" re-entered Lotte.
  h = await harness(null);
  await h.click({ action: 'start' });
  await h.travel('lotte');
  assert.match(h.board(), /<h2>Lotte 的桥<\/h2>/);
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.doesNotMatch(card, /data-action="city-enter"/, 'no nearest-entry shortcut hides as a pub button');
  assert.match(card, /回酒馆开门/);
  assert.ok(!card.includes('walk-step'), 'a single recommendation, not the old three-step list');
  // Generic nearest-entry behaviour is intentionally unchanged: E enters Lotte.
  await h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Lotte 的桥<\/h2>/, 'E still enters the nearest place');
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.deepEqual(buttonDataset(pubTag), { action: 'city-travel', place: 'pub', kind: undefined });
  await h.click(buttonDataset(pubTag));
  await h.settleTravel('pub'); // real City movement across the bridge, frame by frame
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'real travel from the bridge ends at the pub');
  let pos = h.save().city;
  assert.ok(Math.hypot(pos.x - h.fixture.anchors.pub.x, pos.y - h.fixture.anchors.pub.y) < 5, 'avatar stands at the pub');
  assert.ok(Math.hypot(pos.x - h.fixture.anchors.lotte.x, pos.y - h.fixture.anchors.lotte.y) > 100, 'avatar is not left at Lotte');

  // From a genuinely distant, non-pub place (Bram's cafe in De Pijp).
  h = await harness(null);
  await h.click({ action: 'start' });
  await h.travel('coffee');
  assert.match(h.board(), /<h2>Bram 咖啡馆<\/h2>/);
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  // E at the cafe enters the cafe, never the pub.
  await h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Bram 咖啡馆<\/h2>/, 'nearest E keeps its generic meaning');
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.ok(pubTag, 'pub route is offered from a distant place');
  await h.click(buttonDataset(pubTag));
  await h.settleTravel('pub');
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'real travel from De Pijp ends at the pub');
  pos = h.save().city;
  assert.ok(Math.hypot(pos.x - h.fixture.anchors.pub.x, pos.y - h.fixture.anchors.pub.y) < 5, 'avatar stands at the pub');
});

// ===========================================================================
// 11. Exactly one current feasible step: before meeting, at the bridge, away
//     from the bridge, after promising, and with no preparations remaining.
// ===========================================================================
test('the recommendation advances one honest step at a time and never promises resources it cannot spend', async () => {
  const h = await harness(null);
  await h.click({ action: 'start' });

  // Before meeting Lotte: the one CTA walks to the bridge; cost shown up front.
  let card = walkCard(h.board());
  assert.equal(countPrimary(card), 1, 'exactly one main CTA');
  assert.match(card, /data-action="city-travel" data-place="lotte"/);
  assert.doesNotMatch(card, /data-kind="visit"/, 'no remote promise before meeting');
  assert.match(card, /1\s*次准备/);
  assert.match(card, /不花钱/);

  // Arrival is only movement: no promise, no spent action, no reward.
  await h.travel('lotte');
  const arrived = h.save().game;
  assert.equal(arrived.promises.lotte, false);
  assert.equal(arrived.actions, 2);
  assert.equal(arrived.music, false);

  // Met and standing on the bridge: the real promise action is the one CTA.
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.match(card, /data-action="prepare" data-kind="visit"/);
  assert.match(card, /1\s*次准备/, 'true cost visible before the real promise');

  // Met but standing elsewhere: honest navigation back, not an impossible click.
  await h.travel('coffee');
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.match(card, /data-action="city-travel" data-place="lotte"/);
  assert.doesNotMatch(card, /data-kind="visit"/, 'cannot promise from another street');

  // After promising: the current step is returning to the pub; still no reward.
  await h.travel('lotte');
  await h.click({ action: 'prepare', kind: 'visit' });
  const promised = h.save().game;
  assert.equal(promised.promises.lotte, true);
  assert.equal(promised.actions, 1, 'exactly one preparation consumed');
  assert.equal(promised.music, false, 'no automatic music reward');
  await h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.doesNotMatch(card, /data-kind="visit"/);
  assert.match(card, /data-action="city-travel" data-place="pub"/);
  await h.click({ action: 'city-travel', place: 'pub' });
  await h.settleTravel('pub');
  assert.match(h.board(), /<h2>Tweede Kans<\/h2>/);

  // Zero preparations left, no promise: feasible pub step, no fake promise CTA.
  const spent = act(act(start(), { type: 'prepare', kind: 'market' }), { type: 'prepare', kind: 'lab' });
  assert.equal(spent.actions, 0);
  assert.equal(spent.promises.lotte, false);
  const h2 = await harness({ version: 1, game: spent, city: City.create(), sound: true });
  card = walkCard(h2.board());
  assert.equal(countPrimary(card), 1);
  assert.doesNotMatch(card, /data-kind="visit"/, 'no impossible promise without preparations');
  assert.match(card, /data-action="city-travel" data-place="pub"/);
  await h2.click({ action: 'city-travel', place: 'pub' });
  await h2.frames(1);
  assert.match(h2.board(), /<h2>Tweede Kans<\/h2>/);
});

function trackZones(html, id) {
  const start = html.indexOf('id="' + id + '"');
  assert.ok(start >= 0, 'missing timing track ' + id);
  const track = html.slice(start, html.indexOf('</div>', start));
  function zone(name) {
    const match = track.match(new RegExp('class="' + name + '" style="left:([\\d.]+)%;width:([\\d.]+)%"'));
    assert.ok(match, id + ' must inline its real ' + name + ' window: ' + track);
    return { left: Number(match[1]), width: Number(match[2]) };
  }
  return { sweet: zone('sweet-zone'), perfect: zone('perfect-zone') };
}

function actionText(html, action) {
  const match = html.match(new RegExp('<button[^>]*data-action="' + action + '"[^>]*>([\\s\\S]*?)<\\/button>'));
  assert.ok(match, 'missing action ' + action);
  return match[1].replace(/<[^>]+>/g, '');
}

async function resume(h) {
  if (!h.overlay().hidden) await h.clickModal(0);
}

function friendsNightAt(person) {
  let state = start();
  state = act(state, { type: 'prepare', kind: 'coffee' });
  state = act(state, { type: 'prepare', kind: 'visit' });
  state = act(state, { type: 'open' });
  while (state.phase === 'night') {
    const order = state.night.orders.find(o => o.person === person);
    if (order.status === 'waiting') return state;
    const seconds = Math.min(1, Math.max(.01, order.arrival - state.night.elapsed));
    state = act(state, { type: 'tick', seconds });
    if (state.night.event?.status === 'pending') state = act(state, { type: 'event', choice: 'refuse' });
  }
  assert.fail(person + ' never reached the bar');
}

async function serveSelectedClassic(h, order) {
  await h.click({ action: 'select', id: order.id });
  await h.click({ action: 'pour' });
  await h.tick(1000);
  await h.tick(1000);
  await h.tick(880);
  await h.frames(1, 0);
  await h.click({ action: 'serve', id: order.id });
}

test('night queue, both pour tracks and the stop cue share each guest’s real service window', async () => {
  let night = skipToNight();
  const pairArrival = night.night.orders[1].arrival;
  while (night.night.elapsed < pairArrival) {
    night = act(night, { type: 'tick', seconds: Math.min(1, pairArrival - night.night.elapsed) });
  }
  const h = await harness({ version: 1, game: night, city: City.create(), tutorialSeen: true, sound: false });
  await resume(h);
  const queue = h.queue();
  assert.match(queue, /赶时间/);
  assert.match(queue, /想满些/);
  assert.match(queue, /aria-label="[^"]*赶时间[^"]*"/);
  assert.match(queue, /午市熟人|还可以等/, 'ordinary waiting information remains available');

  h.key('2');
  const quick = h.save().game.night.orders.find(o => o.service === 'quick');
  assert.equal(h.diagnostics().game.night.pours.length, 0);
  h.key('e');
  await h.flush();
  const current = h.save().game;
  const window = R.pourWindow(current, quick);
  const expected = {
    sweet: { left: window.min * 100, width: (window.max - window.min) * 100 },
    perfect: { left: window.perfectMin * 100, width: (window.perfectMax - window.perfectMin) * 100 }
  };
  assert.deepEqual(trackZones(h.board(), 'service-pour'), expected);
  assert.deepEqual(trackZones(h.els.get('pour-stations').innerHTML, 'pour-' + quick.id), expected);

  await h.tick(1000);
  await h.tick(640);
  await h.frames(1, 0);
  assert.match(actionText(h.board(), 'serve'), /漂亮！现在收杯/);
  const satisfied = h.save().game.night.satisfied;
  h.key(' ');
  await h.flush();
  assert.equal(h.save().game.night.satisfied, satisfied + 1, 'Space still serves the selected pour');
});

test('window flowers produce one game-time arrival reaction that pauses, expires and never replays from a save', async () => {
  let prep = start();
  prep = act(prep, { type: 'flowerStart' });
  for (const stem of [0, 1, 2]) prep = act(prep, { type: 'flowerPick', stem });
  prep = act(prep, { type: 'flowerWrap', wrap: 'paper' });
  prep = act(prep, { type: 'flowerFinish' });
  prep = act(prep, { type: 'flowerUse', target: 'display' });
  const patienceBonus = R.flowerFit(prep.life.display, 'display') ? 6 : 3;
  const h = await harness({ version: 1, game: prep, city: City.create(), tutorialSeen: true, sound: false });
  await resume(h);
  await h.click({ action: 'open' });
  if (!h.overlay().hidden) await h.clickModal(1);
  let reactions = h.diagnostics().reactions;
  assert.ok(Array.isArray(reactions), 'entry exposes only local reaction diagnostics');
  assert.equal(reactions.length, 1);
  assert.match(reactions[0].text, /窗边的花/);
  assert.match(reactions[0].text, new RegExp(patienceBonus + ' 秒'));
  const saved = h.save();
  assert.equal(saved.reactions, undefined);
  assert.equal(saved.serviceReactions, undefined);

  h.key('p');
  const paused = h.diagnostics();
  await h.tick(1000);
  await h.frames(1, 100);
  assert.equal(h.diagnostics().game.night.elapsed, paused.game.night.elapsed);
  assert.deepEqual(h.diagnostics().reactions, paused.reactions, 'reaction lifetime freezes with night time');
  await h.clickModal(0);
  await h.tick(1000);
  await h.tick(1000);
  await h.tick(1000);
  await h.tick(100);
  assert.deepEqual(h.diagnostics().reactions, [], 'reaction expires after three seconds of play');

  const restored = await harness(saved);
  await resume(restored);
  await restored.tick(100);
  assert.deepEqual(restored.diagnostics().reactions, [], 'refresh does not reconstruct an old arrival reaction');
  h.close();
  restored.close();
});

test('Bram and Lotte acknowledge the real daytime help and kept promise after service', async () => {
  for (const [person, expected] of [['bram', /午市/], ['lotte', /记得那杯黑啤/]]) {
    const night = friendsNightAt(person);
    const order = night.night.orders.find(o => o.person === person);
    const h = await harness({ version: 1, game: night, city: City.create(), tutorialSeen: true, sound: false });
    await resume(h);
    if (person === 'bram') assert.match(h.queue(), /午市熟人 · 多等 10 秒/);
    await serveSelectedClassic(h, order);
    const reactions = h.diagnostics().reactions;
    assert.ok(Array.isArray(reactions), person + ' reactions are local diagnostics');
    assert.ok(reactions.some(r => r.name === order.name && expected.test(r.text)),
      person + ' gets a visible response: ' + JSON.stringify(reactions));
    assert.equal(h.save().reactions, undefined, 'service reactions never enter the save envelope');
    h.close();
  }
});

function giftNightAtLotte() {
  let state = start();
  state = act(state, { type: 'flowerStart' });
  for (const stem of [0, 1, 2]) state = act(state, { type: 'flowerPick', stem });
  state = act(state, { type: 'flowerWrap', wrap: 'ribbon' });
  state = act(state, { type: 'flowerFinish' });
  state = act(state, { type: 'flowerUse', target: 'lotte' });
  state = act(state, { type: 'open' });
  while (state.phase === 'night') {
    const order = state.night.orders.find(o => o.person === 'lotte');
    if (order.status === 'waiting') return state;
    const seconds = Math.min(1, Math.max(.01, order.arrival - state.night.elapsed));
    state = act(state, { type: 'tick', seconds });
    if (state.night.event?.status === 'pending') state = act(state, { type: 'event', choice: 'refuse' });
  }
  assert.fail('Lotte never reached the bar');
}

test('a private gift is remembered at Lotte’s seat and in the morning, without becoming music', async () => {
  const night = giftNightAtLotte();
  const order = night.night.orders.find(o => o.person === 'lotte');
  const h = await harness({ version: 1, game: night, city: City.create(), tutorialSeen: true, sound: false });
  await resume(h);
  assert.match(h.queue(), /她提了提你今天送的花/);
  assert.doesNotMatch(h.queue(), /你答应为她留一杯黑啤/);
  await serveSelectedClassic(h, order);
  const d = h.diagnostics();
  assert.ok(d.reactions.some(r => r.name === 'Lotte' && /今天送的花/.test(r.text)),
    'gift is acknowledged at the seat: ' + JSON.stringify(d.reactions));
  assert.equal(d.game.music, false);
  assert.equal(d.game.night.promiseKept, false);
  await h.click({ action: 'close-night' });
  await h.clickModal(1);
  await h.click({ action: 'next' });
  const board = h.board();
  assert.match(board, /Lotte 的花与酒/);
  assert.match(board, /第 1 天/);
  assert.match(board, /不会自动换演出/);
  assert.doesNotMatch(board, /第 2 晚她带乐队来/);
  h.close();
});

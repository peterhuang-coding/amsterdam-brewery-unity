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
function harness(saved) {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, { get: (o, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : noop), set: () => true });
  const mkEl = () => ({
    textContent: '', hidden: false, disabled: false, innerHTML: '', value: undefined,
    setAttribute: noop, removeAttribute: noop, addEventListener: noop, removeEventListener: noop,
    classList: { toggle: noop, add: noop, remove: noop }, style: {}, title: '', focus: noop,
    scrollIntoView: noop, querySelector: () => null, querySelectorAll: () => [], dataset: {}, remove: noop
  });
  const els = new Map();
  const listeners = {};
  const canvasListeners = {};
  const overlayEl = () => ({ ...mkEl(), hidden: true });
  const dialogActions = () => ({ ...mkEl(), querySelector: () => ({ focus: noop }) });
  const seedEl = () => ({ ...mkEl(), value: 42 });
  const canvasEl = () => ({ ...mkEl(), tabIndex: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1100, height: 640 }),
    addEventListener: (type, cb) => { (canvasListeners[type] = canvasListeners[type] || []).push(cb); } });
  const document = {
    addEventListener: (type, cb) => { (listeners[type] = listeners[type] || []).push(cb); },
    hidden: false, activeElement: { isConnected: false }, body: { classList: { toggle: noop } },
    getElementById(id) {
      if (id === 'pub-canvas') { if (!els.has(id)) els.set(id, canvasEl()); return els.get(id); }
      if (id === 'overlay') { if (!els.has(id)) els.set(id, overlayEl()); return els.get(id); }
      if (id === 'dialog-actions') { if (!els.has(id)) els.set(id, dialogActions()); return els.get(id); }
      if (id === 'seed-input') { if (!els.has(id)) els.set(id, seedEl()); return els.get(id); }
      if (!els.has(id)) els.set(id, mkEl());
      return els.get(id);
    },
    querySelector: () => null, querySelectorAll: () => []
  };
  let capturedSave = null;
  const localStorage = {
    getItem: () => (saved ? JSON.stringify(saved) : null),
    setItem: (k, v) => { capturedSave = JSON.parse(v); }
  };
  const rafs = [];
  let nowValue = 1000;
  const sandbox = {
    document, matchMedia: () => ({ matches: false }), localStorage,
    performance: { now: () => nowValue }, setTimeout: () => 0, clearTimeout: noop,
    setInterval: () => 0, requestAnimationFrame: cb => rafs.push(cb),
    devicePixelRatio: 1, location: { search: '' }, scrollTo: noop, addEventListener: noop,
    URLSearchParams: class { get() { return null; } }, navigator: {}, AudioContext: undefined, CSS: { escape: String }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), sandbox);
  for (const file of ['journey-core.js', 'backstage-core.js', 'backstage-auto.js', 'delivery-orders.js',
    'character-stories.js', 'flower-network.js', 'reopening-core.js', 'reopening-city.js', 'reopening-scene.js',
    'backstage-scene.js', 'backstage-ui.js', 'journey-ui.js', 'reopening-ui.js']) load(file);
  const board = () => els.get('action-content').innerHTML;
  const queue = () => els.get('queue').innerHTML;
  const toolbar = () => els.get('city-toolbar').innerHTML;
  const overlay = () => els.get('overlay');
  const click = dataset => {
    const button = { dataset, disabled: false };
    const event = { target: { closest: sel => (sel === 'button[data-action]' ? button : null) } };
    for (const cb of listeners.click) cb(event);
  };
  const clickModal = index => {
    const button = { dataset: { modalAction: String(index) }, disabled: false };
    const event = { target: { closest: sel => (sel === '[data-modal-action]' ? button : null) } };
    for (const cb of listeners.click) cb(event);
  };
  // Pumps real requestAnimationFrame frames; movement uses real City movement.
  function pump(frames = 2000) {
    for (let i = 0; i < frames; i++) {
      nowValue += 100;
      const cb = rafs.shift();
      if (!cb) break;
      cb(nowValue);
    }
  }
  function travel(placeId, frames = 2000) {
    click({ action: 'city-travel', place: placeId });
    const name = City.PLACES[placeId].name;
    for (let i = 0; i < frames; i++) {
      nowValue += 100;
      const cb = rafs.shift();
      assert.ok(cb, 'frame scheduled while walking to ' + placeId);
      cb(nowValue);
      if (board().includes('<h2>' + name + '</h2>')) return;
    }
    assert.fail('never entered ' + placeId);
  }
  return {
    board, queue, toolbar, overlay, click, clickModal, travel,
    save: () => capturedSave, frames: pump,
    kicker: () => els.get('dialog-kicker').textContent,
    dialogBody: () => els.get('dialog-body').innerHTML
  };
}

// ---------------------------------------------------------------------------
// Real PubScene renderer with a recording 2D context (no source inspection).
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
test('welcome offers one start CTA and keeps the seed in an accessible native disclosure', () => {
  const h = harness(null);
  const html = h.board();
  assert.equal((html.match(/data-action="start"/g) || []).length, 1, 'exactly one start CTA');
  assert.match(html, /<details[\s\S]*?id="seed-input"[\s\S]*?<\/details>/, 'seed sits inside native details');
  assert.ok(!/class="rule-list"/.test(html), 'welcome carries no legacy long rule list');
});

// ===========================================================================
// 2. Close street is the default; overview keeps every destination reachable.
// ===========================================================================
test('day starts in a close following street view; pub/Lotte lead and the overview is one action away', () => {
  const h = harness(null);
  h.click({ action: 'start' });
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
  h.click({ action: 'city-overview' });
  assert.match(h.toolbar(), /data-action="city-street"/);
  assert.match(h.toolbar(), /回到街头/);
  const overview = h.queue();
  for (const id of Object.keys(City.PLACES)) assert.match(overview, new RegExp('data-place="' + id + '"'));
});

test('all seven destinations stay genuinely reachable through the overview, and every arrival is recorded', () => {
  const h = harness({ version: 1, game: start(), city: City.create(), sound: true });
  h.click({ action: 'city-overview' });
  // Real City routing + movement walks the avatar to each named destination.
  for (const id of ['lotte', 'coffee', 'flowers', 'market', 'lab', 'noord']) {
    h.travel(id);
    h.click({ action: 'city-map' });
  }
  const visited = h.save().city.visited.slice().sort();
  assert.deepEqual(visited, Object.keys(City.PLACES).sort());
});

// ===========================================================================
// 3. Optional Lotte promise: real route, real one-preparation cost.
// ===========================================================================
test('first street recommends the optional Lotte walk whose promise spends exactly one preparation and no cash', () => {
  const h = harness(null);
  h.click({ action: 'start' });
  // The recommendation states the actual cost before anything happens.
  const street = h.board();
  assert.match(street, /Lotte/);
  assert.match(street, /1\s*次准备/);
  const before = h.save().game;
  assert.equal(before.promises.lotte, false);
  assert.deepEqual(before.prepared, []);
  // Walk to the bridge: real movement, no teleport and no auto-promise.
  h.travel('lotte');
  const walking = h.save().game;
  assert.equal(walking.promises.lotte, false, 'arriving never auto-accepts the promise');
  assert.equal(walking.actions, 2);
  assert.match(h.board(), /1\s*次准备/, 'the actual promise button labels its preparation cost');
  h.click({ action: 'prepare', kind: 'visit' });
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
test('the recommendation can be skipped: the pub door works immediately and opening keeps the preparations warning', () => {
  const h = harness(null);
  h.click({ action: 'start' });
  // Direct pub entry from the spawn point, no Lotte detour.
  h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Tweede Kans<\/h2>/);
  assert.equal(h.save().game.promises.lotte, false);
  h.click({ action: 'open' });
  // The preparation-ended-on-open warning is preserved and blocks nothing.
  assert.equal(h.overlay().hidden, false);
  assert.match(h.dialogBody(), /2\s*次准备/);
  h.clickModal(0); // go back, nothing happens
  assert.equal(h.save().game.phase, 'prep');
  h.click({ action: 'open' });
  h.clickModal(1); // confirm opening
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
test('first night shows a short local select/pour/stop cue that can be dismissed once', () => {
  const h = harness(null);
  h.click({ action: 'start' });
  h.click({ action: 'city-enter' });
  h.click({ action: 'open' });
  h.clickModal(1);
  assert.equal(h.overlay().hidden, true);
  const cue = h.board();
  assert.match(cue, /选中/);
  assert.match(cue, /开始倒酒/);
  assert.match(cue, /收杯/);
  assert.match(cue, /data-action="tutorial-dismiss"/);
  h.click({ action: 'tutorial-dismiss' });
  const save = h.save();
  assert.equal(save.tutorialSeen, true);
  assert.doesNotMatch(h.board(), /data-action="tutorial-dismiss"/);
});

// ===========================================================================
// 6. Restore-to-pause is maintained.
// ===========================================================================
test('restoring a saved night keeps the auto-pause; resuming returns to play', () => {
  const night = skipToNight();
  const h = harness({ version: 1, game: night, city: City.create(), tutorialSeen: true, sound: true });
  assert.equal(h.overlay().hidden, false, 'a restored run opens paused');
  assert.match(h.kicker(), /PAUSED/);
  h.clickModal(0);
  assert.equal(h.overlay().hidden, true);
  assert.match(h.board(), /开始倒酒|倒酒/);
});

// ===========================================================================
// 7. Camera transforms invert at the pub and far boundary in every mode.
// ===========================================================================
test('camera follows at close scale, and clicks invert the real transform at pub and far boundary', () => {
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
test('street view labels the pub door and Lotte bridge but not distant destinations; overview labels all seven', () => {
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
test('pub route from the card really reaches the pub from the pub, Lotte bridge and a distant place, while E stays nearest', () => {
  // From the spawn point at the pub, the card's pub control opens the real pub.
  let h = harness(null);
  h.click({ action: 'start' });
  let card = walkCard(h.board());
  assert.doesNotMatch(card, /data-action="city-enter"/, 'the card never advertises E as a pub shortcut');
  assert.doesNotMatch(card, /直接进酒馆/, 'no fake "straight into the pub" label');
  let pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.ok(pubTag, 'card offers a pub route');
  h.click(buttonDataset(pubTag));
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'at the pub the route enters the pub flow');

  // From Lotte's bridge: the old primary "直接进酒馆 · E" re-entered Lotte.
  h = harness(null);
  h.click({ action: 'start' });
  h.travel('lotte');
  assert.match(h.board(), /<h2>Lotte 的桥<\/h2>/);
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.doesNotMatch(card, /data-action="city-enter"/, 'no nearest-entry shortcut hides as a pub button');
  assert.match(card, /回酒馆开门/);
  assert.ok(!card.includes('walk-step'), 'a single recommendation, not the old three-step list');
  // Generic nearest-entry behaviour is intentionally unchanged: E enters Lotte.
  h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Lotte 的桥<\/h2>/, 'E still enters the nearest place');
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.deepEqual(buttonDataset(pubTag), { action: 'city-travel', place: 'pub', kind: undefined });
  h.click(buttonDataset(pubTag));
  h.frames(800); // real City movement across the bridge, frame by frame
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'real travel from the bridge ends at the pub');
  let pos = h.save().city;
  assert.ok(Math.hypot(pos.x - City.PLACES.pub.x, pos.y - City.PLACES.pub.y) < 5, 'avatar stands at the pub');
  assert.ok(Math.hypot(pos.x - City.PLACES.lotte.x, pos.y - City.PLACES.lotte.y) > 100, 'avatar is not left at Lotte');

  // From a genuinely distant, non-pub place (Bram's cafe in De Pijp).
  h = harness(null);
  h.click({ action: 'start' });
  h.travel('coffee');
  assert.match(h.board(), /<h2>Bram 咖啡馆<\/h2>/);
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  // E at the cafe enters the cafe, never the pub.
  h.click({ action: 'city-enter' });
  assert.match(h.board(), /<h2>Bram 咖啡馆<\/h2>/, 'nearest E keeps its generic meaning');
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  pubTag = cardButtons(card).find(tag => tag.includes('data-place="pub"'));
  assert.ok(pubTag, 'pub route is offered from a distant place');
  h.click(buttonDataset(pubTag));
  h.frames(800);
  assert.match(h.board(), new RegExp(PUB_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'real travel from De Pijp ends at the pub');
  pos = h.save().city;
  assert.ok(Math.hypot(pos.x - City.PLACES.pub.x, pos.y - City.PLACES.pub.y) < 5, 'avatar stands at the pub');
});

// ===========================================================================
// 11. Exactly one current feasible step: before meeting, at the bridge, away
//     from the bridge, after promising, and with no preparations remaining.
// ===========================================================================
test('the recommendation advances one honest step at a time and never promises resources it cannot spend', () => {
  const h = harness(null);
  h.click({ action: 'start' });

  // Before meeting Lotte: the one CTA walks to the bridge; cost shown up front.
  let card = walkCard(h.board());
  assert.equal(countPrimary(card), 1, 'exactly one main CTA');
  assert.match(card, /data-action="city-travel" data-place="lotte"/);
  assert.doesNotMatch(card, /data-kind="visit"/, 'no remote promise before meeting');
  assert.match(card, /1\s*次准备/);
  assert.match(card, /不花钱/);

  // Arrival is only movement: no promise, no spent action, no reward.
  h.travel('lotte');
  const arrived = h.save().game;
  assert.equal(arrived.promises.lotte, false);
  assert.equal(arrived.actions, 2);
  assert.equal(arrived.music, false);

  // Met and standing on the bridge: the real promise action is the one CTA.
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.match(card, /data-action="prepare" data-kind="visit"/);
  assert.match(card, /1\s*次准备/, 'true cost visible before the real promise');

  // Met but standing elsewhere: honest navigation back, not an impossible click.
  h.travel('coffee');
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.match(card, /data-action="city-travel" data-place="lotte"/);
  assert.doesNotMatch(card, /data-kind="visit"/, 'cannot promise from another street');

  // After promising: the current step is returning to the pub; still no reward.
  h.travel('lotte');
  h.click({ action: 'prepare', kind: 'visit' });
  const promised = h.save().game;
  assert.equal(promised.promises.lotte, true);
  assert.equal(promised.actions, 1, 'exactly one preparation consumed');
  assert.equal(promised.music, false, 'no automatic music reward');
  h.click({ action: 'city-map' });
  card = walkCard(h.board());
  assert.equal(countPrimary(card), 1);
  assert.doesNotMatch(card, /data-kind="visit"/);
  assert.match(card, /data-action="city-travel" data-place="pub"/);
  h.click({ action: 'city-travel', place: 'pub' });
  h.frames(800);
  assert.match(h.board(), /<h2>Tweede Kans<\/h2>/);

  // Zero preparations left, no promise: feasible pub step, no fake promise CTA.
  const spent = act(act(start(), { type: 'prepare', kind: 'market' }), { type: 'prepare', kind: 'lab' });
  assert.equal(spent.actions, 0);
  assert.equal(spent.promises.lotte, false);
  const h2 = harness({ version: 1, game: spent, city: City.create(), sound: true });
  card = walkCard(h2.board());
  assert.equal(countPrimary(card), 1);
  assert.doesNotMatch(card, /data-kind="visit"/, 'no impossible promise without preparations');
  assert.match(card, /data-action="city-travel" data-place="pub"/);
  h2.click({ action: 'city-travel', place: 'pub' });
  assert.match(h2.board(), /<h2>Tweede Kans<\/h2>/);
});

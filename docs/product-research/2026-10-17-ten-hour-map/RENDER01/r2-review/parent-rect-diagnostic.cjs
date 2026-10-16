'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('./geo-map-renderer.js');

// ---------------------------------------------------------------------------
// Fake 2D canvas: records every state-affecting call so tests can assert
// drawing state (balanced save/restore, fill rule, dash style, geometry
// traced) rather than aesthetics.
// ---------------------------------------------------------------------------

const LOG_PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
  'font', 'textAlign', 'textBaseline', 'lineDashOffset', 'globalAlpha'];

class FakeCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.log = [];
    this.depth = 0;
    this._stack = [];
    const backing = {};
    for (const p of LOG_PROPS) {
      Object.defineProperty(this, p, {
        get() { return backing[p]; },
        set(v) { backing[p] = v; this.log.push(['set', p, v]); },
        configurable: true, enumerable: true
      });
      backing[p] = null;
    }
  }
  _r(name, args) { this.log.push([name].concat(Array.prototype.slice.call(args))); }
  save() {
    this.depth++;
    const snap = {};
    for (const p of LOG_PROPS) snap[p] = this[p];
    this._stack.push(snap);
    this._r('save', arguments);
  }
  restore() {
    if (this.depth === 0) throw new Error('unbalanced restore on ' + this.canvas.__id);
    const snap = this._stack.pop();
    for (const p of LOG_PROPS) this[p] = snap[p];
    this.depth--;
    this._r('restore', arguments);
  }
  scale() { this._r('scale', arguments); }
  translate() { this._r('translate', arguments); }
  rotate() { this._r('rotate', arguments); }
  setTransform() { this._r('setTransform', arguments); }
  resetTransform() { this._r('resetTransform', arguments); }
  clearRect() { this._r('clearRect', arguments); }
  fillRect() { this._r('fillRect', arguments); }
  strokeRect() { this._r('strokeRect', arguments); }
  beginPath() { this._r('beginPath', arguments); }
  closePath() { this._r('closePath', arguments); }
  moveTo() { this._r('moveTo', arguments); }
  lineTo() { this._r('lineTo', arguments); }
  rect() { this._r('rect', arguments); }
  arc() { this._r('arc', arguments); }
  ellipse() { this._r('ellipse', arguments); }
  clip(rule) { this.log.push(['clip', rule]); }
  fill(rule) { this.log.push(['fill', rule || null]); }
  stroke() { this._r('stroke', arguments); }
  setLineDash(d) { this.log.push(['setLineDash', Array.prototype.slice.call(d)]); }
  drawImage(img) {
    const args = Array.prototype.slice.call(arguments);
    args[0] = img && img.__id ? img.__id : 'image';
    this.log.push(['drawImage'].concat(args));
  }
  fillText() { this._r('fillText', arguments); }
  measureText(text) {
    var m = /([\d.]+)px/.exec(this.font || '11px');
    return { width: R.estimateTextWidth(text, m ? parseFloat(m[1]) : 11) };
  }
  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
}

class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.__id = 'cv' + (FakeCanvas.seq++); this.ctx = new FakeCtx(this); }
  getContext() { return this.ctx; }
}
FakeCanvas.seq = 0;

function makeFactory() {
  const factory = function (w, h) {
    const cv = new FakeCanvas(w, h);
    factory.canvases.push(cv);
    return cv;
  };
  factory.canvases = [];
  return factory;
}

function mainCanvas() {
  const cv = new FakeCanvas(1200, 800);
  cv.__id = 'main';
  return cv;
}

// ---------------------------------------------------------------------------
// Synthetic schema builders.
// ---------------------------------------------------------------------------

function closeRing(coords) { return coords.concat([coords[0].slice()]); }
function rectRing(x0, y0, x1, y1) {
  return closeRing([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}
function makeFeature(id, polygons, properties) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const poly of polygons) for (const ring of poly) for (const p of ring) {
    if (p[0] < bx0) bx0 = p[0]; if (p[1] < by0) by0 = p[1];
    if (p[0] > bx1) bx1 = p[0]; if (p[1] > by1) by1 = p[1];
  }
  return {
    id, sourceId: id, localId: null, properties: properties || {},
    polygons, bounds: [bx0, by0, bx1, by1]
  };
}
function makeData(W, H, layers) {
  return {
    schemaVersion: 1,
    bbox: [4.865, 52.345, 4.97, 52.405],
    width: W, height: H,
    projection: { type: 'local-equirectangular' },
    source: { provider: 'Kadaster / PDOK BGT', license: 'CC0-1.0', complete: false },
    layers: Object.assign({ water: [], buildings: [], roads: [], bridges: [] }, layers)
  };
}
function draw(renderer, view, options) {
  const cv = mainCanvas();
  const out = renderer.draw(cv.ctx, view, options || {});
  return { out, ctx: cv.ctx };
}

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'real-pub-sample.json'), 'utf8'));
const PUB = { x: 1100.211, y: 3243.117 };
const LOTTE = { x: 1056.057, y: 3247.41 };

// ---------------------------------------------------------------------------
// 1. Module shape & validation
// ---------------------------------------------------------------------------

test('UMD exports frozen API surface', () => {
  assert.equal(typeof globalThis.AmsterdamGeoRenderer, 'object');
  assert.equal(typeof R.create, 'function');
  assert.equal(typeof R.worldToScreen, 'function');
  assert.equal(typeof R.screenToWorld, 'function');
  assert.equal(R.PALETTE.canal, '#378e9b');
  assert.equal(R.PALETTE.ink, '#183b48');
  assert.equal(R.PALETTE.brick, '#b86b4c');
  assert.equal(R.PALETTE.sand, '#e2d4b0');
  assert.equal(R.PALETTE.lamp, '#ffd184');
  assert.equal(R.PALETTE.slate, '#253d49');
});

test('rejects invalid required data with offending feature context', () => {
  assert.throws(() => R.create(null), /schema/);
  assert.throws(() => R.create({ schemaVersion: 2, width: 1, height: 1, layers: {} }), /schemaVersion/);
  assert.throws(() => R.create(makeData(10, 10, { water: [{ id: 'x' }] })), /x/);
  const open = makeFeature('bad:open', [[rectRing(0, 0, 5, 5).slice(0, -1)]]);
  assert.throws(() => R.create(makeData(10, 10, { water: [open] })), /bad:open/);
  const nan = makeFeature('bad:nan', [[closeRing([[0, 0], [NaN, 2], [2, 2]])]]);
  assert.throws(() => R.create(makeData(10, 10, { water: [nan] })), /bad:nan/);
  const two = makeFeature('bad:two', [[closeRing([[0, 0], [1, 0]])]]);
  assert.throws(() => R.create(makeData(10, 10, { water: [two] })), /bad:two/);
  const bounds = makeFeature('bad:bounds', [[rectRing(0, 0, 5, 5)]]);
  bounds.bounds = [0, 0, 99, 5];
  assert.throws(() => R.create(makeData(10, 10, { water: [bounds] })), /bounds/);
  assert.throws(() => R.create(makeData(0, 10)), /positive/);
});

test('rejects non-finite player positions and bad place rows', () => {
  const r = R.create(makeData(400, 300), { canvasFactory: makeFactory() });
  assert.throws(() => draw(r, { camera: 'street', position: { x: NaN, y: 1 } }), /finite player/);
  assert.throws(() => draw(r, { camera: 'city', zoom: 2, position: { x: 1, y: NaN } }), /finite player/);
  assert.throws(() => draw(r, { camera: 'street' }), /finite player/);
  assert.throws(() => draw(r, { camera: 'city', position: { x: 1, y: 1 } },
    { places: [{ id: 'p', name: 'n' }] }), /finite x,y/);
  assert.throws(() => draw(r, { camera: 'city' }, { places: 'nope' }), /array/);
});

test('city zoom 1 works without a player position', () => {
  const r = R.create(makeData(400, 300), { canvasFactory: makeFactory() });
  const { out } = draw(r, { camera: 'city', zoom: 1 });
  assert.ok(out.transform.scale > 0);
});

// ---------------------------------------------------------------------------
// 2. Transform inversion / framing at the specified widths and edges
// ---------------------------------------------------------------------------

test('transform inverse is exact at css widths 320/390/1100 across cameras', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  for (const w of [320, 390, 1100]) {
    const cases = [
      { camera: 'city', zoom: 1, position: { x: PUB.x, y: PUB.y } },
      { camera: 'city', zoom: 2, position: { x: PUB.x, y: PUB.y } },
      { camera: 'street', position: { x: PUB.x, y: PUB.y } },
      { camera: 'street', position: { x: 0, y: 0 } },
      { camera: 'street', position: { x: sample.width, y: sample.height } }
    ];
    for (const view of cases) {
      const { out } = draw(r, view, { width: w, height: 640, cssWidth: w });
      const tr = out.transform;
      for (const p of [[0, 0], [PUB.x, PUB.y], [sample.width, sample.height], [42.5, 99.25]]) {
        const s = R.worldToScreen(tr, p[0], p[1]);
        const back = R.screenToWorld(tr, s.x, s.y);
        assert.ok(Math.abs(back.x - p[0]) < 1e-9, 'x roundtrip ' + w);
        assert.ok(Math.abs(back.y - p[1]) < 1e-9, 'y roundtrip ' + w);
      }
      if (view.camera === 'street') {
        assert.ok(Math.abs(tr.scale - 2) < 1e-12, 'street ~2 css px/m at ' + w);
      }
    }
  }
});

test('street scale derives from cssWidth even when logical width differs', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const { out } = draw(r, { camera: 'street', position: { x: PUB.x, y: PUB.y } },
    { width: 1100, height: 640, cssWidth: 390 });
  // 2 CSS px per metre, scaled by logical/css ratio.
  assert.ok(Math.abs(out.transform.scale - 2 * 1100 / 390) < 1e-9);
});

test('city zoom1 fits the whole world and reports its bounds', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const { out } = draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } },
    { width: 1100, height: 640 });
  const b = out.visibleBounds;
  // The whole world sits inside the visible rectangle (letterboxed)...
  assert.ok(b[0] <= 1e-9 && b[1] <= 1e-9);
  assert.ok(b[2] >= sample.width - 1e-6 && b[3] >= sample.height - 1e-6);
  // ...and maps inside the canvas, nothing panned off-screen.
  const nw = R.worldToScreen(out.transform, 0, 0);
  const se = R.worldToScreen(out.transform, sample.width, sample.height);
  assert.ok(nw.x >= 0 - 1e-9 && nw.y >= 0 - 1e-9 && se.x <= 1100 + 1e-9 && se.y <= 640 + 1e-9);
});

test('zoom2 follows the player but clamps at world edges', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const left = draw(r, { camera: 'city', zoom: 2, position: { x: 0, y: 3000 } },
    { width: 1100, height: 640 }).out;
  assert.ok(Math.abs(left.visibleBounds[0]) < 1e-9);
  const right = draw(r, { camera: 'city', zoom: 2, position: { x: sample.width, y: 3000 } },
    { width: 1100, height: 640 }).out;
  assert.ok(Math.abs(right.visibleBounds[2] - sample.width) < 1e-9);
});

test('street camera clamps at edges and letterboxes a tiny world centered', () => {
  const big = R.create(makeData(4000, 3000, {}), { canvasFactory: makeFactory() });
  const edge = draw(big, { camera: 'street', position: { x: 0, y: 0 } }).out;
  assert.ok(Math.abs(edge.visibleBounds[0]) < 1e-9);
  assert.ok(Math.abs(edge.visibleBounds[1]) < 1e-9);
  const far = draw(big, { camera: 'street', position: { x: 4000, y: 3000 } }).out;
  assert.ok(Math.abs(far.visibleBounds[2] - 4000) < 1e-9);
  assert.ok(Math.abs(far.visibleBounds[3] - 3000) < 1e-9);
  const r = R.create(makeData(200, 100, {}), { canvasFactory: makeFactory() });
  const tiny = draw(r, { camera: 'street', position: { x: 100, y: 50 } },
    { width: 1100, height: 640 }).out;
  assert.ok(tiny.visibleBounds[0] < 0 && tiny.visibleBounds[2] > 200);
  const center = R.screenToWorld(tiny.transform, 550, 320);
  assert.ok(Math.abs(center.x - 100) < 1e-9 && Math.abs(center.y - 50) < 1e-9);
});

// ---------------------------------------------------------------------------
// 3. Actual holes & multipolygon gaps (synthetic, exact fill state)
// ---------------------------------------------------------------------------

test('every hole ring is traced and filled even-odd; multipolygon gaps stay open', () => {
  const water = makeFeature('water:donut', [
    [rectRing(10, 10, 90, 90), rectRing(40, 40, 60, 60)] // outer + island hole
  ]);
  const twin = makeFeature('building:twin', [
    [rectRing(200, 50, 240, 90)],
    [rectRing(300, 200, 340, 240)]
  ]);
  const data = makeData(400, 300, { water: [water], buildings: [twin] });
  const factory = makeFactory();
  const r = R.create(data, { canvasFactory: factory });
  draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  const cache = factory.canvases[0];
  assert.ok(cache.width <= 2048 && cache.height <= 2048);
  const log = cache.ctx.log;

  function groups() {
    const gs = [], idxs = [];
    let start = 0;
    for (let i = 0; i < log.length; i++) {
      if (log[i][0] === 'beginPath') start = i;
      if (log[i][0] === 'fill') { gs.push(log.slice(start, i + 1)); idxs.push(start); }
    }
    return gs;
  }
  const hasPoint = (g, x, y) => g.some(e => (e[0] === 'moveTo' || e[0] === 'lineTo') && e[1] === x && e[2] === y);

  const donutFill = groups().find(g => g[g.length - 1][1] === 'evenodd' &&
    hasPoint(g, 10, 10) && hasPoint(g, 90, 90) && hasPoint(g, 40, 40) && hasPoint(g, 60, 60));
  assert.ok(donutFill, 'outer + hole rings share one evenodd fill path');

  const twinFill = groups().find(g => g[g.length - 1][1] === 'evenodd' &&
    hasPoint(g, 200, 50) && hasPoint(g, 300, 200));
  assert.ok(twinFill, 'both multipolygon components share the evenodd fill');

  // Even-odd is used for every static polygon fill (never nonzero).
  assert.ok(log.some(e => e[0] === 'clip' && e[1] === 'evenodd'));
  for (const e of log) if (e[0] === 'fill') assert.equal(e[1], 'evenodd');
});

// ---------------------------------------------------------------------------
// 4. Spatial culling
// ---------------------------------------------------------------------------

test('index culls distant features and stats measure indexed/culled/drawn', () => {
  const buildings = [];
  for (let gx = 0; gx < 12; gx++) for (let gy = 0; gy < 12; gy++) {
    const x = 200 + gx * 650, y = 200 + gy * 600;
    buildings.push(makeFeature('b:' + gx + ':' + gy, [[rectRing(x, y, x + 12, y + 12)]]));
  }
  const data = makeData(8000, 7200, { buildings });
  const factory = makeFactory();
  const r = R.create(data, { canvasFactory: factory });
  const { out } = draw(r, { camera: 'street', position: { x: 850, y: 800 } });
  const s = r.stats();
  assert.equal(s.indexedFeatures, 144);
  assert.ok(s.lastFrame.indexed > 0, 'bucket candidates measured');
  assert.ok(s.lastFrame.drawn >= 1 && s.lastFrame.drawn < 12);
  assert.equal(s.lastFrame.culled, s.lastFrame.indexed - s.lastFrame.drawn);
  // The far corner of the world never reached the painted cache.
  const streetCache = factory.canvases.find(c => c.width < 2048);
  const far = streetCache.ctx.log.some(e => (e[0] === 'moveTo' || e[0] === 'lineTo') && e[1] > 7000);
  assert.ok(!far);
  assert.ok(out.visibleBounds[0] >= 0 && out.visibleBounds[2] <= 8000);
});

// ---------------------------------------------------------------------------
// 5. Cache build / reuse / invalidation / bounded allocation
// ---------------------------------------------------------------------------

test('city cache builds once and reuses for unchanged frames', () => {
  const factory = makeFactory();
  const r = R.create(makeData(400, 300, {
    buildings: [makeFeature('b1', [[rectRing(20, 20, 60, 60)]])]
  }), { canvasFactory: factory });
  const v = { camera: 'city', zoom: 1, position: { x: 0, y: 0 } };
  const a = draw(r, v); const b = draw(r, v);
  const s = r.stats();
  assert.equal(s.cacheBuilds, 1);
  assert.equal(s.cacheReuses, 1);
  assert.equal(s.lastFrame.reused, true);
  assert.ok(b.ctx.log.filter(e => e[0] === 'drawImage').length >= 1);
  // Same overview cache serves every screen size without reallocating.
  draw(r, v, { width: 320, height: 480, cssWidth: 320 });
  draw(r, v, { width: 1100, height: 640, cssWidth: 1100 });
  assert.equal(factory.canvases.length, 1);
});

test('night and camera-area changes invalidate; street surface is reused', () => {
  const factory = makeFactory();
  const r = R.create(makeData(4000, 3000, {
    buildings: [makeFeature('b1', [[rectRing(900, 900, 960, 960)]])]
  }), { canvasFactory: factory });
  draw(r, { camera: 'city', zoom: 1, afterHours: false, position: { x: 0, y: 0 } });
  draw(r, { camera: 'city', zoom: 1, afterHours: false, position: { x: 0, y: 0 } });
  draw(r, { camera: 'city', zoom: 1, afterHours: true, position: { x: 0, y: 0 } });
  assert.equal(r.stats().cacheBuilds, 2);
  assert.equal(r.stats().activeCanvases, 1); // night cache replaces day cache

  draw(r, { camera: 'street', afterHours: false, position: { x: 1000, y: 1000 } });
  const afterStreet = r.stats().canvasesCreated;
  draw(r, { camera: 'street', afterHours: false, position: { x: 1020, y: 1010 } });
  assert.equal(r.stats().canvasesCreated, afterStreet, 'small pan reuses the padded cache element');
  assert.equal(r.stats().lastFrame.reused, true);
  draw(r, { camera: 'street', afterHours: false, position: { x: 2600, y: 1000 } });
  assert.equal(r.stats().lastFrame.reused, false, 'leaving the padded area rebuilds');
  assert.equal(r.stats().canvasesCreated, afterStreet, 'rebuild reuses the same canvas element');
});

test('offscreen allocation stays bounded on long cross-city pans, day and night', () => {
  const factory = makeFactory();
  const r = R.create(makeData(7000, 6500, {
    buildings: [makeFeature('b', [[rectRing(30, 30, 60, 60)]])]
  }), { canvasFactory: factory });
  for (let i = 0; i < 12; i++) {
    draw(r, { camera: 'street', afterHours: false, position: { x: 100 + i * 560, y: 800 + (i % 3) * 500 } });
  }
  draw(r, { camera: 'city', zoom: 1, afterHours: true, position: { x: 0, y: 0 } });
  for (let i = 0; i < 12; i++) {
    draw(r, { camera: 'street', afterHours: true, position: { x: 100 + i * 560, y: 800 + (i % 3) * 500 } });
  }
  // day city + day street + night city + night street, never more.
  assert.ok(r.stats().canvasesCreated <= 4, 'created=' + r.stats().canvasesCreated);
  assert.ok(r.stats().activeCanvases <= 2);
  for (const c of factory.canvases) {
    assert.ok(c.width <= 2048 && c.height <= 2048);
  }
});

test('dispose releases caches; drawing afterwards rebuilds', () => {
  const factory = makeFactory();
  const r = R.create(makeData(400, 300), { canvasFactory: factory });
  draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  assert.equal(r.stats().activeCanvases, 1);
  r.dispose();
  assert.equal(r.stats().activeCanvases, 0);
  draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  assert.equal(r.stats().activeCanvases, 1);
});

test('without offscreen capability the renderer draws directly', () => {
  const r = R.create(makeData(400, 300, {
    water: [makeFeature('w', [[rectRing(0, 0, 100, 100)]])]
  }), { canvasFactory: () => null });
  const { ctx, out } = draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  assert.ok(r.stats().directFrames >= 1);
  assert.ok(ctx.log.some(e => e[0] === 'fill' && e[1] === 'evenodd'));
  assert.ok(out.transform.scale > 0);
});

// ---------------------------------------------------------------------------
// 6. Input immutability & context preservation
// ---------------------------------------------------------------------------

test('never mutates data or view and preserves caller context state', () => {
  const factory = makeFactory();
  const data = makeData(400, 300, {
    buildings: [makeFeature('b1', [[rectRing(100, 100, 140, 140)]])]
  });
  const before = JSON.stringify(data);
  const r = R.create(data, { canvasFactory: factory });
  const view = {
    camera: 'street', afterHours: false, zoom: 1,
    position: { x: 150, y: 150, visited: ['p1'], bike: { x: 154, y: 150, mounted: false } },
    path: [{ x: 180, y: 160 }], target: 'p1', time: 3,
    flowerCart: { x: 170, y: 150 }
  };
  const viewBefore = JSON.stringify(view);
  const places = [{ id: 'p1', name: 'Place One', icon: 'P', x: 180, y: 160 }];
  const placesBefore = JSON.stringify(places);
  const { ctx } = draw(r, view, { width: 390, height: 640, cssWidth: 390, places });
  assert.equal(JSON.stringify(data), before);
  assert.equal(JSON.stringify(view), viewBefore);
  assert.equal(JSON.stringify(places), placesBefore);
  assert.equal(ctx.depth, 0, 'save/restore balanced');
  assert.ok(!ctx.log.some(e => e[0] === 'setTransform' || e[0] === 'resetTransform'),
    'caller transform matrix is never reset');
});

test('caller styles survive the frame via save/restore', () => {
  const r = R.create(makeData(400, 300), { canvasFactory: makeFactory() });
  const cv = mainCanvas();
  cv.ctx.fillStyle = '#deadbe';
  cv.ctx.lineWidth = 99;
  r.draw(cv.ctx, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  assert.equal(cv.ctx.fillStyle, '#deadbe');
  assert.equal(cv.ctx.lineWidth, 99);
});

// ---------------------------------------------------------------------------
// 7. Labels: readable CSS-space rectangles, avatar clearance, no truncation
// ---------------------------------------------------------------------------

test('full readable label rectangles at every css width; avatar never covered', () => {
  const factory = makeFactory();
  const r = R.create(sample, { canvasFactory: factory });
  const longName = 'Café De Twee Lange Kans — Speciale Editie';
  const places = [
    { id: 'pub', name: '酒馆 Tweede Kans', icon: '🍺', x: PUB.x, y: PUB.y },
    { id: 'lotte', name: longName, icon: '♪', x: LOTTE.x, y: LOTTE.y }
  ];
  for (const w of [320, 390, 1100]) {
    const res = draw(r, { camera: 'street', position: { x: PUB.x, y: PUB.y }, target: 'lotte' },
      { width: w, height: 640, cssWidth: w, places }).out;
    assert.ok(res.labels.length >= 1 && res.labels.length <= 2);
    const lb = res.labels.find(l => l.id === 'lotte');
    assert.ok(lb, 'selected long name is always shown at ' + w);
    assert.equal(lb.text, longName, 'full name preserved, never truncated');
    assert.ok(lb.fontCssPx >= 11);
    assert.ok(lb.x >= 4 && lb.y >= 4 && lb.x + lb.width <= w - 4 + 1e-9 &&
      lb.y + lb.height <= 636 + 1e-9, 'clamped into viewport at ' + w);
    if (w === 320) assert.ok(lb.height > 12 * 1.24 + 8 + 1, 'long selected name wraps at 320');
    // Avatar clearance circle approximated by 26 css-pixel box.
    const ps = R.worldToScreen(res.transform, PUB.x, PUB.y);
    const overlap = lb.x < ps.x + 13 && lb.x + lb.width > ps.x - 13 &&
      lb.y < ps.y + 13 && lb.y + lb.height > ps.y - 13;
    assert.ok(!overlap, 'label clears avatar at ' + w);
  }
});

test('single-line label rectangles match the estimator exactly', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const name = 'Lotte 桥';
  const res = draw(r, { camera: 'street', position: { x: LOTTE.x, y: LOTTE.y }, target: 'lotte' }, {
    width: 390, height: 640, cssWidth: 390,
    places: [{ id: 'lotte', name, icon: '♪', x: LOTTE.x, y: LOTTE.y }]
  }).out;
  const lb = res.labels[0];
  const fp = 12; // selected -> 12 css px, d=1
  const expectedW = R.estimateTextWidth(name, fp) + 14;
  const expectedH = fp * 1.24 + 8;
  assert.ok(Math.abs(lb.width - expectedW) < 1e-9);
  assert.ok(Math.abs(lb.height - expectedH) < 1e-9);
});

test('street shows at most selected plus nearest within 60 m', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const places = [
    { id: 'near', name: '近点', x: PUB.x + 40, y: PUB.y },
    { id: 'far', name: '远点远点远点远点远点', x: PUB.x + 400, y: PUB.y },
    { id: 'target', name: '目标点', x: PUB.x + 500, y: PUB.y + 10 }
  ];
  const res = draw(r, { camera: 'street', position: { x: PUB.x, y: PUB.y }, target: 'target' },
    { width: 390, height: 640, cssWidth: 390, places }).out;
  const ids = res.labels.map(l => l.id).sort();
  assert.deepEqual(ids, ['near', 'target']);
});

test('overview labels selected plus nearest even when far; nonfitting names are skipped', () => {
  const data = makeData(8000, 7000, {});
  const r = R.create(data, { canvasFactory: makeFactory() });
  const places = [
    { id: 'nearest', name: 'The Nearest Venue With A Rather Long Name', x: 1000, y: 1000 },
    { id: 'other', name: 'Another Distant Place With A Long Name', x: 6000, y: 6000 }
  ];
  const res = draw(r, { camera: 'city', zoom: 1, position: { x: 1000, y: 1000 } },
    { width: 320, height: 640, cssWidth: 320, places }).out;
  // Long single-line non-selected name cannot fit a 320 view, so it is skipped,
  // but every marker is still returned.
  assert.equal(res.markers.length, 2);
  assert.equal(res.labels.length, 0);
  const res2 = draw(r, { camera: 'city', zoom: 1, position: { x: 1000, y: 1000 }, target: 'nearest' },
    { width: 320, height: 640, cssWidth: 320, places }).out;
  assert.deepEqual(res2.labels.map(l => l.id), ['nearest']);
  assert.ok(res2.labels[0].width <= 320 - 8);
});

// ---------------------------------------------------------------------------
// 7b. Correction: selected label is reserved first; nearest never occludes it
// ---------------------------------------------------------------------------

const PUB_PLACE = { id: 'pub', name: '酒馆 Tweede Kans', icon: '🍺', x: PUB.x, y: PUB.y };
const LOTTE_PLACE = { id: 'lotte', name: 'Lotte 的桥', icon: '♪', x: LOTTE.x, y: LOTTE.y };

function rectHits(a, b, pad) {
  pad = pad || 0;
  const aw = a.width ?? a.w, ah = a.height ?? a.h, bw = b.width ?? b.w, bh = b.height ?? b.h;
  return a.x - pad < b.x + bw && a.x + aw + pad > b.x &&
         a.y - pad < b.y + bh && a.y + ah + pad > b.y;
}
function contained(lb, w, h, tag) {
  assert.ok(lb.x >= 4 - 1e-6 && lb.y >= 4 - 1e-6 &&
    lb.x + lb.width <= w - 4 + 1e-6 && lb.y + lb.height <= h - 4 + 1e-6,
    'label inside viewport ' + tag);
}

test('resolveFrameSize trusts the laid-out measurement, never the requested width', () => {
  // Page requests 1100 CSS px; max-width:100% / phone viewport lays it out at 362.
  const laid = { getBoundingClientRect() { return { width: 362, height: Math.round(362 * 640 / 1100) }; } };
  const s = R.resolveFrameSize(laid, { width: 1100, height: 640 });
  assert.equal(s.width, 362);
  assert.equal(s.height, 211);
  assert.equal(s.cssWidth, 362);
  // clientWidth fallback when getBoundingClientRect is unavailable.
  const client = { clientWidth: 292, clientHeight: 170 };
  const s2 = R.resolveFrameSize(client, { width: 1100, height: 640 });
  assert.equal(s2.width, 292);
  assert.equal(s2.height, 170);
  assert.equal(s2.cssWidth, 292);
  // A zero live measurement falls back to the requested size...
  const zero = { getBoundingClientRect() { return { width: 0, height: 0 }; } };
  const s3 = R.resolveFrameSize(zero, { width: 390, height: 640 });
  assert.equal(s3.width, 390);
  assert.equal(s3.cssWidth, 390);
  // ...and the documented default remains 1100x640.
  const s4 = R.resolveFrameSize(null);
  assert.equal(s4.width, 1100);
  assert.equal(s4.height, 640);
  assert.equal(s4.cssWidth, 1100);
});

test('drawing at measured phone CSS sizes keeps ~2 css px/m and >=11 css px labels', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  // [requested style width, actual laid-out width] — exactly the demo bug pair.
  for (const [requested, actual] of [[1100, 362], [1100, 292], [390, 390], [1100, 1100]]) {
    const h = Math.round(actual * 640 / 1100);
    const dom = { getBoundingClientRect() { return { width: actual, height: h }; } };
    const size = R.resolveFrameSize(dom, { width: requested, height: 640 });
    const res = draw(r, { camera: 'street', position: { x: PUB.x, y: PUB.y }, target: 'lotte' },
      { width: size.width, height: size.height, cssWidth: size.cssWidth, places: [PUB_PLACE, LOTTE_PLACE] }).out;
    assert.ok(Math.abs(res.transform.scale - 2) < 1e-9, '2 css px/m at actual ' + actual);
    const sel = res.labels.find(l => l.id === 'lotte');
    assert.ok(sel, 'selected label shown at actual ' + actual);
    assert.ok(sel.fontCssPx >= 11);
    assert.equal(sel.text, 'Lotte 的桥');
  }
});

test('actual 7127.775x6671.705 fixture: pub label never occludes Lotte across widths/cameras/modes/edges', () => {
  assert.ok(Math.abs(sample.width - 7127.775) < 1e-9);
  assert.ok(Math.abs(sample.height - 6671.705) < 1e-9);
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const places = [PUB_PLACE, LOTTE_PLACE];
  // 292/362 are the parent's actual laid-out canvas widths at viewports 320/390
  // (frame padding + max-width:100%); height follows the 1100x640 aspect.
  const widths = [[292, 170], [320, 640], [362, 211], [390, 640], [1100, 640]];
  const cams = [['street', 1], ['city', 1], ['city', 2]];
  const players = [
    ['pub', PUB.x, PUB.y], ['nw', 0, 0],
    ['se', sample.width, sample.height], ['lotte', LOTTE.x, LOTTE.y]
  ];
  let frames = 0;
  for (const [w, h] of widths) {
    for (const [cam, zoom] of cams) {
      for (const night of [false, true]) {
        for (const [pname, px, py] of players) {
          const tag = [w, cam, zoom, night ? 'night' : 'day', pname].join('/');
          const gv = { camera: cam, zoom, afterHours: night, position: { x: px, y: py }, target: 'lotte' };
          const res = draw(r, gv, { width: w, height: h, cssWidth: w, places }).out;
          frames++;
          const sel = res.labels.find(l => l.id === 'lotte');
          assert.ok(sel, 'selected Lotte label present: ' + tag);
          assert.equal(sel.text, 'Lotte 的桥');
          assert.equal(sel.fontCssPx, 12);
          contained(sel, w, h, tag);
          // Selected chip always reserves avatar clearance.
          const as = R.worldToScreen(res.transform, px, py);
          assert.ok(!rectHits(sel, { x: as.x - 13, y: as.y - 13, w: 26, h: 26 }),
            'selected clears avatar: ' + tag);
          const near = res.labels.find(l => l.id === 'pub');
          if (pname === 'pub') {
            // The parent's recorded occlusion case: BOTH labels must render.
            assert.ok(near, 'nearest pub label rendered jointly: ' + tag);
          }
          if (near) {
            assert.equal(near.fontCssPx, 11);
            contained(near, w, h, tag);
            assert.ok(!rectHits(sel, near), 'nearest never occludes selected: ' + tag);
            assert.ok(!rectHits(near, { x: as.x - 13, y: as.y - 13, w: 26, h: 26 }),
              'nearest clears avatar: ' + tag);
            const rv = R._internals.resolveView(gv, { width: w, height: h, cssWidth: w },
              sample.width, sample.height);
            for (const hr of R._internals.hudRects(rv)) {
              assert.ok(!rectHits(near, hr, 1), 'nearest clears HUD: ' + tag);
            }
          }
          // Markers are retained whether or not the nearest label earned a slot.
          assert.ok(res.markers.find(m => m.id === 'pub'), 'pub marker kept: ' + tag);
          assert.ok(res.markers.find(m => m.id === 'lotte'), 'lotte marker kept: ' + tag);
        }
      }
    }
  }
  assert.equal(frames, 5 * 3 * 2 * 4);
});

test('long ASCII and CJK selected names wrap to >=11 css px, stay full, and never occlude nearest', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const names = [
    'Café De Twee Lange Kans — Speciale Editie',
    '阿姆斯特丹市中心小型精酿啤酒馆 Lotte 桥头现场特别延长名称'
  ];
  const widths = [[292, 170], [320, 640], [362, 211], [390, 640], [1100, 640]];
  for (const name of names) {
    for (const [w, h] of widths) {
      for (const [cam, zoom] of [['street', 1], ['city', 1], ['city', 2]]) {
        const tag = cam + zoom + ' ' + w + ' ' + name.slice(0, 8);
        const lotte = Object.assign({}, LOTTE_PLACE, { name });
        const res = draw(r, { camera: cam, zoom, position: { x: PUB.x, y: PUB.y }, target: 'lotte' },
          { width: w, height: h, cssWidth: w, places: [PUB_PLACE, lotte] }).out;
        const sel = res.labels.find(l => l.id === 'lotte');
        assert.ok(sel, 'long selected label present: ' + tag);
        assert.equal(sel.text, name, 'full name preserved, never truncated: ' + tag);
        assert.equal(sel.fontCssPx, 12);
        assert.ok(sel.height > 12 * 1.24 + 8 + 0.5, 'long selected name wraps: ' + tag);
        contained(sel, w, h, tag);
        const as = R.worldToScreen(res.transform, PUB.x, PUB.y);
        assert.ok(!rectHits(sel, { x: as.x - 13, y: as.y - 13, w: 26, h: 26 }),
          'selected clears avatar: ' + tag);
        const near = res.labels.find(l => l.id === 'pub');
        if (near) {
          assert.ok(!rectHits(sel, near), 'nearest never occludes wrapped selected: ' + tag);
          assert.ok(!rectHits(near, { x: as.x - 13, y: as.y - 13, w: 26, h: 26 }),
            'nearest clears avatar: ' + tag);
        }
        assert.ok(res.markers.length === 2, 'both markers retained: ' + tag);
      }
    }
  }
});

test('nearest label is dropped when no joint slot exists, while its marker stays', () => {
  // Tiny overview frame, both anchors on the avatar at the top-left: the
  // wrapped selected chip falls back across the only free space, so the
  // nearest chip cannot clear selected/avatar/HUD and must be omitted.
  const view = {
    width: 200, height: 140, cssWidth: 200, d: 1, camera: 'city', zoom: 1, night: false,
    scale: 0.03, tx: 0, ty: 0, vis: [-100, -100, 8000, 8000], W: sample.width, H: sample.height,
    player: { x: 1, y: 1 }, reduced: false, time: 0
  };
  const anchors = [
    { id: 's', name: '选定地点特别长名称需要三行才能放得下哦好', x: 1, y: 1, district: '', icon: '' },
    { id: 'n', name: '近点', x: 1, y: 1, district: '', icon: '' }
  ];
  const labs = R._internals.layoutLabels(view, { target: 's' }, anchors, null);
  assert.deepEqual(labs.map(l => l.id), ['s']);
  assert.equal(labs[0].text, anchors[0].name);
  assert.ok(labs[0].x >= 4 && labs[0].y >= 4 &&
    labs[0].x + labs[0].width <= 196 && labs[0].y + labs[0].height <= 136);
  assert.ok(labs[0].height > 12 * 1.24 + 8);
});

test('live ctx.measureText drives reserved rects but never under the conservative bound', () => {
  const view = {
    width: 700, height: 400, cssWidth: 700, d: 1, camera: 'city', zoom: 1, night: false,
    scale: 0.1, tx: 0, ty: 0, vis: [0, 0, 7127, 6671], W: sample.width, H: sample.height,
    player: null, reduced: false, time: 0
  };
  // Stub context reports glyphs 1.4x wider than the estimator (a wide font).
  const stub = {
    font: '',
    measureText(text) {
      var m = /([\d.]+)px/.exec(this.font || '12px');
      return { width: R.estimateTextWidth(text, m ? parseFloat(m[1]) : 12) * 1.4 };
    }
  };
  const labs = R._internals.layoutLabels(view, { target: 's' },
    [{ id: 's', name: 'Lotte 的桥', x: 100, y: 100, district: '', icon: '' }], stub);
  const measured = R.estimateTextWidth('Lotte 的桥', 12) * 1.4;
  assert.ok(labs[0].width >= measured + 14 - 1e-9, 'rect reserves measured advance + padding');
  // A context that reports implausibly narrow text never shrinks the chip.
  const narrow = { font: '', measureText() { return { width: 0.5 }; } };
  const labs2 = R._internals.layoutLabels(view, { target: 's' },
    [{ id: 's', name: 'Lotte 的桥', x: 100, y: 100, district: '', icon: '' }], narrow);
  assert.ok(Math.abs(labs2[0].width - (R.estimateTextWidth('Lotte 的桥', 12) + 14)) < 1e-9);
});

test('all destination markers are always returned with screen-space radii', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const places = [];
  for (let i = 0; i < 8; i++) places.push({ id: 'p' + i, name: 'P' + i, x: 100 + i * 900, y: 100 + i * 700 });
  const res = draw(r, { camera: 'city', zoom: 1, position: { x: PUB.x, y: PUB.y } },
    { width: 1100, height: 640, places }).out;
  assert.equal(res.markers.length, 8);
  for (const m of res.markers) {
    const p = places.find(q => q.id === m.id);
    const s = R.worldToScreen(res.transform, p.x, p.y);
    assert.ok(Math.abs(m.x - s.x) < 1e-9 && Math.abs(m.y - s.y) < 1e-9);
    assert.ok(m.radius > 0);
  }
});

test('garden entry is a fictional marker only when view.garden is set; no footprint invented', () => {
  const factory = makeFactory();
  const r = R.create(makeData(400, 300), { canvasFactory: factory });
  const entry = { id: 'garden', name: '玻璃屋后的门', x: 200, y: 150 };
  const off = draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } },
    { width: 390, height: 640, cssWidth: 390, gardenEntry: entry }).out;
  assert.equal(off.markers.find(m => m.id === 'garden'), undefined);
  const on = draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 }, garden: {} },
    { width: 390, height: 640, cssWidth: 390, gardenEntry: entry }).out;
  assert.ok(on.markers.find(m => m.id === 'garden'));
});

// ---------------------------------------------------------------------------
// 8. Reduced motion determinism, ferry styling, actors
// ---------------------------------------------------------------------------

test('reduced-motion frames are deterministic regardless of time', () => {
  const r = R.create(makeData(800, 600), { canvasFactory: makeFactory() });
  const view = (t) => ({
    camera: 'street', reducedMotion: true, time: t,
    position: { x: 300, y: 300, bike: { x: 310, y: 300, mounted: false } },
    path: [{ x: 400, y: 350 }, { x: 500, y: 400 }]
  });
  const a = draw(r, view(1)).ctx.log;
  const b = draw(r, view(999)).ctx.log;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('ferry connections use a distinct cool dashed line and never a land fill', () => {
  const r = R.create(makeData(2000, 1000), { canvasFactory: makeFactory() });
  const { ctx } = draw(r, {
    camera: 'street', position: { x: 100, y: 500 },
    path: [{ x: 300, y: 500 }, { x: 300, y: 520, transport: 'ferry' }, { x: 900, y: 520 }]
  }, { width: 1100, height: 640, cssWidth: 1100 });
  const dashes = ctx.log.filter(e => e[0] === 'setLineDash' && e[1][0] === 11);
  assert.ok(dashes.length >= 1, 'long ferry dash pattern used');
  const coolStroke = ctx.log.some(e => e[0] === 'set' && e[1] === 'strokeStyle' &&
    (e[2] === R._internals.THEMES.day.ferry));
  assert.ok(coolStroke);
  // Ordinary route segment: gold line with standard dash.
  const r2 = R.create(makeData(2000, 1000), { canvasFactory: makeFactory() });
  const gold = draw(r2, {
    camera: 'street', position: { x: 100, y: 500 },
    path: [{ x: 900, y: 520 }]
  }, { width: 1100, height: 640, cssWidth: 1100 }).ctx.log;
  assert.ok(gold.some(e => e[0] === 'set' && e[1] === 'strokeStyle' &&
    e[2] === R._internals.THEMES.day.routeGold));
  assert.ok(gold.some(e => e[0] === 'setLineDash' && e[1][0] === 10 && e[1][1] === 9));
});

test('avatar 14-18 css px; parked bike and cart use passed coordinates', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const { ctx, out } = draw(r, {
    camera: 'street', position: { x: PUB.x, y: PUB.y, bike: { x: LOTTE.x, y: LOTTE.y, mounted: false } },
    flowerCart: { x: PUB.x + 12, y: PUB.y + 4 }
  }, { width: 390, height: 640, cssWidth: 390 });
  const ps = R.worldToScreen(out.transform, PUB.x, PUB.y);
  const bodyArc = ctx.log.find(e => e[0] === 'arc' && Math.abs(e[1] - ps.x) < 0.01 &&
    Math.abs(e[2] - (ps.y + 1)) < 0.01);
  assert.ok(bodyArc);
  assert.ok(bodyArc[3] * 2 >= 14 - 1e-9 && bodyArc[3] * 2 <= 18 + 1e-9);
  const bs = R.worldToScreen(out.transform, LOTTE.x, LOTTE.y);
  const wheel = ctx.log.find(e => e[0] === 'arc' && Math.abs(e[1] - (bs.x - 6.5)) < 0.01);
  assert.ok(wheel, 'parked bike drawn at passed bike coordinates');
  const cs = R.worldToScreen(out.transform, PUB.x + 12, PUB.y + 4);
  const cartBox = ctx.log.find(e => e[0] === 'fillRect' && Math.abs(e[1] - (cs.x - 9)) < 0.01);
  assert.ok(cartBox, 'cart drawn at passed flowerCart coordinates');
});

// ---------------------------------------------------------------------------
// 9. Real 62-feature BGT sample end to end
// ---------------------------------------------------------------------------

test('the supplied real sample validates and renders (2 water, 23 buildings, 36 roads, 1 bridge)', () => {
  const factory = makeFactory();
  const r = R.create(sample, { canvasFactory: factory });
  assert.equal(r.stats().indexedFeatures, 62);
  assert.equal(sample.layers.water.length, 2);
  assert.equal(sample.layers.buildings.length, 23);
  assert.equal(sample.layers.roads.length, 36);
  assert.equal(sample.layers.bridges.length, 1);
  const places = [
    { id: 'pub', name: '酒馆 Tweede Kans', icon: '🍺', x: PUB.x, y: PUB.y },
    { id: 'lotte', name: 'Lotte 的桥', icon: '♪', x: LOTTE.x, y: LOTTE.y }
  ];
  const res = draw(r, {
    camera: 'street', position: { x: PUB.x, y: PUB.y, visited: ['pub'] }, target: 'lotte',
    path: [{ x: 1080, y: 3244 }, { x: LOTTE.x, y: LOTTE.y }]
  }, { width: 1100, height: 640, cssWidth: 1100, places }).out;
  const ids = res.labels.map(l => l.id).sort();
  assert.deepEqual(ids, ['lotte', 'pub']);
  for (const lb of res.labels) {
    assert.ok(lb.fontCssPx >= 11 && lb.width > 0 && lb.height > 0);
    assert.ok(lb.x >= 0 && lb.y >= 0 && lb.x + lb.width <= 1100 && lb.y + lb.height <= 640);
  }
  // Both real polygons of the multipolygon building reach the painted cache.
  const twin = sample.layers.buildings.find(f => f.id === 'pand:8bf7d713-4410-5a3b-9f14-6008e96eedbc');
  assert.ok(twin && twin.polygons.length === 2);
  const street = factory.canvases.find(c => c.width < 2048 && c.width > 1200);
  assert.ok(street);
  const c0 = twin.polygons[0][0][0], c1 = twin.polygons[1][0][0];
  // Both separate multipolygon components reach the painted street cache
  // (the gap between them stays empty via one even-odd fill).
  draw(r, { camera: 'city', zoom: 1, position: { x: PUB.x, y: PUB.y } });
  const streetCache = factory.canvases.find(c => c.width < 2048);
  const overview = factory.canvases.find(c => c.width === 2048);
  assert.ok(streetCache && overview);
  const hasPoint = (log, pt) => log.some(e => (e[0] === 'moveTo' || e[0] === 'lineTo') &&
    Math.abs(e[1] - pt[0]) < 1e-9 && Math.abs(e[2] - pt[1]) < 1e-9);
  assert.ok(hasPoint(streetCache.ctx.log, c0) && hasPoint(streetCache.ctx.log, c1));
  assert.ok(hasPoint(overview.ctx.log, c0) && hasPoint(overview.ctx.log, c1));
  // Every static fill in both caches uses even-odd.
  assert.ok(streetCache.ctx.log.filter(e => e[0] === 'fill').every(e => e[1] === 'evenodd'));
});

test('bridge deck is rendered as a deck; piers never take deck colours', () => {
  const factory = makeFactory();
  const r = R.create(sample, { canvasFactory: factory });
  draw(r, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  const overview = factory.canvases.find(c => c.width === 2048);
  const styles = overview.ctx.log.filter(e => e[0] === 'set' && e[1] === 'fillStyle').map(e => e[2]);
  assert.ok(styles.includes(R._internals.THEMES.day.deck));
  assert.ok(!styles.includes(R._internals.THEMES.day.pier), 'sample has no pier parts');
  const data = makeData(400, 300, { bridges: [
    makeFeature('br:dek', [[rectRing(20, 20, 80, 40)]], { type_overbruggingsdeel: 'dek' }),
    makeFeature('br:pijler', [[rectRing(30, 60, 50, 90)]], { type_overbruggingsdeel: 'pijler' })
  ] });
  const f2 = makeFactory();
  const r2 = R.create(data, { canvasFactory: f2 });
  draw(r2, { camera: 'city', zoom: 1, position: { x: 0, y: 0 } });
  const s2 = f2.canvases[0].ctx.log.filter(e => e[0] === 'set' && e[1] === 'fillStyle').map(e => e[2]);
  assert.ok(s2.includes(R._internals.THEMES.day.deck));
  assert.ok(s2.includes(R._internals.THEMES.day.pier));
});

test('source credit is exact and scale bar uses round metres', () => {
  const r = R.create(sample, { canvasFactory: makeFactory() });
  const city = draw(r, { camera: 'city', zoom: 1, position: { x: PUB.x, y: PUB.y } },
    { width: 1100, height: 640 }).ctx;
  assert.ok(city.log.some(e => e[0] === 'fillText' && e[1] === R.SOURCE_CREDIT));
  assert.ok(city.log.some(e => e[0] === 'fillText' && e[1] === '1 km'));
  const street = draw(r, { camera: 'street', position: { x: PUB.x, y: PUB.y } },
    { width: 390, height: 640, cssWidth: 390 }).ctx;
  assert.ok(street.log.some(e => e[0] === 'fillText' && e[1] === '50 m'));
});

test('returned geometry never escapes the world clip and night palette renders', () => {
  // A source polygon legitimately extends beyond the bbox world extent.
  const overflow = makeFeature('w:overflow', [[rectRing(-40, -40, 80, 80)]]);
  const f = makeFactory();
  const r = R.create(makeData(200, 200, { water: [overflow] }), { canvasFactory: f });
  draw(r, { camera: 'city', zoom: 1, afterHours: true, position: { x: 0, y: 0 } });
  const cache = f.canvases[0];
  assert.ok(cache.ctx.log.some(e => e[0] === 'rect' && e[1] === 0 && e[2] === 0));
  assert.ok(cache.ctx.log.some(e => e[0] === 'set' && e[1] === 'fillStyle' &&
    e[2] === R._internals.THEMES.night.water));
});

'use strict';
// Node:test suite for the independent DistrictScene module. Uses a recording
// mock 2D canvas; no browser, no native canvas, no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');

const api = require(path.join(__dirname, 'district-scene.js'));
const DistrictScene = api.DistrictScene;
const overviewFixture = require(path.join(__dirname, 'map-fixture', 'overview.json'));
const districtFixture = require(path.join(__dirname, 'map-fixture', 'districts', 'pub-sample.json'));
// Real city index: five districts with snapped entrances, ten markers and the
// five actual overview travel links whose from/to use DISTRICT ids.
const catalog = require(path.join(__dirname, '..', '..', 'reference', 'actual-catalog.json'));

// --------------------------------------------------------------------------
// Recording mocks
// --------------------------------------------------------------------------

function makeCtx() {
  const ops = [];
  const ctx = {
    ops,
    save() { ops.push({ op: 'save' }); },
    restore() { ops.push({ op: 'restore' }); },
    scale(...a) { ops.push({ op: 'scale', a }); },
    translate(...a) { ops.push({ op: 'translate', a }); },
    setTransform(...a) { ops.push({ op: 'setTransform', a }); },
    clearRect() {},
    fillRect(...a) { ops.push({ op: 'fillRect', a }); },
    strokeRect(...a) { ops.push({ op: 'strokeRect', a }); },
    beginPath() { ops.push({ op: 'beginPath' }); },
    moveTo(...a) { ops.push({ op: 'moveTo', a }); },
    lineTo(...a) { ops.push({ op: 'lineTo', a }); },
    closePath() { ops.push({ op: 'closePath' }); },
    rect(...a) { ops.push({ op: 'rect', a }); },
    arc(...a) { ops.push({ op: 'arc', a }); },
    ellipse(...a) { ops.push({ op: 'ellipse', a }); },
    fill(rule) { ops.push({ op: 'fill', rule: rule || null }); },
    stroke() { ops.push({ op: 'stroke' }); },
    clip(rule) { ops.push({ op: 'clip', rule: rule || null }); },
    setLineDash(d) { ops.push({ op: 'setLineDash', d }); },
    drawImage() { ops.push({ op: 'drawImage' }); },
    fillText(text, ...a) { ops.push({ op: 'fillText', text: String(text), a }); },
    strokeText() {},
    measureText(text) { return { width: String(text).length * 7.2 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }
  };
  ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline',
    'lineDashOffset', 'lineJoin', 'lineCap', 'globalAlpha'].forEach(function (prop) {
    let v = '';
    Object.defineProperty(ctx, prop, {
      configurable: true,
      get() { return v; },
      set(value) { v = value; ops.push({ op: 'set', prop: prop, value: value }); }
    });
  });
  return ctx;
}

function makeCanvas(spec) {
  spec = spec || {};
  const rect = spec.rect || { left: 0, top: 0, width: 400, height: 300 };
  const styleWrites = [];
  const style = {};
  for (const key of ['width', 'height']) {
    let backing = key === 'width' ? (spec.width || 300) : (spec.height || 150);
    let sets = 0;
    Object.defineProperty(style, key, { configurable: true, get() { return ''; }, set(v) { styleWrites.push([key, v]); } });
  }
  const ctx = makeCtx();
  const canvas = {
    style,
    ownerDocument: spec.ownerDocument || null,
    getBoundingClientRect() { return typeof rect === 'function' ? rect() : rect; },
    getContext() { return ctx; },
    _ctx: ctx,
    _styleWrites: styleWrites,
    widthSets: 0,
    heightSets: 0
  };
  let w = spec.width || 300, h = spec.height || 150;
  Object.defineProperty(canvas, 'width', {
    configurable: true,
    get() { return w; },
    set(v) { w = v; canvas.widthSets++; }
  });
  Object.defineProperty(canvas, 'height', {
    configurable: true,
    get() { return h; },
    set(v) { h = v; canvas.heightSets++; }
  });
  Object.defineProperty(canvas, 'clientWidth', { get() { return rect.width; } });
  Object.defineProperty(canvas, 'clientHeight', { get() { return rect.height; } });
  return canvas;
}

function canvasFactory() {
  const created = [];
  function factory(w, h) {
    const ctx = makeCtx();
    const off = {
      getContext() { return ctx; },
      _ctx: ctx,
      width: w,
      height: h
    };
    created.push(off);
    return off;
  }
  factory.created = created;
  return factory;
}

function chromeDoc(box) {
  // box: {border, padding} applied on every edge
  return {
    defaultView: {
      getComputedStyle() {
        const v = box.border + 'px';
        const p = box.padding + 'px';
        return {
          borderLeftWidth: v, borderRightWidth: v, borderTopWidth: v, borderBottomWidth: v,
          paddingLeft: p, paddingRight: p, paddingTop: p, paddingBottom: p
        };
      }
    }
  };
}

// --------------------------------------------------------------------------
// Fixtures / views
// --------------------------------------------------------------------------

function squareData(over) {
  const d = {
    schemaVersion: 1,
    mapVersion: 'test-v1',
    bounds: [0, 0, 1000, 800],
    shapes: [
      { kind: 'water', rings: [[[60, 60], [940, 60], [940, 200], [60, 200], [60, 60]]] },
      { kind: 'road', rings: [[[0, 400], [1000, 380], [1000, 430], [0, 450], [0, 400]]] },
      { kind: 'bridge', rings: [[[460, 380], [540, 380], [540, 450], [460, 450], [460, 380]]] },
      { kind: 'building', rings: [[[200, 520], [300, 520], [300, 640], [200, 640], [200, 520]]] }
    ],
    markers: [
      { id: 'm1', x: 250, y: 580, districtId: 'd1' },
      { id: 'm2', x: 750, y: 300, districtId: 'd1' }
    ],
    travelLinks: []
  };
  return Object.assign(d, over || {});
}

function baseView(over) {
  const v = {
    mode: 'overview',
    data: squareData(),
    districts: [{ id: 'd1', name: 'District One', bounds: [0, 0, 1000, 800] }],
    places: [],
    activeDistrictId: 'd1',
    position: { x: 500, y: 400, visited: [], bike: null },
    path: [],
    target: null,
    afterHours: false,
    camera: 'fit',
    flowerCart: null,
    garden: null
  };
  return Object.assign(v, over || {});
}

function districtData(over) {
  const d = {
    schemaVersion: 1,
    mapVersion: 'test-v1',
    id: 'd1',
    name: 'D1',
    bounds: [0, 0, 200, 200],
    entrance: { x: 100, y: 100 },
    anchors: {},
    shapes: [
      { kind: 'water', rings: [[[10, 10], [190, 10], [190, 40], [10, 40], [10, 10]]] },
      { kind: 'building', rings: [[[60, 120], [90, 120], [90, 160], [60, 160], [60, 120]]] }
    ],
    travelLinks: []
  };
  return Object.assign(d, over || {});
}

function districtView(over) {
  const v = baseView({
    mode: 'district',
    data: districtData(),
    activeDistrictId: 'd1',
    position: { x: 100, y: 100, visited: [], bike: null }
  });
  return Object.assign(v, over || {});
}

function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// Client-page coordinates for a world point, given plain zero-origin chrome.
function clientFor(scene, wx, wy, rect) {
  const tr = scene.diagnostics().transform;
  const r = rect || { left: 0, top: 0 };
  return { clientX: r.left + wx * tr.scale + tr.tx, clientY: r.top + wy * tr.scale + tr.ty };
}

// Label chips are the only fillRect immediately paired with an equal-geometry
// strokeRect and a subsequent fillText (cart bodies and garden walls pair
// rects too but never stroke+fillText afterwards). Structural witness, no
// private strings or color coupling.
function labelChips(ctx) {
  const ops = ctx.ops;
  const chips = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.op !== 'fillRect' || o.a.length !== 4) continue;
    let paired = false, text = null;
    for (let k = i + 1; k < Math.min(ops.length, i + 9); k++) {
      const q = ops[k];
      if (q.op === 'fillText') { text = q.text; break; }
      if (q.op === 'fillRect') break;
      if (q.op === 'strokeRect' && q.a.length === 4 &&
          q.a.every((v, j) => approx(v, o.a[j], 1e-9))) paired = true;
    }
    if (paired && text !== null) chips.push({ x: o.a[0], y: o.a[1], w: o.a[2], h: o.a[3], text });
  }
  return chips;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test('module exports the DistrictScene UMD class', () => {
  assert.equal(typeof DistrictScene, 'function');
  assert.equal(typeof DistrictScene.prototype.draw, 'function');
  assert.equal(typeof DistrictScene.prototype.screenToWorld, 'function');
  assert.equal(typeof DistrictScene.prototype.hitTest, 'function');
  assert.equal(typeof DistrictScene.prototype.dispose, 'function');
  assert.equal(typeof DistrictScene.prototype.diagnostics, 'function');
});

test('constructor derives backing store from content box and never writes author CSS', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 400, height: 300 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView());
  assert.equal(canvas.width, 400);
  assert.equal(canvas.height, 300);
  assert.equal(canvas.widthSets, 1);
  assert.deepEqual(canvas._styleWrites, []);
  assert.deepEqual(Object.keys(canvas.style).filter(k => k === 'width' || k === 'height'), []);
  const d = scene.diagnostics();
  assert.equal(d.liveCanvases, 2);
  assert.equal(d.backingWidth, 400);
  assert.equal(d.backingHeight, 300);
  assert.equal(d.cacheBytes, 400 * 300 * 4);
  assert.equal(d.staticBuilds, 1);
});

test('idle repeated draws reuse one static build; time animation never rebuilds', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  // One view object with one attached data identity across the whole idle
  // sequence: a fresh data object on every frame must not masquerade as reuse.
  const v = baseView();
  scene.draw(v, 0);
  const offCtx = factory.created[0]._ctx;
  const opsAfterFirst = offCtx.ops.length;
  for (let i = 1; i <= 100; i++) scene.draw(v, i * 0.016);
  assert.equal(offCtx.ops.length, opsAfterFirst);
  assert.equal(scene.diagnostics().staticBuilds, 1);
  assert.equal(scene.diagnostics().cacheReuses, 100);
  // day/night change on the SAME view/data identity rebuilds
  v.afterHours = true;
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 2);
  v.afterHours = false;
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 3);
  // fit camera ignores player movement: mutate the SAME view and draw again
  // while the current cache key is still this one (consecutive, not after
  // unrelated maps — the static cache holds one bounded slot).
  v.position = { x: 10, y: 10, visited: [], bike: null };
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 3);
  // a different data object identity rebuilds even when contents match
  scene.draw(baseView(), 0);
  assert.equal(scene.diagnostics().staticBuilds, 4);
  // a mapVersion bump on the same object invalidates the static layer
  v.data.mapVersion = 'test-v2';
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 5);
});

test('cache invalidations: same-object mapVersion bump, entrance change, malformed never cached', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const v = baseView();
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 1);
  // Mutating the attached data object is valid only with a mapVersion bump;
  // the version-gated WeakMap revalidates and the static layer rebuilds.
  v.data.mapVersion = 'test-v2';
  scene.draw(v, 0);
  assert.equal(scene.diagnostics().staticBuilds, 2);
  // An equal-contents object with a new identity also rebuilds.
  scene.draw(baseView(), 0);
  assert.equal(scene.diagnostics().staticBuilds, 3);
  // A district entrance change moves schematic link endpoints, so the
  // district signature (id|bounds|entrance|name) invalidates the static layer
  // even though the attached data object is untouched.
  const v2 = baseView();
  scene.draw(v2, 0);
  assert.equal(scene.diagnostics().staticBuilds, 4);
  v2.districts[0].entrance = { x: 12, y: 34 };
  scene.draw(v2, 0);
  assert.equal(scene.diagnostics().staticBuilds, 5);
  // A malformed first input throws and is never cached as valid: a second
  // attempt with the same object still throws, then the repaired object draws.
  const badData = squareData();
  badData.shapes = null;
  const badView = baseView({ data: badData });
  assert.throws(() => scene.draw(badView), TypeError);
  assert.throws(() => scene.draw(badView), TypeError);
  badData.shapes = squareData().shapes;
  scene.draw(badView);
  assert.equal(scene.diagnostics().staticBuilds, 6);
});

test('street camera rebuilds only when its world window changes', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const v = districtView({ camera: 'street', position: { x: 100, y: 100, visited: [], bike: null } });
  scene.draw(v);
  assert.equal(scene.diagnostics().staticBuilds, 1);
  scene.draw(v);
  assert.equal(scene.diagnostics().staticBuilds, 1);
  v.position = { x: 130, y: 120, visited: [], bike: null };
  scene.draw(v);
  assert.equal(scene.diagnostics().staticBuilds, 2);
});

test('fit camera matrix centers full bounds and inverts exactly', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 400, height: 300 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({ data: squareData({ bounds: [0, 0, 1000, 1000] }),
    districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 1000, 1000] }] }));
  const tr = scene.diagnostics().transform;
  assert.ok(approx(tr.scale, 0.3));
  const w = scene.screenToWorld(200, 150);
  assert.ok(approx(w.x, 500, 1e-6), 'screen center maps to world center x');
  assert.ok(approx(w.y, 500, 1e-6), 'screen center maps to world center y');
});

test('nonzero-offset district bounds map correctly (local coordinates)', () => {
  const factory = canvasFactory();
  const data = JSON.parse(JSON.stringify(districtFixture));
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 440, height: 280 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const v = {
    mode: 'district', data,
    districts: [{ id: data.id, name: data.name, bounds: data.bounds }],
    places: [
      { id: 'pub', name: 'Tweede Kans', icon: 'B', x: 1100.5, y: 3243.5, districtId: data.id },
      { id: 'lotte', name: 'Lotte', icon: 'N', x: 1056.5, y: 3247.5, districtId: data.id }
    ],
    activeDistrictId: data.id,
    position: { x: 1100.5, y: 3243.5, visited: [], bike: null },
    path: [], target: null, afterHours: false, camera: 'fit', flowerCart: null, garden: null
  };
  scene.draw(v);
  const w = scene.screenToWorld(220, 140);
  assert.ok(approx(w.x, 1085, 1e-6), 'got ' + w.x);
  assert.ok(approx(w.y, 3255, 1e-6), 'got ' + w.y);
});

test('screenToWorld subtracts page rect, border and padding; margins return null', () => {
  const factory = canvasFactory();
  const rect = { left: 30, top: 40, width: 420, height: 320 };
  const canvas = makeCanvas({
    rect,
    ownerDocument: chromeDoc({ border: 2, padding: 8 }),
    width: 420, height: 320
  });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({ data: squareData({ bounds: [0, 0, 1000, 1000] }),
    districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 1000, 1000] }] }));
  // content origin in client coords is (30+2+8, 40+2+8) = (40,50)
  const origin = scene.screenToWorld(40, 50);
  assert.ok(approx(origin.y, 0, 1e-6), 'top content edge is world y0');
  assert.ok(approx(origin.x, -166.666667, 1e-4), 'letterboxed world left of 0');
  assert.equal(scene.screenToWorld(30, 40), null, 'border-box corner is outside content');
  assert.equal(scene.screenToWorld(35, 45), null, 'padding strip is outside content');
  assert.equal(scene.screenToWorld(449, 50), null, 'right border is outside content');
  assert.equal(scene.screenToWorld(-1, 10), null, 'page coords outside canvas return null');
});

test('rings with holes are traced and filled evenodd', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const data = squareData({
    bounds: [0, 0, 100, 100],
    shapes: [{
      kind: 'water',
      rings: [
        [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
        [[25, 25], [75, 25], [75, 75], [25, 75], [25, 25]]
      ]
    }]
  });
  scene.draw(baseView({ data, districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 100, 100] }] }));
  const ops = factory.created[0]._ctx.ops;
  const evenoddFills = ops.filter(o => o.op === 'fill' && o.rule === 'evenodd');
  assert.ok(evenoddFills.length >= 1, 'shape filled with evenodd');
  assert.ok(ops.some(o => o.op === 'clip' && o.rule === 'evenodd'), 'water ripple clip is evenodd');
  // Both rings are walked into the same path before the fill.
  const firstFill = ops.findIndex(o => o.op === 'fill');
  const moveTos = ops.slice(0, firstFill).filter(o => o.op === 'moveTo');
  assert.ok(moveTos.length >= 2, 'outer ring and hole ring both traced');
});

test('local static painting stays inside the nonzero-offset district bounds', () => {
  const factory = canvasFactory();
  const data = JSON.parse(JSON.stringify(districtFixture));
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 520 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const v = {
    mode: 'district', data,
    districts: [],
    places: [
      { id: 'pub', name: 'Pub', icon: 'B', x: 1100.5, y: 3243.5, districtId: data.id },
      { id: 'lotte', name: 'Lotte', icon: 'N', x: 1056.5, y: 3247.5, districtId: data.id }
    ],
    activeDistrictId: data.id,
    position: { x: 1100.5, y: 3243.5, visited: [], bike: null },
    path: [], target: null, afterHours: false, camera: 'fit', flowerCart: null, garden: null
  };
  scene.draw(v);
  // Witness the actual SHAPE geometry: coordinates traced between beginPath
  // and an evenodd fill are the rings (plus the <=1 world-unit roof shadow
  // offset). Decorative strokes painted AFTER a clip — stone seams, water
  // ripples, bridge decking — may route paths through areas the clip then
  // hides, so they are not part of this bounds witness.
  const ops = factory.created[0]._ctx.ops;
  const shapePoints = [];
  let pending = [];
  for (const o of ops) {
    if (o.op === 'beginPath') pending = [];
    else if (o.op === 'moveTo' || o.op === 'lineTo') pending.push(o.a);
    else if (o.op === 'fill' && o.rule === 'evenodd') {
      shapePoints.push(...pending);
      pending = [];
    } else if (o.op === 'stroke' || (o.op === 'clip')) {
      pending = [];
    }
  }
  assert.ok(shapePoints.length >= data.shapes.length * 3, 'all rings traced into fills');
  for (const a of shapePoints) {
    assert.ok(a[0] >= 1029 && a[0] <= 1141, 'shape x inside district bounds: ' + a[0]);
    assert.ok(a[1] >= 3219 && a[1] <= 3291, 'shape y inside district bounds: ' + a[1]);
  }
  assert.equal(scene.diagnostics().shapes, data.shapes.length);
});

test('hitTest places: active target wins close-venue ties; nearest otherwise', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 300 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const places = [
    { id: 'a', name: 'Alpha', icon: 'A', x: 100, y: 100, districtId: 'd1' },
    { id: 'b', name: 'Bravo', icon: 'B', x: 103, y: 100, districtId: 'd1' }
  ];
  scene.draw(districtView({
    mode: 'district', data: districtData(), activeDistrictId: 'd1',
    places, target: 'b'
  }));
  let c = clientFor(scene, 100, 100);
  assert.deepEqual(scene.hitTest(c.clientX, c.clientY), { type: 'place', id: 'b' },
    'active target has priority over an equally close venue');
  c = clientFor(scene, 103, 100);
  assert.deepEqual(scene.hitTest(c.clientX, c.clientY), { type: 'place', id: 'b' });

  const scene2 = new DistrictScene(makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 300 } }),
    { canvasFactory: canvasFactory() });
  scene2.draw(districtView({
    mode: 'district', data: districtData(), activeDistrictId: 'd1', places, target: null
  }));
  const ca = clientFor(scene2, 100, 100);
  assert.deepEqual(scene2.hitTest(ca.clientX, ca.clientY), { type: 'place', id: 'a' },
    'without a target the nearest marker wins');
});

test('hitTest overview districts and empty space', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 400, height: 300 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({
    data: squareData({ bounds: [0, 0, 1000, 1000], markers: [] }),
    districts: [{ id: 'd1', name: 'D1', bounds: [100, 100, 400, 400] }],
    position: { x: 500, y: 500, visited: [], bike: null }
  }));
  const inside = clientFor(scene, 250, 250);
  assert.deepEqual(scene.hitTest(inside.clientX, inside.clientY), { type: 'district', id: 'd1' });
  const outside = clientFor(scene, 900, 50);
  assert.equal(scene.hitTest(outside.clientX, outside.clientY), null);
  assert.equal(scene.hitTest(-5, -5), null);
});

test('place markers outrank district rectangles in overview hitTest', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 400, height: 300 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({
    data: squareData({
      bounds: [0, 0, 1000, 1000],
      markers: [{ id: 'm1', x: 250, y: 250, districtId: 'd1' }]
    }),
    districts: [{ id: 'd1', name: 'D1', bounds: [100, 100, 400, 400] }],
    places: [{ id: 'm1', name: 'Marker One', icon: 'M', x: 250, y: 250, districtId: 'd1' }],
    position: { x: 500, y: 500, visited: [], bike: null }
  }));
  const c = clientFor(scene, 250, 250);
  assert.deepEqual(scene.hitTest(c.clientX, c.clientY), { type: 'place', id: 'm1' });
});

test('parked bike in a remote district is not drawn; local parked bike is', () => {
  function run(bike) {
    const factory = canvasFactory();
    const data = JSON.parse(JSON.stringify(districtFixture));
    const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 520 } });
    const scene = new DistrictScene(canvas, { canvasFactory: factory });
    scene.draw({
      mode: 'district', data, districts: [], places: [], activeDistrictId: data.id,
      position: { x: 1100.5, y: 3243.5, visited: [], bike: bike },
      path: [], target: null, afterHours: false, camera: 'street', flowerCart: null, garden: null
    });
    const tr = scene.diagnostics().transform;
    const bsx = bike.x * tr.scale + tr.tx, bsy = bike.y * tr.scale + tr.ty;
    // The bike glyph strokes two wheel rings at (+-6.5, +4.5) CSS px from the
    // bike anchor with radius 4.4 — wheel CENTERS sit 7.91px from the anchor,
    // so a witness radius under 7 could never see them. Match the exact arcs.
    const arcs = canvas._ctx.ops.filter(o => o.op === 'arc');
    function wheelAt(dx) {
      return arcs.some(o =>
        Math.abs(o.a[0] - (bsx + dx * 6.5)) <= 1.2 &&
        Math.abs(o.a[1] - (bsy + 4.5)) <= 1.2 &&
        Math.abs(o.a[2] - 4.4) <= 0.6);
    }
    const wheels = (wheelAt(-1) ? 1 : 0) + (wheelAt(1) ? 1 : 0);
    return { near: wheels, onScreen: bsx > -30 && bsx < 420 && bsy > -30 && bsy < 550 };
  }
  const remote = run({ x: 1120, y: 3265, mounted: false, districtId: 'centrum' });
  assert.equal(remote.onScreen, true, 'fixture setup: remote bike position is on screen');
  assert.equal(remote.near, 0, 'no bike glyph drawn for remote parked bike');
  const local = run({ x: 1104, y: 3247, mounted: false, districtId: districtFixture.id });
  assert.ok(local.near >= 2, 'local parked bike wheels are drawn (got ' + local.near + ')');
});

test('route draws exactly supplied points; a null gap is not interpolated', () => {
  const factory = canvasFactory();
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const canvas = makeCanvas({ rect });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({
    data: squareData({ bounds: [0, 0, 1000, 1000] }),
    districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 1000, 1000] }],
    position: { x: 100, y: 100, visited: [], bike: null },
    path: [{ x: 120, y: 120 }, { x: 140, y: 140 }]
  }));
  const tr = scene.diagnostics().transform;
  function sp(x, y) { return [x * tr.scale + tr.tx, y * tr.scale + tr.ty]; }
  const expected = [sp(100, 100), sp(120, 120), sp(140, 140)];
  const pathOps = canvas._ctx.ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo');
  let found = false;
  for (let i = 0; i + 2 < pathOps.length; i++) {
    if (pathOps[i].op === 'moveTo' && pathOps[i + 1].op === 'lineTo' && pathOps[i + 2].op === 'lineTo' &&
        approx(pathOps[i].a[0], expected[0][0], 1e-6) && approx(pathOps[i].a[1], expected[0][1], 1e-6) &&
        approx(pathOps[i + 1].a[0], expected[1][0], 1e-6) && approx(pathOps[i + 1].a[1], expected[1][1], 1e-6) &&
        approx(pathOps[i + 2].a[0], expected[2][0], 1e-6) && approx(pathOps[i + 2].a[1], expected[2][1], 1e-6)) {
      found = true; break;
    }
  }
  assert.ok(found, 'supplied route polyline present with no extra points');
});

test('null gap splits the route into separate subpaths', () => {
  const factory = canvasFactory();
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const canvas = makeCanvas({ rect });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView({
    data: squareData({ bounds: [0, 0, 1000, 1000] }),
    districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 1000, 1000] }],
    position: { x: 100, y: 100, visited: [], bike: null },
    path: [{ x: 120, y: 120 }, null, { x: 140, y: 140 }]
  }));
  const tr = scene.diagnostics().transform;
  const p3 = [140 * tr.scale + tr.tx, 140 * tr.scale + tr.ty];
  const reaches3 = canvas._ctx.ops.some(o => (o.op === 'lineTo' || o.op === 'moveTo') &&
    approx(o.a[0], p3[0], 1e-6) && approx(o.a[1], p3[1], 1e-6));
  assert.equal(reaches3, false, 'gap endpoint is not connected or moved to');
});

test('travelLinks: ferry and street are visually distinct; bad links dropped, not thrown', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const data = squareData({
    markers: [{ id: 'm1', x: 100, y: 100, districtId: 'd1' }, { id: 'm2', x: 900, y: 700, districtId: 'd1' }],
    travelLinks: [
      { kind: 'ferry', from: [100, 100], to: [900, 700] },
      { kind: 'street', from: 'm1', to: 'm2' },
      { kind: 'ferry', from: [1, 2] } // unresolved endpoint: dropped
    ]
  });
  scene.draw(baseView({ data }));
  const s = scene.diagnostics().transform.scale;
  const dashes = factory.created[0]._ctx.ops.filter(o => o.op === 'setLineDash').map(o => o.d);
  assert.ok(dashes.some(d => approx(d[0], 11 / s, 1e-6) && approx(d[1], 8 / s, 1e-6)), 'ferry long dash');
  assert.ok(dashes.some(d => approx(d[0], 6 / s, 1e-6) && approx(d[1], 5 / s, 1e-6)), 'street short dash');
  assert.equal(scene.diagnostics().droppedLinks, 1);
});

test('collision-aware labels: clustered venues yield non-overlapping chips, target first', () => {
  const cluster = [
    { id: 'a', name: 'Alpha Venue', icon: 'A', x: 100, y: 100, districtId: 'd1' },
    { id: 'b', name: 'Bravo Place', icon: 'B', x: 100.3, y: 100, districtId: 'd1' },
    { id: 'c', name: 'Charlie Corner', icon: 'C', x: 99.8, y: 100.2, districtId: 'd1' }
  ];
  function run(target, places) {
    const factory = canvasFactory();
    const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 300 } });
    const scene = new DistrictScene(canvas, { canvasFactory: factory });
    scene.draw(districtView({
      mode: 'district', data: districtData(), activeDistrictId: 'd1',
      places: places || cluster, target: target
    }));
    return labelChips(canvas._ctx);
  }
  // Three coincident markers have four free sides: when every label fits the
  // correct behavior is to SHOW all three on disjoint chips — suppression must
  // not be demanded merely because markers coincide.
  const withTarget = run('b');
  const names = ['Alpha Venue', 'Bravo Place', 'Charlie Corner'];
  for (const name of names) {
    const chip = withTarget.find(c => c.text === name);
    assert.ok(chip, name + ' chip is shown when a side is free');
    // chips stay fully inside the 390 CSS px viewport
    assert.ok(chip.x >= 0 && chip.y >= 0 && chip.x + chip.w <= 390 && chip.y + chip.h <= 300,
      name + ' chip inside viewport');
  }
  for (let i = 0; i < withTarget.length; i++) {
    for (let j = i + 1; j < withTarget.length; j++) {
      assert.equal(rectsOverlap(withTarget[i], withTarget[j]), false,
        'chips never overlap: ' + withTarget[i].text + ' / ' + withTarget[j].text);
    }
  }

  // Genuine overcrowding: six coincident venues cannot all occupy the four
  // sides, so the extras collapse to dots while the active target survives.
  const crowd = cluster.concat([
    { id: 'd', name: 'Delta Dock', icon: 'D', x: 100.1, y: 99.9, districtId: 'd1' },
    { id: 'e', name: 'Echo Eetcafe', icon: 'E', x: 99.9, y: 100.1, districtId: 'd1' },
    { id: 'f', name: 'Foxtrot Frituur', icon: 'F', x: 100.2, y: 99.8, districtId: 'd1' }
  ]);
  const crowded = run('e', crowd);
  const crowdTexts = crowded.map(c => c.text);
  assert.ok(crowdTexts.includes('Echo Eetcafe'), 'active target chip is always reserved');
  assert.ok(crowdTexts.length < 6, 'coincident markers never pile all labels on one spot');
  assert.ok(crowdTexts.length <= 4, 'only the four free sides carry chips');
  for (let i = 0; i < crowded.length; i++) {
    for (let j = i + 1; j < crowded.length; j++) {
      assert.equal(rectsOverlap(crowded[i], crowded[j]), false, 'crowded chips stay disjoint');
    }
  }
});

test('malformed input fails loudly with TypeError', () => {
  const scene = new DistrictScene(makeCanvas(), { canvasFactory: canvasFactory() });
  function bad(v) { return () => scene.draw(v); }
  assert.throws(bad(null), TypeError);
  assert.throws(bad({}), TypeError);
  assert.throws(bad(baseView({ mode: 'satellite' })), TypeError);
  assert.throws(bad(baseView({ camera: 'panopticon' })), TypeError);
  assert.throws(bad(baseView({ data: squareData({ schemaVersion: 2 }) })), TypeError);
  assert.throws(bad(baseView({ data: squareData({ bounds: [0, 0, -1, 100] }) })), TypeError);
  assert.throws(bad(baseView({ data: squareData({ bounds: [0, 0, 10] }) })), TypeError);
  assert.throws(bad(baseView({ data: squareData({ shapes: 'nope' }) })), TypeError);
  assert.throws(bad(baseView({
    data: squareData({ shapes: [{ kind: 'water', rings: [[[0, 0], [NaN, 1], [1, 1]]] }] })
  })), TypeError);
  assert.throws(bad(baseView({
    data: squareData({ shapes: [{ kind: 'canal', rings: [[[0, 0], [1, 0], [1, 1]]] }] })
  })), TypeError);
  assert.throws(bad(baseView({
    data: squareData({ shapes: [{ kind: 'water', rings: [[[0, 0], [1, 0]]] }] })
  })), TypeError);
  assert.throws(bad(baseView({ position: { x: 0, visited: [], bike: null } })), TypeError);
  assert.throws(bad(baseView({ path: [{ x: 1 }] })), TypeError);
  assert.throws(bad(baseView({ path: 'there' })), TypeError);
  assert.throws(bad(baseView({ target: 7 })), TypeError);
  assert.throws(bad(baseView({ flowerCart: { x: 1 } })), TypeError);
  assert.throws(bad(baseView({
    places: [{ id: 4, name: 'X', x: 1, y: 1 }]
  })), TypeError);
  assert.throws(bad(baseView({
    districts: [{ id: 'd1', name: 'X', bounds: [0, 0, 1, 1, 2] }]
  })), TypeError);
});

test('dispose cancels rendering, is idempotent and releases offscreen buffers', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  scene.draw(baseView());
  const off = factory.created[0];
  scene.dispose();
  assert.equal(off.width, 1);
  assert.equal(off.height, 1);
  assert.equal(scene.diagnostics().liveCanvases, 1);
  assert.equal(scene.diagnostics().cacheBytes, 0);
  assert.equal(scene.diagnostics().disposed, true);
  assert.equal(scene.screenToWorld(10, 10), null);
  assert.equal(scene.hitTest(10, 10), null);
  assert.throws(() => scene.draw(baseView()), /disposed/);
  scene.dispose(); // idempotent
});

test('DPR clamp and 2048 backing resource bounds', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 300, height: 200 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory, dpr: 3 });
  scene.draw(baseView());
  assert.equal(scene.diagnostics().backingWidth, 600);
  assert.equal(scene.diagnostics().backingHeight, 400);
  assert.equal(scene.diagnostics().dpr, 2, 'device pixel ratio clamped to 2');

  const big = makeCanvas({ rect: { left: 0, top: 0, width: 9999, height: 9999 }, width: 9999, height: 9999 });
  const bigScene = new DistrictScene(big, { canvasFactory: canvasFactory(), dpr: 2 });
  bigScene.draw(baseView());
  const d = bigScene.diagnostics();
  assert.ok(d.backingWidth <= 2048 && d.backingHeight <= 2048);
  assert.ok(d.cacheBytes <= 2048 * 2048 * 4);
  assert.ok(d.liveCanvases <= 2);
});

test('resize: backing changes once per size change, idle frames hold size, CSS never written', () => {
  const factory = canvasFactory();
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const canvas = makeCanvas({ rect });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  // One view object with one attached data identity for the whole sequence;
  // a fresh data object per draw would force a rebuild for identity reasons.
  const v = baseView();
  scene.draw(v);
  assert.equal(canvas.widthSets, 1, JSON.stringify(scene.diagnostics()));
  scene.draw(v);
  assert.equal(canvas.widthSets, 1, JSON.stringify({ d: scene.diagnostics(), w: canvas.width, h: canvas.height }));
  for (let i = 0; i < 100; i++) scene.draw(v, i * 0.016);
  assert.equal(canvas.widthSets, 1, 'no backing churn on 100 idle frames');
  assert.equal(scene.diagnostics().staticBuilds, 1);
  assert.deepEqual(canvas._styleWrites, [], 'physical CSS outer size is the author’s alone');

  rect.width = 500; rect.height = 300;
  scene.draw(v);
  assert.equal(canvas.width, 500);
  assert.equal(canvas.widthSets, 2);
  assert.equal(scene.diagnostics().staticBuilds, 2, 'viewport change rebuilds static layer');
  assert.equal(factory.created[0].width, 500, 'single offscreen canvas is resized, not duplicated');
  for (let i = 0; i < 100; i++) scene.draw(v, i * 0.016);
  assert.equal(canvas.widthSets, 2);
  assert.equal(scene.diagnostics().staticBuilds, 2);
  assert.equal(scene.diagnostics().liveCanvases, 2, 'at most two live canvases');
});

test('screenToWorld before first draw and with non-finite input is null', () => {
  const scene = new DistrictScene(makeCanvas(), { canvasFactory: canvasFactory() });
  assert.equal(scene.screenToWorld(10, 10), null);
  assert.equal(scene.hitTest(10, 10), null);
  const factory = canvasFactory();
  const scene2 = new DistrictScene(makeCanvas(), { canvasFactory: factory });
  scene2.draw(baseView());
  assert.equal(scene2.screenToWorld('x', 1), null);
  assert.equal(scene2.hitTest(NaN, 1), null);
});

test('real attached fixtures render in both modes, day and night', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 600 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const places = [
    { id: 'pub', name: 'Tweede Kans', icon: 'B', x: 1100.211, y: 3243.117, districtId: 'pub-sample' },
    { id: 'lotte', name: 'Lotte', icon: 'N', x: 1056.057, y: 3247.41, districtId: 'pub-sample' }
  ];
  const common = {
    districts: [{ id: 'pub-sample', name: 'Pub public subset', bounds: [1030, 3220, 1140, 3290] }],
    places, activeDistrictId: 'pub-sample',
    position: { x: 1100.211, y: 3243.117, visited: ['lotte'], bike: null },
    path: [{ x: 1090, y: 3245 }, { x: 1070, y: 3247 }], target: 'pub',
    flowerCart: { x: 1095, y: 3262 }, garden: { x: 1075, y: 3230, known: true }
  };
  scene.draw(Object.assign({ mode: 'overview', data: overviewFixture,
    afterHours: false, camera: 'fit' }, common));
  assert.equal(scene.diagnostics().shapes, overviewFixture.shapes.length);
  scene.draw(Object.assign({ mode: 'overview', data: overviewFixture,
    afterHours: true, camera: 'fit' }, common));
  scene.draw(Object.assign({ mode: 'district', data: districtFixture,
    afterHours: false, camera: 'fit' }, common));
  scene.draw(Object.assign({ mode: 'district', data: districtFixture,
    afterHours: false, camera: 'street' }, common));
  scene.draw(Object.assign({ mode: 'district', data: districtFixture,
    afterHours: true, camera: 'street' }, common));
  assert.ok(scene.diagnostics().staticBuilds >= 4);
  // Marker hit test against the actual anchor coordinate.
  scene.draw(Object.assign({ mode: 'district', data: districtFixture,
    afterHours: false, camera: 'fit' }, common, { target: null }));
  const c = clientFor(scene, 1100.211, 3243.117);
  assert.deepEqual(scene.hitTest(c.clientX, c.clientY), { type: 'place', id: 'pub' });
  // overview markers resolve from data.markers even without place details
  const factory2 = canvasFactory();
  const canvas2 = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 600 } });
  const scene2 = new DistrictScene(canvas2, { canvasFactory: factory2 });
  scene2.draw({
    mode: 'overview', data: overviewFixture,
    districts: common.districts, places: [], activeDistrictId: 'pub-sample',
    position: { x: 1100, y: 3243, visited: [], bike: null },
    path: [], target: null, afterHours: false, camera: 'fit', flowerCart: null, garden: null
  });
  const cm = clientFor(scene2, 1100.211, 3243.117);
  assert.deepEqual(scene2.hitTest(cm.clientX, cm.clientY), { type: 'place', id: 'pub' });
});

test('d30 close street keeps the real pub and Lotte bridgehead visible, labelled and clickable', () => {
  // Use the actual production geography, not the older public subset. Rendering
  // stays mocked; the world scale, anchors and marker hit tests are real.
  const file = path.join(__dirname, 'map-data', 'amsterdam-shape-d30-v1', 'districts', 'jordaan.json.gz');
  const data = JSON.parse(gunzipSync(fs.readFileSync(file)));
  assert.equal(data.mapVersion, 'amsterdam-shape-d30-v1');
  assert.deepEqual(data.anchors.lotte, {
    x: 1059.5, y: 3256.5, sourceX: 1059.5, sourceY: 3256.5,
    featureId: 'wegdeel:efcc66b2-c61e-5f1e-a74b-7dca858058fe'
  });
  const names = { pub: 'Tweede Kans', lotte: 'Lotte 的桥' };
  const places = ['pub', 'lotte'].map(id => ({
    id, name: names[id], icon: id === 'pub' ? 'B' : 'N',
    x: data.anchors[id].x, y: data.anchors[id].y, districtId: data.id
  }));
  for (const [width, height, dpr] of [[750, 436, 1], [360, 390, 2]]) {
    const canvas = makeCanvas({ rect: { left: 0, top: 0, width, height } });
    const scene = new DistrictScene(canvas, { canvasFactory: canvasFactory(), dpr });
    scene.draw({
      mode: 'district', data,
      districts: [{ id: data.id, name: data.name, bounds: data.bounds, entrance: data.entrance }],
      places, activeDistrictId: data.id,
      position: { ...data.anchors.pub, visited: ['pub'], bike: null },
      path: [], target: null, afterHours: false, camera: 'street', flowerCart: null, garden: null
    });
    const tr = scene.diagnostics().transform;
    assert.equal(tr.camera, 'street');
    const chips = labelChips(canvas._ctx);
    for (const place of places) {
      const x = place.x * tr.scale + tr.tx, y = place.y * tr.scale + tr.ty;
      assert.ok(x >= 12 && x <= width - 12 && y >= 12 && y <= height - 12,
        place.id + ' marker is visibly inside the ' + width + 'px close view');
      assert.ok(chips.some(chip => chip.text === place.name), place.id + ' has a readable label');
      assert.deepEqual(scene.hitTest(x, y), { type: 'place', id: place.id },
        place.id + ' exact marker hit test at DPR ' + dpr);
    }
    scene.dispose();
  }
});

test('actual catalog: all five district-ID travel links render, F3 ferry distinct, zero dropped', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 600 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  // Real overview schema: shapes/markers/travelLinks attached as data.
  const links = catalog.manifest.travelLinks;
  assert.equal(links.length, 5, 'fixture setup: five real links');
  assert.deepEqual(links.map(l => [l.from, l.to, l.mode]).sort(),
    [['depijp', 'science', 'street'], ['jordaan', 'depijp', 'street'],
     ['jordaan', 'station', 'street'], ['science', 'station', 'street'],
     ['station', 'noord', 'ferry']].sort());
  const cityData = Object.assign({}, overviewFixture, {
    markers: catalog.markers,
    travelLinks: links
  });
  const cityDistricts = catalog.manifest.districts.map(d => {
    const snap = catalog.snappedDistricts.find(s => s.id === d.id);
    return { id: d.id, name: d.name, bounds: d.bounds, entrance: snap.entrance };
  });
  scene.draw({
    mode: 'overview', data: cityData, districts: cityDistricts, places: [],
    activeDistrictId: 'depijp',
    position: { x: 3000, y: 3300, visited: [], bike: null },
    path: [], target: null, afterHours: false, camera: 'fit',
    flowerCart: null, garden: null
  });
  const diag = scene.diagnostics();
  assert.equal(diag.droppedLinks, 0, 'every district-ID endpoint resolves');
  const s = diag.transform.scale;
  const ops = factory.created[0]._ctx.ops;
  // Four street links get one short-dash stroke each; the F3 ferry gets an
  // underlay plus a top long-dash stroke (visibly different dashed journey).
  const dashOps = ops.filter(o => o.op === 'setLineDash');
  const streetDashes = dashOps.filter(o => approx(o.d[0], 6 / s, 1e-6) && approx(o.d[1], 5 / s, 1e-6));
  const ferryDashes = dashOps.filter(o => approx(o.d[0], 11 / s, 1e-6) && approx(o.d[1], 8 / s, 1e-6));
  assert.equal(streetDashes.length, 4, 'four street links painted');
  assert.equal(ferryDashes.length, 1, 'F3 uses one visibly different long-dash pattern');
  // The ferry journey is stroked twice: dark underlay then the light top line.
  const strokeColors = ops.filter(o => o.op === 'set' && o.prop === 'strokeStyle').map(o => o.value);
  assert.ok(strokeColors.includes('rgba(16,44,56,.5)'), 'ferry dark underlay');
  assert.ok(strokeColors.includes('#dceef2'), 'ferry light top stroke');
  assert.ok(ops.some(o => o.op === 'fillText' && o.text === 'F3'), 'ferry number label painted');

  // All five documented entrances are used as schematic endpoints (world
  // metres, inside the translated static context).
  const entrances = catalog.snappedDistricts.map(d => d.entrance);
  const lineOps = ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo');
  for (const e of entrances) {
    assert.ok(lineOps.some(o => approx(o.a[0], e.x, 1e-6) && approx(o.a[1], e.y, 1e-6)),
      'link endpoint at entrance ' + e.x + ',' + e.y);
  }
  // One explicit segment: depijp entrance -> science entrance.
  let depijpScience = false;
  for (let i = 0; i + 1 < ops.length; i++) {
    const a = ops[i], b = ops[i + 1];
    if (a.op === 'moveTo' && b.op === 'lineTo' &&
        approx(a.a[0], 1930.5, 1e-6) && approx(a.a[1], 5497.5, 1e-6) &&
        approx(b.a[0], 6158.5, 1e-6) && approx(b.a[1], 5450.5, 1e-6)) depijpScience = true;
  }
  assert.ok(depijpScience, 'depijp -> science street link geometry');
});

test('travelLinks: district id without entrance uses bounds center; marker-ID endpoints still supported', () => {
  const factory = canvasFactory();
  const canvas = makeCanvas();
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  const data = squareData({
    markers: [{ id: 'm1', x: 100, y: 100, districtId: 'd1' }],
    travelLinks: [
      { mode: 'street', from: 'd1', to: { district: 'd2' } },
      { mode: 'street', from: 'm1', to: [900, 700] }
    ]
  });
  scene.draw(baseView({
    data,
    districts: [
      { id: 'd1', name: 'D1', bounds: [0, 0, 400, 400] },           // center (200,200)
      { id: 'd2', name: 'D2', bounds: [800, 0, 1000, 200] }          // center (900,100)
    ]
  }));
  assert.equal(scene.diagnostics().droppedLinks, 0);
  const ops = factory.created[0]._ctx.ops;
  const lineOps = ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo');
  assert.ok(lineOps.some(o => approx(o.a[0], 200, 1e-6) && approx(o.a[1], 200, 1e-6)),
    'entrance-less district endpoint falls back to bounds center');
  assert.ok(lineOps.some(o => approx(o.a[0], 900, 1e-6) && approx(o.a[1], 100, 1e-6)),
    'object {district} endpoint resolves through center');
  assert.ok(lineOps.some(o => approx(o.a[0], 100, 1e-6) && approx(o.a[1], 100, 1e-6)),
    'marker-ID endpoint support retained');
});

test('390 CSS px De Pijp street view: active flowers chip clears actor, nearby marker and cart', () => {
  // Real De Pijp extent/entrance from the catalog, minimal in-bounds shapes.
  const data = {
    schemaVersion: 1, mapVersion: 'depijp-test-v1', id: 'depijp', name: 'De Pijp',
    bounds: [1500, 5200, 2150, 6100], entrance: { x: 1930.5, y: 5497.5 },
    anchors: {
      flowers: { x: 1787.5, y: 5870.5 }, flowerCart: { x: 1797.5, y: 5870.5 },
      garden: { x: 1810.5, y: 5802.5 }, coffee: { x: 1890.5, y: 5451.5 },
      market: { x: 1930.5, y: 5497.5 }
    },
    shapes: [
      { kind: 'water', rings: [[[1510, 5900], [2140, 5900], [2140, 5960], [1510, 5960], [1510, 5900]]] },
      { kind: 'road', rings: [[[1500, 5860], [2150, 5850], [2150, 5880], [1500, 5890], [1500, 5860]]] },
      { kind: 'building', rings: [[[1850, 5700], [1900, 5700], [1900, 5760], [1850, 5760], [1850, 5700]]] }
    ],
    markers: [], travelLinks: []
  };
  const places = [
    { id: 'flowers', name: 'Flowers Stall', icon: 'F', x: 1787.5, y: 5870.5, districtId: 'depijp' },
    { id: 'flowerCart', name: 'Cut Flowers', icon: 'C', x: 1797.5, y: 5870.5, districtId: 'depijp' },
    { id: 'garden', name: 'Garden Plot', icon: 'G', x: 1810.5, y: 5802.5, districtId: 'depijp' },
    { id: 'coffee', name: 'Coffee Bar', icon: 'K', x: 1890.5, y: 5451.5, districtId: 'depijp' },
    { id: 'market', name: 'Market Hall', icon: 'M', x: 1930.5, y: 5497.5, districtId: 'depijp' }
  ];
  const factory = canvasFactory();
  const canvas = makeCanvas({ rect: { left: 0, top: 0, width: 390, height: 600 } });
  const scene = new DistrictScene(canvas, { canvasFactory: factory });
  // Player stands at the active target, flower cart prop 10m to the right.
  scene.draw({
    mode: 'district', data, districts: [{ id: 'depijp', name: 'De Pijp', bounds: data.bounds }],
    places, activeDistrictId: 'depijp',
    position: { x: 1787.5, y: 5870.5, visited: [], bike: null },
    path: [], target: 'flowers', afterHours: false, camera: 'street',
    flowerCart: { x: 1797.5, y: 5870.5 }, garden: { x: 1810.5, y: 5802.5, known: true }
  });
  const tr = scene.diagnostics().transform;
  const sp = (x, y) => ({ x: x * tr.scale + tr.tx, y: y * tr.scale + tr.ty });
  const chips = labelChips(canvas._ctx);
  const active = chips.find(c => c.text === 'Flowers Stall');
  assert.ok(active, 'active target chip is present at the crowded 390px street view');
  assert.ok(active.x >= 0 && active.y >= 0 && active.x + active.w <= 390 && active.y + active.h <= 600,
    'active chip fully inside viewport');
  for (const c of chips) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 390 && c.y + c.h <= 600, c.text + ' inside viewport');
  }
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      assert.equal(rectsOverlap(chips[i], chips[j]), false,
        'no chip-on-chip intersection: ' + chips[i].text + ' / ' + chips[j].text);
    }
  }
  // Live actor/prop/marker footprints, exactly as _liveFootprints reserves them.
  const player = sp(1787.5, 5870.5);
  const footprints = [{ x: player.x - 12, y: player.y - 14, w: 24, h: 27 }];
  for (const p of places) {
    const q = sp(p.x, p.y);
    const r = p.id === 'flowers' ? 8.5 + 2 : 8.5;
    const pad = r + 3.5; // dot footprint the layout reserves
    footprints.push({ x: q.x - pad, y: q.y + 1.4 - pad, w: 2 * pad, h: 2 * pad });
  }
  const cart = sp(1797.5, 5870.5);
  footprints.push({ x: cart.x - 12, y: cart.y - 13, w: 24, h: 26 });
  for (const chip of chips) {
    for (const f of footprints) {
      assert.equal(rectsOverlap(chip, f), false,
        'chip "' + chip.text + '" clears an actor/marker/cart footprint');
    }
  }
  // The player actor is still drawn (never hidden to make room for labels):
  // body circle radius 7.2 at (+0,+1) from the anchor.
  assert.ok(canvas._ctx.ops.some(o => o.op === 'arc' &&
    Math.abs(o.a[0] - player.x) <= 1 && Math.abs(o.a[1] - (player.y + 1)) <= 1 &&
    Math.abs(o.a[2] - 7.2) <= 0.2), 'player body visible');
});

test('malformed district entrance fails loudly', () => {
  const scene = new DistrictScene(makeCanvas(), { canvasFactory: canvasFactory() });
  assert.throws(() => scene.draw(baseView({
    districts: [{ id: 'd1', name: 'D1', bounds: [0, 0, 1, 1], entrance: { x: 1 } }]
  })), TypeError);
});

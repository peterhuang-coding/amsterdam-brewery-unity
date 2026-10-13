'use strict';

// PLAY09 pub material depth regressions. A real PubScene.draw runs inside a VM
// against a recording Canvas2D context (real save/restore stack, transform
// matrix, finite-argument checks and stable gradient handles). The checks are
// semantic spatial properties of the three allowed background spans — wall
// plaster/timber, contained lamp light and bevelled/recessed counter shell with
// localized night pools — not method existence or source regex counts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scenePath = path.join(__dirname, 'reopening-scene.js');
assert.ok(fs.existsSync(scenePath), 'reopening-scene.js must exist');
const sceneSource = fs.readFileSync(scenePath, 'utf8');

const mediaQuery = { matches: false };

// Synthetic renderer-only API per frame-contract.md; never a production change.
const Reopening = {
  BEERS: {
    blond: { name: '金色艾尔', short: '金色艾尔' },
    stout: { name: '运河黑啤', short: '黑啤' }
  },
  pourProgress(state, p) {
    return Math.max(0, Math.min(1, (state.night.elapsed - p.startedAt) / p.duration));
  }
};

function loadWorld() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.devicePixelRatio = 1;
  sandbox.matchMedia = () => mediaQuery;
  sandbox.Reopening = Reopening;
  vm.createContext(sandbox);
  vm.runInContext(sceneSource, sandbox);
  return sandbox;
}

const NUMERIC_INDICES = {
  fillRect: [0, 1, 2, 3], clearRect: [0, 1, 2, 3], rect: [0, 1, 2, 3],
  ellipse: [0, 1, 2, 3, 4, 5, 6], arc: [0, 1, 2, 3, 4],
  moveTo: [0, 1], lineTo: [0, 1],
  quadraticCurveTo: [0, 1, 2, 3], bezierCurveTo: [0, 1, 2, 3, 4, 5],
  fillText: [1, 2], strokeText: [1, 2],
  translate: [0, 1], scale: [0, 1], rotate: [0],
  transform: [0, 1, 2, 3, 4, 5], setTransform: [0, 1, 2, 3, 4, 5],
  createRadialGradient: [0, 1, 2, 3, 4, 5], createLinearGradient: [0, 1, 2, 3],
  addColorStop: [0]
};
const XY_ORIGIN = {
  fillRect: [0, 1], clearRect: [0, 1], rect: [0, 1], ellipse: [0, 1],
  arc: [0, 1], moveTo: [0, 1], lineTo: [0, 1], fillText: [1, 2], strokeText: [1, 2]
};

function createRecorder() {
  const calls = [];
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let gradientSeq = 0;
  const gradients = new Map();
  const style = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    font: '10px sans-serif', textAlign: 'start', lineDash: [], lineDashOffset: 0
  };
  function screen(x, y) {
    return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  }
  function tag(value) {
    return value && typeof value === 'object' && '__gid' in value ? { gradient: value.__gid } : value;
  }
  function record(name, args, gradId) {
    const required = NUMERIC_INDICES[name];
    if (required) {
      for (const index of required) {
        const value = args[index];
        assert.ok(
          typeof value === 'number' && Number.isFinite(value),
          name + ' requires finite numeric geometry at argument ' + index + ' but got ' + String(value)
        );
      }
    }
    if (name === 'fillText' || name === 'strokeText') {
      assert.ok(typeof args[0] === 'string', name + ' first argument must be text');
    } else if (name === 'addColorStop') {
      assert.ok(typeof args[1] === 'string', 'addColorStop color must be a string');
    }
    for (const value of args) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), name + ' received a non-finite number');
    }
    let projected = null;
    const origin = XY_ORIGIN[name];
    if (origin) {
      const [sx, sy] = screen(args[origin[0]], args[origin[1]]);
      assert.ok(Number.isFinite(sx) && Number.isFinite(sy), name + ' produced non-finite screen coordinates');
      projected = [sx, sy];
    }
    for (const v of matrix) assert.ok(Number.isFinite(v), name + ' corrupted the transform matrix');
    const entry = {
      name, args: args.map(tag),
      fillStyle: tag(style.fillStyle), strokeStyle: tag(style.strokeStyle),
      lineWidth: style.lineWidth, screen: projected, matrix: matrix.slice()
    };
    if (gradId !== undefined) entry.gradId = gradId;
    calls.push(entry);
  }
  function makeGradient(id, kind, coords) {
    const info = { id, kind, coords: coords.slice(), stops: [] };
    gradients.set(id, info);
    return {
      __gid: id,
      addColorStop(offset, color) {
        info.stops.push({ offset, color });
        record('addColorStop', [offset, color], id);
      }
    };
  }
  const explicit = {
    save() {
      stack.push({ matrix: matrix.slice(), style: { ...style, lineDash: style.lineDash.slice() } });
      record('save', []);
    },
    restore() {
      const previous = stack.pop();
      assert.ok(previous, 'ctx.restore() called without a matching ctx.save()');
      matrix = previous.matrix;
      Object.assign(style, previous.style);
      record('restore', []);
    },
    translate(x, y) {
      matrix[4] += matrix[0] * x + matrix[2] * y;
      matrix[5] += matrix[1] * x + matrix[3] * y;
      record('translate', [x, y]);
    },
    scale(sx, sy) {
      matrix[0] *= sx; matrix[1] *= sx; matrix[2] *= sy; matrix[3] *= sy;
      record('scale', [sx, sy]);
    },
    setLineDash(dash) {
      const value = Array.isArray(dash) ? dash.slice() : [];
      for (const entry of value) assert.ok(typeof entry === 'number' && Number.isFinite(entry));
      style.lineDash = value;
      record('setLineDash', value.slice());
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const id = ++gradientSeq;
      record('createRadialGradient', [x0, y0, r0, x1, y1, r1], id);
      return makeGradient(id, 'radial', [x0, y0, r0, x1, y1, r1]);
    },
    createLinearGradient(x0, y0, x1, y1) {
      const id = ++gradientSeq;
      record('createLinearGradient', [x0, y0, x1, y1], id);
      return makeGradient(id, 'linear', [x0, y0, x1, y1]);
    }
  };
  const ctx = new Proxy(explicit, {
    get(target, key) {
      if (typeof key === 'symbol') return undefined;
      if (key in target) return target[key];
      return (...args) => record(String(key), args);
    },
    set(target, key, value) {
      if (key === 'lineDashOffset') assert.ok(Number.isFinite(value));
      style[key] = value;
      return true;
    }
  });
  return {
    ctx, calls, gradients,
    depth: () => stack.length,
    matrix: () => matrix.slice()
  };
}

function pubState(over = {}) {
  return {
    phase: 'night', day: 1, cash: 45,
    batches: [{ beer: 'blond', cups: 6 }, { beer: 'stout', cups: 2 }],
    upgrades: [], promises: { lotte: false }, music: false,
    night: { elapsed: 0, orders: [], pours: [] },
    ...over
  };
}

const MARTA = {
  id: 'guest-m', name: 'Marta', person: 'marta', beer: 'blond',
  arrival: 0, patience: 26, status: 'waiting', budget: 12,
  quote: '先倒一杯。', portrait: ''
};
const POUR = { customerId: 'guest-m', beer: 'stout', price: 10, quality: 1, aged: false, startedAt: 1, duration: 4 };

function render(world, state, timestamp = 0, selectedId = null, cityView = null) {
  const recorder = createRecorder();
  const canvas = { width: 0, height: 0, getContext: () => recorder.ctx };
  const scene = new world.PubScene(canvas);
  scene.draw(state, timestamp, selectedId, cityView);
  return { scene, recorder };
}

// Locate the three editable spans inside the recorded pub frame by their fixed
// anchor geometry (clear, window clip, lamp cords, counter top, first tap).
function spanRanges(calls) {
  const clear = calls.findIndex(q =>
    q.name === 'clearRect' && q.args[0] === 0 && q.args[1] === 0 && q.args[2] === 1100 && q.args[3] === 640);
  assert.ok(clear >= 0, 'pub frame must clear the full canvas');
  const wallEnd = calls.findIndex((q, i) => i > clear && q.name === 'save');
  const lampStart = calls.findIndex((q, i) =>
    i > wallEnd && q.name === 'moveTo' && q.args[0] === 257 && q.args[1] === 0 &&
    calls[i + 1] && calls[i + 1].name === 'lineTo' && calls[i + 1].args[0] === 257 && calls[i + 1].args[1] === 50);
  const counterStart = calls.findIndex((q, i) =>
    i > lampStart && q.name === 'fillRect' && q.args[0] === 10 && q.args[1] === 398 && q.args[2] === 1080 && q.args[3] === 38);
  const tapStart = calls.findIndex((q, i) =>
    i > counterStart && q.name === 'fillRect' && q.args[0] === 469 && q.args[1] === 391 && q.args[2] === 51 && q.args[3] === 7);
  for (const [label, value] of [['wallEnd', wallEnd], ['lampStart', lampStart], ['counterStart', counterStart], ['tapStart', tapStart]]) {
    assert.ok(value >= 0, 'anchor missing: ' + label);
  }
  return {
    wall: [clear + 1, wallEnd],
    lamp: [lampStart, counterStart],
    counter: [counterStart, tapStart]
  };
}
function sliceSpan(calls, range) { return calls.slice(range[0], range[1]); }

function parseColor(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim();
  if (!/^#[0-9a-fA-F]{8}$|^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  hex = hex.slice(1);
  if (hex.length === 6) hex += 'ff';
  const n = parseInt(hex, 16);
  return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: n & 255 };
}
function luminance(value) {
  const c = parseColor(value);
  return c ? 0.299 * c.r + 0.587 * c.g + 0.114 * c.b : null;
}
function isWarm(value) {
  const c = parseColor(value);
  return !!c && c.r >= 180 && c.r >= c.g + 15 && c.g >= c.b + 20;
}
function stringStyles(calls, kind) {
  const out = new Set();
  for (const call of calls) {
    const v = kind === 'fill' ? call.fillStyle : call.strokeStyle;
    if (typeof v === 'string') out.add(v);
  }
  return [...out];
}
function paintedRects(calls) {
  return calls.filter(q => q.name === 'fillRect').map(q => ({
    x: q.args[0], y: q.args[1], w: q.args[2], h: q.args[3], style: q.fillStyle
  }));
}
function strokePoints(calls) {
  // Every lineTo paired with the live strokeStyle; points are identity-matrix
  // screen coordinates (the pub draw sets no camera transform).
  const out = [];
  for (const call of calls) {
    if (call.name === 'lineTo') out.push({ x: call.args[0], y: call.args[1], style: call.strokeStyle });
  }
  return out;
}
function assertRectsInside(rects, b, label) {
  for (const r of rects) {
    assert.ok(r.x >= b.x0 && r.y >= b.y0 && r.x + r.w <= b.x1 && r.y + r.h <= b.y1,
      `${label}: rect ${JSON.stringify(r)} paints outside ${JSON.stringify(b)}`);
  }
}

const WALL_BAND = { x0: 0, y0: 0, x1: 1100, y1: 460 };
const TOP_BAND = { x0: 10, y0: 398, x1: 1090, y1: 436 };
const COUNTER_BAND = { x0: 0, y0: 398, x1: 1100, y1: 631 };
// Adopted base keeps the original nine-panel grid verbatim; its last column
// (x=1064) is clipped by the canvas edge. New detail may not add overhang.
const LEGACY_OVERHANG = new Set(['1064,452,113,156', '1069,457,103,146', '1074,462,93,134']);
const PANEL_X = [40, 168, 296, 424, 552, 680, 808, 936, 1064];
const LAMP_X = [257, 652, 952];

test('wall span: worn plaster and dark stained timber read as depth, by day and night', () => {
  const world = loadWorld();
  for (const phase of ['intro', 'night']) {
    const label = phase === 'night' ? 'night' : 'day';
    const { recorder } = render(world, pubState({ phase }));
    const wall = sliceSpan(recorder.calls, spanRanges(recorder.calls).wall);
    // Full-width dark timber: the kept top beam plus a new lower rail behind
    // the bar, both structurally readable rather than repetitive thin strips.
    const beams = paintedRects(wall).filter(r => r.w >= 1000);
    assert.ok(beams.some(r => r.y === 0 && r.h >= 18), label + ' keeps the heavy top beam');
    const rail = beams.find(r => r.y >= 380 && r.y + r.h <= 400);
    assert.ok(rail, label + ' gains a full-width stained timber rail above the bar');
    assert.ok(luminance(rail.style) <= 70, label + ' rail must read as dark stained timber');
    // Quiet plaster: several wide, very soft patches (not 3px repeating lines).
    const softPatches = paintedRects(wall).filter(r =>
      r.w >= 24 && r.h >= 12 && parseColor(r.style) && parseColor(r.style).a <= 0x14);
    assert.ok(softPatches.length >= 10, label + ' plaster needs multiple soft worn patches, got ' + softPatches.length);
    // Tonal variety: several distinct plaster/timber fills instead of a flat wash.
    const fills = stringStyles(wall, 'fill').filter(s => parseColor(s));
    assert.ok(fills.length >= 5, label + ' wall needs at least 5 distinct material tones, got ' + fills.length);
    // Everything stays inside the wall footprint behind the later fixtures.
    assertRectsInside(paintedRects(wall), WALL_BAND, label + ' wall');
    for (const p of strokePoints(wall)) assert.ok(p.x >= 0 && p.x <= 1100 && p.y >= 0 && p.y <= 460, label + ' wall line out of band');
  }
});

test('lamp span: the three anchors survive and night light is stronger yet fully contained', () => {
  const world = loadWorld();
  for (const phase of ['intro', 'night']) {
    const label = phase === 'night' ? 'night' : 'day';
    const night = phase === 'night';
    const { recorder } = render(world, pubState({ phase }));
    const ranges = spanRanges(recorder.calls);
    const lamp = sliceSpan(recorder.calls, ranges.lamp);
    for (const x of LAMP_X) {
      assert.ok(lamp.some((q, i) =>
        q.name === 'moveTo' && q.args[0] === x && q.args[1] === 0 &&
        lamp[i + 1] && lamp[i + 1].name === 'lineTo' && lamp[i + 1].args[0] === x && lamp[i + 1].args[1] === 50),
        label + ' lamp cord anchor missing at ' + x);
    }
    const cords = lamp.filter(q => q.name === 'moveTo' && q.args[1] === 0 && LAMP_X.includes(q.args[0]));
    assert.equal(cords.length, 3, label + ' must keep exactly three hanging lamps');
    const glowCalls = lamp.filter(q => q.name === 'createRadialGradient');
    if (!night) {
      assert.equal(glowCalls.length, 0, 'day lamps stay calm with no radial glow');
      continue;
    }
    assert.equal(glowCalls.length, 3, 'each night lamp gets one contained glow');
    for (const call of glowCalls) {
      const info = recorder.gradients.get(call.gradId);
      const [gx, gy] = [info.coords[0], info.coords[1]];
      assert.ok(LAMP_X.some(x => Math.abs(gx - x) <= 1), 'glow must be centred on a real lamp');
      assert.ok(gy >= 50 && gy <= 110, 'glow origin must sit at the shade, not on the foreground');
      const inner = info.stops.find(s => s.offset === 0);
      assert.ok(inner && isWarm(inner.color), 'night glow needs a warm copper core');
      const alpha = parseColor(inner.color).a;
      assert.ok(alpha >= 0x30 && alpha <= 0x80, 'glow core must be visibly warm but unable to wash props: ' + alpha);
      // Every fill painted with this gradient stays inside the wall band and
      // on screen (the adopted base glow spilled past the right canvas edge).
      const fills = lamp.filter(q => q.name === 'fillRect' && q.fillStyle && q.fillStyle.gradient === info.id);
      assert.ok(fills.length >= 1, 'glow gradient must actually be painted');
      assertRectsInside(fills.map(q => ({ x: q.args[0], y: q.args[1], w: q.args[2], h: q.args[3] })), WALL_BAND, 'night glow');
    }
  }
});

test('counter span: shell footprints and panel grid are preserved exactly', () => {
  const world = loadWorld();
  const { recorder } = render(world, pubState());
  const counter = sliceSpan(recorder.calls, spanRanges(recorder.calls).counter);
  const find = (x, y, w, h) => counter.find(q => q.name === 'fillRect' && q.args[0] === x && q.args[1] === y && q.args[2] === w && q.args[3] === h);
  assert.ok(find(10, 398, 1080, 38), 'counter top footprint must remain');
  const lip = find(10, 398, 1080, 7);
  assert.ok(lip && lip.fillStyle === '#a99668', 'polished lip highlight must remain');
  const cab = find(24, 436, 1052, 195);
  assert.ok(cab && cab.fillStyle === '#3b392c', 'cabinet footprint/color must remain');
  const base = find(15, 612, 1072, 18);
  assert.ok(base && base.fillStyle === '#242a25', 'baseboard footprint/color must remain');
  for (const x of PANEL_X) {
    const outer = find(x, 452, 113, 156);
    assert.ok(outer && outer.fillStyle === '#454330', 'original panel outer missing at ' + x);
    assert.ok(find(x + 5, 457, 103, 146), 'original panel middle missing at ' + x);
    assert.ok(find(x + 10, 462, 93, 134), 'original panel inner missing at ' + x);
  }
});

test('counter span: bevelled top, woodgrain and recessed panel light/shadow add depth', () => {
  const world = loadWorld();
  for (const phase of ['intro', 'night']) {
    const label = phase === 'night' ? 'night' : 'day';
    const { recorder } = render(world, pubState({ phase }));
    const counter = sliceSpan(recorder.calls, spanRanges(recorder.calls).counter);
    // Polished bevel on the top slab: bright sheen plus dark lip/contact edges.
    const topStrokes = strokePoints(counter).filter(p => p.y >= 399 && p.y <= 435 && p.x >= 12 && p.x <= 1088);
    const strokeColors = [...new Set(topStrokes.map(p => p.style).filter(s => parseColor(s)))];
    assert.ok(strokeColors.some(s => luminance(s) >= 90), label + ' top needs a light bevel highlight');
    assert.ok(strokeColors.some(s => luminance(s) <= 55), label + ' top needs a dark bevel/contact shadow');
    // Calm deterministic woodgrain follows the slab inside its footprint.
    const grain = topStrokes.filter(p => p.y >= 407 && p.y <= 423);
    assert.ok(grain.length >= 8, label + ' needs multiple woodgrain strokes along the top, got ' + grain.length);
    // Every new painted rect belongs either to the top slab footprint or to
    // the cabinet/baseboard region; only the mandated legacy last panel column
    // (already clipped by the canvas edge) may reach past the carcass.
    const topRects = paintedRects(counter).filter(r => r.y >= 398 && r.y + r.h <= 436);
    assertRectsInside(topRects, TOP_BAND, label + ' top detail');
    const lowerRects = paintedRects(counter).filter(r =>
      r.y >= 436 && !LEGACY_OVERHANG.has(`${r.x},${r.y},${r.w},${r.h}`));
    assertRectsInside(lowerRects, { x0: 15, y0: 436, x1: 1090, y1: 631 }, label + ' lower cabinet detail');
    // Recessed panels: each original grid cell gains an inner light catch and
    // a settling shadow, both geometrically inside that cell.
    for (const px of PANEL_X) {
      const inside = (x, y) => x >= px && x <= px + 113 && y >= 452 && y <= 608;
      const colors = new Set();
      for (const r of paintedRects(counter)) {
        if (inside(r.x + r.w / 2, r.y + r.h / 2) && typeof r.style === 'string') colors.add(r.style);
      }
      for (const p of strokePoints(counter)) if (inside(p.x, p.y)) colors.add(p.style);
      const tones = [...colors].filter(s => parseColor(s));
      assert.ok(tones.some(s => luminance(s) >= 80), label + ' panel at ' + px + ' needs a recessed highlight');
      assert.ok(tones.some(s => luminance(s) <= 45), label + ' panel at ' + px + ' needs a recessed shadow');
      // New inset strokes for this panel stay within the cabinet carcass.
      for (const p of strokePoints(counter)) {
        if (inside(p.x, p.y)) assert.ok(p.x <= 1076 && p.y <= 608, label + ' panel detail escapes cabinet at ' + px);
      }
    }
  }
});

test('counter span: night pools are warm, localized on the wood under lamps, absent by day', () => {
  const world = loadWorld();
  for (const phase of ['intro', 'night']) {
    const label = phase === 'night' ? 'night' : 'day';
    const night = phase === 'night';
    const { recorder } = render(world, pubState({ phase }));
    const counter = sliceSpan(recorder.calls, spanRanges(recorder.calls).counter);
    const pools = counter.filter(q => q.name === 'createRadialGradient');
    if (!night) {
      assert.equal(pools.length, 0, 'day counter keeps a calm sheen, no light pools');
      continue;
    }
    assert.equal(pools.length, 3, 'one warm pool per lamp on the countertop');
    const centers = [];
    for (const call of pools) {
      const info = recorder.gradients.get(call.gradId);
      const [cx, cy] = [info.coords[0], info.coords[1]];
      assert.ok(cy >= 398 && cy <= 436, 'pool centre must sit on the countertop, got y=' + cy);
      assert.ok(LAMP_X.some(x => Math.abs(cx - x) <= 40), 'pool must align under a lamp, got x=' + cx);
      centers.push(cx);
      const inner = info.stops.find(s => s.offset === 0);
      assert.ok(inner && isWarm(inner.color), 'pool core must read warm copper');
      const alpha = parseColor(inner.color).a;
      assert.ok(alpha >= 0x22 && alpha <= 0x80, 'pool must be present but never wash foreground: ' + alpha);
      const fills = counter.filter(q => q.name === 'fillRect' && q.fillStyle && q.fillStyle.gradient === info.id);
      assert.ok(fills.length >= 1, 'pool gradient must be painted');
      assertRectsInside(fills.map(q => ({ x: q.args[0], y: q.args[1], w: q.args[2], h: q.args[3] })),
        { x0: 10, y0: 398, x1: 1090, y1: 436 }, 'night pool');
    }
    assert.deepEqual([...centers].sort((a, b) => a - b), [...LAMP_X].sort((a, b) => a - b), 'pools map 1:1 to lamps');
  }
});

test('new material detail is deterministic: equal state at different timestamps renders equal spans', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  try {
    for (const phase of ['intro', 'night']) {
      const first = render(world, pubState({ phase }), 0).recorder.calls;
      const later = render(world, pubState({ phase }), 48213).recorder.calls;
      const r1 = spanRanges(first);
      const r2 = spanRanges(later);
      for (const name of ['wall', 'lamp', 'counter']) {
        assert.deepEqual(first.slice(...r1[name]), later.slice(...r2[name]),
          phase + ' ' + name + ' material must not jitter with timestamp');
      }
    }
  } finally {
    mediaQuery.matches = false;
  }
});

test('reduced motion: full pub frames are identical at different timestamps and unwind canvas state', () => {
  const world = loadWorld();
  mediaQuery.matches = true;
  try {
    for (const state of [pubState(), pubState({ phase: 'intro' })]) {
      const a = render(world, state, 0.25).recorder;
      const b = render(world, state, 17.9).recorder;
      assert.ok(a.calls.length > 120, 'a full pub frame must render');
      assert.deepEqual(a.calls, b.calls, 'reduced-motion pub frames must be time independent');
      assert.equal(a.depth(), 0, 'save/restore must be balanced');
      assert.deepEqual(a.matrix(), [1, 0, 0, 1, 0, 0], 'transform must return to identity');
    }
  } finally {
    mediaQuery.matches = false;
  }
});

test('every pub frame stays finite, on the canvas and balanced for day, night, upgrades and pours', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  const configs = [
    pubState(),
    pubState({ phase: 'intro', day: 2 }),
    pubState({ phase: 'summary', day: 3, upgrades: ['doubleTap', 'cellar', 'stage'], music: true }),
    pubState({ night: { elapsed: 3, orders: [], pours: [POUR] } })
  ];
  try {
    for (const state of configs) {
      const { recorder } = render(world, state, 9.31);
      const ranges = spanRanges(recorder.calls);
      assert.equal(recorder.depth(), 0, 'unbalanced save/restore');
      assert.deepEqual(recorder.matrix(), [1, 0, 0, 1, 0, 0], 'transform drift');
      for (const [name, band] of [['wall', WALL_BAND], ['counter', COUNTER_BAND]]) {
        const span = sliceSpan(recorder.calls, ranges[name]);
        for (const r of paintedRects(span)) {
          if (name === 'counter' && LEGACY_OVERHANG.has(`${r.x},${r.y},${r.w},${r.h}`)) continue;
          assert.ok(r.x >= band.x0 && r.y >= band.y0 && r.x + r.w <= band.x1 && r.y + r.h <= band.y1,
            `${name} rect outside its band: ${JSON.stringify(r)}`);
        }
      }
    }
  } finally {
    mediaQuery.matches = false;
  }
});

test('truthful fixtures survive: stock bottles, cash text, tap count, guest seat and pour fill', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  try {
    // Baseline stock: 6 blond + 2 stout = 8 real bottles, matching text totals.
    const { recorder } = render(world, pubState({
      night: { elapsed: 3, orders: [{ ...MARTA }], pours: [] }
    }), 4, 'guest-m');
    const calls = recorder.calls;
    assert.equal(calls.filter(q => q.name === 'fillText' && q.args[0] === 'TK').length, 8, 'one TK tag per stocked bottle');
    assert.ok(calls.some(q => q.name === 'fillText' && q.args[0] === '6 GLASSES'), 'blond total text');
    assert.ok(calls.some(q => q.name === 'fillText' && q.args[0] === '2 GLASSES'), 'stout total text');
    assert.ok(calls.some(q => q.name === 'fillText' && q.args[0] === '€45'), 'register shows real cash');
    // Marta (waiting) maps to the first stool and keeps her marta palette.
    assert.ok(calls.some(q => q.name === 'ellipse' && q.args[0] === 240 && q.args[1] === 529 && q.fillStyle === '#ae9e68'),
      'waiting guest must sit at the first seat with her own coat color');
    assert.ok(calls.some(q => q.name === 'ellipse' && q.args[0] === 240 && q.args[1] === 416 && q.fillStyle === '#f1cf8a'),
      'selection marker follows the selected guest');
    // One tap without the upgrade; the active stout pour fills halfway (elapsed 3 of 4).
    const pour = render(world, pubState({ night: { elapsed: 3, orders: [], pours: [POUR] } }), 0).recorder.calls;
    assert.equal(pour.filter(q => q.name === 'fillRect' && q.args[2] === 14 && q.args[3] === 64 && q.fillStyle === '#b28b4c').length, 1,
      'exactly one tap pipe without doubleTap');
    assert.ok(pour.some(q => q.name === 'fillRect' && q.args[0] === 518 && q.args[1] === 381 && q.args[2] === 22 && q.args[3] === 15 && q.fillStyle === '#6a4831'),
      'stout pour must reach its real 0.5 fill geometry');
    const doubled = render(world, pubState({ upgrades: ['doubleTap'] }), 0).recorder.calls;
    assert.equal(doubled.filter(q => q.name === 'fillRect' && q.args[2] === 14 && q.args[3] === 64 && q.fillStyle === '#b28b4c').length, 2,
      'doubleTap still draws two tap pipes');
  } finally {
    mediaQuery.matches = false;
  }
});

test('rendering never mutates the supplied state, orders or pours', () => {
  const world = loadWorld();
  const state = pubState({ night: { elapsed: 3, orders: [{ ...MARTA }], pours: [{ ...POUR }] } });
  const before = JSON.stringify(state);
  render(world, state, 2.5, 'guest-m');
  render(world, state, 9.75, null);
  assert.equal(JSON.stringify(state), before, 'draw must be read-only against its inputs');
  assert.equal(state.night.orders[0].name, 'Marta');
  assert.equal(state.night.pours[0].beer, 'stout');
});

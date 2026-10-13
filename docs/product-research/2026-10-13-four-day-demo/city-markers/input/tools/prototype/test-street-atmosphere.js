'use strict';

// PLAY04 canal street atmosphere regressions. The harness is a recording
// Canvas2D context inside a VM: a real save/restore stack, a real transform
// matrix, effective styles logged per call and stable gradient handles.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const City = require(path.join(__dirname, 'reopening-city.js'));
const scenePath = path.join(__dirname, 'reopening-scene.js');
assert.ok(fs.existsSync(scenePath), 'reopening-scene.js must exist');
const sceneSource = fs.readFileSync(scenePath, 'utf8');

// One shared media-query result so individual tests can flip reduced motion.
const mediaQuery = { matches: false };

function loadWorld() {
  const sandbox = {};
  sandbox.window = sandbox; // window.City / window.PubScene resolve on the VM global
  sandbox.City = City;
  sandbox.devicePixelRatio = 1;
  sandbox.matchMedia = () => mediaQuery;
  vm.createContext(sandbox);
  vm.runInContext(sceneSource, sandbox);
  return sandbox;
}

// Required finite-number argument positions per Canvas operation. fillText
// and strokeText receive their text at index 0; addColorStop a color string.
const NUMERIC_INDICES = {
  fillRect: [0, 1, 2, 3], clearRect: [0, 1, 2, 3], rect: [0, 1, 2, 3],
  ellipse: [0, 1, 2, 3, 4, 5, 6], arc: [0, 1, 2, 3, 4], arcTo: [0, 1, 2, 3, 4],
  moveTo: [0, 1], lineTo: [0, 1],
  quadraticCurveTo: [0, 1, 2, 3], bezierCurveTo: [0, 1, 2, 3, 4, 5],
  fillText: [1, 2], strokeText: [1, 2],
  translate: [0, 1], scale: [0, 1], rotate: [0],
  transform: [0, 1, 2, 3, 4, 5], setTransform: [0, 1, 2, 3, 4, 5],
  createRadialGradient: [0, 1, 2, 3, 4, 5], createLinearGradient: [0, 1, 2, 3],
  addColorStop: [0]
};
const TEXT_METHODS = new Set(['fillText', 'strokeText']);
// Argument pair holding the anchor point projected through the live matrix.
const XY_ORIGIN = {
  fillRect: [0, 1], clearRect: [0, 1], rect: [0, 1],
  ellipse: [0, 1], arc: [0, 1], arcTo: [0, 1],
  moveTo: [0, 1], lineTo: [0, 1],
  quadraticCurveTo: [0, 1], bezierCurveTo: [0, 1],
  fillText: [1, 2], strokeText: [1, 2]
};

function createRecorder() {
  const calls = [];
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let gradientSeq = 0;
  const style = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    font: '10px sans-serif', textAlign: 'start', lineDash: [], lineDashOffset: 0
  };

  function screen(x, y) {
    return [
      matrix[0] * x + matrix[2] * y + matrix[4],
      matrix[1] * x + matrix[3] * y + matrix[5]
    ];
  }
  function tag(value) {
    return value && typeof value === 'object' && '__gid' in value ? { gradient: value.__gid } : value;
  }
  function record(name, args) {
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
    if (TEXT_METHODS.has(name)) {
      assert.ok(typeof args[0] === 'string', name + ' first argument must be the text to draw');
    } else if (name === 'addColorStop') {
      assert.ok(typeof args[1] === 'string', 'addColorStop color must be a string');
    }
    for (const value of args) {
      if (typeof value === 'number') {
        assert.ok(Number.isFinite(value), name + ' received a non-finite number');
      }
    }
    let projected = null;
    const origin = XY_ORIGIN[name];
    if (origin) {
      const [sx, sy] = screen(args[origin[0]], args[origin[1]]);
      assert.ok(Number.isFinite(sx) && Number.isFinite(sy), name + ' produced non-finite screen coordinates');
      projected = [sx, sy];
    }
    for (const v of matrix) assert.ok(Number.isFinite(v), name + ' corrupted the transform matrix');
    calls.push({
      name,
      args: args.map(tag),
      fillStyle: tag(style.fillStyle),
      strokeStyle: tag(style.strokeStyle),
      lineWidth: style.lineWidth,
      font: style.font,
      textAlign: style.textAlign,
      lineDash: style.lineDash.slice(),
      lineDashOffset: style.lineDashOffset,
      screen: projected,
      matrix: matrix.slice()
    });
  }

  function gradient(id) {
    return { __gid: id, addColorStop(offset, color) { record('addColorStop', [offset, color]); } };
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
      // Canvas post-multiplication: scale the x column (a,b) by sx and the
      // y column (c,d) by sy; the accumulated translation (e,f) stays fixed.
      matrix[0] *= sx; matrix[1] *= sx;
      matrix[2] *= sy; matrix[3] *= sy;
      record('scale', [sx, sy]);
    },
    setLineDash(dash) {
      const value = Array.isArray(dash) ? dash.slice() : [];
      for (const entry of value) {
        assert.ok(typeof entry === 'number' && Number.isFinite(entry), 'setLineDash entries must be finite numbers');
      }
      style.lineDash = value;
      record('setLineDash', value.slice());
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      record('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
      return gradient(++gradientSeq);
    },
    createLinearGradient(x0, y0, x1, y1) {
      record('createLinearGradient', [x0, y0, x1, y1]);
      return gradient(++gradientSeq);
    }
  };

  const ctx = new Proxy(explicit, {
    get(target, key) {
      if (typeof key === 'symbol') return undefined;
      if (key in target) return target[key];
      return (...args) => record(String(key), args);
    },
    set(target, key, value) {
      if (key === 'lineDashOffset') {
        assert.ok(Number.isFinite(value), 'lineDashOffset must stay finite');
      }
      style[key] = value;
      return true;
    }
  });

  return {
    ctx,
    calls,
    depth: () => stack.length,
    matrix: () => matrix.slice(),
    dash: () => style.lineDash.slice(),
    offset: () => style.lineDashOffset
  };
}

function render(world, view, time) {
  const recorder = createRecorder();
  const canvas = { width: 0, height: 0, getContext: () => recorder.ctx };
  const scene = new world.PubScene(canvas);
  scene.drawCity(view, time);
  return { scene, recorder };
}

function cityView(camera, afterHours, extra = {}) {
  return {
    position: City.create(), path: [], target: null, mode: 'map',
    notes: [], camera, zoom: 1, afterHours, ...extra
  };
}

const ROUTE = [{ x: 310, y: 590 }, { x: 360, y: 590 }, { x: 405, y: 615 }];
const routeCopy = () => ROUTE.map(p => ({ ...p }));

test('reduced motion: a fixed city state draws identical frames at two different times', () => {
  const world = loadWorld();
  mediaQuery.matches = true;
  try {
    for (const camera of ['street', 'overview']) {
      for (const afterHours of [false, true]) {
        const label = `${afterHours ? 'night' : 'day'}-${camera}`;
        const first = render(world, cityView(camera, afterHours, { path: routeCopy() }), 0.25);
        const second = render(world, cityView(camera, afterHours, { path: routeCopy() }), 17.9);
        assert.ok(first.recorder.calls.length > 200, label + ' did not render a full city frame');
        assert.deepEqual(
          first.recorder.calls,
          second.recorder.calls,
          label + ' reduced-motion frames must be time independent (water, rings, notes, path dash)'
        );
      }
    }
  } finally {
    mediaQuery.matches = false;
  }
});

test('normal mode keeps the gentle ambient animation over time', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  const first = render(world, cityView('street', false, { path: routeCopy() }), 0);
  const second = render(world, cityView('street', false, { path: routeCopy() }), 5);
  assert.notDeepEqual(first.recorder.calls, second.recorder.calls, 'ambient water/rings/notes must still move');
});

test('drawCity never mutates its view input or the shared city geometry', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  const view = cityView('street', false, {
    target: 'lotte', mode: 'place', notes: ['示例笔记'], path: routeCopy()
  });
  const viewBefore = JSON.stringify(view);
  const cityBefore = JSON.stringify([City.LAND, City.WATERS, City.CROSSINGS, City.PLACES, City.BUILDINGS]);
  render(world, view, 6.4);
  render(world, view, 2.1);
  assert.equal(JSON.stringify(view), viewBefore, 'the view object must be unchanged after rendering');
  assert.equal(
    JSON.stringify([City.LAND, City.WATERS, City.CROSSINGS, City.PLACES, City.BUILDINGS]),
    cityBefore,
    'frozen city geometry must be unchanged after rendering'
  );
});

test('every frame uses finite coordinates and unwinds its save/restore transforms', () => {
  const world = loadWorld();
  const configs = [
    { camera: 'street', afterHours: false, zoom: 1 },
    { camera: 'street', afterHours: true, zoom: 1 },
    { camera: 'overview', afterHours: false, zoom: 1 },
    { camera: 'overview', afterHours: true, zoom: 2 }
  ];
  for (const reduced of [false, true]) {
    mediaQuery.matches = reduced;
    for (const cfg of configs) {
      const label = JSON.stringify({ ...cfg, reduced });
      const { recorder } = render(
        world,
        cityView(cfg.camera, cfg.afterHours, { zoom: cfg.zoom, path: routeCopy() }),
        9.1
      );
      assert.ok(recorder.calls.length > 200, label + ' did not render a full city frame');
      assert.equal(recorder.depth(), 0, label + ' left unbalanced save/restore calls');
      assert.deepEqual(recorder.matrix(), [1, 0, 0, 1, 0, 0], label + ' transform must return to identity');
      assert.deepEqual(recorder.dash(), [], label + ' line dash must be reset after the frame');
      assert.equal(recorder.offset(), 0, label + ' line dash offset must be reset after the frame');
    }
  }
  mediaQuery.matches = false;
});

test('the recorded city draw matrix matches cityTransform and cityWorldPoint inverts it at the pub, Lotte bridge and map edges', () => {
  const world = loadWorld();
  mediaQuery.matches = false;
  const points = {
    pub: [City.PLACES.pub.x, City.PLACES.pub.y],
    lotte: [City.PLACES.lotte.x, City.PLACES.lotte.y],
    bridge: [516, 624], // musician's narrow bridge
    edgeTopLeft: [78, 48], edgeTopRight: [1722, 48],
    edgeBottomLeft: [78, 1072], edgeBottomRight: [1722, 1072],
    landNear: [City.LAND.x, City.LAND.y],
    landFar: [City.LAND.x + City.LAND.w, City.LAND.y + City.LAND.h]
  };
  const cameras = [
    { camera: 'street', zoom: 1 },
    { camera: 'overview', zoom: 1 },
    { camera: 'overview', zoom: 2 }
  ];
  const closeToOne = (a, b) => Math.abs(a - b) < 1e-7;
  for (const cfg of cameras) {
    const label = `${cfg.camera} zoom${cfg.zoom}`;
    const { scene, recorder } = render(world, cityView(cfg.camera, false, { zoom: cfg.zoom }), 1);
    const tr = scene.cityTransform;
    assert.ok(tr && Number.isFinite(tr.scale) && tr.scale > 0, label + ': transform scale is missing');
    assert.ok(Number.isFinite(tr.tx) && Number.isFinite(tr.ty), label + ': transform translation is missing');
    // The base land rect (0,0,WIDTH,HEIGHT) is a real world-space draw issued
    // while the city camera matrix is active; read the matrix off its record.
    const base = recorder.calls.find(call =>
      call.name === 'fillRect' &&
      call.args[0] === 0 && call.args[1] === 0 &&
      call.args[2] === City.WIDTH && call.args[3] === City.HEIGHT
    );
    assert.ok(base, label + ': recorded world-space base draw was not found');
    const m = base.matrix;
    assert.ok(closeToOne(m[0], tr.scale) && closeToOne(m[3], tr.scale), label + ': recorded scale differs from cityTransform');
    assert.ok(closeToOne(m[1], 0) && closeToOne(m[2], 0), label + ': recorded city matrix is not axis aligned');
    assert.ok(closeToOne(m[4], tr.tx) && closeToOne(m[5], tr.ty), label + ': recorded translation differs from cityTransform');
    assert.ok(closeToOne(base.screen[0], tr.tx) && closeToOne(base.screen[1], tr.ty), label + ': recorded base origin is not the camera translation');
    for (const [name, [wx, wy]] of Object.entries(points)) {
      const sx = m[0] * wx + m[2] * wy + m[4];
      const sy = m[1] * wx + m[3] * wy + m[5];
      assert.ok(
        closeToOne(sx, wx * tr.scale + tr.tx) && closeToOne(sy, wy * tr.scale + tr.ty),
        `${label} ${name}: recorded draw point disagrees with the cityTransform forward mapping`
      );
      const back = scene.cityWorldPoint(sx, sy);
      assert.ok(
        Math.hypot(back.x - wx, back.y - wy) < 1e-7,
        `${label} ${name}: cityWorldPoint failed to invert the recorded draw matrix at world ${wx},${wy}`
      );
    }
  }
});

test('recorder models Canvas translate/scale post-multiplication with nested save/restore', () => {
  const recorder = createRecorder();
  const c = recorder.ctx;
  c.save();
  c.translate(10, 20);
  c.scale(2, 3);
  assert.deepEqual(recorder.matrix(), [2, 0, 0, 3, 10, 20], 'translate then scale must keep the earlier translation');
  c.fillRect(4, 5, 1, 1);
  assert.deepEqual(recorder.calls.at(-1).screen, [18, 35], 'world point (4,5) must project to screen (18,35)');
  // A nested transform measures its translation in the scaled parent space.
  c.save();
  c.translate(6, 0);
  c.moveTo(0, 0);
  assert.deepEqual(recorder.calls.at(-1).screen, [22, 20], 'nested translate must compose in scaled coordinates');
  c.restore();
  assert.deepEqual(recorder.matrix(), [2, 0, 0, 3, 10, 20], 'inner restore must return to the parent camera matrix');
  c.moveTo(0, 0);
  assert.deepEqual(recorder.calls.at(-1).screen, [10, 20]);
  c.restore();
  assert.equal(recorder.depth(), 0, 'nested save/restore must fully unwind');
  assert.deepEqual(recorder.matrix(), [1, 0, 0, 1, 0, 0], 'matrix must return to identity after restore');
});

test('recorder rejects string, undefined and non-finite geometry while accepting real text, styles and gradients', () => {
  const recorder = createRecorder();
  const c = recorder.ctx;
  // Legitimate calls first: text content, styles, dashes and gradient colors
  // are never geometry and must be accepted.
  c.fillStyle = '#e6d5a9';
  c.strokeStyle = '#f6d88f';
  c.lineWidth = 5;
  c.font = '16px sans-serif';
  c.textAlign = 'left';
  c.setLineDash([10, 9]);
  c.fillText('免费渡轮', 12, 300);
  c.strokeText('N', 1068, 43);
  c.fillRect(0, 0, 1100, 640);
  const glow = c.createRadialGradient(335, 610, 0, 335, 610, 66);
  glow.addColorStop(0, '#eab85a3d');
  glow.addColorStop(1, '#eab85a00');
  assert.doesNotThrow(() => glow.addColorStop(0.5, '#ffffff14'));
  const invalid = [
    ['fillRect string x (the quay bug)', () => c.fillRect('450[object Object]1', 453, 6, 646)],
    ['fillRect undefined width', () => c.fillRect(1, 2, undefined, 4)],
    ['fillRect NaN height', () => c.fillRect(1, 2, 3, NaN)],
    ['fillRect Infinity y', () => c.fillRect(1, Infinity, 3, 4)],
    ['moveTo string coordinate', () => c.moveTo('1', 2)],
    ['lineTo undefined coordinate', () => c.lineTo(1, undefined)],
    ['ellipse non-finite radius', () => c.ellipse(1, 2, 3, Infinity, 0, 0, Math.PI * 2)],
    ['arc string radius', () => c.arc(1, 2, '6', 0, Math.PI * 2)],
    ['fillText string x', () => c.fillText('Lotte', '9', 2)],
    ['fillText undefined y', () => c.fillText('Lotte', 9, undefined)],
    ['createRadialGradient NaN radius', () => c.createRadialGradient(0, 0, 0, 0, 0, NaN)],
    ['createLinearGradient undefined coordinate', () => c.createLinearGradient(0, 0, 4, undefined)],
    ['addColorStop NaN offset', () => glow.addColorStop(NaN, '#ffffff')],
    ['addColorStop numeric color', () => glow.addColorStop(0, 42)],
    ['setLineDash non-finite entry', () => c.setLineDash([7, NaN])],
    ['translate NaN', () => c.translate(NaN, 1)],
    ['scale undefined factor', () => c.scale(2, undefined)]
  ];
  for (const [label, fn] of invalid) assert.throws(fn, label);
  assert.equal(recorder.depth(), 0, 'rejected geometry must not leave save state behind');
});

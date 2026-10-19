'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const City = require('./reopening-city.js');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const pubBike = { x: 290, y: 590, mounted: false };
const position = (x, y, mounted = false) => ({ x, y, visited: ['pub', 'coffee'], bike: { x, y, mounted } });

test('new cities and legacy saves receive an independent bicycle at the pub', () => {
  assert.deepEqual(City.create().bike, pubBike);
  const old = { x: 730, y: 930, visited: ['pub', 'coffee'] };
  assert.deepEqual(City.restore(old), { ...old, bike: pubBike });
  const city = City.create();
  city.bike.x = 300;
  assert.deepEqual(City.create().bike, pubBike);
});

test('legacy saves covered by the added flower facade keep their visited places', () => {
  const legacy = { x: 1240, y: 980, visited: ['pub', 'coffee', 'market', 'lab', 'noord', 'lotte'] };
  const before = JSON.stringify(legacy);
  const restored = City.restore(legacy);
  assert.deepEqual(restored.visited, legacy.visited);
  assert.equal(City.walkable(restored.x, restored.y), true);
  assert.deepEqual(restored.bike, pubBike);
  assert.equal(JSON.stringify(legacy), before);
  assert.notEqual(restored.visited, legacy.visited);
});

test('relocating a flower-facade save retains an independently parked bicycle', () => {
  const legacy = { x: 1240, y: 980, visited: ['pub', 'coffee'], bike: { x: 730, y: 930, mounted: false } };
  const restored = City.restore(legacy);
  assert.deepEqual(restored.bike, legacy.bike);
  assert.notEqual(restored.bike, legacy.bike);
  assert.deepEqual(restored.visited, legacy.visited);
  assert.equal(City.walkable(restored.x, restored.y), true);
});

test('flower-facade migration does not admit nonfinite coordinates or corrupt visits', () => {
  for (const invalid of [
    { x: Infinity, y: 980, visited: ['pub', 'coffee'] },
    { x: 1240, y: NaN, visited: ['pub', 'coffee'] },
    { x: 290, y: 500, visited: ['pub', 'coffee'] },
    { x: 200, y: 380, visited: ['pub', 'coffee'] },
    { x: 1240, y: 980, visited: ['ghost'] },
    { x: 1240, y: 980, visited: ['coffee', 'coffee'] }
  ]) assert.deepEqual(City.restore(invalid), City.create());
});

test('malformed bicycle data resets the bicycle while retaining valid player progress', () => {
  const player = { x: 730, y: 930, visited: ['pub', 'flowers'] };
  for (const bike of [null, {}, { x: NaN, y: 590, mounted: false },
    { x: 200, y: 380, mounted: false }, { x: 290, y: 590, mounted: 'yes' },
    { x: 290, y: 590, mounted: true }, { x: 490, y: 650, mounted: true }]) {
    assert.deepEqual(City.restore({ ...player, bike }), { ...player, bike: pubBike });
  }
  const source = position(730, 930, true);
  const restored = City.restore(source);
  assert.deepEqual(restored, source);
  assert.notEqual(restored.bike, source.bike);
  assert.notEqual(restored.visited, source.visited);
});

test('mounting requires proximity and dismounting keeps the bicycle at the player', () => {
  const original = City.create();
  const mounted = City.toggleBike(original);
  assert.equal(mounted.bike.mounted, true);
  assert.deepEqual(original.bike, pubBike);
  assert.deepEqual(City.toggleBike(mounted), original);
  const far = { ...original, x: original.x + 43 };
  assert.deepEqual(City.toggleBike(far), far);
  const close = { ...original, x: original.x + 42 };
  assert.deepEqual(City.toggleBike(close).bike, { x: close.x, y: close.y, mounted: true });
});

test('parking on entry dismounts locally and never recalls a distant bicycle', () => {
  const riding = position(730, 930, true);
  assert.deepEqual(City.parkBike(riding), position(730, 930));
  const walking = { ...riding, bike: pubBike };
  assert.deepEqual(City.parkBike(walking), walking);
  assert.equal(riding.bike.mounted, true);
});

test('manual movement preserves visits, moves a ridden bicycle, and leaves a parked one behind', () => {
  const source = position(290, 590, true);
  const before = JSON.stringify(source);
  const riding = City.move(source, 1, 0, 0.1);
  const walking = City.move({ ...source, bike: pubBike }, 1, 0, 0.1);
  assert.ok(Math.abs(riding.x - 332) < 1e-7);
  assert.ok(Math.abs(walking.x - 314) < 1e-7);
  assert.deepEqual(riding.bike, { x: riding.x, y: riding.y, mounted: true });
  assert.deepEqual(walking.bike, pubBike);
  assert.deepEqual(riding.visited, source.visited);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(City.move(source, 0, 0, 1), source);
  assert.deepEqual(City.move(source, NaN, 1, 0.1), source);
});

test('automatic movement uses bicycle speed and retains the complete city state', () => {
  const source = position(290, 590, true);
  const route = [{ x: 310, y: 590 }, { x: 390, y: 590 }];
  const before = JSON.stringify({ source, route });
  const moved = City.moveAlong(source, route, 0.1);
  assert.ok(Math.abs(moved.position.x - 332) < 1e-7);
  assert.deepEqual(moved.position.bike, { x: moved.position.x, y: 590, mounted: true });
  assert.deepEqual(moved.position.visited, source.visited);
  assert.deepEqual(moved.path, [route[1]]);
  assert.equal(moved.arrived, false);
  assert.equal(JSON.stringify({ source, route }), before);
});

test('bicycles cross every bridge and ferry both ways without being left behind', () => {
  const passages = [
    [position(414, 640, true), { x: 550, y: 640 }, false],
    [position(414, 965, true), { x: 538, y: 965 }, true],
    [position(1014, 670, true), { x: 1150, y: 670 }, false],
    [position(1014, 985, true), { x: 1150, y: 985 }, true],
    [position(670, 734, true), { x: 670, y: 870 }, false],
    [position(1430, 734, true), { x: 1430, y: 890 }, false],
    [position(890, 496, true), { x: 890, y: 260 }, true]
  ];
  for (const [from, to, narrow] of passages) for (const reverse of [false, true]) {
    let current = reverse ? position(to.x, to.y, true) : from;
    const target = reverse ? { x: from.x, y: from.y } : to;
    let path = [{ ...target }], pushed = false;
    for (let step = 0; step < 40 && path.length; step++) {
      const result = City.moveAlong(current, path, 0.1);
      current = result.position; path = result.path;
      assert.equal(City.walkable(current.x, current.y), true);
      assert.deepEqual({ x: current.bike.x, y: current.bike.y }, { x: current.x, y: current.y }, 'bike stays with player');
      if (current.bike.pushing) { pushed = true; assert.equal(current.bike.mounted, false); }
      assert.deepEqual(City.restore(current), current, 'mid-crossing save restores exactly');
    }
    assert.equal(pushed, narrow, 'wide bridges ride; narrow bridges and ferry push');
    assert.equal(path.length, 0, JSON.stringify({from,to,reverse,current}));
    assert.equal(current.bike.mounted, true, 'resume riding on the opposite bank');
  }
});

test('manual narrow-bridge movement pushes the bicycle, can park, and can take it again', () => {
  let current = position(414, 965, true);
  for (let i = 0; i < 3; i++) current = City.move(current, 1, 0, 0.1);
  assert.ok(current.x > 450 && current.x < 530);
  assert.equal(current.bike.pushing, true);
  const carried = structuredClone(current);
  current = City.toggleBike(current);
  assert.equal(Boolean(current.bike.pushing), false);
  assert.equal(current.bike.mounted, false);
  const parked = structuredClone(current.bike);
  current = City.move(current, 1, 0, .1);
  assert.deepEqual(current.bike, parked);
  current = City.toggleBike(current);
  assert.equal(current.bike.pushing, true, 'can pick up a parked bike on the bridge');
  assert.equal(current.bike.x, current.x);
  assert.deepEqual(City.restore(carried), carried);
  assert.equal(City.parkBike(carried).bike.pushing, undefined);
});

test('manual riding crosses a wide bridge and parked bicycles never follow automatically', () => {
  let current = position(414, 640, true);
  for(let i=0;i<4;i++) current=City.move(current,1,0,.1);
  assert.ok(current.x>550);assert.equal(current.bike.mounted,true);
  const parked=City.parkBike(position(470,640,true));
  assert.deepEqual(City.restore(parked),parked);
  assert.deepEqual(City.move(parked,1,0,.1).bike,parked.bike);
});

test('bicycle speed never tunnels through a canal or facade', () => {
  for (const from of [position(430, 550, true), position(290, 574, true)]) {
    const direction = from.y === 550 ? [1, 0] : [0, -1];
    let current = from;
    for (let i = 0; i < 20; i++) current = City.move(current, ...direction, 0.1);
    assert.equal(City.walkable(current.x, current.y), true);
    assert.equal(current.bike.mounted, true);
    assert.ok(Math.hypot(current.x - from.x, current.y - from.y) <= 14);
  }
});

function render(view, phase) {
  const context = { window: { City } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reopening-scene.js'), 'utf8'), context);
  const scene = Object.create(context.window.PubScene.prototype);
  const marks = [];
  scene.ctx = new Proxy({
    fillStyle: '',
    fillRect(...args) { marks.push(['rect', this.fillStyle, ...args]); },
    fillText(...args) { marks.push(['text', this.fillStyle, ...args]); },
    ellipse(...args) { marks.push(['ellipse', this.fillStyle, ...args]); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  scene.reduced = { matches: true };
  const cityView = { position: City.create(), path: [], zoom: 1, mode: 'map', target: null, ...view };
  if (phase) scene.draw({ phase }, 0, null, cityView);
  else scene.drawCity(cityView, 0);
  return marks;
}

test('the same city renders night lighting and discovered map notes', () => {
  const day = render({});
  const night = render({ afterHours: true, notes: ['温室后门还有灯'] });
  assert.ok(JSON.stringify(night.filter(mark => mark[0] === 'rect')) !== JSON.stringify(day.filter(mark => mark[0] === 'rect')), 'night has different street lighting');
  assert.ok(night.some(mark => mark[0] === 'text' && mark[2] === '温室后门还有灯'));
  for (const marks of [day, night]) {
    assert.ok(marks.some(mark => mark[0] === 'text' && mark[2] === '南街花店'));
  }
});

test('summary can render the city without requiring an interior pub state', () => {
  assert.doesNotThrow(() => render({ afterHours: true }, 'summary'));
});

test('the bicycle and basket bouquet remain visible at the parked location', () => {
  const city = { ...position(730, 930), bike: { x: 350, y: 610, mounted: false } };
  const empty = render({ position: city });
  assert.ok(empty.some(mark => mark[0] === 'ellipse' && mark[2] === city.bike.x - 15 && mark[3] === city.bike.y + 7), 'the parked rear wheel is visible');
  const warm = render({ position: city, bouquet: { palette: 'warm', wrap: 'paper', stored: true } });
  const cool = render({ position: city, bouquet: { palette: 'cool', wrap: 'paper', stored: true } });
  assert.notDeepEqual(warm, empty, 'stored flowers fill the basket');
  assert.notDeepEqual(warm, cool, 'the bouquet retains its selected palette');
  const riding = render({ position: position(350, 610, true) });
  assert.notDeepEqual(riding, empty, 'riding and walking have distinct poses');
});

test('a displayed bouquet appears in the pub window and uses the chosen wrapping', () => {
  const game = require('./reopening-core.js').createGame(42);
  const context = { window: { City } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reopening-scene.js'), 'utf8'), context);
  const scene = Object.create(context.window.PubScene.prototype);
  const stems = [];
  scene.ctx = new Proxy({
    lineTo(...args) { stems.push(args); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  scene.reduced = { matches: true };
  const view = { position: City.create(), mode: 'place', place: 'pub' };
  scene.draw(game, 0, null, view);
  const empty = JSON.stringify(stems);
  stems.length = 0;
  scene.draw(game, 0, null, { ...view, display: { palette: 'mixed', wrap: 'ribbon', stored: false } });
  assert.ok(JSON.stringify(stems) !== empty, 'placing a bouquet changes the sill');
  const ribbon = JSON.stringify(stems);
  stems.length = 0;
  scene.draw(game, 0, null, { ...view, display: { palette: 'mixed', wrap: 'paper', stored: false } });
  assert.ok(JSON.stringify(stems) !== ribbon, 'paper and ribbon stay distinct on display');
});

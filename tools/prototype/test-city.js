'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cityPath = path.join(__dirname, 'reopening-city.js');
assert.ok(fs.existsSync(cityPath), 'The city geometry module must exist');
const City = require(cityPath);
let tests = 0;

function test(name, fn) {
  fn();
  tests++;
  console.log('\u2713 ' + name);
}

function inside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function assertSafeSegment(from, to, message) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 2));
  for (let step = 0; step <= steps; step++) {
    const amount = step / steps;
    const x = from.x + (to.x - from.x) * amount;
    const y = from.y + (to.y - from.y) * amount;
    assert.equal(City.walkable(x, y), true, message + ' at ' + x + ',' + y);
  }
}

test('CommonJS and browser expose the same public contract', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(cityPath, 'utf8'), context);
  assert.deepEqual(Object.keys(context.City).sort(), Object.keys(City).sort());
  for (const key of ['walkable', 'onFerry', 'route', 'move', 'moveAlong', 'near', 'create', 'restore', 'toggleBike', 'parkBike', 'rideable']) {
    assert.equal(typeof City[key], 'function');
  }
  for (const key of ['LAND', 'WATERS', 'CROSSINGS', 'PLACES', 'BUILDINGS']) assert.ok(City[key]);
  assert.equal(City.WIDTH, 1800);
  assert.equal(City.HEIGHT, 1120);
});

test('map geometry and named destinations match the shared scene contract', () => {
  assert.deepEqual(City.LAND, { x: 70, y: 40, w: 1660, h: 1040 });
  assert.deepEqual(City.WATERS, [
    { x: 70, y: 300, w: 1660, h: 160 },
    { x: 450, y: 460, w: 60, h: 620 },
    { x: 1050, y: 460, w: 60, h: 620 },
    { x: 70, y: 770, w: 1660, h: 60 }
  ]);
  assert.deepEqual(City.CROSSINGS, [
    { x: 430, y: 600, w: 100, h: 80, kind: 'bridge' },
    { x: 430, y: 930, w: 100, h: 70, kind: 'bridge' },
    { x: 1030, y: 630, w: 100, h: 80, kind: 'bridge' },
    { x: 1030, y: 950, w: 100, h: 70, kind: 'bridge' },
    { x: 660, y: 750, w: 100, h: 100, kind: 'bridge' },
    { x: 1410, y: 750, w: 100, h: 100, kind: 'bridge' },
    { x: 860, y: 280, w: 80, h: 200, kind: 'ferry' }
  ]);

  const expected = {
    pub: ['Tweede Kans', 'Jordaan', 290, 590, 'pub', '\ud83c\udf7a'],
    lotte: ['Lotte \u7684\u6865', '\u8fd0\u6cb3\u5e26', 490, 650, 'visit', '\u266b'],
    coffee: ['Bram \u5496\u5561\u9986', 'De Pijp', 730, 930, 'coffee', '\u2615'],
    noord: ['\u5317\u5cb8\u7801\u5934', 'Noord', 1230, 170, 'surf', '\u2693'],
    market: ['Albert Cuyp \u5e02\u573a', 'De Pijp', 930, 1010, 'market', '\u25a5'],
    flowers: ['南街花店', 'De Pijp', 1240, 1040, 'flowers', '⚘'],
    lab: ['Chen \u5b9e\u9a8c\u5ba4', 'Science Park', 1490, 910, 'lab', '\u2697']
  };
  assert.deepEqual(Object.keys(City.PLACES), Object.keys(expected));
  for (const [id, values] of Object.entries(expected)) {
    const place = City.PLACES[id];
    assert.deepEqual([place.name, place.district, place.x, place.y, place.kind, place.icon], values);
    assert.equal(place.id, id);
  }
});

test('facades use fixed positions and decorative buildings stay on dry land', () => {
  assert.equal(City.BUILDINGS.length, 26);
  for (const id of ['pub', 'coffee', 'noord', 'market', 'flowers', 'lab']) {
    const place = City.PLACES[id];
    const facade = City.BUILDINGS.find(building => building.id === id);
    assert.deepEqual(facade, { id, kind: 'facade', x: place.x - 50, y: place.y - 110, w: 100, h: 80 });
  }
  assert.equal(City.BUILDINGS.some(building => building.id === 'lotte'), false);
  const decorative = City.BUILDINGS.filter(building => building.kind === 'decorative');
  assert.equal(decorative.length, 20);
  for (const building of decorative) {
    assert.ok(building.x > City.LAND.x && building.y > City.LAND.y);
    assert.ok(building.x + building.w < City.LAND.x + City.LAND.w);
    assert.ok(building.y + building.h < City.LAND.y + City.LAND.h);
    assert.equal(City.WATERS.some(water => overlaps(building, water)), false, building.id + ' is in water');
    assert.equal(City.CROSSINGS.some(crossing => overlaps(building, crossing)), false, building.id + ' blocks a crossing');
    for (const place of Object.values(City.PLACES)) {
      const access = { x: place.x - 18, y: place.y - 18, w: 36, h: 36 };
      assert.equal(overlaps(building, access), false, building.id + ' blocks ' + place.id);
    }
  }
});

test('walkability keeps an eight-unit safety margin from bounds, water, and buildings', () => {
  assert.equal(City.walkable(78, 48), true);
  assert.equal(City.walkable(77.99, 48), false);
  assert.equal(City.walkable(1722, 1072), true);
  assert.equal(City.walkable(1722.01, 1072), false);
  assert.equal(City.walkable(200, 380), false);
  assert.equal(City.walkable(900, 380), true);
  assert.equal(City.onFerry(900, 380), true);
  assert.equal(City.onFerry(850, 380), false);
  const pubFacade = City.BUILDINGS.find(building => building.id === 'pub');
  assert.equal(City.walkable(pubFacade.x - 8, pubFacade.y + 20), true);
  assert.equal(City.walkable(pubFacade.x - 7.99, pubFacade.y + 20), false);
  assert.equal(City.walkable(NaN, 100), false);
  assert.equal(City.walkable(100, Infinity), false);
});

test('all 49 ordered destination routes are reachable and every segment is safe', () => {
  const places = Object.values(City.PLACES);
  for (const from of places) {
    for (const to of places) {
      const path = City.route(from, to);
      assert.ok(Array.isArray(path), from.id + ' to ' + to.id + ' returns a path');
      if (from.id === to.id) {
        assert.deepEqual(path, []);
        continue;
      }
      assert.ok(path.length > 0, from.id + ' reaches ' + to.id);
      assert.deepEqual(path.at(-1), { x: to.x, y: to.y }, from.id + ' ends at ' + to.id);
      assert.notDeepEqual(path[0], { x: from.x, y: from.y }, 'path excludes its start');
      let previous = from;
      for (const waypoint of path) {
        assert.equal(City.walkable(waypoint.x, waypoint.y), true);
        assertSafeSegment(previous, waypoint, from.id + ' to ' + to.id + ' clips an obstacle');
        previous = waypoint;
      }
    }
  }
});

test('the Noord route crosses the IJ only through the ferry corridor', () => {
  const path = City.route(City.PLACES.pub, City.PLACES.noord);
  const ijPoints = path.filter(point => inside(City.WATERS[0], point.x, point.y));
  assert.ok(ijPoints.length > 0);
  assert.ok(ijPoints.every(point => City.onFerry(point.x, point.y)));
  assert.ok(ijPoints.some(point => point.y > 320 && point.y < 440));
});

test('routing safely joins exact positions and snaps blocked targets', () => {
  const from = { x: 306.5, y: 608.5 };
  const target = { x: 722.25, y: 694.75 };
  assert.equal(City.walkable(from.x, from.y), true);
  assert.equal(City.walkable(target.x, target.y), true);
  const path = City.route(from, target);
  assert.deepEqual(path.at(-1), target);
  assertSafeSegment(from, path[0], 'initial join');
  assertSafeSegment(path.length > 1 ? path.at(-2) : from, path.at(-1), 'final join');

  for (const blocked of [{ x: 200, y: 380 }, { x: 290, y: 500 }, { x: -20, y: 400 }]) {
    const snapped = City.route(from, blocked);
    assert.ok(snapped.length > 0);
    assert.equal(City.walkable(snapped.at(-1).x, snapped.at(-1).y), true);
    let previous = from;
    for (const waypoint of snapped) {
      assertSafeSegment(previous, waypoint, 'blocked target route');
      previous = waypoint;
    }
  }
});

test('movement normalizes diagonals, clamps elapsed time, and cannot cross obstacles', () => {
  const source = { ...City.create(), x: 300, y: 650 };
  const diagonal = City.move(source, 3, 4, 1);
  assert.ok(Math.hypot(diagonal.x - 314.4, diagonal.y - 669.2) < 1e-7);
  assert.deepEqual(diagonal.visited, source.visited);
  assert.deepEqual(diagonal.bike, source.bike);
  assert.deepEqual(source, { ...City.create(), x: 300, y: 650 });
  assert.deepEqual(City.move({ x: 300, y: 650 }, 0, 0, 0.1), { ...City.create(), x: 300, y: 650 });
  assert.deepEqual(City.move({ x: 300, y: 650 }, 1, 0, -5), { ...City.create(), x: 300, y: 650 });
  const againstCanal = City.move({ x: 430, y: 550 }, 1, 0, 0.1);
  assert.ok(againstCanal.x <= 442);
  assert.equal(againstCanal.y, 550);
  assert.equal(City.walkable(againstCanal.x, againstCanal.y), true);
  const corner = City.move({ x: 425, y: 575 }, 1, 1, 0.1);
  assert.equal(City.walkable(corner.x, corner.y), true);
  const facadeCorner = City.move({ x: 231, y: 488 }, 17, -17, 0.1);
  assert.ok(facadeCorner.x < 240, 'a diagonal move must not cut across a building corner');
  assert.equal(City.walkable(facadeCorner.x, facadeCorner.y), true);
});

test('moveAlong advances at walking speed without mutating its inputs', () => {
  const position = City.create();
  const path = [{ x: 310, y: 590 }, { x: 330, y: 590 }];
  const before = JSON.stringify({ position, path });
  const partial = City.moveAlong(position, path, 0.05);
  assert.deepEqual(partial, { position: { ...position, x: 302, y: 590 }, path: [{ x: 310, y: 590 }, { x: 330, y: 590 }], arrived: false });
  assert.equal(JSON.stringify({ position, path }), before);
  const advanced = City.moveAlong(position, path, 0.1);
  assert.deepEqual(advanced, { position: { ...position, x: 314, y: 590 }, path: [{ x: 330, y: 590 }], arrived: false });
  const arrived = City.moveAlong({ x: 329, y: 590 }, [{ x: 330, y: 590 }], 0.1);
  assert.deepEqual(arrived, { position: { ...position, x: 330, y: 590 }, path: [], arrived: true });
});

test('near selects the closest destination within the requested radius', () => {
  assert.equal(City.near({ x: 300, y: 600 }).id, 'pub');
  assert.equal(City.near({ x: 540, y: 650 }, 50).id, 'lotte');
  assert.equal(City.near({ x: 550.01, y: 650 }, 60), null);
  assert.equal(City.near({ x: NaN, y: 650 }), null);
});

test('city state creation and restoration are strict, cloned, and independent', () => {
  assert.deepEqual(City.create(), { x: 290, y: 590, visited: ['pub'], bike: { x: 290, y: 590, mounted: false } });
  const source = { ...City.create(), x: 306.5, y: 608.5, visited: ['pub', 'coffee'] };
  const restored = City.restore(source);
  assert.deepEqual(restored, source);
  assert.notEqual(restored, source);
  assert.notEqual(restored.visited, source.visited);
  assert.deepEqual(City.restore({ ...source, path: [{ x: 400, y: 600 }] }), source, 'routes are ephemeral');
  restored.visited.push('lab');
  assert.deepEqual(source.visited, ['pub', 'coffee']);

  const fallback = City.create();
  for (const corrupt of [null, {}, { x: NaN, y: 590, visited: ['pub'] },
    { x: 200, y: 380, visited: ['pub'] }, { x: 290, y: 590, visited: ['ghost'] },
    { x: 290, y: 590, visited: 'pub' }, { x: 290, y: 590, visited: ['pub', 'pub'] }]) {
    assert.deepEqual(City.restore(corrupt), fallback);
  }
});

function renderCamera(position, zoom) {
  const context = { window: { City } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'reopening-scene.js'), 'utf8'), context);
  const scene = Object.create(context.window.PubScene.prototype);
  const transform = { tx: 0, ty: 0, scale: 1 };
  scene.ctx = new Proxy({
    translate(x, y) { transform.tx = x; transform.ty = y; },
    scale(x) { transform.scale = x; }
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  scene.reduced = { matches: true };
  scene.drawCity({ position: { ...position, visited: [] }, zoom, path: [], target: null, mode: 'map' }, 0);
  return { scene, transform };
}

test('zoomed camera keeps a player visible at every dry map corner', () => {
  for (const x of [78, 1722]) for (const y of [48, 1072]) {
    const { transform: t } = renderCamera({ x, y }, 2);
    assert.ok(x * t.scale + t.tx >= 0 && x * t.scale + t.tx <= 1100, 'Avatar stays inside horizontal viewport');
    assert.ok(y * t.scale + t.ty >= 0 && y * t.scale + t.ty <= 640, 'Avatar stays inside vertical viewport');
  }
});

test('zoom follows a central player and map clicks invert the actual render transform', () => {
  for (const zoom of [1, 2]) {
    const position = { x: 900, y: 600 };
    const { scene, transform: t } = renderCamera(position, zoom);
    if (zoom === 2) {
      assert.ok(Math.abs(position.x * t.scale + t.tx - 550) < 1e-7);
      assert.ok(Math.abs(position.y * t.scale + t.ty - 320) < 1e-7);
    }
    for (const place of Object.values(City.PLACES)) {
      const world = scene.cityWorldPoint(place.x * t.scale + t.tx, place.y * t.scale + t.ty);
      assert.ok(Math.hypot(world.x - place.x, world.y - place.y) < 1e-7);
    }
  }
});

console.log('\n' + tests + ' city tests passed.');

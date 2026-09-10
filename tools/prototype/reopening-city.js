(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.City = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 1800;
  const HEIGHT = 1120;
  const RADIUS = 8;
  const GRID = 20;
  const SPEED = 240;
  const LAND = Object.freeze({ x: 70, y: 40, w: 1660, h: 1040 });
  const WATERS = freezeList([
    { x: 70, y: 300, w: 1660, h: 160 },
    { x: 450, y: 460, w: 60, h: 620 },
    { x: 1050, y: 460, w: 60, h: 620 },
    { x: 70, y: 770, w: 1660, h: 60 }
  ]);
  const CROSSINGS = freezeList([
    { x: 430, y: 600, w: 100, h: 80, kind: 'bridge' },
    { x: 430, y: 930, w: 100, h: 70, kind: 'bridge' },
    { x: 1030, y: 630, w: 100, h: 80, kind: 'bridge' },
    { x: 1030, y: 950, w: 100, h: 70, kind: 'bridge' },
    { x: 660, y: 750, w: 100, h: 100, kind: 'bridge' },
    { x: 1430, y: 750, w: 100, h: 100, kind: 'bridge' },
    { x: 860, y: 280, w: 80, h: 200, kind: 'ferry' }
  ]);
  const PLACES = Object.freeze({
    pub: place('pub', 'Tweede Kans', 'Jordaan', 290, 590, 'pub', '\ud83c\udf7a',
      '\u56de\u5230\u5427\u53f0\uff0c\u51c6\u5907\u4eca\u665a\u7684\u4e8c\u6b21\u673a\u4f1a\u3002', '\u9152\u9986\u8fd8\u6ca1\u5012\uff0c\u53ea\u662f\u8d26\u5355\u7ad9\u5f97\u66f4\u7a33\u3002', 0),
    lotte: place('lotte', 'Lotte \u7684\u6865', '\u8fd0\u6cb3\u5e26', 490, 650, 'visit', '\u266b',
      '\u627e Lotte \u7ea6\u597d\u4eca\u665a\u7684\u9ed1\u5564\u548c\u5409\u4ed6\u3002', '\u6211\u5e26\u5409\u4ed6\uff0c\u4f60\u5e26\u4e00\u676f\u4e0d\u662f\u66dd\u5149\u91cf\u7684\u62a5\u916c\u3002', 0),
    coffee: place('coffee', 'Bram \u5496\u5561\u9986', 'De Pijp', 730, 930, 'coffee', '\u2615',
      '\u5e2e Bram \u9876\u4e00\u6bb5\u5348\u5e02\uff0c\u5de5\u8d44\u5f53\u5929\u7ed3\u3002', '\u68a6\u60f3\u4e0d\u80fd\u62b5\u65f6\u85aa\uff0c\u8fd9\u6761\u8857\u81f3\u5c11\u8fd8\u8bb0\u5f97\u3002', 0),
    noord: place('noord', '\u5317\u5cb8\u7801\u5934', 'Noord', 1230, 170, 'surf', '\u2693',
      '\u4ece\u6f02\u6d6e\u7269\u91cc\u627e\u8fd8\u80fd\u7528\u7684\u9152\u82b1\u548c\u74f6\u5b50\u3002', '\u6cb3\u9762\u4ec0\u4e48\u90fd\u9001\u6765\uff0c\u9664\u4e86\u4fdd\u4fee\u5355\u3002', 0),
    market: place('market', 'Albert Cuyp \u5e02\u573a', 'De Pijp', 930, 1010, 'market', '\u25a5',
      '\u7528 \u20ac8 \u6536\u4e0b\u4e00\u7bb1\u6536\u5e02\u5e93\u5b58\u3002', '\u4e09\u74f6\u9152\u7684\u4fdd\u8d28\u671f\uff0c\u6bd4\u8fd9\u95f4\u5e97\u7684\u79df\u7ea6\u957f\u3002', 8),
    lab: place('lab', 'Chen \u5b9e\u9a8c\u5ba4', 'Science Park', 1490, 910, 'lab', '\u2697',
      '\u7528 \u20ac6 \u6362\u4e24\u4efd\u5b9e\u9a8c\u9152\u82b1\u3002', '\u7ecf\u8d39\u4e0d\u591f\u53d1\u8bba\u6587\uff0c\u591f\u53d1\u9175\u3002', 6)
  });
  const BUILDINGS = freezeList([
    facade('pub'), facade('coffee'), facade('noord'), facade('market'), facade('lab'),
    block('block-01', 110, 80, 160, 90),
    block('block-02', 340, 90, 150, 80),
    block('block-03', 550, 70, 140, 100),
    block('block-04', 1010, 80, 120, 100),
    block('block-05', 1450, 90, 180, 90),
    block('block-06', 100, 490, 100, 80),
    block('block-07', 110, 660, 140, 70),
    block('block-08', 330, 680, 80, 60),
    block('block-09', 560, 490, 120, 70),
    block('block-10', 740, 510, 140, 80),
    block('block-11', 900, 500, 100, 80),
    block('block-12', 790, 670, 150, 60),
    block('block-13', 1170, 500, 140, 80),
    block('block-14', 1400, 500, 130, 90),
    block('block-15', 1570, 620, 100, 90),
    block('block-16', 110, 860, 140, 80),
    block('block-17', 290, 900, 110, 100),
    block('block-18', 550, 870, 90, 110),
    block('block-19', 800, 850, 70, 80),
    block('block-20', 1590, 900, 90, 100)
  ]);

  function freezeList(items) {
    return Object.freeze(items.map(item => Object.freeze(item)));
  }

  function place(id, name, district, x, y, kind, icon, description, quote, cost) {
    return Object.freeze({ id, name, district, x, y, kind, icon, description, quote, cost });
  }

  function facade(id) {
    const destination = PLACES[id];
    return { id, kind: 'facade', x: destination.x - 50, y: destination.y - 110, w: 100, h: 80 };
  }

  function block(id, x, y, w, h) {
    return { id, kind: 'decorative', x, y, w, h };
  }

  function finitePoint(value) {
    return value && typeof value.x === 'number' && Number.isFinite(value.x) &&
      typeof value.y === 'number' && Number.isFinite(value.y);
  }

  function containsCircle(rect, x, y) {
    return x - RADIUS >= rect.x && x + RADIUS <= rect.x + rect.w &&
      y - RADIUS >= rect.y && y + RADIUS <= rect.y + rect.h;
  }

  function circleHits(rect, x, y) {
    const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dx = x - closestX;
    const dy = y - closestY;
    return dx * dx + dy * dy < RADIUS * RADIUS;
  }

  function onFerry(x, y) {
    const ferry = CROSSINGS[CROSSINGS.length - 1];
    return Number.isFinite(x) && Number.isFinite(y) && x >= ferry.x && x <= ferry.x + ferry.w &&
      y >= ferry.y && y <= ferry.y + ferry.h;
  }

  function walkable(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !containsCircle(LAND, x, y)) return false;
    if (BUILDINGS.some(building => circleHits(building, x, y))) return false;
    if (!WATERS.some(water => circleHits(water, x, y))) return true;
    return CROSSINGS.some(crossing => containsCircle(crossing, x, y));
  }

  function safeSegment(from, to) {
    if (!finitePoint(from) || !finitePoint(to)) return false;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let step = 0; step <= steps; step++) {
      const amount = step / steps;
      if (!walkable(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount)) return false;
    }
    return true;
  }

  const gridNodes = [];
  const gridByKey = Object.create(null);
  for (let y = 50; y <= 1070; y += GRID) {
    for (let x = 90; x <= 1710; x += GRID) {
      if (!walkable(x, y)) continue;
      const node = Object.freeze({ x, y });
      gridNodes.push(node);
      gridByKey[key(x, y)] = node;
    }
  }

  function key(x, y) {
    return x + ',' + y;
  }

  function closestConnector(point) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of gridNodes) {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < bestDistance && safeSegment(point, node)) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  function search(start) {
    const startKey = key(start.x, start.y);
    const queue = [start];
    const previous = Object.create(null);
    previous[startKey] = null;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      const candidates = [
        gridByKey[key(current.x + GRID, current.y)],
        gridByKey[key(current.x - GRID, current.y)],
        gridByKey[key(current.x, current.y + GRID)],
        gridByKey[key(current.x, current.y - GRID)]
      ];
      for (const candidate of candidates) {
        if (!candidate || !safeSegment(current, candidate)) continue;
        const candidateKey = key(candidate.x, candidate.y);
        if (Object.prototype.hasOwnProperty.call(previous, candidateKey)) continue;
        previous[candidateKey] = current;
        queue.push(candidate);
      }
    }
    return { previous, nodes: queue };
  }

  function rebuildPath(previous, end) {
    const path = [];
    let current = end;
    while (previous[key(current.x, current.y)] !== null) {
      path.push({ x: current.x, y: current.y });
      current = previous[key(current.x, current.y)];
    }
    path.reverse();
    return path;
  }

  function route(from, to) {
    if (!finitePoint(from) || !finitePoint(to) || !walkable(from.x, from.y)) return [];
    if (from.x === to.x && from.y === to.y) return [];
    if (walkable(to.x, to.y) && safeSegment(from, to)) return [{ x: to.x, y: to.y }];

    const start = closestConnector(from);
    if (!start) return [];
    const found = search(start);
    let end = null;
    let appendTarget = false;

    if (walkable(to.x, to.y)) {
      let bestSteps = Infinity;
      for (const node of found.nodes) {
        if (!safeSegment(node, to)) continue;
        const steps = pathLength(found.previous, node);
        if (steps < bestSteps) {
          end = node;
          bestSteps = steps;
        }
      }
      appendTarget = true;
    } else {
      let bestDistance = Infinity;
      for (const node of found.nodes) {
        const distance = Math.hypot(node.x - to.x, node.y - to.y);
        if (distance < bestDistance) {
          end = node;
          bestDistance = distance;
        }
      }
    }
    if (!end) return [];

    const path = rebuildPath(found.previous, end);
    if (start.x !== from.x || start.y !== from.y) path.unshift({ x: start.x, y: start.y });
    if (appendTarget && (end.x !== to.x || end.y !== to.y)) path.push({ x: to.x, y: to.y });
    return path;
  }

  function pathLength(previous, end) {
    let length = 0;
    let current = end;
    while (previous[key(current.x, current.y)] !== null) {
      length++;
      current = previous[key(current.x, current.y)];
    }
    return length;
  }

  function seconds(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(0.1, value)) : 0;
  }

  function move(position, dx, dy, elapsed) {
    if (!finitePoint(position) || !walkable(position.x, position.y) ||
        !Number.isFinite(dx) || !Number.isFinite(dy)) return finitePoint(position) ? { x: position.x, y: position.y } : createPoint();
    const magnitude = Math.hypot(dx, dy);
    const distance = SPEED * seconds(elapsed);
    if (!magnitude || !distance) return { x: position.x, y: position.y };
    const changeX = dx / magnitude * distance;
    const changeY = dy / magnitude * distance;
    const target = { x: position.x + changeX, y: position.y + changeY };
    if (safeSegment(position, target)) return target;

    const steps = Math.max(1, Math.ceil(distance / 4));
    const stepX = changeX / steps;
    const stepY = changeY / steps;
    let current = { x: position.x, y: position.y };
    for (let step = 0; step < steps; step++) {
      const diagonal = { x: current.x + stepX, y: current.y + stepY };
      if (safeSegment(current, diagonal)) {
        current = diagonal;
        continue;
      }
      const horizontal = { x: current.x + stepX, y: current.y };
      const vertical = { x: current.x, y: current.y + stepY };
      if (safeSegment(current, horizontal)) current = horizontal;
      if (safeSegment(current, vertical)) current = vertical;
    }
    return current;
  }

  function moveAlong(position, path, elapsed) {
    const currentPath = Array.isArray(path) && path.every(finitePoint) ? path.map(point => ({ x: point.x, y: point.y })) : [];
    let current = finitePoint(position) ? { x: position.x, y: position.y } : createPoint();
    let remaining = SPEED * seconds(elapsed);
    while (currentPath.length && remaining > 0) {
      const next = currentPath[0];
      const distance = Math.hypot(next.x - current.x, next.y - current.y);
      if (distance <= remaining && safeSegment(current, next)) {
        current = { x: next.x, y: next.y };
        currentPath.shift();
        remaining -= distance;
        continue;
      }
      const moved = move(current, next.x - current.x, next.y - current.y, remaining / SPEED);
      if (moved.x === current.x && moved.y === current.y) break;
      current = moved;
      remaining = 0;
    }
    return { position: current, path: currentPath, arrived: currentPath.length === 0 };
  }

  function near(position, radius) {
    if (!finitePoint(position)) return null;
    const limit = radius === undefined ? 60 : radius;
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) return null;
    let result = null;
    let nearest = limit;
    for (const destination of Object.values(PLACES)) {
      const distance = Math.hypot(destination.x - position.x, destination.y - position.y);
      if (distance <= nearest) {
        result = destination;
        nearest = distance;
      }
    }
    return result;
  }

  function createPoint() {
    return { x: PLACES.pub.x, y: PLACES.pub.y };
  }

  function create() {
    return { x: PLACES.pub.x, y: PLACES.pub.y, visited: ['pub'] };
  }

  function restore(value) {
    if (!finitePoint(value) || !walkable(value.x, value.y) || !Array.isArray(value.visited)) return create();
    const seen = new Set();
    for (const id of value.visited) {
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PLACES, id) || seen.has(id)) return create();
      seen.add(id);
    }
    return { x: value.x, y: value.y, visited: value.visited.slice() };
  }

  return Object.freeze({
    WIDTH, HEIGHT, LAND, WATERS, CROSSINGS, PLACES, BUILDINGS,
    walkable, onFerry, route, move, moveAlong, near, create, restore
  });
});

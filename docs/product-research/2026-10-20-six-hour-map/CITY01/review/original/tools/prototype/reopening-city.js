(function (root, factory) {
  'use strict';
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./geo-world.js') : root.GeoWorld);
  if (common) module.exports = api;
  if (root) root.City = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GeoWorld) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Real-geometry city (CITY01 / f02-real-city-d27).
  //
  // Geometry never lives in this module: City.configure(data, {navigator,routes})
  // is called once per runtime with the accepted GEO v1 data, an accepted NAV
  // navigator (isWalkable / segmentWalkable predicates) and the independently
  // implemented frozen routes service. Before configuration, every method that
  // needs geometry fails clearly; there is no fabricated fallback city.
  //
  // Units are metres and metres per game-second. F3 is an explicit saved
  // transit leg; the boat is never represented as walkable water.
  // ---------------------------------------------------------------------------

  const PLACES = GeoWorld.PLACES;
  const ANCHORS = GeoWorld.ANCHORS;
  const MAP_VERSION = GeoWorld.MAP_VERSION;
  const F3_DEF = GeoWorld.F3;
  const FERRY_ID = F3_DEF.id;
  const FERRY_BANKS = Object.freeze(new Set([F3_DEF.from, F3_DEF.to]));

  // Exported tuning constants for UI consumers.
  const ACTOR_RADIUS = 0.4;      // metres, whole-body clearance
  const WALK_SPEED = 48;         // metres per game-second
  const BIKE_SPEED = 96;
  const FERRY_SPEED = F3_DEF.speedMps; // 32
  const ARRIVAL_RADIUS = 4;      // metres, arrival at a waypoint/place
  const BIKE_RETRIEVAL = 2;      // metres, bicycle pickup distance
  const SUBSTEP = 2;             // max metres per swept-capsule move chunk
  const EPS = 1e-6;

  // Frozen legacy coordinate table (old 1800x1120 invented units), used only
  // to migrate recognized old saves once. Nothing else may use these values.
  const LEGACY_UNITS = Object.freeze({ width: 1800, height: 1120 });
  const LEGACY_PLACES = Object.freeze({
    pub: Object.freeze({ x: 290, y: 590 }),
    lotte: Object.freeze({ x: 490, y: 650 }),
    coffee: Object.freeze({ x: 730, y: 930 }),
    noord: Object.freeze({ x: 1230, y: 170 }),
    market: Object.freeze({ x: 930, y: 1010 }),
    flowers: Object.freeze({ x: 1240, y: 1040 }),
    lab: Object.freeze({ x: 1490, y: 910 })
  });
  const LEGACY_RECOGNITION = 60; // old-unit nearest-place radius

  let config = null;

  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function finitePoint(v) {
    return !!v && typeof v === 'object' && isNum(v.x) && isNum(v.y);
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function samePoint(a, b) {
    return !!a && !!b && Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
  }

  function ready() {
    if (!config) {
      throw new Error('City is not configured: call City.configure(data, { navigator, routes }) first');
    }
    return config;
  }

  // ---------------------------------------------------------------------------
  // Configuration / lifecycle
  // ---------------------------------------------------------------------------

  function configure(data, options) {
    if (config) {
      throw new Error('City is already configured; call City.dispose() before reconfiguring');
    }
    if (!data || typeof data !== 'object') {
      throw new TypeError('City.configure: geo data object is required');
    }
    if (!data.layers || typeof data.layers !== 'object') {
      throw new TypeError('City.configure: data.layers (accepted GEO v1 layers) is required');
    }
    if (!isNum(data.width) || data.width <= 0 || !isNum(data.height) || data.height <= 0) {
      throw new TypeError('City.configure: positive finite data.width/data.height (metres) are required');
    }
    const opts = options || {};
    const navigator = opts.navigator;
    if (!navigator || typeof navigator.isWalkable !== 'function' ||
        typeof navigator.segmentWalkable !== 'function') {
      throw new TypeError('City.configure: options.navigator must expose isWalkable() and segmentWalkable()');
    }
    const routes = opts.routes;
    if (!routes || typeof routes.route !== 'function') {
      throw new TypeError('City.configure: options.routes.route(from,to,opts) must be a function');
    }

    // The navigator indexed and validated the complete immutable geometry at
    // construction; City never rescans or revalidates that geometry per tick.
    // `active`/`serial`/`cache` are mutable runtime state, so config itself is
    // not frozen (only its fixed geometry pieces are).
    config = {
      data,
      width: data.width,
      height: data.height,
      bounds: Object.freeze({ x: 0, y: 0, width: data.width, height: data.height }),
      nav: navigator,
      routes,
      cache: new Map(),
      serial: 0,
      active: null
    };
  }

  function isReady() { return config !== null; }
  function getData() { return ready().data; }
  function dispose() {
    if (config && config.active) {
      try { config.active.controller.abort(makeAbortError()); } catch (_) { /* noop */ }
    }
    config = null;
  }

  // ---------------------------------------------------------------------------
  // Geometry predicates (accepted NAV navigator; actor radius 0.4 m)
  // ---------------------------------------------------------------------------

  function navPoint(p) { return { x: p.x, y: p.y }; }

  function isWalkablePoint(x, y, mode) {
    const c = ready();
    if (!isNum(x) || !isNum(y)) return false;
    return c.nav.isWalkable({ x, y }, { mode: mode || 'walk', radius: ACTOR_RADIUS });
  }

  function walkable(x, y) { return isWalkablePoint(x, y, 'walk'); }
  function rideable(x, y) { return isWalkablePoint(x, y, 'bike'); }

  function segmentWalkable(from, to, mode) {
    const c = ready();
    if (!finitePoint(from) || !finitePoint(to)) return false;
    return c.nav.segmentWalkable(navPoint(from), navPoint(to), {
      mode: mode === 'bike' ? 'bike' : 'walk', radius: ACTOR_RADIUS
    });
  }

  // UI predicate only: is the point drawn on the canonical F3 lane? Never used
  // by walkability/movement — the boat is not walkable water.
  function onFerry(x, y) {
    if (!isNum(x) || !isNum(y)) return false;
    const a = ANCHORS[F3_DEF.from];
    const b = ANCHORS[F3_DEF.to];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t, py = a.y + dy * t;
    return dist(x, y, px, py) <= ARRIVAL_RADIUS && t > 0 && t < 1;
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  function makeAbortError() {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return err;
  }

  function linkAbort(external, controller) {
    if (!external) return;
    if (external.aborted) {
      controller.abort(external.reason instanceof Error ? external.reason : makeAbortError());
      return;
    }
    external.addEventListener('abort', function () {
      controller.abort(external.reason instanceof Error ? external.reason : makeAbortError());
    }, { once: true });
  }

  function clonePath(path) {
    return path.map(p => {
      const q = { x: p.x, y: p.y };
      if (p.transport) {
        q.transport = p.transport; q.id = p.id; q.from = p.from; q.to = p.to;
      }
      return q;
    });
  }

  function keyOf(p) { return Math.round(p.x * 1000) / 1000 + ',' + Math.round(p.y * 1000) / 1000; }

  // Compatibility helper: CACHE ONLY. Never runs a (possibly long) full-map
  // search. Returns the cloned path of the latest resolved routeAsync with the
  // same endpoints/mode, or [] when nothing is cached. The runtime must use
  // routeAsync for actual planning.
  function route(from, to, options) {
    ready();
    if (!finitePoint(from) || !finitePoint(to)) return [];
    const mode = options && options.mode === 'bike' ? 'bike' : 'walk';
    const entry = config.cache.get(keyOf(from) + '>' + keyOf(to) + '|' + mode);
    return entry ? clonePath(entry.path) : [];
  }

  function asAbortError(err) {
    if (err && err.name === 'AbortError') return err;
    const wrapped = makeAbortError();
    wrapped.cause = err;
    return wrapped;
  }

  function routeOptions(c, signal, mode, onProgress, phase) {
    return {
      mode,
      radius: ACTOR_RADIUS,
      signal,
      onProgress: typeof onProgress === 'function' ? function (info) {
        onProgress(Object.assign({ phase }, info && typeof info === 'object' ? info : {}));
      } : undefined
    };
  }

  function emit(onProgress, phase, progress) {
    if (typeof onProgress === 'function') onProgress({ phase, progress });
  }

  // Ground call into the frozen routes service. The frozen surface is:
  //   routes.route(from,to,{mode,radius,signal,onProgress})
  //   -> Promise<{found,reason,points,length,visited,startSnap,endSnap}>
  async function groundRoute(c, from, to, signal, mode, onProgress, phase) {
    const result = await c.routes.route({ x: from.x, y: from.y }, { x: to.x, y: to.y },
      routeOptions(c, signal, mode, onProgress, phase));
    if (signal.aborted) throw asAbortError(result);
    if (!result || typeof result.found !== 'boolean') {
      throw new Error('routes.route returned an invalid result');
    }
    return result;
  }

  function stripFromStart(points, from) {
    const out = [];
    for (const p of points) {
      if (out.length === 0 && samePoint(p, from)) continue;
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  // Compose: validated ground leg to boarding anchor, canonical F3 leg,
  // validated onward ground leg. Every required ground leg must exist with
  // exact anchor endpoints (no silent snapping) before the composed route is
  // accepted. Returns null when composition is impossible in this direction.
  async function ferryCompose(c, serial, from, to, signal, mode, onProgress, bankFromId, bankToId) {
    const board = ANCHORS[bankFromId];
    const arrive = ANCHORS[bankToId];

    emit(onProgress, 'ground-to-board', 0);
    const legA = await groundRoute(c, from, board, signal, mode, onProgress, 'ground-to-board');
    if (serial !== c.serial || signal.aborted) throw makeAbortError();
    if (!legA.found) return null;
    if (legA.endSnap || !samePoint(legA.points[legA.points.length - 1], board)) return null;

    emit(onProgress, 'ground-from-bank', 0);
    const legC = await groundRoute(c, arrive, to, signal, mode, onProgress, 'ground-from-bank');
    if (serial !== c.serial || signal.aborted) throw makeAbortError();
    if (!legC.found) return null;
    if (legC.startSnap || legC.endSnap) return null;
    if (!samePoint(legC.points[0], arrive)) return null;

    const path = stripFromStart(legA.points, from);
    // Guard against a duplicated boarding anchor.
    if (path.length && samePoint(path[path.length - 1], board)) path.pop();
    path.push({ x: board.x, y: board.y }); // stand on the actual boarding anchor
    path.push({ // boat endpoint: canonical metadata, derives boat position
      x: arrive.x, y: arrive.y, transport: 'ferry', id: FERRY_ID, from: bankFromId, to: bankToId
    });
    const onward = legC.points.slice(1).map(p => ({ x: p.x, y: p.y }));
    path.push(...onward);

    const water = dist(board.x, board.y, arrive.x, arrive.y);
    return {
      found: true, reason: 'ferry', path,
      length: (legA.length || 0) + water + (legC.length || 0),
      visited: (legA.visited || 0) + (legC.visited || 0)
    };
  }

  async function routeAsync(from, to, options) {
    const c = ready();
    const opts = options || {};
    if (!finitePoint(from) || !finitePoint(to)) {
      return { found: false, reason: 'invalid', path: [], length: 0 };
    }
    const mode = opts.mode === 'bike' ? 'bike' : 'walk';
    const onProgress = opts.onProgress;
    const controller = new AbortController();
    linkAbort(opts.signal, controller);
    const signal = controller.signal;

    // A new planning request supersedes any stale in-flight work.
    if (c.active) {
      try { c.active.controller.abort(makeAbortError()); } catch (_) { /* noop */ }
    }
    const serial = ++c.serial;
    c.active = { controller, serial };
    const clearActive = () => {
      if (c.active && c.active.serial === serial) c.active = null;
    };

    const cacheKey = keyOf(from) + '>' + keyOf(to) + '|' + mode;
    const failure = { found: false, reason: 'unreachable', path: [], length: 0 };

    try {
      emit(onProgress, 'ground', 0);
      const direct = await groundRoute(c, from, to, signal, mode, onProgress, 'ground');
      if (serial !== c.serial || signal.aborted) throw makeAbortError();

      let result;
      if (direct.found) {
        const path = stripFromStart(direct.points, from);
        result = { found: true, reason: 'ok', path, length: direct.length || 0 };
        emit(onProgress, 'ground', 1);
      } else {
        // Ground routing failed: try F3 composition in both canonical
        // directions. City contains no pathfinder of its own; only the frozen
        // routes service searches.
        let composed =
          await ferryCompose(c, serial, from, to, signal, mode, onProgress, F3_DEF.from, F3_DEF.to);
        if (serial !== c.serial || signal.aborted) throw makeAbortError();
        if (!composed) {
          composed =
            await ferryCompose(c, serial, from, to, signal, mode, onProgress, F3_DEF.to, F3_DEF.from);
          if (serial !== c.serial || signal.aborted) throw makeAbortError();
        }
        if (composed) {
          result = composed;
          emit(onProgress, 'ferry', 1);
        } else {
          c.cache.delete(cacheKey);
          failure.reason = direct.reason || 'unreachable';
          clearActive();
          return failure;
        }
      }

      c.cache.set(cacheKey, { path: clonePath(result.path), length: result.length });
      clearActive();
      return result;
    } catch (err) {
      if (serial === c.serial) c.cache.delete(cacheKey);
      clearActive();
      if (signal.aborted || (err && err.name === 'AbortError')) throw asAbortError(err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Movement state
  // ---------------------------------------------------------------------------

  function seconds(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(0.1, value)) : 0;
  }

  function createPoint() {
    return { x: PLACES.pub.x, y: PLACES.pub.y };
  }

  function create() {
    return {
      map: MAP_VERSION,
      x: PLACES.pub.x, y: PLACES.pub.y,
      visited: ['pub'],
      bike: { x: PLACES.pub.x, y: PLACES.pub.y, mounted: false }
    };
  }

  function carriedBikeAt(x, y) {
    return rideable(x, y)
      ? { x, y, mounted: true }
      : { x, y, mounted: false, pushing: true };
  }

  function isCarrying(bike) { return !!bike && (bike.mounted || bike.pushing); }

  function relocate(position, x, y) {
    const next = Object.assign({}, position, { x, y });
    if (isCarrying(position.bike)) next.bike = carriedBikeAt(x, y);
    return next;
  }

  // Point-only callers get default visits, like old saves, then go through the
  // full strict restore.
  function movementState(position) {
    ready();
    if (position && typeof position === 'object' && !Array.isArray(position) &&
        position.visited === undefined && position.map === undefined) {
      return restore(Object.assign({}, position, { visited: ['pub'] }));
    }
    return restore(position);
  }

  // Exact swept-capsule move with diagonal sliding. Every attempted chunk is
  // tested as a whole capsule (walk mode), and a carried bicycle additionally
  // uses the bike-safe capsule to decide ride vs. push.
  function travel(position, dx, dy, elapsed, limit) {
    const c = ready();
    const budget = limit === undefined ? Infinity : limit;
    const magnitude = Math.hypot(dx, dy);
    let current = position;
    let remaining = elapsed;
    let covered = 0;
    if (!magnitude || !Number.isFinite(magnitude)) return { position: current, used: 0 };
    const ux = dx / magnitude, uy = dy / magnitude;

    while (remaining > 1e-10 && covered < budget - 1e-10) {
      const carrying = isCarrying(current.bike);
      const chunk = Math.min(SUBSTEP, WALK_SPEED * remaining, budget - covered);
      let speed = WALK_SPEED;
      // A carried bicycle rides only when the COMPLETE chunk capsule is
      // bike-safe; otherwise this chunk is pushed at walking speed.
      let bikeCapsuleBlocked = false;
      if (carrying && current.bike.mounted) {
        const probe = { x: current.x + ux * chunk, y: current.y + uy * chunk };
        if (segmentWalkable(current, probe, 'bike')) speed = BIKE_SPEED;
        else bikeCapsuleBlocked = true;
      }
      if (chunk <= 1e-10) break;
      const stepX = ux * chunk, stepY = uy * chunk;
      const target = { x: current.x + stepX, y: current.y + stepY };
      let point = { x: current.x, y: current.y };
      if (segmentWalkable(current, target, 'walk')) {
        point = target;
      } else {
        // Diagonal sliding along each axis, never through a barrier.
        const horizontal = { x: current.x + stepX, y: current.y };
        if (segmentWalkable(current, horizontal, 'walk')) point = horizontal;
        const base = point;
        const vertical = { x: base.x, y: current.y + stepY };
        if (segmentWalkable(base, vertical, 'walk')) point = vertical;
      }
      if (point.x === current.x && point.y === current.y) {
        remaining = 0;
        break;
      }
      current = relocate(current, point.x, point.y);
      if (bikeCapsuleBlocked && current.bike && current.bike.mounted) {
        // The swept capsule was not bike-safe: dismount to a push for this
        // chunk; the bicycle is retained and keeps following the player.
        current = Object.assign({}, current, {
          bike: { x: current.x, y: current.y, mounted: false, pushing: true }
        });
      }
      remaining = Math.max(0, remaining - chunk / speed);
      covered += chunk;
      if (chunk >= budget - covered - 1e-10) break;
    }
    return { position: current, used: elapsed - remaining };
  }

  function move(position, dx, dy, elapsed) {
    ready();
    const current = movementState(position);
    if (!isNum(dx) || !isNum(dy)) return current;
    const dt = seconds(elapsed);

    // Aboard F3: direction keys clear onward intent (the runtime drops the
    // ephemeral path), but the crossing always finishes to the safe bank.
    if (current.transit) return advanceFerry(current, dt).position;
    return travel(current, dx, dy, dt).position;
  }

  // ---------------------------------------------------------------------------
  // F3 transit leg
  // ---------------------------------------------------------------------------

  function canonicalFerry(from, to) {
    return from !== to && FERRY_BANKS.has(from) && FERRY_BANKS.has(to);
  }

  function ferryPoint(transit, progress) {
    const a = ANCHORS[transit.from];
    const b = ANCHORS[transit.to];
    return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
  }

  function ferryLength(transit) {
    const a = ANCHORS[transit.from];
    const b = ANCHORS[transit.to];
    return dist(a.x, a.y, b.x, b.y);
  }

  function isFerryPoint(p) {
    return !!p && p.transport === 'ferry' && p.id === FERRY_ID &&
      canonicalFerry(p.from, p.to);
  }

  // Advance a saved transit leg by dt seconds. Bike (if carried) follows the
  // player; a remotely parked bike never moves. On landing, ride state is
  // recomputed from the actual bank surface.
  function advanceFerry(position, dt) {
    let transit = position.transit;
    const length = ferryLength(transit);
    let progress = transit.progress + (FERRY_SPEED * dt) / length;
    let next = Object.assign({}, position);
    if (progress >= 1) {
      const bank = ANCHORS[transit.to];
      next.x = bank.x;
      next.y = bank.y;
      next.transit = null;
      delete next.transit;
      if (isCarrying(position.bike)) next.bike = carriedBikeAt(bank.x, bank.y);
      return { position: next, landed: true, progress: 1 };
    }
    const p = ferryPoint(transit, progress);
    next.x = p.x;
    next.y = p.y;
    next.transit = Object.assign({}, transit, { progress });
    if (isCarrying(position.bike)) {
      next.bike = Object.assign({}, position.bike, { x: p.x, y: p.y });
    }
    return { position: next, landed: false, progress };
  }

  function boardFerry(position, point) {
    const anchor = ANCHORS[point.from];
    const next = Object.assign({}, position, {
      x: anchor.x, y: anchor.y,
      transit: { id: FERRY_ID, from: point.from, to: point.to, progress: 0 }
    });
    if (isCarrying(position.bike)) {
      next.bike = Object.assign({}, position.bike, { x: anchor.x, y: anchor.y });
    }
    return next;
  }

  function moveAlong(position, path, elapsed) {
    ready();
    const input = Array.isArray(path) && path.every(finitePoint) ? clonePath(path) : [];
    let current = movementState(position);
    let remaining = seconds(elapsed);

    while (remaining > 1e-10) {
      // Aboard the boat: keep crossing even with an empty ephemeral path
      // (refresh / cancellation / movement keys).
      if (current.transit) {
        const before = current.transit;
        const sailed = advanceFerry(current, remaining);
        current = sailed.position;
        remaining = 0;
        if (sailed.landed) {
          if (input.length && isFerryPoint(input[0]) &&
              input[0].from === before.from && input[0].to === before.to) {
            input.shift();
          }
          // Continue onto validated onward ground intent with any spare time;
          // without it the crossing simply ends on safe bank ground.
          if (!input.length) break;
          continue;
        }
        break;
      }

      if (!input.length) break;
      const next = input[0];

      if (isFerryPoint(next)) {
        const anchor = ANCHORS[next.from];
        // Board only from the actual reviewed boarding anchor.
        if (dist(current.x, current.y, anchor.x, anchor.y) > ARRIVAL_RADIUS) break;
        current = boardFerry(current, next);
        continue;
      }

      const d = dist(next.x, next.y, current.x, current.y);
      if (d < EPS) {
        current = relocate(current, next.x, next.y);
        input.shift();
        continue;
      }
      const result = travel(current, next.x - current.x, next.y - current.y, remaining, d);
      const before = current;
      current = result.position;
      remaining -= result.used;
      if (dist(next.x, next.y, current.x, current.y) <= EPS) {
        current = relocate(current, next.x, next.y);
        input.shift();
      } else break;
    }

    return { position: current, path: input, arrived: input.length === 0 && !current.transit };
  }

  // ---------------------------------------------------------------------------
  // Places, bikes
  // ---------------------------------------------------------------------------

  function near(position, radius) {
    if (!finitePoint(position)) return null;
    const limit = radius === undefined ? ARRIVAL_RADIUS : radius;
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) return null;
    let result = null;
    let nearest = limit;
    for (const destination of Object.values(PLACES)) {
      const distance = dist(destination.x, destination.y, position.x, position.y);
      if (distance <= nearest) {
        result = destination;
        nearest = distance;
      }
    }
    return result;
  }

  function toggleBike(position) {
    const current = movementState(position);
    if (isCarrying(current.bike)) return parkBike(current);
    const bike = current.bike;
    if (dist(current.x, current.y, bike.x, bike.y) > BIKE_RETRIEVAL ||
        !segmentWalkable(current, bike, 'walk')) return current;
    return Object.assign({}, current, { bike: carriedBikeAt(current.x, current.y) });
  }

  function parkBike(position) {
    const current = movementState(position);
    if (isCarrying(current.bike)) {
      return Object.assign({}, current, { bike: { x: current.x, y: current.y, mounted: false } });
    }
    return current;
  }

  // ---------------------------------------------------------------------------
  // Saves: new-version validation, legacy migration, strict cloning
  // ---------------------------------------------------------------------------

  function validVisits(visited) {
    if (!Array.isArray(visited)) return false;
    const seen = new Set();
    for (const id of visited) {
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PLACES, id) || seen.has(id)) {
        return false;
      }
      seen.add(id);
    }
    return true;
  }

  // Recognize an old 1800x1120-unit coordinate as one of the seven named
  // places; otherwise the pub. Player and bicycle are migrated independently.
  function legacyPlaceId(x, y) {
    if (!isNum(x) || !isNum(y)) return 'pub';
    if (x < 0 || y < 0 || x > LEGACY_UNITS.width || y > LEGACY_UNITS.height) return 'pub';
    let best = 'pub';
    let bestDistance = LEGACY_RECOGNITION;
    for (const [id, p] of Object.entries(LEGACY_PLACES)) {
      const d = dist(x, y, p.x, p.y);
      if (d <= bestDistance) { best = id; bestDistance = d; }
    }
    return best;
  }

  function bikeAtPlace(id, mounted) {
    const p = PLACES[id];
    return mounted ? { x: p.x, y: p.y, mounted: true } : { x: p.x, y: p.y, mounted: false };
  }

  // Structural/consistency validation of a new-version bike record. Returns
  // the normalized record or null when invalid. Carried bikes must coincide
  // with the player and (when mounted) be on bike-safe ground.
  function validBike(bike, x, y, transit) {
    if (!finitePoint(bike) || typeof bike.mounted !== 'boolean') return null;
    if (![undefined, true, false].includes(bike.pushing)) return null;
    if (bike.mounted && bike.pushing) return null;
    const carrying = bike.mounted || bike.pushing;
    if (carrying) {
      if (Math.abs(bike.x - x) > EPS || Math.abs(bike.y - y) > EPS) return null;
      if (!transit) {
        if (!walkable(bike.x, bike.y)) return null;
        if (bike.mounted && !rideable(bike.x, bike.y)) return null;
      }
      return {
        x: bike.x, y: bike.y, mounted: bike.mounted,
        ...(bike.pushing ? { pushing: true } : {})
      };
    }
    if (!walkable(bike.x, bike.y)) return null;
    return { x: bike.x, y: bike.y, mounted: false };
  }

  function validTransit(t, x, y) {
    if (!t || typeof t !== 'object' || t.id !== FERRY_ID) return null;
    if (!canonicalFerry(t.from, t.to)) return null;
    if (!isNum(t.progress) || t.progress < 0 || t.progress > 1) return null;
    if (t.progress >= 1) return null; // arrived legs must already be cleared
    const derived = ferryPoint(t, t.progress);
    // Stored coordinates must lie on the canonical leg (boat position derives
    // from from/to/progress); reject forged/nonfinite/unknown transit.
    if (dist(x, y, derived.x, derived.y) > 0.05) return null;
    return { id: FERRY_ID, from: t.from, to: t.to, progress: t.progress };
  }

  function restoreInfo(value) {
    ready();
    const fresh = create();
    const notes = [];
    if (!value || typeof value !== 'object' || Array.isArray(value) || !finitePoint(value) ||
        !validVisits(value.visited)) {
      return { state: fresh, migrated: false, notes: ['reset-create'] };
    }
    const visited = value.visited.slice();
    let x = value.x, y = value.y;
    let bike = null;
    let transit = null;
    let migrated = false;
    let positionReset = false;

    if (value.map !== MAP_VERSION) {
      // Old rectangular-city save: migrate once, independently for the player
      // and any parked bicycle.
      migrated = true;
      const placeId = legacyPlaceId(value.x, value.y);
      x = PLACES[placeId].x; y = PLACES[placeId].y;
      if (finitePoint(value.bike)) {
        const bikeId = legacyPlaceId(value.bike.x, value.bike.y);
        bike = { x: PLACES[bikeId].x, y: PLACES[bikeId].y, mounted: false };
      } else {
        bike = { x: PLACES.pub.x, y: PLACES.pub.y, mounted: false };
      }
      notes.push('migrated-legacy-coordinates');
    } else {
      if (value.transit !== undefined && value.transit !== null) {
        transit = validTransit(value.transit, value.x, value.y);
        if (!transit) {
          notes.push('reset-transit');
        }
      }
      if (!transit && !walkable(value.x, value.y)) {
        x = PLACES.pub.x; y = PLACES.pub.y;
        positionReset = true;
        notes.push('reset-position');
      }

      if (finitePoint(value.bike)) {
        if (positionReset && isCarrying(value.bike)) bike = null;
        else bike = validBike(value.bike, x, y, transit);
        if (!bike) {
          bike = { x: PLACES.pub.x, y: PLACES.pub.y, mounted: false };
          notes.push('reset-bike');
        }
      } else {
        bike = { x: PLACES.pub.x, y: PLACES.pub.y, mounted: false };
      }
    }

    const state = {
      map: MAP_VERSION, x, y, visited,
      bike: { x: bike.x, y: bike.y, mounted: !!bike.mounted,
        ...(bike.pushing ? { pushing: true } : {}) }
    };
    if (transit) state.transit = { id: transit.id, from: transit.from, to: transit.to, progress: transit.progress };
    if (migrated) notes.push('migrated');
    return { state, migrated, notes };
  }

  function restore(value) {
    if (!config && (!value || typeof value !== 'object' || value.map !== MAP_VERSION)) {
      // Keep the legacy "garbage in -> fresh city" behavior informative even
      // pre-configure is impossible; geometry-validating restores require config.
      if (!value || typeof value !== 'object' || !validVisits(value.visited)) return create();
      throw new Error('City is not configured: call City.configure(data, { navigator, routes }) first');
    }
    return restoreInfo(value).state;
  }

  // ---------------------------------------------------------------------------
  // Public API (frozen). WIDTH/HEIGHT/BOUNDS reflect the configured real data.
  // ---------------------------------------------------------------------------

  const api = {
    // Shared immutable world references for the browser adapter.
    world: GeoWorld,
    MAP_VERSION,
    PLACES,
    ANCHORS,
    F3: F3_DEF,
    // Tuning constants.
    ACTOR_RADIUS, WALK_SPEED, BIKE_SPEED, FERRY_SPEED,
    ARRIVAL_RADIUS, BIKE_RETRIEVAL,
    // Lifecycle.
    configure, isReady, getData, dispose,
    // Geometry + movement.
    walkable, rideable, segmentWalkable, onFerry,
    route, routeAsync,
    move, moveAlong, near,
    create, restore, restoreInfo, toggleBike, parkBike
  };

  Object.defineProperties(api, {
    WIDTH: { get() { return ready().width; }, enumerable: true },
    HEIGHT: { get() { return ready().height; }, enumerable: true },
    BOUNDS: { get() { return ready().bounds; }, enumerable: true }
  });

  return Object.freeze(api);
});

  /* removed invented rectangular-city place table:
  Object.freeze({
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
    flowers: place('flowers', '南街花店', 'De Pijp', 1240, 1040, 'flowers', '⚘',
      '挑几枝郁金香，给今天配一种颜色。', '花会谢，账单不会。至少窗台可以先好看起来。', 0),
    lab: place('lab', 'Chen \u5b9e\u9a8c\u5ba4', 'Science Park', 1490, 910, 'lab', '\u2697',
      '\u7528 \u20ac6 \u6362\u4e24\u4efd\u5b9e\u9a8c\u9152\u82b1\u3002', '\u7ecf\u8d39\u4e0d\u591f\u53d1\u8bba\u6587\uff0c\u591f\u53d1\u9175\u3002', 6)
  */

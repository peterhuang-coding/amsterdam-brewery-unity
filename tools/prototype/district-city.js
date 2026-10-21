/*
 * DistrictCity (CITY02) — district movement/travel adapter.
 *
 * UMD: module.exports (CommonJS) and globalThis.DistrictCity (browser).
 * The legacy global `City` (reopening-city.js) is intentionally untouched.
 *
 * Geometry never lives here: configure(session) binds one accepted
 * DistrictRuntime session. Local movement uses ONLY the active district's
 * snapped anchors (active.data.anchors / active.data.entrance) and its
 * navigator predicates. Overview markers are source positions used solely
 * for remote metadata, never as walkability claims. Cross-district travel
 * uses only the manifest's explicit undirected travel links; there is no
 * whole-map geometry, no route cache and no fabricated fallback map.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DistrictCity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Frozen tuning constants (metres / game-seconds).
  // ---------------------------------------------------------------------------
  const ACTOR_RADIUS = 0.4;
  const WALK_SPEED = 48;
  const BIKE_SPEED = 96;
  const FERRY_SPEED = 32;
  const ARRIVAL_RADIUS = 4;
  const BIKE_RETRIEVAL = 2;
  const SUBSTEP = 2;       // max metres per swept-capsule chunk
  const EPS = 1e-6;
  const F3_EPS = 0.05;    // F3 boarding tolerance at the snapped bank

  // Legacy 1800x1120 invented-unit recognition table, used once to migrate
  // old saves. Nothing else may reference these coordinates.
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
  const LEGACY_RECOGNITION = 60;

  // The seven preserved venue identities. Names/kinds/icons/prose/costs are
  // the frozen fictional layer; districtId/anchorId bind each venue to the
  // packaged district map. The Noord venue boards at the north F3 bank.
  function venue(id, name, district, kind, icon, description, quote, cost, districtId, anchorId) {
    return Object.freeze({ id, name, district, kind, icon, description, quote, cost, districtId, anchorId });
  }
  const VENUES = Object.freeze([
    venue('pub', 'Tweede Kans', 'Jordaan', 'pub', '\u{1f37a}',
      '回到吧台，准备今晚的二次机会。', '酒馆还没倒，只是账单站得更稳。', 0, 'jordaan', 'pub'),
    venue('lotte', 'Lotte 的桥', '运河带', 'visit', '♫',
      '找 Lotte 约好今晚的黑啤和吉他。', '我带吉他，你带一杯不是曝光量的报酬。', 0, 'jordaan', 'lotte'),
    venue('coffee', 'Bram 咖啡馆', 'De Pijp', 'coffee', '☕',
      '帮 Bram 顶一段午市，工资当天结。', '梦想不能抵时薪，这条街至少还记得。', 0, 'depijp', 'coffee'),
    venue('noord', '北岸码头', 'Noord', 'surf', '⚓',
      '从漂浮物里找还能用的酒花和瓶子。', '河面什么都送来，除了保修单。', 0, 'noord', 'ferryNorth'),
    venue('market', 'Albert Cuyp 市场', 'De Pijp', 'market', '▥',
      '用 €8 收下一箱收市库存。', '三瓶酒的保质期，比这间店的租约长。', 8, 'depijp', 'market'),
    venue('flowers', '南街花店', 'De Pijp', 'flowers', '⚘',
      '挑几枝郁金香，给今天配一种颜色。', '花会谢，账单不会。至少窗台可以先好看起来。', 0, 'depijp', 'flowers'),
    venue('lab', 'Chen 实验室', 'Science Park', 'lab', '⚗',
      '用 €6 换两份实验酒花。', '经费不够发论文，够发酵。', 6, 'science', 'lab')
  ]);
  const VENUE_BY_ID = Object.freeze(VENUES.reduce((m, p) => (m[p.id] = p, m), Object.create(null)));

  // Special interaction points: separate from the seven economic venues.
  const GARDEN_META = Object.freeze({ id: 'garden', districtId: 'depijp', anchorId: 'garden' });
  const CART_META = Object.freeze({ id: 'flowerCart', districtId: 'depijp', anchorId: 'flowerCart' });

  // Static anchor ownership used for F3 bank selection and remote data.
  const ANCHOR_DISTRICT = Object.freeze({
    pub: 'jordaan', lotte: 'jordaan',
    market: 'depijp', coffee: 'depijp', flowers: 'depijp', flowerCart: 'depijp', garden: 'depijp',
    ferrySouth: 'station', ferryNorth: 'noord', lab: 'science'
  });
  const BANK_ANCHOR = Object.freeze({ station: 'ferrySouth', noord: 'ferryNorth' });

  let config = null;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function finitePoint(v) {
    return !!v && typeof v === 'object' && isNum(v.x) && isNum(v.y);
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function clampSeconds(value) {
    return isNum(value) ? Math.max(0, Math.min(0.1, value)) : 0;
  }
  function isCarrying(bike) { return !!bike && (bike.mounted === true || bike.pushing === true); }
  function cloneJson(value) {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function ready() {
    if (!config) throw new Error('DistrictCity is not configured: call DistrictCity.configure(session) first');
    return config;
  }

  // ---------------------------------------------------------------------------
  // Configuration / lifecycle
  // ---------------------------------------------------------------------------
  function configure(session) {
    if (config) {
      throw new Error('DistrictCity is already configured; call dispose() before reconfiguring');
    }
    if (!session || typeof session !== 'object') {
      throw new TypeError('DistrictCity.configure: a DistrictRuntime session is required');
    }
    const manifest = session.manifest;
    if (!manifest || typeof manifest !== 'object' || typeof manifest.mapVersion !== 'string' ||
        !manifest.mapVersion || !Array.isArray(manifest.districts) || manifest.districts.length === 0) {
      throw new TypeError('DistrictCity.configure: session.manifest needs mapVersion and a districts array');
    }
    const districts = new Map();
    for (const d of manifest.districts) {
      if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id ||
          !Array.isArray(d.bounds) || d.bounds.length !== 4 ||
          !d.bounds.every(isNum) || !(d.bounds[2] > d.bounds[0]) || !(d.bounds[3] > d.bounds[1])) {
        throw new TypeError('DistrictCity.configure: malformed manifest district entry');
      }
      if (districts.has(d.id)) throw new TypeError('DistrictCity.configure: duplicate district ' + d.id);
      districts.set(d.id, { id: d.id, bounds: d.bounds.slice() });
    }
    const links = [];
    const adjacency = new Map();
    function addEdge(a, b, link) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push({ to: b, mode: link.mode, id: link.id });
    }
    const rawLinks = manifest.travelLinks === undefined ? [] : manifest.travelLinks;
    if (!Array.isArray(rawLinks)) throw new TypeError('DistrictCity.configure: travelLinks must be an array');
    for (const link of rawLinks) {
      if (!link || typeof link !== 'object' || typeof link.from !== 'string' ||
          typeof link.to !== 'string' || !['street', 'ferry'].includes(link.mode)) {
        throw new TypeError('DistrictCity.configure: malformed travel link');
      }
      if (link.id !== undefined && typeof link.id !== 'string') {
        throw new TypeError('DistrictCity.configure: travel link id must be a string');
      }
      if (!districts.has(link.from) || !districts.has(link.to) || link.from === link.to) {
        throw new TypeError('DistrictCity.configure: travel link endpoints must be distinct known districts');
      }
      const leg = { from: link.from, to: link.to, mode: link.mode, id: link.id };
      links.push(leg);
      addEdge(link.from, link.to, leg);
      addEdge(link.to, link.from, leg);
    }

    const overview = session.overview;
    if (!overview || typeof overview !== 'object' || !Array.isArray(overview.markers)) {
      throw new TypeError('DistrictCity.configure: session.overview.markers array is required');
    }
    const markers = new Map();
    for (const mk of overview.markers) {
      if (!mk || typeof mk !== 'object' || typeof mk.id !== 'string' || !isNum(mk.x) || !isNum(mk.y) ||
          typeof mk.districtId !== 'string' || !districts.has(mk.districtId)) {
        throw new TypeError('DistrictCity.configure: malformed overview marker');
      }
      markers.set(mk.id, { id: mk.id, x: mk.x, y: mk.y, districtId: mk.districtId });
    }

    // DistrictRuntime.open resolves with active:null until the first
    // loadDistrict(id). A configured manifest+overview is enough for
    // requiredDistrict/planTravel; local geometry/actions stay closed (they
    // read the session's live active value) and no fallback district exists.
    const active = session.active;
    if (active !== null) {
      if (!active || typeof active !== 'object' || !active.data || typeof active.data !== 'object' ||
          !active.navigator || typeof active.navigator !== 'object') {
        throw new TypeError('DistrictCity.configure: session.active must be {data, navigator} or null');
      }
      if (typeof active.data.id !== 'string' || !districts.has(active.data.id)) {
        throw new TypeError('DistrictCity.configure: active district is not in the manifest');
      }
      const nav = active.navigator;
      if (typeof nav.isWalkable !== 'function' || typeof nav.segmentWalkable !== 'function' ||
          typeof nav.route !== 'function') {
        throw new TypeError('DistrictCity.configure: active navigator must expose isWalkable/segmentWalkable/route');
      }
    } else if (typeof session.loadDistrict !== 'function') {
      throw new TypeError('DistrictCity.configure: a null-active session must expose loadDistrict');
    }

    config = {
      session,
      mapVersion: manifest.mapVersion,
      districts,
      links,
      adjacency,
      markers
    };
  }

  function isReady() { return config !== null; }
  function dispose() { config = null; }

  // ---------------------------------------------------------------------------
  // Active-district accessors
  // ---------------------------------------------------------------------------
  function active() {
    const c = ready();
    const a = c.session.active;
    if (!a || !a.data || !a.navigator) {
      throw new Error('DistrictCity: session has no active district');
    }
    return a;
  }
  function activeId() { return active().data.id; }
  function activeNav() { return active().navigator; }
  function activeAnchors() {
    const data = active().data;
    return data.anchors && typeof data.anchors === 'object' ? data.anchors : {};
  }
  function districtBounds(districtId) {
    const d = ready().districts.get(districtId);
    return d ? d.bounds : null;
  }
  function inBounds(districtId, x, y) {
    const b = districtBounds(districtId);
    return !!b && isNum(x) && isNum(y) &&
      x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
  }

  // Authoritative snapped anchor when its district is active; otherwise the
  // overview marker (source position, remote metadata only).
  function resolveAnchor(districtId, anchorId) {
    const c = ready();
    if (activeId() === districtId) {
      const a = activeAnchors()[anchorId];
      if (a && isNum(a.x) && isNum(a.y)) return { x: a.x, y: a.y, snapped: true };
    }
    const m = c.markers.get(anchorId);
    if (m) return { x: m.x, y: m.y, snapped: false };
    return null;
  }

  function descriptor(meta) {
    const p = resolveAnchor(meta.districtId, meta.anchorId);
    if (!p) return null;
    const base = VENUE_BY_ID[meta.id];
    const out = base
      ? { id: base.id, name: base.name, district: base.district, kind: base.kind, icon: base.icon,
          description: base.description, quote: base.quote, cost: base.cost,
          districtId: meta.districtId, anchorId: meta.anchorId, x: p.x, y: p.y }
      : { id: meta.id, districtId: meta.districtId, anchorId: meta.anchorId, x: p.x, y: p.y };
    return Object.freeze(out);
  }

  const PLACES_GETTER = () => Object.freeze(VENUES.map(descriptor).reduce((m, p) => (m[p.id] = p, m), {}));
  const GARDEN_GETTER = () => descriptor(GARDEN_META);
  const CART_GETTER = () => descriptor(CART_META);

  // ---------------------------------------------------------------------------
  // Geometry predicates (active district navigator, actor radius 0.4 m)
  // ---------------------------------------------------------------------------
  function walkable(x, y) {
    if (!isNum(x) || !isNum(y)) return false;
    try {
      return activeNav().isWalkable({ x, y }, { mode: 'walk', radius: ACTOR_RADIUS });
    } catch (_) { return false; }
  }
  function rideable(x, y) {
    if (!isNum(x) || !isNum(y)) return false;
    try {
      return activeNav().isWalkable({ x, y }, { mode: 'bike', radius: ACTOR_RADIUS });
    } catch (_) { return false; }
  }
  function segmentWalkable(a, b, mode) {
    if (!finitePoint(a) || !finitePoint(b)) return false;
    try {
      return activeNav().segmentWalkable({ x: a.x, y: a.y }, { x: b.x, y: b.y },
        { mode: mode === 'bike' ? 'bike' : 'walk', radius: ACTOR_RADIUS });
    } catch (_) { return false; }
  }

  // Nearest venue OR special anchor physically present in the active district.
  function near(position, radius) {
    if (!finitePoint(position)) return null;
    const limit = radius === undefined ? ARRIVAL_RADIUS : radius;
    if (!isNum(limit) || limit < 0) return null;
    const candidates = [];
    for (const v of VENUES) candidates.push(v);
    candidates.push(GARDEN_META, CART_META);
    let result = null;
    let nearest = limit;
    for (const meta of candidates) {
      if (meta.districtId !== activeId()) continue;
      const p = resolveAnchor(meta.districtId, meta.anchorId);
      if (!p || !p.snapped) continue;
      const d = dist(position.x, position.y, p.x, p.y);
      if (d <= nearest) { result = descriptor(meta); nearest = d; }
    }
    return result;
  }

  function nearBike(position) {
    let state;
    try { state = normalize(position, { cancelTransit: false }).state; } catch (_) { return false; }
    if (state.transit) return false;
    const bike = state.bike;
    if (isCarrying(bike)) return false;
    if (!bike || bike.districtId !== state.districtId) return false;
    if (dist(state.x, state.y, bike.x, bike.y) > BIKE_RETRIEVAL) return false;
    return segmentWalkable(state, bike, 'walk');
  }

  // ---------------------------------------------------------------------------
  // Routing — one independent navigator.route call per intent, no cache.
  // ---------------------------------------------------------------------------
  function makeAbortError() {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return err;
  }
  function asAbortError(err) {
    if (err && err.name === 'AbortError') return err;
    const wrapped = makeAbortError();
    wrapped.cause = err;
    return wrapped;
  }

  async function navRoute(from, to, mode, signal, onProgress) {
    const result = await activeNav().route({ x: from.x, y: from.y }, { x: to.x, y: to.y }, {
      mode, radius: ACTOR_RADIUS, signal, onProgress
    });
    if (!result || typeof result.found !== 'boolean' || !Array.isArray(result.points)) {
      throw new Error('DistrictCity: navigator returned an invalid route result');
    }
    return result;
  }

  function toPath(points, from) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!finitePoint(p)) continue;
      // Navigator echoes the exact start as its first point; remaining path
      // begins after it. No snapping of any kind happens in this adapter.
      if (i === 0 && p.x === from.x && p.y === from.y) continue;
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  async function routeAsync(from, to, options) {
    ready();
    if (!finitePoint(from) || !finitePoint(to)) return [];
    const opts = options || {};
    const bike = opts.mode === 'bike';
    const mode = bike ? 'bike' : 'walk';
    const signal = opts.signal;
    if (signal && signal.aborted) throw asAbortError(signal.reason instanceof Error ? signal.reason : makeAbortError());
    try {
      let result = await navRoute(from, to, mode, signal, opts.onProgress);
      if (result.found) return toPath(result.points, from);
      if (!bike) return [];
      // A bicycle route may fall back to a valid walking route; the bicycle
      // stays with the player (push/mount is recomputed by movement locally).
      result = await navRoute(from, to, 'walk', signal, opts.onProgress);
      return result.found ? toPath(result.points, from) : [];
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      if (signal && signal.aborted) throw asAbortError(err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Legacy 1800x1120 recognition (migration only)
  // ---------------------------------------------------------------------------
  function recognizeLegacy(x, y) {
    if (!isNum(x) || !isNum(y)) return null;
    if (x < 0 || y < 0 || x > LEGACY_UNITS.width || y > LEGACY_UNITS.height) return null;
    let best = null;
    let bestDistance = LEGACY_RECOGNITION;
    for (const [id, p] of Object.entries(LEGACY_PLACES)) {
      const d = dist(x, y, p.x, p.y);
      if (d <= bestDistance) { best = id; bestDistance = d; }
    }
    return best;
  }

  function sanitizeVisits(value) {
    const out = [];
    if (!Array.isArray(value)) return out;
    const seen = new Set();
    for (const id of value) {
      if (typeof id !== 'string' || !VENUE_BY_ID[id] || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // State normalization / restore
  // ---------------------------------------------------------------------------
  function carriedBikeAt(districtId, x, y, preferMounted) {
    const mounted = preferMounted === false ? false : rideable(x, y);
    return mounted
      ? { districtId, x, y, mounted: true }
      : { districtId, x, y, mounted: false, pushing: true };
  }
  function parkedBike(districtId, x, y, anchorId) {
    const b = { districtId, x, y, mounted: false };
    if (anchorId !== undefined) b.anchorId = anchorId;
    return b;
  }
  function freshState(districtId, warnings) {
    const a = active();
    const x = a.data.entrance.x;
    const y = a.data.entrance.y;
    return {
      map: ready().mapVersion,
      districtId,
      x, y,
      visited: ['pub'],
      bike: { districtId, x, y, mounted: false }
    };
  }

  function linkBetween(fromId, toId) {
    const c = ready();
    return c.links.find(l =>
      (l.from === fromId && l.to === toId) || (l.from === toId && l.to === fromId)) || null;
  }

  // Strict-ish transit parse. Returns {transit} or {transit:null, malformed}.
  function parseTransit(raw) {
    if (raw === undefined || raw === null) return { transit: null };
    const t = raw;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return { transit: null, malformed: true };
    if (typeof t.from !== 'string' || typeof t.to !== 'string' ||
        !['street', 'ferry'].includes(t.mode) || !finitePoint(t.departure) ||
        typeof t.carried !== 'boolean' || !isNum(t.duration) || t.duration <= 0 ||
        !isNum(t.elapsed) || t.elapsed < 0) {
      return { transit: null, malformed: true };
    }
    const link = linkBetween(t.from, t.to);
    if (!link || link.mode !== t.mode) return { transit: null, malformed: true };
    if ((link.id === undefined ? t.id !== undefined : t.id !== link.id)) {
      return { transit: null, malformed: true };
    }
    return {
      transit: {
        from: t.from, to: t.to, mode: t.mode,
        ...(link.id !== undefined ? { id: link.id } : {}),
        elapsed: Math.min(t.duration, Math.max(0, t.elapsed)),
        duration: t.duration,
        departure: { x: t.departure.x, y: t.departure.y },
        carried: t.carried
      }
    };
  }

  // Active-district validation for a parked or carried bike record.
  function normalizeBike(raw, player, carriedWanted) {
    const c = ready();
    const entrance = active().data.entrance;
    const fail = () => ({ bike: { districtId: player.districtId, x: entrance.x, y: entrance.y, mounted: false },
      warning: 'reset-bike' });
    if (carriedWanted) {
      return { bike: carriedBikeAt(player.districtId, player.x, player.y, true) };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
    if (raw.mounted === true || raw.pushing === true) {
      // Claimed carried: must coincide with the player in the same district.
      if (raw.districtId !== player.districtId ||
          !isNum(raw.x) || !isNum(raw.y) ||
          Math.abs(raw.x - player.x) > EPS || Math.abs(raw.y - player.y) > EPS) {
        return fail();
      }
      return { bike: carriedBikeAt(player.districtId, player.x, player.y, raw.mounted === true) };
    }
    let districtId = typeof raw.districtId === 'string' && c.districts.has(raw.districtId)
      ? raw.districtId : player.districtId;
    if (!isNum(raw.x) || !isNum(raw.y)) return fail();
    const anchorId = typeof raw.anchorId === 'string' ? raw.anchorId : undefined;
    if (districtId === activeId()) {
      // Legacy/remote anchor claim resolves to the snapped anchor once active.
      if (anchorId) {
        const a = activeAnchors()[anchorId];
        if (a && isNum(a.x) && isNum(a.y)) {
          return { bike: parkedBike(districtId, a.x, a.y, anchorId) };
        }
      }
      if (!walkable(raw.x, raw.y)) return fail();
      return { bike: parkedBike(districtId, raw.x, raw.y) };
    }
    // Remote parked bike: keep district + finite in-bounds coordinates; it is
    // validated (or anchor-snapped) only once its district becomes active.
    if (!inBounds(districtId, raw.x, raw.y)) return fail();
    return { bike: parkedBike(districtId, raw.x, raw.y, anchorId) };
  }

  function migrateLegacy(value) {
    const warnings = ['migrated-legacy'];
    const activeIdValue = activeId();
    const entrance = active().data.entrance;

    const playerPlace = VENUE_BY_ID[recognizeLegacy(value.x, value.y) || 'pub'];
    const playerPoint = resolveAnchor(playerPlace.districtId, playerPlace.anchorId);

    // Bicycle migrates independently from the player.
    let bike;
    const rawBike = value.bike;
    const carriedClaim = !!rawBike && typeof rawBike === 'object' &&
      (rawBike.mounted === true || rawBike.pushing === true) &&
      isNum(rawBike.x) && isNum(rawBike.y) &&
      Math.abs(rawBike.x - value.x) <= EPS && Math.abs(rawBike.y - value.y) <= EPS &&
      recognizeLegacy(value.x, value.y) !== null;
    if (carriedClaim) {
      const mounted = playerPlace.districtId === activeIdValue ? rideable(playerPoint.x, playerPoint.y)
        : rawBike.mounted === true;
      bike = mounted
        ? { districtId: playerPlace.districtId, x: playerPoint.x, y: playerPoint.y, mounted: true }
        : { districtId: playerPlace.districtId, x: playerPoint.x, y: playerPoint.y, mounted: false, pushing: true };
    } else {
      let bikePlaceId = finitePoint(rawBike) ? recognizeLegacy(rawBike.x, rawBike.y) : null;
      if (!bikePlaceId) {
        bikePlaceId = 'pub';
        warnings.push('legacy-bike-default-pub');
      }
      const bikePlace = VENUE_BY_ID[bikePlaceId];
      const p = resolveAnchor(bikePlace.districtId, bikePlace.anchorId);
      bike = parkedBike(bikePlace.districtId, p.x, p.y, bikePlace.anchorId);
    }

    const state = {
      map: ready().mapVersion,
      districtId: playerPlace.districtId,
      x: playerPoint.x, y: playerPoint.y,
      visited: sanitizeVisits(value.visited),
      bike
    };
    if (playerPlace.districtId !== activeIdValue) {
      // Player's home district is not loaded: keep remote coords; active play
      // defaults to the active entrance until the caller loads that district.
      state.districtId = activeIdValue;
      state.x = entrance.x; state.y = entrance.y;
      warnings.push('reset-position');
      if (isCarrying(bike)) state.bike = carriedBikeAt(activeIdValue, entrance.x, entrance.y, bike.mounted);
    }
    // Internal normalized shape; restoreInfo re-exposes it as {position,...}.
    return { state, migrated: true, warnings };
  }

  function normalize(value, options) {
    const cancelTransit = !options || options.cancelTransit !== false;
    const c = ready();
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        value.map !== c.mapVersion) {
      if (value && typeof value === 'object' && !Array.isArray(value) && value.map !== c.mapVersion) {
        return migrateLegacy(value);
      }
      const warnings = ['reset-create'];
      return { state: freshState(activeId()), warnings, migrated: false };
    }

    const warnings = [];
    const visited = sanitizeVisits(value.visited);
    const parsed = parseTransit(value.transit);
    let transit = parsed.transit;
    if (parsed.malformed) warnings.push('reset-transit');
    if (transit && cancelTransit) {
      warnings.push('transit-cancelled');
      transit = null;
    }

    const entrance = active().data.entrance;
    let districtId;
    let x;
    let y;

    if (transit) {
      // While transferring the player waits at the safe departure point. The
      // destination may already be active (completeTransfer), so a remote
      // departure is validated by bounds only, never the active navigator.
      districtId = transit.from;
      x = transit.departure.x;
      y = transit.departure.y;
      const departureSafe = districtId === activeId()
        ? walkable(x, y)
        : inBounds(districtId, x, y);
      if (!departureSafe) {
        transit = null;
        warnings.push('reset-transit');
        districtId = activeId();
        x = entrance.x; y = entrance.y;
      }
    } else if (parsed.transit && cancelTransit) {
      // Refresh: restore the stored departure even when its district is remote.
      const t = parsed.transit;
      districtId = t.from;
      x = t.departure.x;
      y = t.departure.y;
      if (districtId === activeId() && !walkable(x, y)) {
        x = entrance.x; y = entrance.y;
        warnings.push('reset-position');
      } else if (districtId !== activeId() && !inBounds(districtId, x, y)) {
        districtId = activeId();
        x = entrance.x; y = entrance.y;
        warnings.push('reset-position');
      }
    } else {
      const known = typeof value.districtId === 'string' && c.districts.has(value.districtId);
      if (!known) {
        districtId = activeId();
        x = entrance.x; y = entrance.y;
        warnings.push('reset-position');
      } else if (value.districtId === activeId()) {
        districtId = value.districtId;
        if (isNum(value.x) && isNum(value.y) && walkable(value.x, value.y)) {
          x = value.x; y = value.y;
        } else {
          x = entrance.x; y = entrance.y;
          warnings.push('reset-position');
        }
      } else {
        districtId = value.districtId;
        if (isNum(value.x) && isNum(value.y) && inBounds(districtId, value.x, value.y)) {
          x = value.x; y = value.y;
        } else {
          districtId = activeId();
          x = entrance.x; y = entrance.y;
          warnings.push('reset-position');
        }
      }
    }

    const player = { districtId, x, y };
    // A carried bicycle at a REMOTE departure cannot probe the active
    // navigator; keep its record at the departure point until commit.
    const carriedHere = (id, px, py) => id === activeId()
      ? carriedBikeAt(id, px, py, true)
      : { districtId: id, x: px, y: py, mounted: true };
    let bikeResult;
    if (transit) {
      bikeResult = transit.carried
        ? { bike: carriedHere(districtId, x, y) }
        : normalizeBike(value.bike, player, false);
    } else if (parsed.transit && cancelTransit && parsed.transit.carried) {
      bikeResult = { bike: carriedHere(districtId, x, y) };
    } else {
      bikeResult = normalizeBike(value.bike, player, false);
    }
    if (bikeResult.warning && !warnings.includes(bikeResult.warning)) warnings.push(bikeResult.warning);

    const state = {
      map: c.mapVersion,
      districtId, x, y,
      visited,
      bike: bikeResult.bike
    };
    if (transit) state.transit = transit;
    return { state, warnings, migrated: false };
  }

  function restoreInfo(value) {
    const input = cloneJson(value);
    const result = normalize(input, { cancelTransit: true });
    return {
      position: result.state,
      migrated: result.migrated === true,
      warnings: result.warnings.slice()
    };
  }
  function restore(value) { return restoreInfo(value).position; }
  function asState(value) { return normalize(cloneJson(value), { cancelTransit: false }).state; }

  function create(placeId) {
    const a = active();
    const id = placeId === undefined ? 'pub' : placeId;
    const meta = VENUE_BY_ID[id];
    if (!meta) throw new Error('DistrictCity.create: unknown place id ' + String(id));
    if (a.data.id !== meta.districtId) {
      throw new Error('DistrictCity.create: district ' + meta.districtId + ' must be active for ' + id);
    }
    const anchor = a.data.anchors && a.data.anchors[meta.anchorId];
    if (!anchor || !isNum(anchor.x) || !isNum(anchor.y)) {
      throw new Error('DistrictCity.create: snapped anchor ' + meta.anchorId + ' is missing');
    }
    return {
      map: ready().mapVersion,
      districtId: meta.districtId,
      x: anchor.x, y: anchor.y,
      visited: ['pub'],
      bike: { districtId: meta.districtId, x: anchor.x, y: anchor.y, mounted: false }
    };
  }

  // ---------------------------------------------------------------------------
  // Movement (swept-capsule chunks, diagonal sliding, ride/push auto-resume)
  // ---------------------------------------------------------------------------
  function relocate(state, x, y) {
    const next = Object.assign({}, state, { x, y });
    if (isCarrying(state.bike)) next.bike = carriedBikeAt(state.districtId, x, y, state.bike.mounted);
    return next;
  }

  function travel(state, dx, dy, elapsed, limit) {
    const budget = limit === undefined ? Infinity : limit;
    const magnitude = Math.hypot(dx, dy);
    let current = state;
    let remaining = elapsed;
    let covered = 0;
    if (!magnitude || !Number.isFinite(magnitude)) return { position: current, used: 0 };
    const ux = dx / magnitude, uy = dy / magnitude;

    while (remaining > 1e-10 && covered < budget - 1e-10) {
      // A carried bicycle is either mounted OR being pushed; in both states
      // every chunk probes the bike capsule again so riding auto-resumes the
      // moment bike-safe ground resumes.
      const carrying = isCarrying(current.bike);
      const reach = budget - covered;
      let speed = WALK_SPEED;
      let chunk = Math.min(SUBSTEP, WALK_SPEED * remaining, reach);
      if (carrying) {
        const probe = { x: current.x + ux * chunk, y: current.y + uy * chunk };
        if (segmentWalkable(current, probe, 'bike')) {
          speed = BIKE_SPEED;
          const longer = Math.min(SUBSTEP, BIKE_SPEED * remaining, reach);
          if (longer > chunk) {
            const longerProbe = { x: current.x + ux * longer, y: current.y + uy * longer };
            if (segmentWalkable(current, longerProbe, 'bike')) chunk = longer;
          }
        }
      }
      if (chunk <= 1e-10) break;
      const stepX = ux * chunk, stepY = uy * chunk;
      const target = { x: current.x + stepX, y: current.y + stepY };
      let point = { x: current.x, y: current.y };
      if (segmentWalkable(current, target, 'walk')) {
        point = target;
      } else {
        // Axis slides can never cross a blocked corner diagonally.
        const horizontal = { x: current.x + stepX, y: current.y };
        if (segmentWalkable(current, horizontal, 'walk')) point = horizontal;
        const vertical = { x: point.x, y: current.y + stepY };
        if (segmentWalkable(point, vertical, 'walk')) point = vertical;
      }
      if (point.x === current.x && point.y === current.y) {
        remaining = 0;
        break;
      }
      // An axis slide can shorten a capsule that was probed at full length;
      // never bill bike time for a chunk the bicycle could not actually clear.
      if (carrying && speed === BIKE_SPEED && !segmentWalkable(current, point, 'bike')) {
        speed = WALK_SPEED;
      }
      const previous = current;
      current = relocate(current, point.x, point.y);
      if (carrying) {
        // Reconcile mounted/pushing against the capsule actually traversed.
        const bikeSafe = segmentWalkable(previous, point, 'bike');
        current = Object.assign({}, current, {
          bike: bikeSafe
            ? carriedBikeAt(current.districtId, point.x, point.y, true)
            : { districtId: current.districtId, x: point.x, y: point.y, mounted: false, pushing: true }
        });
      }
      remaining = Math.max(0, remaining - chunk / speed);
      covered += chunk;
    }
    return { position: current, used: elapsed - remaining };
  }

  function move(position, dx, dy, seconds) {
    let current = asState(position);
    if (!isNum(dx) || !isNum(dy)) return current;
    const dt = clampSeconds(seconds);
    if (current.transit) return advanceTransfer(current, dt).position;
    if (current.districtId !== activeId()) {
      throw new Error('DistrictCity.move: district ' + current.districtId + ' is not active');
    }
    return travel(current, dx, dy, dt).position;
  }

  function moveAlong(position, path, seconds) {
    let current = asState(position);
    const input = Array.isArray(path) && path.every(finitePoint)
      ? path.map(p => ({ x: p.x, y: p.y })) : [];
    let remaining = clampSeconds(seconds);
    if (current.transit) {
      const r = advanceTransfer(current, remaining);
      return { position: r.position, path: input, arrived: false };
    }
    if (current.districtId !== activeId()) {
      throw new Error('DistrictCity.moveAlong: district ' + current.districtId + ' is not active');
    }
    while (remaining > 1e-10) {
      if (!input.length) break;
      const next = input[0];
      const d = dist(next.x, next.y, current.x, current.y);
      if (d < EPS) {
        current = relocate(current, next.x, next.y);
        input.shift();
        continue;
      }
      const result = travel(current, next.x - current.x, next.y - current.y, remaining, d);
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
  // Bicycle park / retrieve (same district only)
  // ---------------------------------------------------------------------------
  function toggleBike(position) {
    const current = asState(position);
    if (current.transit) return current;
    if (isCarrying(current.bike)) return parkBike(current);
    const bike = current.bike;
    if (!bike || bike.districtId !== current.districtId) return current;
    if (dist(current.x, current.y, bike.x, bike.y) > BIKE_RETRIEVAL) return current;
    if (!segmentWalkable(current, bike, 'walk')) return current;
    return Object.assign({}, current, {
      bike: carriedBikeAt(current.districtId, current.x, current.y, true)
    });
  }

  function parkBike(position) {
    const current = asState(position);
    if (current.transit) return current;
    if (isCarrying(current.bike)) {
      return Object.assign({}, current, {
        bike: { districtId: current.districtId, x: current.x, y: current.y, mounted: false }
      });
    }
    return current;
  }

  // ---------------------------------------------------------------------------
  // Explicit same-map relocation for existing home/return game transitions.
  // The caller has ALREADY loaded the destination district; the input may still
  // describe the former district, so it must never be restored against the new
  // active nav (that would erase the remote parked-bike record).
  // ---------------------------------------------------------------------------
  function relocateToPlace(position, placeId) {
    const c = ready();
    const a = active();
    if (!position || typeof position !== 'object' || Array.isArray(position)) {
      throw new Error('DistrictCity.relocateToPlace: a position state is required');
    }
    if (position.transit) throw new Error('DistrictCity.relocateToPlace: finish or cancel the transfer first');
    const meta = VENUE_BY_ID[placeId];
    if (!meta) throw new Error('DistrictCity.relocateToPlace: unknown place id ' + String(placeId));
    if (a.data.id !== meta.districtId) {
      throw new Error('DistrictCity.relocateToPlace: destination district ' + meta.districtId + ' is not active');
    }
    const anchor = a.data.anchors && a.data.anchors[meta.anchorId];
    if (!anchor || !isNum(anchor.x) || !isNum(anchor.y)) {
      throw new Error('DistrictCity.relocateToPlace: snapped anchor ' + meta.anchorId + ' is missing');
    }
    if (typeof position.districtId !== 'string' || !c.districts.has(position.districtId)) {
      throw new Error('DistrictCity.relocateToPlace: position has no known districtId');
    }

    let bike;
    const carrying = !!position.bike && (position.bike.mounted === true || position.bike.pushing === true) &&
      position.bike.districtId === position.districtId &&
      isNum(position.bike.x) && isNum(position.bike.y) &&
      Math.abs(position.bike.x - position.x) <= EPS &&
      Math.abs(position.bike.y - position.y) <= EPS;
    if (carrying) {
      // Park the carried bike at the departure point before moving the player.
      bike = { districtId: position.districtId, x: position.x, y: position.y, mounted: false };
      if (typeof position.bike.anchorId === 'string') bike.anchorId = position.bike.anchorId;
    } else if (position.bike && typeof position.bike === 'object') {
      // Preserve the separately parked bike exactly (possibly in a third district).
      bike = cloneJson(position.bike);
    } else {
      bike = { districtId: position.districtId, x: position.x, y: position.y, mounted: false };
    }

    return {
      map: c.mapVersion,
      districtId: meta.districtId,
      x: anchor.x, y: anchor.y,
      visited: sanitizeVisits(position.visited),
      bike
    };
  }

  // ---------------------------------------------------------------------------
  // Explicit cross-district travel (manifest links only; undirected)
  // ---------------------------------------------------------------------------
  function planTravel(fromDistrict, toDistrict) {
    const c = ready();
    if (fromDistrict === toDistrict) return [];
    if (!c.districts.has(fromDistrict) || !c.districts.has(toDistrict)) return [];
    const previous = new Map();
    const seen = new Set([fromDistrict]);
    const queue = [fromDistrict];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toDistrict) break;
      for (const edge of (c.adjacency.get(cur) || [])) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        previous.set(edge.to, { from: cur, edge });
        queue.push(edge.to);
      }
    }
    if (!seen.has(toDistrict)) return [];
    const legs = [];
    let cur = toDistrict;
    while (cur !== fromDistrict) {
      const step = previous.get(cur);
      legs.unshift({
        from: step.from, to: cur, mode: step.edge.mode,
        ...(step.edge.id !== undefined ? { id: step.edge.id } : {})
      });
      cur = step.from;
    }
    return legs;
  }

  function districtCentre(districtId) {
    const b = ready().districts.get(districtId).bounds;
    return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
  }

  function transferDuration(transit) {
    const c = ready();
    if (transit.mode === 'ferry') {
      const south = c.markers.get('ferrySouth');
      const north = c.markers.get('ferryNorth');
      if (!south || !north) throw new Error('DistrictCity: F3 bank markers are missing from the overview');
      return dist(south.x, south.y, north.x, north.y) / FERRY_SPEED;
    }
    const a = districtCentre(transit.from);
    const b = districtCentre(transit.to);
    const seconds = dist(a.x, a.y, b.x, b.y) / (transit.carried ? 96 : 48);
    return Math.max(3, Math.min(12, seconds));
  }

  function beginTransfer(position, toDistrict) {
    const c = ready();
    // A normal travel intent is validated against the CALLER's raw departure
    // before any normalization: unlike restore(), it must never be silently
    // repaired onto the entrance/bank, and the input object stays immutable.
    if (!position || typeof position !== 'object' || Array.isArray(position)) {
      throw new Error('DistrictCity.beginTransfer: a position state is required');
    }
    if (position.map !== c.mapVersion) {
      throw new Error('DistrictCity.beginTransfer: departure save belongs to another map');
    }
    const fromId = position.districtId;
    if (typeof fromId !== 'string' || !c.districts.has(fromId)) {
      throw new Error('DistrictCity.beginTransfer: departure has no known district');
    }
    if (fromId !== activeId()) {
      throw new Error('DistrictCity.beginTransfer: departure district must be active');
    }
    if (!isNum(position.x) || !isNum(position.y)) {
      throw new Error('DistrictCity.beginTransfer: departure coordinates are missing or invalid');
    }
    if (typeof toDistrict !== 'string' || !c.districts.has(toDistrict)) {
      throw new Error('DistrictCity.beginTransfer: unknown destination district');
    }
    const link = linkBetween(fromId, toDistrict);
    if (!link) throw new Error('DistrictCity.beginTransfer: ' + fromId + ' has no direct link to ' + toDistrict);

    if (link.mode === 'ferry') {
      const bankId = BANK_ANCHOR[fromId];
      const bank = bankId ? activeAnchors()[bankId] : null;
      if (!bank || !isNum(bank.x) || !isNum(bank.y)) {
        throw new Error('DistrictCity.beginTransfer: F3 departure bank anchor is not loaded');
      }
      if (dist(position.x, position.y, bank.x, bank.y) > F3_EPS) {
        throw new Error('DistrictCity.beginTransfer: walk onto the snapped F3 bank before boarding');
      }
    } else if (!walkable(position.x, position.y)) {
      throw new Error('DistrictCity.beginTransfer: street departure point is not walkable');
    }

    // Raw departure passed; normalize only a private clone for the bike/transit
    // record. A valid departure must normalize onto its own exact point.
    const current = asState(position);
    if (current.transit) throw new Error('DistrictCity.beginTransfer: a transfer is already in progress');
    if (current.districtId !== fromId || current.x !== position.x || current.y !== position.y) {
      throw new Error('DistrictCity.beginTransfer: street departure point is not walkable');
    }

    const carried = isCarrying(current.bike);
    const transit = {
      from: fromId, to: toDistrict, mode: link.mode,
      ...(link.id !== undefined ? { id: link.id } : {}),
      elapsed: 0,
      duration: 0, // filled below once the record is complete
      departure: { x: position.x, y: position.y },
      carried
    };
    transit.duration = transferDuration(transit);
    return Object.assign({}, current, { transit });
  }

  function advanceTransfer(position, seconds) {
    const current = asState(position);
    if (!current.transit) throw new Error('DistrictCity.advanceTransfer: no transfer in progress');
    const dt = clampSeconds(seconds);
    const transit = Object.assign({}, current.transit, {
      elapsed: Math.min(current.transit.duration, current.transit.elapsed + dt)
    });
    return {
      position: Object.assign({}, current, { transit }),
      ready: transit.elapsed >= transit.duration
    };
  }

  function destinationPoint(transit) {
    const a = active();
    if (a.data.id !== transit.to) return null;
    if (transit.mode === 'ferry') {
      const bankId = BANK_ANCHOR[transit.to];
      const bank = bankId ? a.data.anchors[bankId] : null;
      if (!bank || !isNum(bank.x) || !isNum(bank.y)) return null;
      return { x: bank.x, y: bank.y };
    }
    const entrance = a.data.entrance;
    if (!entrance || !isNum(entrance.x) || !isNum(entrance.y)) return null;
    return { x: entrance.x, y: entrance.y };
  }

  function completeTransfer(position) {
    const current = asState(position);
    const transit = current.transit;
    if (!transit) throw new Error('DistrictCity.completeTransfer: no transfer in progress');
    if (transit.elapsed < transit.duration) {
      throw new Error('DistrictCity.completeTransfer: transfer has not finished');
    }
    if (activeId() !== transit.to) {
      throw new Error('DistrictCity.completeTransfer: destination district ' + transit.to + ' is not loaded');
    }
    const point = destinationPoint(transit);
    if (!point || !walkable(point.x, point.y)) {
      throw new Error('DistrictCity.completeTransfer: destination entrance/bank is not safe');
    }
    const next = Object.assign({}, current, {
      districtId: transit.to,
      x: point.x,
      y: point.y
    });
    if (transit.carried) {
      next.bike = carriedBikeAt(transit.to, point.x, point.y, true);
    }
    // A parked (possibly remote) bicycle record is deliberately untouched.
    delete next.transit;
    return next;
  }

  function cancelTransfer(position) {
    const current = asState(position);
    const transit = current.transit;
    if (!transit) throw new Error('DistrictCity.cancelTransfer: no transfer in progress');
    if (activeId() !== transit.from) {
      throw new Error('DistrictCity.cancelTransfer: load departure district ' + transit.from + ' first');
    }
    const next = Object.assign({}, current, {
      districtId: transit.from,
      x: transit.departure.x,
      y: transit.departure.y
    });
    if (transit.carried) {
      next.bike = carriedBikeAt(transit.from, transit.departure.x, transit.departure.y,
        current.bike && current.bike.mounted === true);
    }
    delete next.transit;
    return next;
  }

  // ---------------------------------------------------------------------------
  // requiredDistrict — which district the caller must load before restore.
  // Works from the manifest alone (before any district is active).
  // ---------------------------------------------------------------------------
  function requiredDistrict(savedCity) {
    const c = ready();
    const fallback = 'jordaan';
    if (!savedCity || typeof savedCity !== 'object' || Array.isArray(savedCity)) {
      return c.districts.has(fallback) ? fallback : c.districts.keys().next().value;
    }
    if (savedCity.transit && typeof savedCity.transit === 'object' &&
        typeof savedCity.transit.from === 'string' && c.districts.has(savedCity.transit.from)) {
      return savedCity.transit.from;
    }
    if (savedCity.map === c.mapVersion) {
      if (typeof savedCity.districtId === 'string' && c.districts.has(savedCity.districtId)) {
        return savedCity.districtId;
      }
    }
    const legacyId = recognizeLegacy(savedCity.x, savedCity.y);
    if (legacyId) return VENUE_BY_ID[legacyId].districtId;
    return c.districts.has(fallback) ? fallback : c.districts.keys().next().value;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const api = {
    // Lifecycle.
    configure, dispose, isReady, requiredDistrict,
    // Constants.
    ACTOR_RADIUS, WALK_SPEED, BIKE_SPEED, FERRY_SPEED, ARRIVAL_RADIUS, BIKE_RETRIEVAL,
    // State.
    create, restore, restoreInfo,
    // Geometry / routing / movement.
    walkable, rideable, segmentWalkable, near, nearBike,
    routeAsync, move, moveAlong,
    toggleBike, parkBike, relocateToPlace,
    // Travel.
    planTravel, beginTransfer, advanceTransfer, completeTransfer, cancelTransfer
  };

  Object.defineProperties(api, {
    PLACES: { get: PLACES_GETTER, enumerable: true },
    GARDEN: { get: GARDEN_GETTER, enumerable: true },
    FLOWER_CART: { get: CART_GETTER, enumerable: true },
    activeDistrictId: { get: activeId, enumerable: true },
    data: { get() { return active().data; }, enumerable: true }
  });

  return Object.freeze(api);
});

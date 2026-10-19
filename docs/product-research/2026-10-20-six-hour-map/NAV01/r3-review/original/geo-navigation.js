/*
 * D26 NAV01 geo-navigation
 * Implements the frozen geometry/navigation interface in geo-interface.md v1.
 * Pure standard JavaScript, UMD: globalThis.AmsterdamGeoNavigation / module.exports.
 * No DOM, no dependencies, no network.
 *
 * Navigation model:
 *  - walkable iff point is on an allowed road polygon or an actual bridge
 *    deck (properties.type_overbruggingsdeel === "dek");
 *  - buildings always reject; water rejects unless covered by a deck;
 *    piers/pillars/landhoofden never override water;
 *  - segment safety combines <=0.5 m sampling with exact polygon-boundary
 *    crossing splits, so a sub-sample thin barrier can never be jumped;
 *  - routing is a bounded deterministic A* over a sparse 2 m lattice with
 *    8-neighbour moves, diagonal corner-cut prevention and an explicit node
 *    budget; the real caller endpoints are always preserved.
 */
(function (global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = factory();
  } else {
    global.AmsterdamGeoNavigation = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const METRE_EPS = 1e-7;
  const SAMPLE_SPACING = 0.5;

  // Road functie values that are never navigable for either mode.
  const ROAD_BLOCKED_ALWAYS = new Set([
    "autosnelweg",
    "autoweg",
    "spoorbaan",
    "OV-baan",
    "baan voor vliegverkeer"
  ]);

  // Disclosed parent-contract gap: the frozen interface named the bare
  // classes ("autosnelweg", "autoweg"), but the actual BGT source publishes
  // the prefixed carriageway spellings "rijbaan autosnelweg" (138 features)
  // and "rijbaan autoweg" (84 features). The "rijbaan " prefix only names the
  // carriageway part and never changes the underlying excluded class, so both
  // forms are rejected. Ordinary carriageway roads ("rijbaan lokale weg",
  // "rijbaan regionale weg") reduce to non-listed names and stay walkable.
  const RIJBAAN_PREFIX = "rijbaan ";

  function roadBlockedAlways(functie) {
    if (ROAD_BLOCKED_ALWAYS.has(functie)) return true;
    if (typeof functie === "string" &&
        functie.length > RIJBAAN_PREFIX.length &&
        functie.slice(0, RIJBAAN_PREFIX.length) === RIJBAAN_PREFIX) {
      return ROAD_BLOCKED_ALWAYS.has(functie.slice(RIJBAAN_PREFIX.length));
    }
    return false;
  }

  // Road functie values additionally rejected for bikes.
  // BGT authoritative spelling is "voetgangersgebied"; the earlier spec
  // spelling "voetgangergebied" is also treated as excluded (pre-submission
  // amendment documented in source-classification.md).
  const ROAD_BLOCKED_BIKE = new Set([
    "voetpad",
    "voetpad op trap",
    "voetgangergebied",
    "voetgangersgebied",
    "ruiterpad"
  ]);

  function isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  function isPoint(v) {
    return !!v && typeof v === "object" && isNum(v.x) && isNum(v.y);
  }

  function assertPoint(p) {
    if (!isPoint(p)) {
      throw new TypeError("expected a finite point {x,y}");
    }
  }

  function round3(v) {
    const r = Math.round(v * 1000) / 1000;
    return r === 0 ? 0 : r;
  }

  // ---------------------------------------------------------------------------
  // Projection (local equirectangular, metres; see frozen interface)
  // ---------------------------------------------------------------------------

  function project(lon, lat, projection) {
    if (!isNum(lon) || !isNum(lat)) {
      throw new TypeError("project: lon/lat must be finite numbers");
    }
    if (!projection || projection.type !== "local-equirectangular") {
      throw new TypeError("project: missing local-equirectangular projection");
    }
    const R = projection.radiusMeters;
    const refLat = projection.referenceLat;
    if (!isNum(R) || R <= 0 || !isNum(refLat) ||
        !isNum(projection.originLon) || !isNum(projection.originLat)) {
      throw new TypeError("project: invalid projection parameters");
    }
    const x = R * Math.cos(refLat * DEG2RAD) * (lon - projection.originLon) * DEG2RAD;
    const y = R * (projection.originLat - lat) * DEG2RAD;
    return { x: round3(x), y: round3(y) };
  }

  function unproject(x, y, projection) {
    if (!isNum(x) || !isNum(y)) {
      throw new TypeError("unproject: x/y must be finite numbers");
    }
    if (!projection || projection.type !== "local-equirectangular") {
      throw new TypeError("unproject: missing local-equirectangular projection");
    }
    const R = projection.radiusMeters;
    const cosRef = Math.cos(projection.referenceLat * DEG2RAD);
    const lon = projection.originLon + (x / (R * cosRef)) * RAD2DEG;
    const lat = projection.originLat - (y / R) * RAD2DEG;
    return { lon, lat };
  }

  // ---------------------------------------------------------------------------
  // Polygon primitives
  // A polygon is [outerRing, holeRing, ...]; each ring is a closed array of
  // [x,y] (first point repeated), at least three distinct finite points.
  // ---------------------------------------------------------------------------

  function validateRing(ring, where) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new TypeError(where + ": ring must be a closed array of at least 4 points");
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!Array.isArray(first) || first.length < 2 ||
        first[0] !== last[0] || first[1] !== last[1]) {
      throw new TypeError(where + ": ring must close with the exact first point repeated");
    }
    // Count UNIQUE vertices (exact coordinate identity), not consecutive
    // changes: an alternation between two points plus closure used to pass
    // despite having only two distinct points.
    const distinct = new Set();
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (!Array.isArray(c) || c.length < 2 || !isNum(c[0]) || !isNum(c[1])) {
        throw new TypeError(where + ": ring contains a non-finite coordinate");
      }
      distinct.add(c[0] + "," + c[1]);
      if (distinct.size >= 3) break;
    }
    if (distinct.size < 3) {
      throw new TypeError(where + ": ring must contain at least 3 distinct points");
    }
  }

  function validatePolygon(polygon, where) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new TypeError(where + ": polygon must have an outer ring");
    }
    for (let i = 0; i < polygon.length; i++) {
      validateRing(polygon[i], where + " ring[" + i + "]");
    }
  }

  // Boundary inclusion is decided with a LOCAL, metric tolerance: a point is
  // on an edge iff its point-to-segment distance (metres) is below METRE_EPS.
  // The test uses edge-relative quantities only:
  //   cross = w x e  has units m^2, |e| has units m, cross/|e| has units m,
  // so the verdict is invariant under translation and rotation of the whole
  // geometry. Absolute vertex/query magnitudes must never enter the scale:
  // an earlier 1e-9*(1+max(|p|,...))^2 band grew to several millimetres at
  // map coordinates around 3000-6000, which (a) accepted a point 0.0707 m
  // outside a translated triangle as "on the boundary" and (b) erased a
  // sub-millimetre capsule clearance deficit (0.39969 m at r = 0.4 m).
  // Implemented in squared form: cross^2 [m^4] <= eps^2 [m^2] * len2 [m^2].
  const EDGE_EPS2 = METRE_EPS * METRE_EPS;

  function pointOnRing(px, py, ring) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = ring[i][0];
      const ay = ring[i][1];
      const bx = ring[i + 1][0];
      const by = ring[i + 1][1];
      const ex = bx - ax;
      const ey = by - ay;
      const wx = px - ax;
      const wy = py - ay;
      const cross = wx * ey - wy * ex;
      if (cross * cross <= EDGE_EPS2 * (ex * ex + ey * ey)) {
        if (px >= Math.min(ax, bx) - METRE_EPS && px <= Math.max(ax, bx) + METRE_EPS &&
            py >= Math.min(ay, by) - METRE_EPS && py <= Math.max(ay, by) + METRE_EPS) {
          return true;
        }
      }
    }
    return false;
  }

  function pointInRingParity(px, py, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(point, polygon) {
    assertPoint(point);
    validatePolygon(polygon, "pointInPolygon");
    return containsFast(point.x, point.y, polygon, polygonRingBounds(polygon));
  }

  // Containment on geometry already validated once at index time. ringBounds
  // are precomputed bounds per ring used to reject dense irrelevant rings in
  // O(1) instead of scanning every edge on each hot-path query; semantics are
  // identical to pointInPolygon (outer boundary inside, hole boundary out).
  function containsFast(px, py, polygon, rbs) {
    const ob = rbs[0];
    if (px < ob[0] || py < ob[1] || px > ob[2] || py > ob[3]) return false;
    // Hole boundary is excluded, even where it (invalidly) coincides with
    // the outer boundary; outer boundary is inside.
    for (let h = 1; h < polygon.length; h++) {
      const hb = rbs[h];
      if (px < hb[0] || py < hb[1] || px > hb[2] || py > hb[3]) continue;
      if (pointOnRing(px, py, polygon[h])) return false;
    }
    const outer = polygon[0];
    if (pointOnRing(px, py, outer)) return true;
    if (!pointInRingParity(px, py, outer)) return false;
    for (let h = 1; h < polygon.length; h++) {
      const hb = rbs[h];
      if (px < hb[0] || py < hb[1] || px > hb[2] || py > hb[3]) continue;
      if (pointInRingParity(px, py, polygon[h])) return false;
    }
    return true;
  }

  function ringBoundsOf(ring) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (c[0] < minX) minX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] > maxY) maxY = c[1];
    }
    return [minX, minY, maxX, maxY];
  }

  function polygonRingBounds(polygon) {
    const out = new Array(polygon.length);
    for (let i = 0; i < polygon.length; i++) out[i] = ringBoundsOf(polygon[i]);
    return out;
  }

  function polygonBounds(polygon) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of polygon) {
      for (const c of ring) {
        if (c[0] < minX) minX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] > maxY) maxY = c[1];
      }
    }
    return [minX, minY, maxX, maxY];
  }

  // Segment A->B against edge C->D. Pushes every t in (0,1) where the
  // centre segment meets the edge (proper crossing, vertex touch, collinear
  // overlap interval endpoints and midpoint). These parameters split the
  // segment so midpoint classification detects barriers of any width.
  function edgeCrossingParams(ax, ay, bx, by, cx, cy, dx, dy, out) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const den = rx * sy - ry * sx;
    const wx = cx - ax;
    const wy = cy - ay;
    const scale = 1 + Math.max(Math.abs(rx), Math.abs(ry), Math.abs(sx), Math.abs(sy));
    const tol = 1e-9 * scale * scale;
    if (Math.abs(den) > tol) {
      const t = (wx * sy - wy * sx) / den;
      const u = (wx * ry - wy * rx) / den;
      if (t > 0 && t < 1 && u >= -1e-10 && u <= 1 + 1e-10) {
        out.push(t);
      }
    } else if (Math.abs(wx * ry - wy * rx) <= tol) {
      // Collinear lines: project edge endpoints onto the centre segment.
      const len2 = rx * rx + ry * ry;
      if (len2 > 0) {
        let t0 = ((cx - ax) * rx + (cy - ay) * ry) / len2;
        let t1 = ((dx - ax) * rx + (dy - ay) * ry) / len2;
        if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
        const lo = Math.max(0, t0);
        const hi = Math.min(1, t1);
        if (hi > lo + 1e-10) {
          out.push(lo, (lo + hi) / 2, hi);
        }
      }
    }
  }

  // Minimum distance between two finite 2D segments and the closest point q
  // on the first segment. Closest pair is an intersection (distance 0) or an
  // endpoint-to-segment projection, so four point/segment distances suffice.
  function pointSegDistance(px, py, ax, ay, bx, by) {
    const ex = bx - ax;
    const ey = by - ay;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + ex * t;
    const qy = ay + ey * t;
    const dx = px - qx;
    const dy = py - qy;
    return { d: Math.sqrt(dx * dx + dy * dy), qx, qy };
  }

  function segSegDistance(a, b, c, d) {
    let best = pointSegDistance(a.x, a.y, c.x, c.y, d.x, d.y);
    let t = 0;
    let r = pointSegDistance(b.x, b.y, c.x, c.y, d.x, d.y);
    if (r.d < best.d) { best = r; t = 1; }
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    r = pointSegDistance(c.x, c.y, a.x, a.y, b.x, b.y);
    if (r.d < best.d) {
      best = r;
      t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    }
    r = pointSegDistance(d.x, d.y, a.x, a.y, b.x, b.y);
    if (r.d < best.d) {
      best = r;
      t = Math.max(0, Math.min(1, ((d.x - a.x) * abx + (d.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    }
    return { d: best.d, qx: a.x + abx * t, qy: a.y + aby * t };
  }

  // ---------------------------------------------------------------------------
  // Sparse spatial bucket index
  // bucketSize (default 64) is the bucket cell edge in metres; a polygon whose
  // bounds cover more than bucketSize cells is kept in a global short list
  // instead of being fanned out across a huge number of cells.
  // ---------------------------------------------------------------------------

  const KIND_WATER = 0;
  const KIND_BUILDING = 1;
  const KIND_ROAD = 2;
  const KIND_DECK = 3;

  function SpatialIndex(bucketSize) {
    this.cell = bucketSize;
    this.buckets = new Map();
    this.global = [];
  }

  SpatialIndex.prototype._add = function (ix, iy, rec) {
    const k = ix + ":" + iy;
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    arr.push(rec);
  };

  SpatialIndex.prototype.insert = function (rec) {
    const b = rec.bounds;
    const x0 = Math.floor(b[0] / this.cell);
    const x1 = Math.floor(b[2] / this.cell);
    const y0 = Math.floor(b[1] / this.cell);
    const y1 = Math.floor(b[3] / this.cell);
    const nx = x1 - x0 + 1;
    const ny = y1 - y0 + 1;
    // Fan-out guard: a polygon covering more than bucketSize bucket cells is
    // checked globally rather than duplicated into a huge number of cells.
    if (nx * ny > this.cell) {
      this.global.push(rec);
      return;
    }
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        this._add(ix, iy, rec);
      }
    }
  };

  SpatialIndex.prototype.queryBounds = function (minX, minY, maxX, maxY, out) {
    const ix0 = Math.floor(minX / this.cell);
    const ix1 = Math.floor(maxX / this.cell);
    const iy0 = Math.floor(minY / this.cell);
    const iy1 = Math.floor(maxY / this.cell);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const arr = this.buckets.get(ix + ":" + iy);
        if (arr) {
          for (let i = 0; i < arr.length; i++) out.add(arr[i]);
        }
      }
    }
    for (let i = 0; i < this.global.length; i++) out.add(this.global[i]);
    return out;
  };

  // ---------------------------------------------------------------------------
  // Navigator
  // ---------------------------------------------------------------------------

  function createNavigator(data, options) {
    return new Navigator(data, options || {});
  }

  function Navigator(data, options) {
    if (!data || !data.layers || typeof data.layers !== "object") {
      throw new TypeError("createNavigator: data.layers is required");
    }
    this.cellSize = isNum(options.cellSize) && options.cellSize > 0 ? options.cellSize : 2;
    this.maxNodes = isNum(options.maxNodes) && options.maxNodes > 0 ? Math.floor(options.maxNodes) : 250000;
    this.bucketSize = isNum(options.bucketSize) && options.bucketSize > 0 ? options.bucketSize : 64;
    this.radius = isNum(options.radius) && options.radius >= 0 ? options.radius : 0;

    this.index = new SpatialIndex(this.bucketSize);
    this.counts = { water: 0, buildings: 0, roads: 0, bridges: 0, deck: 0, polygons: 0 };
    this.nonDeckBridgeParts = 0;

    const layers = data.layers;
    this._addLayer(layers.water, KIND_WATER);
    this._addLayer(layers.buildings, KIND_BUILDING);
    this._addRoads(layers.roads);
    this._addBridges(layers.bridges);

    this.passCache = new Map();
    this.segCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.segmentChecks = 0;
    this.segmentCacheHits = 0;
    this.searches = 0;
    this.snaps = 0;
    this.lastVisited = 0;
    this.totalExpanded = 0;
    this.lastReason = null;
  }

  Navigator.prototype._featureWhere = function (feature) {
    return "feature " + (feature && (feature.id || feature.sourceId) || "<unknown>");
  };

  // Validate immutable indexed geometry exactly once, and precompute both
  // polygon and per-ring bounds so hot-path point queries never rescan dense
  // irrelevant rings.
  Navigator.prototype._makeRec = function (kind, polygon, walk, bike) {
    return {
      kind,
      polygon,
      bounds: polygonBounds(polygon),
      rb: polygonRingBounds(polygon),
      walk,
      bike
    };
  };

  Navigator.prototype._addLayer = function (features, kind) {
    if (!features) return;
    if (!Array.isArray(features)) {
      throw new TypeError("layer must be an array of features");
    }
    for (const feature of features) {
      const where = this._featureWhere(feature);
      if (!feature || !Array.isArray(feature.polygons)) {
        throw new TypeError(where + ": missing polygons");
      }
      for (let pi = 0; pi < feature.polygons.length; pi++) {
        const polygon = feature.polygons[pi];
        validatePolygon(polygon, where + " polygon[" + pi + "]");
        this.index.insert(this._makeRec(kind, polygon, true, true));
        this.counts.polygons++;
      }
      if (kind === KIND_WATER) this.counts.water++;
      else if (kind === KIND_BUILDING) this.counts.buildings++;
    }
  };

  Navigator.prototype._addRoads = function (features) {
    if (!features) return;
    if (!Array.isArray(features)) throw new TypeError("roads layer must be an array");
    for (const feature of features) {
      const where = this._featureWhere(feature);
      if (!feature || !Array.isArray(feature.polygons)) {
        throw new TypeError(where + ": missing polygons");
      }
      const functie = feature.properties ? feature.properties.functie : null;
      const walk = !roadBlockedAlways(functie);
      const bike = walk && !ROAD_BLOCKED_BIKE.has(functie);
      for (let pi = 0; pi < feature.polygons.length; pi++) {
        const polygon = feature.polygons[pi];
        validatePolygon(polygon, where + " polygon[" + pi + "]");
        this.index.insert(this._makeRec(KIND_ROAD, polygon, walk, bike));
        this.counts.polygons++;
      }
      this.counts.roads++;
    }
  };

  Navigator.prototype._addBridges = function (features) {
    if (!features) return;
    if (!Array.isArray(features)) throw new TypeError("bridges layer must be an array");
    for (const feature of features) {
      const where = this._featureWhere(feature);
      if (!feature || !Array.isArray(feature.polygons)) {
        throw new TypeError(where + ": missing polygons");
      }
      const part = feature.properties ? feature.properties.type_overbruggingsdeel : null;
      this.counts.bridges++;
      // Only "dek" (bridge deck) is a walkable surface. Pijler (pier/pillar),
      // landhoofd (abutment) and null never override water.
      if (part !== "dek") {
        this.nonDeckBridgeParts++;
        continue;
      }
      for (let pi = 0; pi < feature.polygons.length; pi++) {
        const polygon = feature.polygons[pi];
        validatePolygon(polygon, where + " polygon[" + pi + "]");
        this.index.insert(this._makeRec(KIND_DECK, polygon, true, true));
        this.counts.polygons++;
      }
      this.counts.deck++;
    }
  };

  Navigator.prototype._modeFlags = function (mode) {
    if (mode === "bike") return { walk: true, bike: true, useBike: true };
    if (mode === "walk") return { walk: true, bike: false, useBike: false };
    throw new RangeError('mode must be "walk" or "bike"');
  };

  // Side offset (metres) for the both-sides-of-edge face test and the
  // geometric tolerance for on-boundary vertex/tangency decisions.
  const BODY_OFFSET = 1e-6;
  const BODY_TOL = 1e-6;
  const ANGLE_EPS = 1e-9;
  const PARAM_EPS = 1e-9;

  function numAsc(a, b) { return a - b; }

  // All edge parameters u in [0,1] where segment p1->p2 meets the circle
  // (C,r), tangency included.
  function segCircleParams(ax, ay, bx, by, cx, cy, r, out) {
    const ex = bx - ax;
    const ey = by - ay;
    const a = ex * ex + ey * ey;
    if (a === 0) return;
    const fx = ax - cx;
    const fy = ay - cy;
    const b = 2 * (fx * ex + fy * ey);
    const c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4 * a * c;
    const tol = 1e-10 * (1 + b * b + 4 * Math.abs(a * c));
    if (disc < -tol) return;
    if (disc < 0) disc = 0;
    const s = Math.sqrt(disc);
    const u1 = (-b - s) / (2 * a);
    const u2 = (-b + s) / (2 * a);
    if (u1 >= -PARAM_EPS && u1 <= 1 + PARAM_EPS) {
      out.push(u1 < 0 ? 0 : (u1 > 1 ? 1 : u1));
    }
    if (Math.abs(u2 - u1) > 1e-12 && u2 >= -PARAM_EPS && u2 <= 1 + PARAM_EPS) {
      out.push(u2 < 0 ? 0 : (u2 > 1 ? 1 : u2));
    }
  }

  // Core classification of a point known to be finite, evaluated against an
  // already gathered candidate record set (no per-query ring revalidation).
  Navigator.prototype._classifySet = function (x, y, mode, cands) {
    let building = false;
    let water = false;
    let road = false;
    let deck = false;
    for (const rec of cands) {
      const b = rec.bounds;
      if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) continue;
      if (!containsFast(x, y, rec.polygon, rec.rb)) continue;
      if (rec.kind === KIND_BUILDING) building = true;
      else if (rec.kind === KIND_WATER) water = true;
      else if (rec.kind === KIND_DECK) deck = true;
      else if (rec.kind === KIND_ROAD) {
        if (mode === "bike" ? rec.bike : rec.walk) road = true;
      }
    }
    if (building) return false;
    if (water && !deck) return false;
    return road || deck;
  };

  Navigator.prototype._classify = function (x, y, mode) {
    const cands = this.index.queryBounds(x, y, x, y, new Set());
    return this._classifySet(x, y, mode, cands);
  };

  // Exact whole-body clearance.
  //
  // The closed disk D must be contained in the walkable set W (the union of
  // mode-permitted roads and bridge decks, with building/water precedence).
  // Sampling the circumference alone cannot see holes wholly inside the disk
  // or narrow notches between samples, so coverage is established structurally:
  //   1. the centre is walkable;
  //   2. every circle/edge intersection point is walkable (tangency keeps the
  //      documented "the water boundary belongs to the water" semantics);
  //   3. every open circumference arc between consecutive intersections lies
  //      in one planar face, so one classified midpoint per arc suffices;
  //   4. for every polygon edge portion strictly inside the disk both adjacent
  //      faces are walkable. A hole filled by another legal road therefore
  //      passes (both faces are road); an uncovered hole, notch, water or
  //      building does not.
  // Polygon vertices on the circle are added as split points for case 2/3.
  Navigator.prototype._clearDisk = function (cx, cy, mode, r, cands) {
    const angles = [];
    const pushAngle = function (px, py) {
      let a = Math.atan2(py - cy, px - cx);
      if (a < 0) a += 2 * Math.PI;
      angles.push(a);
    };
    const okAt = (px, py) => this._classifySet(px, py, mode, cands);

    for (const rec of cands) {
      const polygon = rec.polygon;
      for (let ri = 0; ri < polygon.length; ri++) {
        const ring = polygon[ri];
        const rb = rec.rb[ri];
        if (rb[2] < cx - r || rb[0] > cx + r ||
            rb[3] < cy - r || rb[1] > cy + r) continue;
        for (let i = 0; i < ring.length - 1; i++) {
          const ax = ring[i][0], ay = ring[i][1];
          const bx = ring[i + 1][0], by = ring[i + 1][1];
          // Edge-level reject: an edge whose box misses the disk box can
          // neither intersect the circle nor run through its interior.
          if (Math.max(ax, bx) < cx - r || Math.min(ax, bx) > cx + r ||
              Math.max(ay, by) < cy - r || Math.min(ay, by) > cy + r) continue;
          const us = [0, 1];
          segCircleParams(ax, ay, bx, by, cx, cy, r, us);
          us.sort(numAsc);
          // Edge/circle intersection points split the circumference.
          for (let k = 0; k < us.length; k++) {
            const u = us[k];
            if (u > PARAM_EPS || u < 1 - PARAM_EPS) {
              pushAngle(ax + (bx - ax) * u, ay + (by - ay) * u);
            }
          }
          // Both faces next to the edge interval strictly inside the disk.
          const elen = Math.hypot(bx - ax, by - ay);
          if (elen > 0) {
            const enx = -(by - ay) / elen;
            const eny = (bx - ax) / elen;
            for (let k = 1; k < us.length; k++) {
              const du = us[k] - us[k - 1];
              if (du <= 1e-12) continue;
              const um = us[k - 1] + du / 2;
              const qx = ax + (bx - ax) * um;
              const qy = ay + (by - ay) * um;
              const d = Math.hypot(qx - cx, qy - cy);
              if (r - d > 2 * BODY_OFFSET) {
                if (!okAt(qx + BODY_OFFSET * enx, qy + BODY_OFFSET * eny)) return false;
                if (!okAt(qx - BODY_OFFSET * enx, qy - BODY_OFFSET * eny)) return false;
              }
            }
          }
        }
        // Vertices on the circle are face-change/tangency split points.
        for (let i = 0; i < ring.length - 1; i++) {
          const vx = ring[i][0], vy = ring[i][1];
          if (vx < cx - r || vx > cx + r || vy < cy - r || vy > cy + r) continue;
          if (Math.abs(Math.hypot(vx - cx, vy - cy) - r) <= BODY_TOL) pushAngle(vx, vy);
        }
      }
    }

    if (angles.length === 0) {
      // No polygon edge meets the circle: the whole circumference is one face.
      return okAt(cx + r, cy);
    }
    angles.sort(numAsc);
    const uniq = [];
    for (const a of angles) {
      if (uniq.length === 0 || Math.abs(a - uniq[uniq.length - 1]) > ANGLE_EPS) uniq.push(a);
    }
    for (const a of uniq) {
      if (!okAt(cx + r * Math.cos(a), cy + r * Math.sin(a))) return false;
    }
    for (let i = 0; i < uniq.length; i++) {
      const a0 = uniq[i];
      const a1 = uniq[(i + 1) % uniq.length] + (i + 1 === uniq.length ? 2 * Math.PI : 0);
      const am = (a0 + a1) / 2;
      if (!okAt(cx + r * Math.cos(am), cy + r * Math.sin(am))) return false;
    }
    return true;
  };

  // Swept-capsule analogue of _clearDisk. The capsule boundary is, in arc
  // length order: rail A+rn -> B+rn, semicircle around B, rail B-rn -> A-rn,
  // semicircle around A. Polygon edges split that boundary at proper and
  // collinear intersections with the two rails and at filtered circle hits;
  // edge portions strictly inside the capsule get the both-faces test.
  Navigator.prototype._clearCapsule = function (A, B, mode, r, cands) {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return this._clearDisk(A.x, A.y, mode, r, cands);
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const capLen = Math.PI * r;
    const sRail1End = len;
    const sRail2Start = len + capLen;
    const sCapAStart = sRail2Start + len;
    const total = sCapAStart + capLen;
    const params = [];
    const addParam = function (s) {
      if (s >= -BODY_TOL && s <= total + BODY_TOL) {
        params.push(s < 0 ? 0 : (s > total ? total : s));
      }
    };
    // Clockwise arc angle theta in [0,pi] from unit vector e to point v/r.
    const arcTheta = function (ex, ey, vx, vy) {
      let th = Math.atan2(-(ex * vy - ey * vx), ex * vx + ey * vy);
      if (th < 0) th = 0;
      if (th > Math.PI) th = Math.PI;
      return th;
    };
    const okAt = (px, py) => this._classifySet(px, py, mode, cands);
    const minBX = Math.min(A.x, B.x) - r;
    const maxBX = Math.max(A.x, B.x) + r;
    const minBY = Math.min(A.y, B.y) - r;
    const maxBY = Math.max(A.y, B.y) + r;

    for (const rec of cands) {
      const polygon = rec.polygon;
      for (let ri = 0; ri < polygon.length; ri++) {
        const ring = polygon[ri];
        const rb = rec.rb[ri];
        if (rb[2] < minBX || rb[0] > maxBX || rb[3] < minBY || rb[1] > maxBY) continue;
        for (let i = 0; i < ring.length - 1; i++) {
          const ax = ring[i][0], ay = ring[i][1];
          const bx = ring[i + 1][0], by = ring[i + 1][1];
          // Edge-level reject against the capsule's bounding box.
          if (Math.max(ax, bx) < minBX || Math.min(ax, bx) > maxBX ||
              Math.max(ay, by) < minBY || Math.min(ay, by) > maxBY) continue;
          const ex = bx - ax, ey = by - ay;
          const elen2 = ex * ex + ey * ey;
          const us = [0, 1];

          // Intersection of edge p1->p2 with one straight rail q0->q1;
          // sAt maps rail parameter v to boundary arc length.
          const rail = (q0x, q0y, q1x, q1y, sAt) => {
            const fx = q1x - q0x, fy = q1y - q0y;
            const den = ex * fy - ey * fx;
            const wx = q0x - ax, wy = q0y - ay;
            const scale = 1 + Math.max(Math.abs(ex), Math.abs(ey),
              Math.abs(fx), Math.abs(fy), Math.abs(wx), Math.abs(wy));
            const tol = 1e-9 * scale * scale;
            if (Math.abs(den) > tol) {
              const u = (wx * fy - wy * fx) / den;
              const v = (wx * ey - wy * ex) / den;
              if (u >= -PARAM_EPS && u <= 1 + PARAM_EPS &&
                  v >= -PARAM_EPS && v <= 1 + PARAM_EPS) {
                const uc = u < 0 ? 0 : (u > 1 ? 1 : u);
                const vc = v < 0 ? 0 : (v > 1 ? 1 : v);
                us.push(uc);
                addParam(sAt(vc));
              }
            } else if (Math.abs(wx * ey - wy * ex) <= tol) {
              // Collinear overlap: its endpoints split both curves.
              const flen2 = fx * fx + fy * fy;
              if (flen2 > 0) {
                const v0 = ((ax - q0x) * fx + (ay - q0y) * fy) / flen2;
                const v1 = ((bx - q0x) * fx + (by - q0y) * fy) / flen2;
                const lo = Math.max(0, Math.min(v0, v1));
                const hi = Math.min(1, Math.max(v0, v1));
                if (hi - lo > 1e-12) {
                  addParam(sAt(lo));
                  addParam(sAt(hi));
                  for (const v of [lo, hi]) {
                    const px = q0x + fx * v, py = q0y + fy * v;
                    if (elen2 > 0) {
                      const u = ((px - ax) * ex + (py - ay) * ey) / elen2;
                      if (u >= -PARAM_EPS && u <= 1 + PARAM_EPS) {
                        us.push(u < 0 ? 0 : (u > 1 ? 1 : u));
                      }
                    }
                  }
                }
              }
            }
          };

          rail(A.x + r * nx, A.y + r * ny, B.x + r * nx, B.y + r * ny,
            v => v * len);
          rail(B.x - r * nx, B.y - r * ny, A.x - r * nx, A.y - r * ny,
            v => sRail2Start + v * len);

          // Semicircle caps.
          const capHits = [A, B];
          for (let ci = 0; ci < 2; ci++) {
            const C = capHits[ci];
            const hits = [];
            segCircleParams(ax, ay, bx, by, C.x, C.y, r, hits);
            for (const u of hits) {
              us.push(u);
              const px = ax + ex * u, py = ay + ey * u;
              const vx = (px - C.x) / r, vy = (py - C.y) / r;
              if (ci === 1) {
                // B cap: outward half (v . u >= 0), sweep n -> -n.
                if (vx * ux + vy * uy >= -BODY_TOL) {
                  addParam(sRail1End + r * arcTheta(nx, ny, vx, vy));
                }
              } else {
                // A cap: outward half (v . u <= 0), sweep -n -> n.
                if (vx * ux + vy * uy <= BODY_TOL) {
                  addParam(sCapAStart + r * arcTheta(-nx, -ny, vx, vy));
                }
              }
            }
          }

          // Edge portions strictly inside the capsule: both faces walkable.
          us.sort(numAsc);
          if (elen2 > 0) {
            const elen = Math.sqrt(elen2);
            const enx = -ey / elen, eny = ex / elen;
            for (let k = 1; k < us.length; k++) {
              const du = us[k] - us[k - 1];
              if (du <= 1e-12) continue;
              const um = us[k - 1] + du / 2;
              const qx = ax + ex * um, qy = ay + ey * um;
              const d = pointSegDistance(qx, qy, A.x, A.y, B.x, B.y).d;
              if (r - d > 2 * BODY_OFFSET) {
                const sx = qx + BODY_OFFSET * enx, sy = qy + BODY_OFFSET * eny;
                const tx = qx - BODY_OFFSET * enx, ty = qy - BODY_OFFSET * eny;
                if (pointSegDistance(sx, sy, A.x, A.y, B.x, B.y).d <= r &&
                    !okAt(sx, sy)) return false;
                if (pointSegDistance(tx, ty, A.x, A.y, B.x, B.y).d <= r &&
                    !okAt(tx, ty)) return false;
              }
            }
          }
        }
        // Polygon vertices sitting on the capsule boundary.
        for (let i = 0; i < ring.length - 1; i++) {
          const vx = ring[i][0], vy = ring[i][1];
          if (vx < minBX || vx > maxBX || vy < minBY || vy > maxBY) continue;
          const t = ((vx - A.x) * dx + (vy - A.y) * dy) / (len * len);
          if (t <= 0) {
            const wx = vx - A.x, wy = vy - A.y;
            if (Math.abs(Math.hypot(wx, wy) - r) <= BODY_TOL &&
                wx * ux + wy * uy <= BODY_TOL) {
              addParam(sCapAStart + r * arcTheta(-nx, -ny, wx / r, wy / r));
            }
          } else if (t >= 1) {
            const wx = vx - B.x, wy = vy - B.y;
            if (Math.abs(Math.hypot(wx, wy) - r) <= BODY_TOL &&
                wx * ux + wy * uy >= -BODY_TOL) {
              addParam(sRail1End + r * arcTheta(nx, ny, wx / r, wy / r));
            }
          } else {
            const wx = vx - (A.x + dx * t), wy = vy - (A.y + dy * t);
            if (Math.abs(Math.hypot(wx, wy) - r) <= BODY_TOL) {
              const side = wx * nx + wy * ny;
              addParam(side >= 0 ? t * len : sRail2Start + t * len);
            }
          }
        }
      }
    }

    const pointAt = function (s) {
      if (s <= sRail1End) {
        return { x: A.x + r * nx + ux * s, y: A.y + r * ny + uy * s };
      }
      if (s <= sRail2Start) {
        const th = (s - sRail1End) / r;
        const c = Math.cos(th), sn = Math.sin(th);
        return { x: B.x + r * (c * nx + sn * ny), y: B.y + r * (-sn * nx + c * ny) };
      }
      if (s <= sCapAStart) {
        const k = s - sRail2Start;
        return { x: B.x - r * nx - ux * k, y: B.y - r * ny - uy * k };
      }
      const th = (s - sCapAStart) / r;
      const c = Math.cos(th), sn = Math.sin(th);
      return { x: A.x + r * (-c * nx - sn * ny), y: A.y + r * (sn * nx - c * ny) };
    };

    params.push(0, total);
    params.sort(numAsc);
    const uniq = [];
    for (const s of params) {
      if (uniq.length === 0 || Math.abs(s - uniq[uniq.length - 1]) > BODY_TOL) uniq.push(s);
    }
    for (const s of uniq) {
      const p = pointAt(s);
      if (!okAt(p.x, p.y)) return false;
    }
    for (let i = 1; i < uniq.length; i++) {
      const sm = (uniq[i - 1] + uniq[i]) / 2;
      const p = pointAt(sm);
      if (!okAt(p.x, p.y)) return false;
    }
    return true;
  };

  // Radius clearance: the whole disk (not just its centre) must be covered by
  // the union of permitted surfaces with building/water precedence.
  Navigator.prototype._clearance = function (point, mode, radius) {
    const x = point.x;
    const y = point.y;
    const r = radius || 0;
    const cands = this.index.queryBounds(x - r, y - r, x + r, y + r, new Set());
    if (!this._classifySet(x, y, mode, cands)) return false;
    if (r <= 0) return true;
    return this._clearDisk(x, y, mode, r, cands);
  };

  Navigator.prototype.isWalkable = function (point, options) {
    assertPoint(point);
    const opts = options || {};
    const mode = opts.mode || "walk";
    if (mode !== "walk" && mode !== "bike") {
      throw new RangeError('mode must be "walk" or "bike"');
    }
    const radius = isNum(opts.radius) ? opts.radius : this.radius;
    if (radius < 0) throw new RangeError("radius must be >= 0");
    return this._clearance(point, mode, radius);
  };

  Navigator.prototype._candidatesForSegment = function (from, to, radius) {
    const r = radius || 0;
    const minX = Math.min(from.x, to.x) - r;
    const maxX = Math.max(from.x, to.x) + r;
    const minY = Math.min(from.y, to.y) - r;
    const maxY = Math.max(from.y, to.y) + r;
    return this.index.queryBounds(minX, minY, maxX, maxY, new Set());
  };

  Navigator.prototype.segmentWalkable = function (from, to, options) {
    assertPoint(from);
    assertPoint(to);
    const opts = options || {};
    const mode = opts.mode || "walk";
    if (mode !== "walk" && mode !== "bike") {
      throw new RangeError('mode must be "walk" or "bike"');
    }
    const radius = isNum(opts.radius) ? opts.radius : this.radius;
    if (radius < 0) throw new RangeError("radius must be >= 0");

    // Geometry is immutable: memoize the verdict per undirected segment.
    let kx0 = from.x, ky0 = from.y, kx1 = to.x, ky1 = to.y;
    if (kx0 > kx1 || (kx0 === kx1 && ky0 > ky1)) {
      kx0 = to.x; ky0 = to.y; kx1 = from.x; ky1 = from.y;
    }
    const key = kx0 + "," + ky0 + ">" + kx1 + "," + ky1 + "|" + mode + "|" + radius;
    const cached = this.segCache.get(key);
    if (cached !== undefined) {
      this.segmentChecks++;
      this.segmentCacheHits++;
      return cached;
    }
    this.segmentChecks++;

    const result = this._segmentWalkableUncached(from, to, mode, radius);
    this.segCache.set(key, result);
    return result;
  };

  Navigator.prototype._segmentWalkableUncached = function (from, to, mode, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = radius || 0;
    const candidates = this._candidatesForSegment(from, to, r);

    // Parameters t where the centre line meets any polygon boundary, plus
    // uniform samples at <= 0.5 m spacing. Midpoints between consecutive
    // parameters lie in a single polygon membership region, so barriers of
    // any width (including sub-0.5 m thin water/building strips) are detected.
    const ts = [0, 1];
    const steps = Math.max(1, Math.ceil(len / SAMPLE_SPACING));
    for (let i = 1; i < steps; i++) ts.push(i / steps);
    for (const rec of candidates) {
      for (let ri = 0; ri < rec.polygon.length; ri++) {
        const ring = rec.polygon[ri];
        const rb = rec.rb[ri];
        if (rb[2] < Math.min(from.x, to.x) - r || rb[0] > Math.max(from.x, to.x) + r ||
            rb[3] < Math.min(from.y, to.y) - r || rb[1] > Math.max(from.y, to.y) + r) continue;
        for (let i = 0; i < ring.length - 1; i++) {
          edgeCrossingParams(
            from.x, from.y, to.x, to.y,
            ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1],
            ts
          );
        }
      }
    }
    ts.sort(function (a, b) { return a - b; });
    const uniq = [];
    for (const t of ts) {
      if (uniq.length === 0 || Math.abs(t - uniq[uniq.length - 1]) > 1e-9) uniq.push(t);
    }

    const at = t => ({ x: from.x + dx * t, y: from.y + dy * t });
    const centreClear = t => this._classifySet(from.x + dx * t, from.y + dy * t, mode, candidates);

    let prev = 0;
    for (let i = 0; i < uniq.length; i++) {
      const t = uniq[i];
      if (t > prev) {
        const mid = (prev + t) / 2;
        if (mid > prev && mid < t && !centreClear(mid)) return false;
      }
      if (!centreClear(t)) return false;
      prev = t;
    }
    if (prev < 1) {
      const mid = (prev + 1) / 2;
      if (!centreClear(mid)) return false;
      if (!centreClear(1)) return false;
    }

    // Positive radius: exact coverage of the whole swept capsule by the union
    // of permitted surfaces (handles holes, notches and blocker interiors
    // alike; decks keep their water precedence through classification).
    if (r > 0 && !this._clearCapsule(from, to, mode, r, candidates)) return false;
    return true;
  };

  Navigator.prototype._latticeClear = function (ix, iy, mode, radius) {
    const k = ix + "|" + iy + "|" + mode + "|" + radius;
    const cached = this.passCache.get(k);
    if (cached !== undefined) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;
    const ok = this._clearance({ x: ix * this.cellSize, y: iy * this.cellSize }, mode, radius);
    this.passCache.set(k, ok);
    return ok;
  };

  Navigator.prototype.snap = function (point, options) {
    assertPoint(point);
    const opts = options || {};
    const mode = opts.mode || "walk";
    if (mode !== "walk" && mode !== "bike") {
      throw new RangeError('mode must be "walk" or "bike"');
    }
    const maxDistance = isNum(opts.maxDistance) ? opts.maxDistance : 80;
    if (maxDistance < 0) throw new RangeError("maxDistance must be >= 0");
    const radius = isNum(opts.radius) ? opts.radius : this.radius;
    this.snaps++;

    if (this._clearance(point, mode, radius)) {
      return { x: point.x === 0 ? 0 : point.x, y: point.y === 0 ? 0 : point.y, distance: 0 };
    }
    const cs = this.cellSize;
    const reach = Math.ceil(maxDistance / cs);
    const ix0 = Math.floor(point.x / cs);
    const iy0 = Math.floor(point.y / cs);
    const candidates = [];
    for (let dix = -reach; dix <= reach; dix++) {
      for (let diy = -reach; diy <= reach; diy++) {
        const x = (ix0 + dix) * cs;
        const y = (iy0 + diy) * cs;
        const ddx = x - point.x;
        const ddy = y - point.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 <= maxDistance * maxDistance) {
          candidates.push({ ix: ix0 + dix, iy: iy0 + diy, x, y, d2 });
        }
      }
    }
    // Deterministic ordering: nearest first, then lattice coordinate.
    candidates.sort(function (a, b) {
      if (a.d2 !== b.d2) return a.d2 - b.d2;
      if (a.ix !== b.ix) return a.ix - b.ix;
      return a.iy - b.iy;
    });
    for (const c of candidates) {
      if (this._latticeClear(c.ix, c.iy, mode, radius)) {
        return { x: c.x, y: c.y, distance: Math.sqrt(c.d2) };
      }
    }
    return null;
  };

  // Binary heap keyed by f then node key for deterministic tie breaks.
  function Heap() {
    this.a = [];
  }

  Heap.prototype.push = function (node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(a[i], a[parent])) {
        const tmp = a[i]; a[i] = a[parent]; a[parent] = tmp;
        i = parent;
      } else break;
    }
  };

  Heap.prototype.pop = function () {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < n && this._less(a[l], a[smallest])) smallest = l;
        if (r < n && this._less(a[r], a[smallest])) smallest = r;
        if (smallest === i) break;
        const tmp = a[i]; a[i] = a[smallest]; a[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  };

  Heap.prototype._less = function (p, q) {
    if (p.f !== q.f) return p.f < q.f;
    if (p.g !== q.g) return p.g > q.g;
    return p.key < q.key;
  };

  Heap.prototype.size = function () { return this.a.length; };

  Navigator.prototype.route = function (from, to, options) {
    const opts = options || {};
    const mode = opts.mode || "walk";
    if (mode !== "walk" && mode !== "bike") {
      throw new RangeError('mode must be "walk" or "bike"');
    }
    const radius = isNum(opts.radius) ? opts.radius : this.radius;
    if (radius < 0) throw new RangeError("radius must be >= 0");
    const budget = isNum(opts.maxNodes) && opts.maxNodes > 0 ?
      Math.floor(opts.maxNodes) : this.maxNodes;
    const snapDistance = isNum(opts.snapDistance) && opts.snapDistance > 0 ?
      opts.snapDistance : 0;
    this.searches++;

    const fail = (reason, visited, startSnap, endSnap) => {
      this.lastReason = reason;
      this.lastVisited = visited;
      this.totalExpanded += visited;
      return {
        found: false, reason, points: [], length: 0,
        visited, startSnap: startSnap || null, endSnap: endSnap || null
      };
    };

    if (!isPoint(from) || !isPoint(to)) {
      return fail("invalid", 0, null, null);
    }

    let start = { x: from.x, y: from.y };
    let goal = { x: to.x, y: to.y };
    let startSnap = null;
    let endSnap = null;

    if (!this._clearance(start, mode, radius)) {
      if (snapDistance > 0) {
        startSnap = this.snap(start, { mode, maxDistance: snapDistance, radius });
        if (!startSnap) return fail("unwalkable", 0, null, null);
        start = { x: startSnap.x, y: startSnap.y };
      } else {
        return fail("unwalkable", 0, null, null);
      }
    }
    if (!this._clearance(goal, mode, radius)) {
      if (snapDistance > 0) {
        endSnap = this.snap(goal, { mode, maxDistance: snapDistance, radius });
        if (!endSnap) return fail("unwalkable", 0, startSnap, null);
        goal = { x: endSnap.x, y: endSnap.y };
      } else {
        return fail("unwalkable", 0, startSnap, null);
      }
    }

    if (Math.abs(start.x - goal.x) < METRE_EPS && Math.abs(start.y - goal.y) < METRE_EPS) {
      this.lastReason = "ok";
      this.lastVisited = 0;
      return {
        found: true, reason: "ok",
        points: [{ x: start.x, y: start.y }],
        length: 0, visited: 0, startSnap, endSnap
      };
    }

    const cs = this.cellSize;
    const seg = (a, b) => this.segmentWalkable(a, b, { mode, radius });

    // Lattice cells surrounding each free-position endpoint; the endpoint is
    // connected to the four corners of its containing cell.
    function cornerKeys(p) {
      const ix0 = Math.floor(p.x / cs);
      const iy0 = Math.floor(p.y / cs);
      const set = new Set();
      const arr = [];
      for (let dix = 0; dix <= 1; dix++) {
        for (let diy = 0; diy <= 1; diy++) {
          const ix = ix0 + dix;
          const iy = iy0 + diy;
          const k = ix + ":" + iy;
          if (!set.has(k)) {
            set.add(k);
            arr.push({ ix, iy, key: k, x: ix * cs, y: iy * cs });
          }
        }
      }
      return arr;
    }

    const startCorners = cornerKeys(start);
    const goalCornerSet = new Set(cornerKeys(goal).map(function (c) { return c.key; }));

    const START_KEY = "#start";
    const GOAL_KEY = "#goal";
    const nodes = new Map();
    nodes.set(START_KEY, { x: start.x, y: start.y, g: 0, parent: null });
    const heap = new Heap();
    const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
    heap.push({ key: START_KEY, g: 0, f: dist(start.x, start.y, goal.x, goal.y) });

    let expanded = 0;
    let resultReason = null;

    const consider = (key, x, y, parentKey, parentG, px, py) => {
      const g = parentG + dist(px, py, x, y);
      const existing = nodes.get(key);
      if (existing && g + 1e-9 >= existing.g) return;
      const h = key === GOAL_KEY ? 0 : dist(x, y, goal.x, goal.y);
      nodes.set(key, { x, y, g, parent: parentKey });
      heap.push({ key, g, f: g + h });
    };

    while (heap.size() > 0) {
      const cur = heap.pop();
      // A node may have been re-queued with a better g; skip stale entries.
      const curNode = nodes.get(cur.key);
      if (!curNode || Math.abs(curNode.g - cur.g) > 1e-6) continue;
      if (cur.key === GOAL_KEY) {
        resultReason = "ok";
        break;
      }
      expanded++;
      if (expanded > budget) {
        resultReason = "limit";
        break;
      }

      if (cur.key === START_KEY) {
        if (seg(start, goal)) {
          consider(GOAL_KEY, goal.x, goal.y, START_KEY, curNode.g, start.x, start.y);
        }
        for (const c of startCorners) {
          if (this._latticeClear(c.ix, c.iy, mode, radius) && seg(start, c)) {
            consider(c.key, c.x, c.y, START_KEY, curNode.g, start.x, start.y);
          }
        }
        continue;
      }

      const ix = parseInt(cur.key.split(":")[0], 10);
      const iy = parseInt(cur.key.split(":")[1], 10);
      const here = { x: curNode.x, y: curNode.y };

      // Goal connector.
      if (goalCornerSet.has(cur.key) && seg(here, goal)) {
        consider(GOAL_KEY, goal.x, goal.y, cur.key, curNode.g, here.x, here.y);
      }

      for (let dix = -1; dix <= 1; dix++) {
        for (let diy = -1; diy <= 1; diy++) {
          if (dix === 0 && diy === 0) continue;
          const nx = ix + dix;
          const ny = iy + diy;
          if (!this._latticeClear(nx, ny, mode, radius)) continue;
          const np = { x: nx * cs, y: ny * cs };
          if (dix !== 0 && diy !== 0) {
            // No diagonal corner cutting: both side cells and both side
            // segments must be clear in addition to the diagonal itself.
            const sx = { x: nx * cs, y: iy * cs };
            const sy = { x: ix * cs, y: ny * cs };
            if (!this._latticeClear(nx, iy, mode, radius)) continue;
            if (!this._latticeClear(ix, ny, mode, radius)) continue;
            if (!seg(here, sx) || !seg(here, sy)) continue;
          }
          if (!seg(here, np)) continue;
          consider(nx + ":" + ny, np.x, np.y, cur.key, curNode.g, here.x, here.y);
        }
      }
    }

    if (resultReason === "limit") return fail("limit", expanded, startSnap, endSnap);
    const goalNode = nodes.get(GOAL_KEY);
    if (resultReason !== "ok" || !goalNode) {
      return fail("unreachable", expanded, startSnap, endSnap);
    }

    // Reconstruct (actual endpoint coordinates preserved).
    const reversed = [];
    let k = GOAL_KEY;
    while (k !== null) {
      const n = nodes.get(k);
      reversed.push({ x: n.x, y: n.y });
      k = n.parent;
    }
    reversed.reverse();

    // Collinear/string-pull simplification, gated on verified segment safety.
    let path = reversed;
    if (path.length > 2) {
      const simplified = [path[0]];
      let anchor = 0;
      for (let i = 1; i < path.length - 1; i++) {
        if (!seg(path[anchor], path[i + 1])) {
          simplified.push(path[i]);
          anchor = i;
        }
      }
      simplified.push(path[path.length - 1]);
      path = simplified;
    }

    let length = 0;
    for (let i = 1; i < path.length; i++) {
      length += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
    }

    this.lastReason = "ok";
    this.lastVisited = expanded;
    this.totalExpanded += expanded;
    return {
      found: true, reason: "ok", points: path, length,
      visited: expanded, startSnap, endSnap
    };
  };

  Navigator.prototype.stats = function () {
    return {
      options: {
        cellSize: this.cellSize,
        maxNodes: this.maxNodes,
        bucketSize: this.bucketSize,
        radius: this.radius
      },
      features: {
        water: this.counts.water,
        buildings: this.counts.buildings,
        roads: this.counts.roads,
        bridges: this.counts.bridges,
        bridgeDeckFeatures: this.counts.deck,
        ignoredNonDeckBridgeParts: this.nonDeckBridgeParts,
        polygonsIndexed: this.counts.polygons
      },
      buckets: this.index.buckets.size,
      globalPolygons: this.index.global.length,
      passabilityCacheEntries: this.passCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      segmentChecks: this.segmentChecks,
      segmentCacheEntries: this.segCache.size,
      segmentCacheHits: this.segmentCacheHits,
      searches: this.searches,
      snaps: this.snaps,
      lastVisited: this.lastVisited,
      totalExpanded: this.totalExpanded,
      lastReason: this.lastReason
    };
  };

  return {
    project,
    unproject,
    pointInPolygon,
    createNavigator
  };
});

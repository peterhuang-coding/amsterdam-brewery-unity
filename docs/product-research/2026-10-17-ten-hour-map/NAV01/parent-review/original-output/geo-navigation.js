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
    let distinct = 0;
    let px = null;
    let py = null;
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      if (!Array.isArray(c) || c.length < 2 || !isNum(c[0]) || !isNum(c[1])) {
        throw new TypeError(where + ": ring contains a non-finite coordinate");
      }
      if (c[0] !== px || c[1] !== py) {
        distinct++;
        px = c[0];
        py = c[1];
      }
    }
    if (distinct < 3) {
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

  function pointOnRing(px, py, ring) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = ring[i][0];
      const ay = ring[i][1];
      const bx = ring[i + 1][0];
      const by = ring[i + 1][1];
      const ex = bx - ax;
      const ey = by - ay;
      const scale = 1 + Math.max(Math.abs(ex), Math.abs(ey), Math.abs(px), Math.abs(py));
      const cross = (px - ax) * ey - (py - ay) * ex;
      if (Math.abs(cross) <= 1e-9 * scale * scale) {
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
    const px = point.x;
    const py = point.y;
    // Hole boundary is excluded, even where it (invalidly) coincides with
    // the outer boundary; outer boundary is inside.
    for (let h = 1; h < polygon.length; h++) {
      if (pointOnRing(px, py, polygon[h])) return false;
    }
    const outer = polygon[0];
    if (pointOnRing(px, py, outer)) return true;
    if (!pointInRingParity(px, py, outer)) return false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRingParity(px, py, polygon[h])) return false;
    }
    return true;
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
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.segmentChecks = 0;
    this.searches = 0;
    this.snaps = 0;
    this.lastVisited = 0;
    this.totalExpanded = 0;
    this.lastReason = null;
  }

  Navigator.prototype._featureWhere = function (feature) {
    return "feature " + (feature && (feature.id || feature.sourceId) || "<unknown>");
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
        const rec = {
          kind,
          polygon,
          bounds: polygonBounds(polygon),
          walk: true,
          bike: true
        };
        this.index.insert(rec);
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
      const walk = !ROAD_BLOCKED_ALWAYS.has(functie);
      const bike = walk && !ROAD_BLOCKED_BIKE.has(functie);
      for (let pi = 0; pi < feature.polygons.length; pi++) {
        const polygon = feature.polygons[pi];
        validatePolygon(polygon, where + " polygon[" + pi + "]");
        this.index.insert({
          kind: KIND_ROAD,
          polygon,
          bounds: polygonBounds(polygon),
          walk,
          bike
        });
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
        this.index.insert({
          kind: KIND_DECK,
          polygon,
          bounds: polygonBounds(polygon),
          walk: true,
          bike: true
        });
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

  // Core classification of a point known to be finite.
  Navigator.prototype._classify = function (x, y, mode) {
    const candidates = this.index.queryBounds(x, y, x, y, new Set());
    let building = false;
    let water = false;
    let road = false;
    let deck = false;
    for (const rec of candidates) {
      const inside = pointInPolygon({ x, y }, rec.polygon);
      if (!inside) continue;
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

  Navigator.prototype._deckContains = function (x, y, candidates) {
    for (const rec of candidates) {
      if (rec.kind === KIND_DECK && pointInPolygon({ x, y }, rec.polygon)) return true;
    }
    return false;
  };

  // Radius clearance: the whole disk (not just its centre) must remain on a
  // legal surface and must not intersect building/water interiors.
  Navigator.prototype._clearance = function (point, mode, radius) {
    const x = point.x;
    const y = point.y;
    if (!this._classify(x, y, mode)) return false;
    const r = radius || 0;
    if (r <= 0) return true;

    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / SAMPLE_SPACING));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (!this._classify(px, py, mode)) return false;
    }

    const candidates = this.index.queryBounds(x - r, y - r, x + r, y + r, new Set());
    for (const rec of candidates) {
      if (rec.kind !== KIND_WATER && rec.kind !== KIND_BUILDING) continue;
      const polygon = rec.polygon;
      for (const ring of polygon) {
        for (let i = 0; i < ring.length - 1; i++) {
          const res = pointSegDistance(x, y, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
          if (res.d + METRE_EPS < r) {
            if (rec.kind === KIND_BUILDING) return false;
            // Water edge inside the radius only blocks when the contact point
            // is not itself covered by a bridge deck.
            if (!this._deckContains(res.qx, res.qy, candidates)) return false;
          }
        }
      }
    }
    return true;
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
    this.segmentChecks++;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const candidates = this._candidatesForSegment(from, to, radius);

    // Parameters t where the segment meets any polygon boundary, plus uniform
    // samples at <= 0.5 m spacing. Midpoints between consecutive parameters
    // lie in a single polygon membership region, so barriers of any width
    // (including sub-0.5 m thin water/building strips) are detected.
    const ts = [0, 1];
    const steps = Math.max(1, Math.ceil(len / SAMPLE_SPACING));
    for (let i = 1; i < steps; i++) ts.push(i / steps);
    for (const rec of candidates) {
      for (const ring of rec.polygon) {
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

    function at(t) {
      return { x: from.x + dx * t, y: from.y + dy * t };
    }

    let prev = 0;
    for (let i = 0; i < uniq.length; i++) {
      const t = uniq[i];
      if (t > prev) {
        const mid = (prev + t) / 2;
        if (mid > prev && mid < t && !this._clearance(at(mid), mode, radius)) return false;
      }
      if (!this._clearance(at(t), mode, radius)) return false;
      prev = t;
    }
    if (prev < 1) {
      const mid = (prev + 1) / 2;
      if (!this._clearance(at(mid), mode, radius)) return false;
      if (!this._clearance(at(1), mode, radius)) return false;
    }

    // Radius: the swept capsule must not intersect blocker interiors. The
    // centre segment classification above handles interior crossings; here
    // reject blocker edges passing inside the radius.
    if (radius > 0) {
      for (const rec of candidates) {
        if (rec.kind !== KIND_WATER && rec.kind !== KIND_BUILDING) continue;
        for (const ring of rec.polygon) {
          for (let i = 0; i < ring.length - 1; i++) {
            const c = { x: ring[i][0], y: ring[i][1] };
            const d = { x: ring[i + 1][0], y: ring[i + 1][1] };
            const res = segSegDistance(from, to, c, d);
            if (res.d + METRE_EPS < radius) {
              if (rec.kind === KIND_BUILDING) return false;
              if (!this._deckContains(res.qx, res.qy, candidates)) return false;
            }
          }
        }
      }
    }
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

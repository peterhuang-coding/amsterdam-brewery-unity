/*
 * D26 RENDER01 — standalone Canvas2D renderer for actual BGT polygon data.
 *
 * UMD: globalThis.AmsterdamGeoRenderer / module.exports.
 * No imports, no fetch, no network, no dependency on the legacy game objects.
 *
 * The world is a local equirectangular projection measured in metres, with
 * y growing downward (north at originLat). Screen space shares that
 * orientation, so the world->screen transform is a uniform positive scale
 * plus translation:  sx = x * scale + tx; sy = y * scale + ty.
 *
 * Static geography (water, roads, bridges, buildings) is painted once into
 * bounded offscreen canvases (<= 2048 per side). Dynamic actors, routes and
 * CSS-space labels are redrawn live every frame.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmsterdamGeoRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CACHE_SIDE = 2048;
  var GRID_CELL_M = 220;
  var SOURCE_CREDIT = '地理轮廓：Kadaster / PDOK BGT · CC0';

  // Visual continuity with the existing game palette.
  var PALETTE = {
    ink: '#183b48', canal: '#378e9b', brick: '#b86b4c',
    sand: '#e2d4b0', lamp: '#ffd184', slate: '#253d49'
  };

  var THEMES = {
    day: {
      ground: '#cec6ab',
      water: '#378e9b', waterDeep: '#2c7d89', waterRipple: 'rgba(216,238,240,.16)',
      quay: '#c2b28b',
      road: '#e8e1cc', roadEdge: 'rgba(122,108,76,.35)', footway: '#ddd4bb',
      deck: '#ddd2b4', deckEdge: '#a9976f',
      pier: '#7e898f', pierEdge: '#606b72',
      brick: ['#ad6549', '#b87356', '#a55f45'],
      slate: ['#33505c', '#3d5863'],
      sandRoof: '#d3c29c',
      shadow: 'rgba(18,40,48,.18)',
      roofEdge: 'rgba(24,59,72,.22)', roofLight: 'rgba(255,246,214,.10)',
      routeUnder: 'rgba(16,44,56,.45)', routeGold: '#f2cd7e',
      ferry: '#dceef2',
      chip: 'rgba(244,236,214,.94)', chipInk: '#183b48', chipBorder: 'rgba(24,59,72,.35)',
      chipActive: 'rgba(255,209,132,.96)', chipActiveInk: '#24313a',
      markerOuter: '#183b48', markerInner: '#33525c', markerVisited: '#3f6b54',
      actor: '#243f47', actorHead: '#d4aa73', actorCap: '#b86b4c', bike: '#bb8254',
      hud: 'rgba(24,59,72,.72)', hudText: '#f0e7cd', hudTextDim: '#d8cfa9',
      scaleBar: '#f3ead2', scaleBarEdge: '#183b48'
    },
    night: {
      ground: '#102733',
      water: '#235d6c', waterDeep: '#1b4855', waterRipple: 'rgba(214,236,232,.12)',
      quay: '#8f886d',
      road: '#314d5a', roadEdge: 'rgba(150,180,190,.22)', footway: '#2c4551',
      deck: '#6f6a55', deckEdge: '#8f886d',
      pier: '#3c4f58', pierEdge: '#52626b',
      brick: ['#7c4937', '#87503c', '#6f4232'],
      slate: ['#1d3540', '#243f4a'],
      sandRoof: '#7d7459',
      shadow: 'rgba(4,14,22,.42)',
      roofEdge: 'rgba(0,0,0,.30)', roofLight: 'rgba(255,246,214,.06)',
      routeUnder: 'rgba(6,20,28,.55)', routeGold: '#ffd184',
      ferry: '#cfe8f0',
      chip: 'rgba(20,42,52,.94)', chipInk: '#f3d9a6', chipBorder: 'rgba(255,209,132,.30)',
      chipActive: 'rgba(255,209,132,.96)', chipActiveInk: '#24313a',
      markerOuter: '#0c212b', markerInner: '#2a4a57', markerVisited: '#35594c',
      actor: '#17303a', actorHead: '#d4aa73', actorCap: '#ce8e4c', bike: '#b99756',
      hud: 'rgba(10,28,38,.78)', hudText: '#f0d6a0', hudTextDim: '#cdb98d',
      scaleBar: '#f0d6a0', scaleBarEdge: '#0c212b'
    }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function fail(message) { throw new TypeError('AmsterdamGeoRenderer: ' + message); }

  // Deterministic 0..1 hash from a string (no Math.random anywhere in the
  // renderer; every cosmetic choice is fixed per feature id).
  function hash01(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // --------------------------------------------------------------------------
  // Pure transform / text helpers (exported for tests).
  // --------------------------------------------------------------------------

  // screen = world * scale + t ; exact floating point inverse.
  function worldToScreen(tr, x, y) { return { x: x * tr.scale + tr.tx, y: y * tr.scale + tr.ty }; }
  function screenToWorld(tr, x, y) { return { x: (x - tr.tx) / tr.scale, y: (y - tr.ty) / tr.scale }; }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Font-independent text width estimate, in pixels for the given font size.
  // CJK / fullwidth glyphs count ~1em, Latin/digits ~0.58em, spaces .32em.
  // The same estimator drives layout and the returned label rectangles, so
  // rects always match what the renderer reserves.
  function estimateTextWidth(text, px) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      var f;
      if (code === 0x20) f = 0.32;
      else if (code >= 0x2E80 && code <= 0xA0CF) f = 1.0;
      else if (code >= 0xFE30 && code <= 0xFFF0) f = 1.0;
      else if (code >= 0xFF00) f = 1.0;
      else if (code >= 0x2000 && code <= 0x27BF) f = 0.55;
      else f = 0.58;
      w += f * px;
    }
    return w;
  }

  // Exact font string used for both measurement and painting, so reserved
  // rectangles always match the glyphs that get drawn.
  function labelFont(fp) {
    return '600 ' + fp + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  }

  // Build a width(text, px) measurer. A live 2D context gives true
  // ctx.measureText metrics; the result is never allowed to be narrower than
  // the validated conservative estimator, so chips never clip real glyphs.
  // Without a measurable context the estimator alone is used (tests, null
  // surfaces, direct fallbacks).
  function makeMeasurer(ctx) {
    return function (text, px) {
      var bound = estimateTextWidth(text, px);
      if (ctx && typeof ctx.measureText === 'function') {
        var measured = null;
        try {
          ctx.font = labelFont(px);
          var m = ctx.measureText(text);
          if (m && isNum(m.width) && m.width > 0) measured = m.width;
        } catch (e) { measured = null; }
        if (measured !== null) return Math.max(bound, measured);
      }
      return bound;
    };
  }

  // Wrap a full name to the given CSS-pixel width at font size `px`
  // (logical widths already include the css/logical ratio via `px`).
  // Latin breaks on words; CJK breaks per character. Names are never cut.
  // `measure(text, px)` drives every width decision, so real browser metrics
  // and the reserved rectangles stay in agreement.
  function wrapText(text, px, maxW, measure) {
    var textW = measure ? function (t) { return measure(t, px); }
      : function (t) { return estimateTextWidth(t, px); };
    if (textW(text) <= maxW) return [text];
    var lines = [], line = '', lineW = 0;
    function push() { if (line) lines.push(line); line = ''; lineW = 0; }
    function tokenWord(word) {
      var tw = textW(word);
      if (lineW + tw > maxW && line) push();
      // A single over-long Latin token splits hard rather than shrinking.
      while (tw > maxW) {
        var cut = Math.max(1, Math.floor(maxW / (px * 0.58)));
        var part = word.slice(0, cut);
        word = word.slice(cut);
        if (line) push();
        line = part; lineW = textW(part);
        push();
        tw = textW(word);
      }
      line += word; lineW += tw;
    }
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === ' ' || ch === '\n') {
        var sw = textW(' ');
        if (lineW + sw > maxW) push(); else { line += ' '; lineW += sw; }
        continue;
      }
      var code = ch.charCodeAt(0);
      if (code >= 0x2E80 && code <= 0xA0CF || code >= 0xFF00) {
        var cw0 = px;
        if (lineW + cw0 > maxW) push();
        line += ch; lineW += cw0;
      } else {
        var j = i;
        while (j < text.length && !/\s/.test(text[j]) &&
          (function (c) { var u = c.charCodeAt(0); return !(u >= 0x2E80 && u <= 0xA0CF) && u < 0xFF00; })(text[j])) j++;
        tokenWord(text.slice(i, j));
        i = j - 1;
      }
    }
    push();
    return lines.length ? lines : [text];
  }

  // --------------------------------------------------------------------------
  // Validation. Geometry is converter output (schema v1) but required fields
  // and finiteness are enforced; errors cite the offending feature id.
  // --------------------------------------------------------------------------

  function validateData(data) {
    if (!data || typeof data !== 'object') fail('data must be the shared schema object');
    if (data.schemaVersion !== 1) fail('schemaVersion must be 1');
    if (!isNum(data.width) || !isNum(data.height) || data.width <= 0 || data.height <= 0) {
      fail('data.width/data.height must be positive finite metres');
    }
    if (!data.layers || typeof data.layers !== 'object') fail('data.layers is required');
    var layerDefs = [
      ['water', 0], ['roads', 1], ['bridges', 2], ['buildings', 3]
    ];
    var layers = layerDefs.map(function (d) { return { key: d[0], order: d[1], items: [] }; });
    var total = 0;
    layerDefs.forEach(function (def) {
      var key = def[0], arr = data.layers[key];
      if (!Array.isArray(arr)) fail('layers.' + key + ' must be an array');
      for (var i = 0; i < arr.length; i++) {
        var f = arr[i];
        var where = key + '[' + i + ']';
        if (!f || typeof f !== 'object') fail(where + ' is not an object');
        var id = typeof f.id === 'string' ? f.id : ('<' + where + '>');
        if (!Array.isArray(f.polygons) || !f.polygons.length) fail(id + ': polygons missing');
        var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (var pi = 0; pi < f.polygons.length; pi++) {
          var poly = f.polygons[pi];
          if (!Array.isArray(poly) || !poly.length) fail(id + ': polygon ' + pi + ' is empty');
          for (var ri = 0; ri < poly.length; ri++) {
            var ring = poly[ri];
            if (!Array.isArray(ring) || ring.length < 4) {
              fail(id + ': ring ' + ri + ' needs at least 4 points (closed)');
            }
            var distinct = 0, px = null, py = null;
            for (var k = 0; k < ring.length; k++) {
              var p = ring[k];
              if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) {
                fail(id + ': non-finite point in ring ' + ri);
              }
              if (px === null || p[0] !== px || p[1] !== py) distinct++;
              px = p[0]; py = p[1];
              if (p[0] < bx0) bx0 = p[0]; if (p[1] < by0) by0 = p[1];
              if (p[0] > bx1) bx1 = p[0]; if (p[1] > by1) by1 = p[1];
            }
            if (distinct < 3) fail(id + ': ring ' + ri + ' needs 3 distinct points');
            var a = ring[0], b = ring[ring.length - 1];
            if (a[0] !== b[0] || a[1] !== b[1]) fail(id + ': ring ' + ri + ' is not closed');
          }
        }
        if (Array.isArray(f.bounds) && f.bounds.length === 4 &&
          isNum(f.bounds[0]) && isNum(f.bounds[1]) && isNum(f.bounds[2]) && isNum(f.bounds[3])) {
          var tol = 1e-6;
          if (Math.abs(f.bounds[0] - bx0) > tol || Math.abs(f.bounds[1] - by0) > tol ||
              Math.abs(f.bounds[2] - bx1) > tol || Math.abs(f.bounds[3] - by1) > tol) {
            fail(id + ': bounds do not describe the actual polygon');
          }
        }
        var rec = {
          id: f.id, sourceId: f.sourceId || null, localId: f.localId || null,
          properties: f.properties && typeof f.properties === 'object' ? f.properties : {},
          polygons: f.polygons, bounds: [bx0, by0, bx1, by1], _g: 0
        };
        layers[def[1]].items.push(rec);
        total++;
      }
    });
    return { width: data.width, height: data.height, layers: layers, total: total };
  }

  // --------------------------------------------------------------------------
  // One-time uniform-grid spatial index.
  // --------------------------------------------------------------------------

  function SpatialIndex(layers, worldW, worldH) {
    this.nx = Math.max(1, Math.ceil(worldW / GRID_CELL_M));
    this.ny = Math.max(1, Math.ceil(worldH / GRID_CELL_M));
    this.buckets = new Array(this.nx * this.ny);
    for (var i = 0; i < this.buckets.length; i++) this.buckets[i] = null;
    this.all = [];
    var self = this;
    layers.forEach(function (layer) {
      layer.items.forEach(function (f) {
        var rec = { f: f, layer: layer.key };
        self.all.push(rec);
        var x0 = clamp(Math.floor(f.bounds[0] / GRID_CELL_M), 0, self.nx - 1);
        var y0 = clamp(Math.floor(f.bounds[1] / GRID_CELL_M), 0, self.ny - 1);
        var x1 = clamp(Math.floor(f.bounds[2] / GRID_CELL_M), 0, self.nx - 1);
        var y1 = clamp(Math.floor(f.bounds[3] / GRID_CELL_M), 0, self.ny - 1);
        for (var cx = x0; cx <= x1; cx++) {
          for (var cy = y0; cy <= y1; cy++) {
            var key = cy * self.nx + cx;
            if (!self.buckets[key]) self.buckets[key] = [];
            self.buckets[key].push(rec);
          }
        }
      });
    });
    this.gen = 1;
  }

  SpatialIndex.prototype.query = function (rect, out) {
    this.gen = (this.gen + 1) | 0;
    if (this.gen < 2) this.gen = 2;
    var g = this.gen;
    var x0 = clamp(Math.floor(rect[0] / GRID_CELL_M), 0, this.nx - 1);
    var y0 = clamp(Math.floor(rect[1] / GRID_CELL_M), 0, this.ny - 1);
    var x1 = clamp(Math.floor(rect[2] / GRID_CELL_M), 0, this.nx - 1);
    var y1 = clamp(Math.floor(rect[3] / GRID_CELL_M), 0, this.ny - 1);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var bucket = this.buckets[cy * this.nx + cx];
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var rec = bucket[i];
          if (rec.f._g === g) continue;
          rec.f._g = g;
          var b = rec.f.bounds;
          if (b[2] < rect[0] || b[3] < rect[1] || b[0] > rect[2] || b[1] > rect[3]) continue;
          out.push(rec);
        }
      }
    }
    return out;
  };

  // --------------------------------------------------------------------------
  // Static geography painting. All coordinates are world metres; the caller
  // has already applied translate/scale. Every ring of every polygon is
  // traced and filled even-odd, so holes and gaps between multipolygon
  // components stay empty. Nothing here mutates geometry.
  // --------------------------------------------------------------------------

  function traceFeature(c, f, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    var polys = f.polygons;
    c.beginPath();
    for (var pi = 0; pi < polys.length; pi++) {
      var poly = polys[pi];
      for (var ri = 0; ri < poly.length; ri++) {
        var ring = poly[ri];
        c.moveTo(ring[0][0] + ox, ring[0][1] + oy);
        for (var k = 1; k < ring.length; k++) c.lineTo(ring[k][0] + ox, ring[k][1] + oy);
        c.closePath();
      }
    }
  }

  function isDeck(f) { return f.properties && f.properties.type_overbruggingsdeel === 'dek'; }

  function paintStatic(c, index, worldRect, worldW, worldH, night, counters) {
    var T = night ? THEMES.night : THEMES.day;
    c.save();
    // Paint ground across the whole cache window...
    c.fillStyle = T.ground;
    c.fillRect(worldRect[0], worldRect[1], worldRect[2] - worldRect[0], worldRect[3] - worldRect[1]);
    // ...then never draw geography outside the requested bbox extent.
    c.beginPath();
    c.rect(0, 0, worldW, worldH);
    c.clip();

    var PAD = 4; // cosmetic strokes / shadows stay within 4 m of a footprint
    var q = [worldRect[0] - PAD, worldRect[1] - PAD, worldRect[2] + PAD, worldRect[3] + PAD];
    var hits = index.query(q, []);
    counters.indexed = hits.length;

    function intersectsWorld(f) {
      var b = f.bounds;
      return !(b[2] < worldRect[0] || b[3] < worldRect[1] ||
               b[0] > worldRect[2] || b[1] > worldRect[3]);
    }

    var drawn = 0;
    function byLayer(key) {
      var out = [];
      for (var i = 0; i < hits.length; i++) if (hits[i].layer === key && intersectsWorld(hits[i].f)) out.push(hits[i].f);
      return out;
    }

    function water(f) {
      traceFeature(c, f);
      c.fillStyle = T.water;
      c.fill('evenodd');
      // Restrained tonal bands / ripples, clipped to the actual water shape.
      c.save();
      traceFeature(c, f);
      c.clip('evenodd');
      var b = f.bounds, w = b[2] - b[0], h = b[3] - b[1];
      c.fillStyle = T.waterDeep;
      if (w >= h) {
        c.fillRect(b[0], b[1] + h * 0.24, w, Math.max(1.2, h * 0.14));
      } else {
        c.fillRect(b[0] + w * 0.24, b[1], Math.max(1.2, w * 0.14), h);
      }
      c.strokeStyle = T.waterRipple;
      c.lineWidth = 1.1;
      var n = w >= h ? 3 : 2;
      c.beginPath();
      for (var k = 0; k < n; k++) {
        var rx = b[0] + 6 + hash01(f.id + ':r' + k) * Math.max(1, w - 40);
        var ry = b[1] + 6 + hash01(f.id + ':r' + k + 'y') * Math.max(1, h - 12);
        var len = 12 + hash01(f.id + ':l' + k) * 16;
        c.moveTo(rx, ry); c.lineTo(Math.min(b[2] - 4, rx + len), ry);
      }
      c.stroke();
      c.restore();
      // Sand quay line sits on the footprint boundary (cosmetic only).
      traceFeature(c, f);
      c.strokeStyle = T.quay;
      c.lineWidth = 1.3;
      c.stroke();
    }

    function road(f) {
      var footway = f.properties && (f.properties.functie === 'voetpad' ||
        f.properties.functie === 'voetgangergebied' || f.properties.functie === 'voetpad op trap');
      traceFeature(c, f);
      c.fillStyle = footway ? T.footway : T.road;
      c.fill('evenodd');
      traceFeature(c, f);
      c.strokeStyle = T.roadEdge;
      c.lineWidth = 0.8;
      c.stroke();
    }

    function pier(f) {
      // Structural parts never take road/deck colours.
      traceFeature(c, f);
      c.fillStyle = T.pier;
      c.fill('evenodd');
      c.save();
      traceFeature(c, f);
      c.clip('evenodd');
      var b = f.bounds;
      c.strokeStyle = 'rgba(255,255,255,.10)';
      c.lineWidth = 0.7;
      c.setLineDash([2.5, 2.5]);
      c.beginPath();
      for (var x = b[0] - (b[3] - b[1]); x < b[2]; x += 5) {
        c.moveTo(x, b[3]); c.lineTo(x + (b[3] - b[1]), b[1]);
      }
      c.stroke();
      c.restore();
      c.setLineDash([]);
      traceFeature(c, f);
      c.strokeStyle = T.pierEdge;
      c.lineWidth = 0.9;
      c.stroke();
    }

    function deck(f) {
      traceFeature(c, f);
      c.fillStyle = T.deck;
      c.fill('evenodd');
      c.save();
      traceFeature(c, f);
      c.clip('evenodd');
      var b = f.bounds;
      var horizontal = (b[2] - b[0]) >= (b[3] - b[1]);
      c.strokeStyle = 'rgba(24,59,72,.18)';
      c.lineWidth = 0.6;
      c.beginPath();
      if (horizontal) {
        for (var x = b[0] + 6; x < b[2] - 3; x += 7) { c.moveTo(x, b[1] + 1); c.lineTo(x, b[3] - 1); }
      } else {
        for (var y = b[1] + 6; y < b[3] - 3; y += 7) { c.moveTo(b[0] + 1, y); c.lineTo(b[2] - 1, y); }
      }
      c.stroke();
      c.restore();
      traceFeature(c, f);
      c.strokeStyle = T.deckEdge;
      c.lineWidth = 1.5;
      c.stroke();
    }

    function buildingShadow(f) {
      // Offset shadow never alters the footprint itself.
      traceFeature(c, f, 2.2, 2.4);
      c.fillStyle = T.shadow;
      c.fill('evenodd');
    }

    function building(f) {
      var r = hash01(f.id);
      var fill;
      if (r < 0.12) fill = T.sandRoof;
      else if (r < 0.55) fill = T.brick[Math.floor(r * 40) % T.brick.length];
      else fill = T.slate[Math.floor(r * 30) % T.slate.length];
      traceFeature(c, f);
      c.fillStyle = fill;
      c.fill('evenodd');
      traceFeature(c, f);
      c.strokeStyle = T.roofEdge;
      c.lineWidth = 0.8;
      c.stroke();
      // One restrained light edge hints at roof tone without inventing facade.
      var b = f.bounds;
      if (b[2] - b[0] >= 6) {
        c.beginPath();
        c.moveTo(b[0] + 0.6, b[1] + 0.6);
        c.lineTo(b[2] - 0.6, b[1] + 0.6);
        c.strokeStyle = T.roofLight;
        c.lineWidth = 0.6;
        c.stroke();
      }
    }

    // Water first, then structural bridge parts inside it, then roads,
    // usable decks, and finally building shadows + footprints.
    byLayer('water').forEach(function (f) { water(f); drawn++; });
    var bridges = byLayer('bridges');
    bridges.forEach(function (f) { if (!isDeck(f)) { pier(f); drawn++; } });
    byLayer('roads').forEach(function (f) { road(f); drawn++; });
    bridges.forEach(function (f) { if (isDeck(f)) { deck(f); drawn++; } });
    var buildings = byLayer('buildings');
    buildings.forEach(buildingShadow);
    buildings.forEach(function (f) { building(f); drawn++; });

    counters.drawn = drawn;
    counters.culled = counters.indexed - drawn;
    c.restore();
  }

  // --------------------------------------------------------------------------
  // Default offscreen canvas factory.
  // --------------------------------------------------------------------------

  function defaultCanvasFactory(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') {
      try { return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ }
    }
    if (typeof document !== 'undefined' && document && document.createElement) {
      try {
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        return cv;
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Renderer instance.
  // --------------------------------------------------------------------------

  function Renderer(data, opts) {
    opts = opts || {};
    var clean = validateData(data);
    this.W = clean.width;
    this.H = clean.height;
    this.layers = clean.layers;
    this.totalFeatures = clean.total;
    this.index = new SpatialIndex(clean.layers, this.W, this.H);
    this.makeCanvas = typeof opts.canvasFactory === 'function' ? opts.canvasFactory : defaultCanvasFactory;
    this.canCache = true;
    this.cityCache = null;
    this.streetCache = null;
    this.metrics = {
      frames: 0,
      cacheBuilds: 0,
      cacheReuses: 0,
      directFrames: 0,
      indexedFeatures: this.totalFeatures,
      indexBuckets: this.index.buckets.length,
      canvasesCreated: 0,
      activeCanvases: 0,
      maxCanvasSide: 0,
      lastFrame: { indexed: 0, culled: 0, drawn: 0, reused: false, kind: '-', night: false }
    };
    this._disposed = false;
  }

  Renderer.prototype._createCanvas = function (w, h) {
    if (!this.canCache) return null;
    var cv;
    try { cv = this.makeCanvas(w, h); } catch (e) { cv = null; }
    if (!cv || typeof cv.getContext !== 'function') {
      // No usable offscreen surface: truthfully fall back to direct draws.
      this.canCache = false;
      this._dropCache('city');
      this._dropCache('street');
      return null;
    }
    var ctx;
    try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) { this.canCache = false; return null; }
    this.metrics.canvasesCreated++;
    this.metrics.activeCanvases++;
    this.metrics.maxCanvasSide = Math.max(this.metrics.maxCanvasSide, w, h);
    return { canvas: cv, ctx: ctx, w: w, h: h };
  };

  Renderer.prototype._dropCache = function (kind) {
    var key = kind === 'city' ? 'cityCache' : 'streetCache';
    if (this[key]) {
      this.metrics.activeCanvases--;
      this[key] = null;
    }
  };

  // Full-world overview cache, fixed resolution regardless of screen size;
  // shared by city zoom 1 and zoom 2.
  Renderer.prototype._acquireCity = function (night) {
    // Pin the binding side exactly at the cap (a naive floor can turn the
    // exact 2048 ratio into 2047).
    var widthBinds = (MAX_CACHE_SIDE / this.W) <= (MAX_CACHE_SIDE / this.H);
    var cw, ch, s0;
    if (widthBinds) {
      cw = MAX_CACHE_SIDE;
      s0 = cw / this.W;
      ch = Math.max(1, Math.floor(this.H * s0));
    } else {
      ch = MAX_CACHE_SIDE;
      s0 = ch / this.H;
      cw = Math.max(1, Math.floor(this.W * s0));
    }
    if (this.cityCache && this.cityCache.night !== night) this._dropCache('city');
    var built = false, counters = { indexed: 0, culled: 0, drawn: 0 };
    if (!this.cityCache) {
      var slot = this._createCanvas(cw, ch);
      if (!slot) return null;
      this.cityCache = {
        slot: slot, night: night, scale: cw / this.W,
        cw: cw, ch: ch, wx: 0, wy: 0, ww: this.W, wh: this.H, counters: counters
      };
      built = true;
    }
    var cache = this.cityCache;
    if (built) {
      var c = cache.slot.ctx;
      c.save();
      c.scale(cache.scale, cache.scale);
      paintStatic(c, this.index, [0, 0, this.W, this.H], this.W, this.H, night, counters);
      c.restore();
      this.metrics.cacheBuilds++;
    } else {
      counters = cache.counters;
      this.metrics.cacheReuses++;
    }
    return { cache: cache, counters: counters, built: built };
  };

  // Padded street cache. The surface element is reused across pans; only its
  // painted contents rebuild. Size/scale/night changes allocate a new one
  // (the old one is released), so live canvases stay bounded.
  Renderer.prototype._acquireStreet = function (night, scale, width, height, vis) {
    var padX = Math.min(220, Math.max(60, width * 0.22));
    var padY = Math.min(180, Math.max(60, height * 0.22));
    var cw = Math.min(MAX_CACHE_SIDE, Math.round(width + padX * 2));
    var ch = Math.min(MAX_CACHE_SIDE, Math.round(height + padY * 2));
    if (cw < width || ch < height) return null; // view itself exceeds the cap
    var winW = cw / scale, winH = ch / scale;
    if (this.streetCache && (this.streetCache.night !== night ||
        this.streetCache.cw !== cw || this.streetCache.ch !== ch ||
        this.streetCache.scale !== scale)) {
      this._dropCache('street');
    }
    var counters = { indexed: 0, culled: 0, drawn: 0 };
    var built = false;
    if (!this.streetCache) {
      var slot = this._createCanvas(cw, ch);
      if (!slot) return null;
      this.streetCache = {
        slot: slot, night: night, scale: scale, cw: cw, ch: ch,
        wx: 0, wy: 0, ww: winW, wh: winH, counters: counters
      };
      built = true;
    }
    var cache = this.streetCache;
    var eps = 1e-6;
    var inside = vis[0] >= cache.wx + eps && vis[1] >= cache.wy + eps &&
                 vis[2] <= cache.wx + cache.ww - eps && vis[3] <= cache.wy + cache.wh - eps;
    if (built || !inside) {
      // Center the fixed-size window on the visible centre, clamped to world.
      var cxv = (vis[0] + vis[2]) / 2, cyv = (vis[1] + vis[3]) / 2;
      var wx = this.W <= winW ? (this.W - winW) / 2 : clamp(cxv - winW / 2, 0, this.W - winW);
      var wy = this.H <= winH ? (this.H - winH) / 2 : clamp(cyv - winH / 2, 0, this.H - winH);
      cache.wx = wx; cache.wy = wy; cache.ww = winW; cache.wh = winH;
      var c = cache.slot.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cw, ch);
      c.restore();
      c.save();
      c.scale(scale, scale);
      c.translate(-wx, -wy);
      counters = { indexed: 0, culled: 0, drawn: 0 };
      paintStatic(c, this.index, [wx, wy, wx + winW, wy + winH], this.W, this.H, night, counters);
      c.restore();
      cache.counters = counters;
      this.metrics.cacheBuilds++;
      built = true;
    } else {
      counters = cache.counters;
      this.metrics.cacheReuses++;
    }
    return { cache: cache, counters: counters, built: built };
  };

  function blitCache(ctx, slot, meta, view) {
    var s = meta.scale; // cache px per metre
    var ix0 = Math.max(0, view.vis[0]), iy0 = Math.max(0, view.vis[1]);
    var ix1 = Math.min(view.W, view.vis[2]), iy1 = Math.min(view.H, view.vis[3]);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    // Cache pixel rect for this world window.
    var sx = (ix0 - meta.wx) * s, sy = (iy0 - meta.wy) * s;
    var sw = (ix1 - ix0) * s, sh = (iy1 - iy0) * s;
    var dx = ix0 * view.scale + view.tx, dy = iy0 * view.scale + view.ty;
    var dw = (ix1 - ix0) * view.scale, dh = (iy1 - iy0) * view.scale;
    ctx.drawImage(slot.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // --------------------------------------------------------------------------
  // View / transform resolution.
  // --------------------------------------------------------------------------

  // Resolve the true drawable size of a laid-out canvas. The requested width
  // (option/attribute/style) is only a hint: max-width:100%, viewport changes
  // and page layout can paint the element at a different size. The canvas's
  // OWN post-layout measurement (getBoundingClientRect, then clientWidth) is
  // authoritative; the requested number is used solely as the no-DOM fallback.
  // Returns logical width/height plus cssWidth equal to the measured width,
  // i.e. the caller draws in CSS pixels after applying its own DPR transform.
  function resolveFrameSize(canvas, requested) {
    requested = requested || {};
    var reqW = isNum(requested.width) && requested.width > 0 ? requested.width : 1100;
    var reqH = isNum(requested.height) && requested.height > 0 ? requested.height : reqW * 640 / 1100;
    var w = 0, h = 0;
    if (canvas && typeof canvas.getBoundingClientRect === 'function') {
      var rect = null;
      try { rect = canvas.getBoundingClientRect(); } catch (e) { rect = null; }
      if (rect) {
        if (isNum(rect.width) && rect.width > 0) w = rect.width;
        if (isNum(rect.height) && rect.height > 0) h = rect.height;
      }
    }
    if (!(w > 0) && canvas && isNum(canvas.clientWidth) && canvas.clientWidth > 0) {
      w = canvas.clientWidth;
      if (!(h > 0) && isNum(canvas.clientHeight) && canvas.clientHeight > 0) h = canvas.clientHeight;
    }
    if (!(w > 0)) w = reqW;
    if (!(h > 0)) h = reqH;
    return { width: w, height: h, cssWidth: w };
  }

  function resolveView(view, o, W, H) {
    view = view || {};
    var width = isNum(o.width) && o.width > 0 ? o.width : 1100;
    var height = isNum(o.height) && o.height > 0 ? o.height : 640;
    var cssWidth = isNum(o.cssWidth) && o.cssWidth > 0 ? o.cssWidth : width;
    var d = width / cssWidth; // logical px per CSS px
    var camera = view.camera === 'street' ? 'street' : 'city';
    var zoom = view.zoom === 2 ? 2 : 1;
    var pos = view.position || null;
    var px = pos && isNum(pos.x) ? pos.x : null;
    var py = pos && isNum(pos.y) ? pos.y : null;
    if (camera === 'street' || (camera === 'city' && zoom === 2)) {
      if (px === null || py === null) {
        fail('finite player position is required for ' + camera + ' zoom ' + zoom);
      }
    }
    var scale, vis;
    if (camera === 'street') {
      scale = 2 * d; // ~2 CSS pixels per metre at any CSS width
      var cx = clamp(px, 0, W), cy = clamp(py, 0, H);
      vis = centeredVis(cx, cy, width / scale, height / scale, W, H);
    } else if (zoom === 1) {
      scale = Math.min(width / W, height / H);
      vis = { x0: (W - width / scale) / 2, y0: (H - height / scale) / 2,
              ww: width / scale, wh: height / scale };
    } else {
      scale = Math.min(width / W, height / H) * 2;
      var cx2 = clamp(px, 0, W), cy2 = clamp(py, 0, H);
      vis = centeredVis(cx2, cy2, width / scale, height / scale, W, H);
    }
    var tx = -vis.x0 * scale, ty = -vis.y0 * scale;
    return {
      width: width, height: height, cssWidth: cssWidth, d: d,
      camera: camera, zoom: zoom, night: !!view.afterHours,
      scale: scale, tx: tx, ty: ty,
      vis: [vis.x0, vis.y0, vis.x0 + vis.ww, vis.y0 + vis.wh],
      W: W, H: H,
      player: px === null ? null : { x: px, y: py },
      reduced: !!view.reducedMotion,
      time: isNum(view.time) ? view.time : 0
    };
  }

  function centeredVis(cx, cy, spanW, spanH, W, H) {
    var x0, y0;
    if (spanW >= W) x0 = (W - spanW) / 2;
    else x0 = clamp(cx - spanW / 2, 0, W - spanW);
    if (spanH >= H) y0 = (H - spanH) / 2;
    else y0 = clamp(cy - spanH / 2, 0, H - spanH);
    return { x0: x0, y0: y0, ww: spanW, wh: spanH };
  }

  // --------------------------------------------------------------------------
  // Dynamic overlays.
  // --------------------------------------------------------------------------

  function validatePlaces(places, where) {
    if (places === undefined || places === null) return [];
    if (!Array.isArray(places)) fail(where + ' must be an array');
    return places.map(function (p, i) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string') {
        fail(where + '[' + i + '] needs string id and name');
      }
      if (!isNum(p.x) || !isNum(p.y)) fail(where + '[' + i + '] (' + p.id + ') needs finite x,y');
      return { id: p.id, name: p.name, district: typeof p.district === 'string' ? p.district : '',
        icon: typeof p.icon === 'string' ? p.icon : '', x: p.x, y: p.y };
    });
  }

  function drawRoute(ctx, view, gameView) {
    var path = Array.isArray(gameView.path) ? gameView.path : [];
    var start = view.player;
    if (!start || !path.length) return;
    var pts = [{ x: start.x, y: start.y }];
    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      if (p && isNum(p.x) && isNum(p.y)) pts.push({ x: p.x, y: p.y, transport: p.transport });
    }
    if (pts.length < 2) return;
    var screen = pts.map(function (p) { return worldToScreen(view, p.x, p.y); });
    var t = view.reduced ? 0 : view.time;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var seg = 0; seg < screen.length - 1; seg++) {
      var a = screen[seg], b = screen[seg + 1];
      var ferry = pts[seg].transport === 'ferry' || pts[seg + 1].transport === 'ferry';
      var T = view.night ? THEMES.night : THEMES.day;
      function strokePair(color, w, dash) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (dash) {
          ctx.setLineDash(dash.size);
          ctx.lineDashOffset = ferry ? 0 : -t * 12;
        } else {
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.stroke();
      }
      if (ferry) {
        // Distinct cool dashed connection; never a land surface.
        strokePair(T.routeUnder, 8 * view.d, { size: [3 * view.d, 7 * view.d] });
        strokePair(T.ferry, 3.4 * view.d, { size: [11 * view.d, 8 * view.d] });
      } else {
        strokePair(T.routeUnder, 8 * view.d, { size: [10 * view.d, 9 * view.d] });
        strokePair(T.routeGold, 4.4 * view.d, { size: [10 * view.d, 9 * view.d] });
      }
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.restore();
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Screen-space rectangles owned by the HUD (mode chip, scale bar with its
  // label, source credit). Labels must not cover them. Geometry mirrors
  // drawHud exactly.
  function hudRects(view) {
    var d = view.d, width = view.width, height = view.height;
    var rects = [];
    var mode = (view.night ? '夜间' : '白天') + ' · ' +
      (view.camera === 'street' ? '街头视角'
        : (view.zoom === 2 ? '全城地图 · 近景' : '全城地图'));
    var chipW = estimateTextWidth(mode, 12 * d) + 22 * d;
    rects.push({ x: 12 * d, y: 12 * d, w: chipW, h: 27 * d });
    var cssPerM = view.scale / d;
    var steps = [10, 20, 50, 100, 200, 500, 1000, 2000];
    var metres = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * cssPerM >= 72) { metres = steps[i]; break; }
    }
    var barW = metres * view.scale;
    // The value label's baseline sits ~5d above the bar; reserve its ascent.
    rects.push({ x: 11 * d, y: height - 52 * d, w: barW + 8 * d, h: 26 * d });
    var cw = estimateTextWidth(SOURCE_CREDIT, 11 * d);
    rects.push({ x: width - cw - 16 * d, y: height - 26 * d, w: cw + 12 * d, h: 20 * d });
    return rects;
  }

  // Build the (at most two) screen-space labels, jointly. The selected chip is
  // reserved first at full size (wrapping long names, never shrinking); the
  // nearest label earns a slot only when it clears the selected chip, the
  // avatar, the viewport and the HUD. When no joint slot exists the nearest
  // label is skipped (its marker is always kept), never drawn on top.
  function layoutLabels(view, gameView, anchors, measureCtx) {
    var width = view.width, height = view.height, d = view.d;
    var measure = makeMeasurer(measureCtx);
    var selectedId = null;
    if (typeof gameView.target === 'string') selectedId = gameView.target;
    else if (gameView.mode === 'place' && typeof gameView.place === 'string') selectedId = gameView.place;
    var selected = null, nearest = null;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].id === selectedId) selected = anchors[i];
    }
    if (view.player) {
      var best = Infinity;
      for (var j = 0; j < anchors.length; j++) {
        var a = anchors[j];
        if (selected && a.id === selected.id) continue;
        var dist = Math.hypot(a.x - view.player.x, a.y - view.player.y);
        if (view.camera === 'street' && dist > 60) continue;
        if (dist < best) { best = dist; nearest = a; }
      }
    }

    var acx = width / 2, acy = height / 2;
    if (view.player) {
      var ps = worldToScreen(view, view.player.x, view.player.y);
      acx = ps.x; acy = ps.y;
    }
    var clearance = 13 * d;
    var avatarRect = view.player
      ? { x: acx - clearance, y: acy - clearance, w: clearance * 2, h: clearance * 2 }
      : null;
    var hud = hudRects(view);
    var gap = 2 * d; // breathing room between reserved rectangles

    function overlapsRect(r, b, pad) {
      pad = pad || 0;
      return rectsOverlap(r.x, r.y, r.w, r.h, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
    }

    // A clamped candidate is usable only when it truly stays on screen and
    // clears the avatar plus every HUD zone (with the shared gap).
    function blocked(r) {
      if (r.x < 4 - 1e-6 || r.y < 4 - 1e-6 ||
          r.x + r.w > width - 4 + 1e-6 || r.y + r.h > height - 4 + 1e-6) return true;
      if (avatarRect && overlapsRect(r, avatarRect, gap)) return true;
      for (var i = 0; i < hud.length; i++) if (overlapsRect(r, hud[i], gap)) return true;
      return false;
    }

    function chipSize(place, sel) {
      var fontCss = sel ? 12 : 11;
      var fp = fontCss * d;
      var padX = 7 * d, padY = 4 * d, lineH = fp * 1.24;
      var maxChipW = Math.max(96 * d, Math.min(210 * d, width * 0.62));
      var lines;
      if (sel) {
        lines = wrapText(place.name, fp, maxChipW - 2 * padX, measure);
      } else {
        // Non-selected names stay on one line and are skipped if they cannot fit.
        if (measure(place.name, fp) + 2 * padX > Math.min(maxChipW, width - 8)) return null;
        lines = [place.name];
      }
      var textW = 0;
      for (var k = 0; k < lines.length; k++) textW = Math.max(textW, measure(lines[k], fp));
      var bw = textW + 2 * padX, bh = lines.length * lineH + 2 * padY;
      var mr = (view.camera === 'street' ? 10.5 : 8.5) * d + (sel ? 1.5 * d : 0);
      return {
        place: place, sel: sel, fontCss: fontCss, fp: fp, padX: padX, padY: padY,
        lineH: lineH, lines: lines, bw: bw, bh: bh, mr: mr,
        anchor: worldToScreen(view, place.x, place.y)
      };
    }

    function candidates(sz) {
      var a = sz.anchor;
      var bases = [
        { x: a.x - sz.bw / 2, y: a.y - sz.mr - 7 * d - sz.bh },
        { x: a.x - sz.bw / 2, y: a.y + sz.mr + 7 * d },
        { x: a.x + sz.mr + 7 * d, y: a.y - sz.bh / 2 },
        { x: a.x - sz.mr - 7 * d - sz.bw, y: a.y - sz.bh / 2 }
      ];
      var out = [];
      for (var k = 0; k < bases.length; k++) {
        out.push({
          x: clamp(bases[k].x, 4, Math.max(4, width - 4 - sz.bw)),
          y: clamp(bases[k].y, 4, Math.max(4, height - 4 - sz.bh)),
          w: sz.bw, h: sz.bh
        });
      }
      return out;
    }

    function makeRecord(sz, r) {
      return {
        id: sz.place.id, text: sz.place.name, x: r.x, y: r.y, width: r.w, height: r.h,
        fontCssPx: sz.fontCss, lines: sz.lines, selected: sz.sel,
        padX: sz.padX, padY: sz.padY, lineH: sz.lineH, fp: sz.fp
      };
    }

    var labels = [];
    var nearSize = nearest ? chipSize(nearest, false) : null;

    if (selected) {
      var selSize = chipSize(selected, true);
      var selCands = candidates(selSize).filter(function (r) { return !blocked(r); });
      var nearCands = nearSize ? candidates(nearSize).filter(function (r) { return !blocked(r); }) : [];

      var pickedSel = null, pickedNear = null;
      if (!nearSize) {
        if (selCands.length) pickedSel = selCands[0];
      } else {
        // Joint search over the (at most) two chips: prefer the selected chip's
        // best side, but move it to another side when that lets both labels
        // render without touching.
        for (var si = 0; si < selCands.length && !pickedSel; si++) {
          for (var ni = 0; ni < nearCands.length; ni++) {
            if (!overlapsRect(selCands[si], nearCands[ni], gap)) {
              pickedSel = selCands[si];
              pickedNear = nearCands[ni];
              break;
            }
          }
        }
      }

      if (!pickedSel) {
        // The selected name is always shown. Use its best valid slot, or the
        // avatar-clearance fallback at edges / extreme aspect ratios.
        if (selCands.length) {
          pickedSel = selCands[0];
        } else {
          var yTop = acy - clearance - 7 * d - selSize.bh;
          var yBot = acy + clearance + 7 * d;
          var cy = yTop >= 4 ? yTop : yBot;
          pickedSel = {
            x: clamp(selSize.anchor.x - selSize.bw / 2, 4, Math.max(4, width - 4 - selSize.bw)),
            y: clamp(cy, 4, Math.max(4, height - 4 - selSize.bh)),
            w: selSize.bw, h: selSize.bh
          };
        }
        // A nearest label may still fit beside a forced selected rectangle.
        if (nearSize && !pickedNear) {
          for (var k2 = 0; k2 < nearCands.length; k2++) {
            if (!overlapsRect(pickedSel, nearCands[k2], gap)) { pickedNear = nearCands[k2]; break; }
          }
        }
      }

      labels.push(makeRecord(selSize, pickedSel));
      if (nearSize && pickedNear) labels.push(makeRecord(nearSize, pickedNear));
    } else if (nearSize) {
      var free = candidates(nearSize).filter(function (r) { return !blocked(r); });
      if (free.length) labels.push(makeRecord(nearSize, free[0]));
    }
    return labels;
  }

  function drawLabels(ctx, view, labels) {
    var T = view.night ? THEMES.night : THEMES.day;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    labels.forEach(function (lb) {
      ctx.fillStyle = lb.selected ? T.chipActive : T.chip;
      ctx.strokeStyle = T.chipBorder;
      ctx.lineWidth = 1;
      ctx.fillRect(lb.x, lb.y, lb.width, lb.height);
      ctx.strokeRect(lb.x, lb.y, lb.width, lb.height);
      ctx.fillStyle = lb.selected ? T.chipActiveInk : T.chipInk;
      ctx.font = labelFont(lb.fp);
      for (var i = 0; i < lb.lines.length; i++) {
        ctx.fillText(lb.lines[i], lb.x + lb.padX, lb.y + lb.padY + lb.fp * 0.92 + i * lb.lineH);
      }
    });
    ctx.restore();
  }

  function drawMarkers(ctx, view, anchors, selectedId) {
    var T = view.night ? THEMES.night : THEMES.day;
    var d = view.d;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    anchors.forEach(function (place) {
      var s = worldToScreen(view, place.x, place.y);
      if (s.x < -30 || s.x > view.width + 30 || s.y < -30 || s.y > view.height + 30) return;
      var sel = place.id === selectedId;
      var known = view.player && view.positionVisited && view.positionVisited.indexOf(place.id) !== -1;
      var r = (view.camera === 'street' ? 10.5 : 8.5) * d + (sel ? 1.5 * d : 0);
      ctx.beginPath();
      ctx.arc(s.x, s.y + 1.5 * d, r, 0, Math.PI * 2);
      ctx.fillStyle = T.markerOuter;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r - 1.6 * d, 0, Math.PI * 2);
      ctx.fillStyle = sel ? PALETTE.lamp : (known ? T.markerVisited : T.markerInner);
      ctx.fill();
      if (place.icon) {
        ctx.fillStyle = sel ? '#24313a' : '#f0e6cc';
        ctx.font = (11 * d) + 'px sans-serif';
        ctx.fillText(place.icon, s.x, s.y + 0.5 * d);
      }
    });
    ctx.restore();
  }

  function drawBike(ctx, x, y, s, color) {
    var T = ctx._theme;
    ctx.save();
    ctx.strokeStyle = color || T.bike;
    ctx.lineWidth = 1.7 * s;
    ctx.lineCap = 'round';
    for (var i = 0; i < 2; i++) {
      var wx = x + (i ? 6.5 : -6.5) * s, wy = y + 4.5 * s;
      ctx.beginPath();
      ctx.arc(wx, wy, 4.4 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - 6.5 * s, y + 4.5 * s);
    ctx.lineTo(x - 2 * s, y - 2 * s);
    ctx.lineTo(x + 2.5 * s, y + 4.5 * s);
    ctx.lineTo(x - 6.5 * s, y + 4.5 * s);
    ctx.moveTo(x + 6.5 * s, y + 4.5 * s);
    ctx.lineTo(x - 2 * s, y - 2 * s);
    ctx.moveTo(x + 2.5 * s, y + 4.5 * s);
    ctx.lineTo(x + 4 * s, y - 3.5 * s);
    ctx.lineTo(x + 7.5 * s, y - 3.5 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawCart(ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = '#927752';
    ctx.fillRect(x - 9 * s, y - 5 * s, 18 * s, 10 * s);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.4 * s;
    ctx.strokeRect(x - 9 * s, y - 5 * s, 18 * s, 10 * s);
    ctx.fillStyle = '#294b51';
    ctx.beginPath(); ctx.arc(x - 6 * s, y + 7 * s, 2.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6 * s, y + 7 * s, 2.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.lamp;
    ctx.beginPath(); ctx.arc(x, y - 8 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawActor(ctx, view, gameView) {
    if (!view.player) return;
    var T = view.night ? THEMES.night : THEMES.day;
    var d = view.d;
    var p = worldToScreen(view, view.player.x, view.player.y);
    var bike = gameView.position && gameView.position.bike;
    var mounted = !!(bike && bike.mounted);
    var s = d;
    ctx.save();
    // Shadow.
    ctx.fillStyle = 'rgba(10,30,38,.30)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 8.5 * s, 9 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mounted && isNum(bike.x) && isNum(bike.y)) {
      drawBike(ctx, p.x, p.y + 2 * s, s, T.bike);
    }
    // Body circle is 14.4 CSS px across (within the 14-18 CSS target);
    // head/cap/legs add screen presence without changing collision radius.
    ctx.fillStyle = T.actor;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 1 * s, 7.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.actorHead;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 8.2 * s, 4.1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.actorCap;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 9.4 * s, 4.1 * s, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(p.x - 4.2 * s, p.y - 9.8 * s, 8.4 * s, 1.4 * s);
    // Legs (animated only when motion is allowed).
    var swing = (!view.reduced && mounted) ? Math.sin(view.time * 6) * 1.6 * s : 0;
    ctx.strokeStyle = T.actor;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - 2.4 * s, p.y + 6 * s);
    ctx.lineTo(p.x - 3.4 * s + swing, p.y + 10.5 * s);
    ctx.moveTo(p.x + 2.4 * s, p.y + 6 * s);
    ctx.lineTo(p.x + 3.4 * s - swing, p.y + 10.5 * s);
    ctx.stroke();
    ctx.restore();

    // Parked bike uses the passed coordinates exactly.
    if (!mounted && bike && isNum(bike.x) && isNum(bike.y)) {
      var bs = worldToScreen(view, bike.x, bike.y);
      drawBike(ctx, bs.x, bs.y, s, T.bike);
    }
    var cart = gameView.flowerCart;
    if (cart && isNum(cart.x) && isNum(cart.y)) {
      var cs = worldToScreen(view, cart.x, cart.y);
      drawCart(ctx, cs.x, cs.y, s);
    }
  }

  function drawHud(ctx, view) {
    var T = view.night ? THEMES.night : THEMES.day;
    var d = view.d, width = view.width, height = view.height;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // Mode chip, top-left.
    var mode = (view.night ? '夜间' : '白天') + ' · ' +
      (view.camera === 'street' ? '街头视角' : (view.zoom === 2 ? '全城地图 · 近景' : '全城地图'));
    ctx.font = '600 ' + (12 * d) + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    var chipW = estimateTextWidth(mode, 12 * d) + 22 * d;
    ctx.fillStyle = T.hud;
    ctx.fillRect(12 * d, 12 * d, chipW, 27 * d);
    ctx.fillStyle = T.hudText;
    ctx.textAlign = 'left';
    ctx.fillText(mode, 23 * d, 30.5 * d);

    // Scale bar: round metres landing between ~72 and ~150 CSS px.
    var cssPerM = view.scale / d;
    var steps = [10, 20, 50, 100, 200, 500, 1000, 2000];
    var metres = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * cssPerM >= 72) { metres = steps[i]; break; }
    }
    var barW = metres * view.scale, barH = 5 * d, bx = 14 * d, by = height - 34 * d;
    ctx.fillStyle = T.scaleBarEdge;
    ctx.fillRect(bx - 1.5 * d, by - 1.5 * d, barW + 3 * d, barH + 3 * d);
    ctx.fillStyle = T.scaleBar;
    ctx.fillRect(bx, by, barW, barH);
    ctx.font = (11 * d) + 'px ui-monospace,Menlo,monospace';
    ctx.fillStyle = T.hudText;
    var label = metres >= 1000 ? (metres / 1000) + ' km' : metres + ' m';
    ctx.fillText(label, bx, by - 5 * d);

    // Source credit, never shortened.
    ctx.font = (11 * d) + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.textAlign = 'right';
    var credit = SOURCE_CREDIT;
    var cw = estimateTextWidth(credit, 11 * d);
    ctx.fillStyle = T.hud;
    ctx.fillRect(width - cw - 16 * d, height - 26 * d, cw + 12 * d, 20 * d);
    ctx.fillStyle = T.hudTextDim;
    ctx.fillText(credit, width - 10 * d, height - 12 * d);
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // Public draw.
  // --------------------------------------------------------------------------

  Renderer.prototype.draw = function (ctx, gameView, options) {
    if (!ctx || typeof ctx !== 'object') fail('draw requires a 2D context');
    gameView = gameView || {};
    var o = options || {};
    var places = validatePlaces(o.places, 'options.places');
    var gardenEntry = o.gardenEntry ? validatePlaces([o.gardenEntry], 'options.gardenEntry')[0] : null;
    var view = resolveView(gameView, o, this.W, this.H);
    var night = view.night;
    var T = night ? THEMES.night : THEMES.day;
    this.metrics.frames++;

    // The caller's DPR transform and styles are preserved across the frame.
    ctx.save();

    // Letterbox / backdrop.
    ctx.fillStyle = T.ground;
    ctx.fillRect(0, 0, view.width, view.height);

    var counters, frameBuilt;
    if (view.camera === 'city') {
      var got = this._acquireCity(night);
      if (got) {
        blitCache(ctx, got.cache.slot, got.cache, view);
        counters = got.counters; frameBuilt = got.built;
      } else {
        counters = this._directPaint(ctx, view, night); frameBuilt = true;
      }
    } else {
      var gotS = this._acquireStreet(night, view.scale, view.width, view.height, view.vis);
      if (gotS) {
        blitCache(ctx, gotS.cache.slot, gotS.cache, view);
        counters = gotS.counters; frameBuilt = gotS.built;
      } else {
        counters = this._directPaint(ctx, view, night); frameBuilt = true;
      }
    }

    // World-space clip is only relevant for direct painting; caches already
    // clip themselves.
    var anchors = places.slice();
    if (gardenEntry && gameView.garden) anchors.push(gardenEntry);

    drawRoute(ctx, view, gameView);

    var selectedId = typeof gameView.target === 'string' ? gameView.target
      : (gameView.mode === 'place' && typeof gameView.place === 'string' ? gameView.place : null);

    // Labels are reserved before markers/actor are drawn so chips never sit
    // under the avatar; markers draw above surfaces, actor above everything.
    var playerView = Object.assign({}, view, {
      positionVisited: gameView.position && Array.isArray(gameView.position.visited)
        ? gameView.position.visited : null
    });
    // The live context supplies true text metrics; chips reserve rectangles
    // from the same metrics the glyphs are painted with.
    var labels = layoutLabels(playerView, gameView, anchors, ctx);
    drawLabels(ctx, playerView, labels);
    drawMarkers(ctx, playerView, anchors, selectedId);
    drawActor(ctx, view, gameView);
    drawHud(ctx, view);

    ctx.restore();

    this.metrics.lastFrame = {
      indexed: counters.indexed, culled: counters.culled, drawn: counters.drawn,
      reused: !frameBuilt,
      kind: view.camera + (view.camera === 'city' ? view.zoom : ''),
      night: night
    };

    var markers = anchors.map(function (place) {
      var s = worldToScreen(view, place.x, place.y);
      var sel = place.id === selectedId;
      var radius = (view.camera === 'street' ? 10.5 : 8.5) * view.d + (sel ? 1.5 * view.d : 0);
      return { id: place.id, x: s.x, y: s.y, radius: radius };
    });
    var labelRecords = labels.map(function (lb) {
      return { id: lb.id, text: lb.text, x: lb.x, y: lb.y, width: lb.width, height: lb.height, fontCssPx: lb.fontCssPx };
    });

    return {
      transform: { scale: view.scale, tx: view.tx, ty: view.ty },
      markers: markers,
      labels: labelRecords,
      visibleBounds: [view.vis[0], view.vis[1], view.vis[2], view.vis[3]]
    };
  };

  Renderer.prototype._directPaint = function (ctx, view, night) {
    var counters = { indexed: 0, culled: 0, drawn: 0 };
    ctx.save();
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);
    paintStatic(ctx, this.index,
      [Math.max(0, view.vis[0]), Math.max(0, view.vis[1]),
       Math.min(this.W, view.vis[2]), Math.min(this.H, view.vis[3])],
      this.W, this.H, night, counters);
    ctx.restore();
    this.metrics.directFrames++;
    return counters;
  };

  Renderer.prototype.stats = function () { return this.metrics; };
  Renderer.prototype.statsSnapshot = function () { return this.metrics; };

  Renderer.prototype.dispose = function () {
    this._dropCache('city');
    this._dropCache('street');
    this._disposed = true;
  };

  function create(data, options) { return new Renderer(data, options || {}); }

  return {
    create: create,
    PALETTE: PALETTE,
    SOURCE_CREDIT: SOURCE_CREDIT,
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld,
    estimateTextWidth: estimateTextWidth,
    wrapText: wrapText,
    resolveFrameSize: resolveFrameSize,
    // Exposed for synthetic benchmarks/tests only.
    _internals: {
      validateData: validateData,
      SpatialIndex: SpatialIndex,
      paintStatic: paintStatic,
      traceFeature: traceFeature,
      resolveView: resolveView,
      resolveFrameSize: resolveFrameSize,
      layoutLabels: layoutLabels,
      hudRects: hudRects,
      labelFont: labelFont,
      makeMeasurer: makeMeasurer,
      THEMES: THEMES,
      MAX_CACHE_SIDE: MAX_CACHE_SIDE
    }
  };
});

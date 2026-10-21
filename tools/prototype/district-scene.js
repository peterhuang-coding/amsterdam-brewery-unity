/*
 * District scene — independent shape-first city overview / local district
 * presentation module.
 *
 * UMD: window.DistrictScene and CommonJS module.exports.
 * No imports, no fetch, no network, no dependency on legacy game objects
 * (never touches City.LAND / WATERS / CROSSINGS or hardcoded geometry).
 *
 * World coordinates are local equirectangular metres, y down. Screen and
 * world share orientation, so the camera is a uniform positive scale plus a
 * translation:  sx = x * scale + tx, sy = y * scale + ty.
 *
 * The backing store is derived every frame from the canvas CSS CONTENT box
 * (border/padding excluded). The author's CSS is never written to, so there
 * is no width/height feedback loop. DPR is clamped to 2 and each backing
 * dimension to 2048.
 *
 * Static geography (shapes, district names, schematic travel links) is
 * painted once into a single offscreen canvas and rebuilt only when the data
 * identity/mapVersion, content viewport or DPR, camera world window, mode or
 * day/night changes. Actors, the supplied route, markers and labels are
 * redrawn live on the visible canvas.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DistrictScene = api.DistrictScene;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BACKING_SIDE = 2048;
  var MAX_DPR = 2;
  var STREET_ZOOM = 2.6;
  var SHAPE_KINDS = ['water', 'road', 'bridge', 'building'];
  var SHORT_CREDIT = 'Map data: Kadaster / PDOK BGT · CC0-1.0';

  // Warm stone/brick ground with the game's muted canal blue. Night tones
  // mirror the accepted renderer so the two presentations feel related.
  var THEMES = {
    day: {
      ground: '#cfc7ac',
      texture: 'rgba(122,108,76,.10)',
      water: '#378e9b', waterDeep: '#2c7d89', waterRipple: 'rgba(216,238,240,.18)',
      quay: '#c2b28b',
      road: '#e8e1cc', roadEdge: 'rgba(122,108,76,.35)',
      bridge: '#ddd2b4', bridgeEdge: '#a9976f',
      brick: ['#ad6549', '#b87356', '#a55f45'],
      slate: ['#33505c', '#3d5863'], sandRoof: '#d3c29c',
      shadow: 'rgba(18,40,48,.18)', roofEdge: 'rgba(24,59,72,.22)', roofLight: 'rgba(255,246,214,.10)',
      linkStreet: 'rgba(96,107,114,.75)', linkFerry: '#dceef2', linkFerryUnder: 'rgba(16,44,56,.5)',
      routeUnder: 'rgba(16,44,56,.45)', routeGold: '#f2cd7e',
      markerOuter: '#183b48', markerInner: '#33525c', markerVisited: '#3f6b54', markerActive: '#ffd184',
      pulse: 'rgba(255,209,132,.75)',
      actor: '#243f47', actorHead: '#d4aa73', actorCap: '#b86b4c', bike: '#bb8254',
      cart: '#927752', gardenKnown: '#5f7f5b', gardenUnknown: 'rgba(95,127,91,.45)',
      chip: 'rgba(244,236,214,.94)', chipInk: '#183b48', chipBorder: 'rgba(24,59,72,.35)',
      chipActive: 'rgba(255,209,132,.96)', chipActiveInk: '#24313a',
      leader: 'rgba(24,59,72,.45)',
      hud: 'rgba(24,59,72,.72)', hudText: '#f0e7cd', hudTextDim: '#d8cfa9',
      scaleBar: '#f3ead2', scaleBarEdge: '#183b48',
      districtLabel: 'rgba(56,74,60,.78)', districtHalo: 'rgba(247,241,222,.75)'
    },
    night: {
      ground: '#102733',
      texture: 'rgba(150,180,190,.07)',
      water: '#235d6c', waterDeep: '#1b4855', waterRipple: 'rgba(214,236,232,.12)',
      quay: '#8f886d',
      road: '#314d5a', roadEdge: 'rgba(150,180,190,.22)',
      bridge: '#6f6a55', bridgeEdge: '#8f886d',
      brick: ['#7c4937', '#87503c', '#6f4232'],
      slate: ['#1d3540', '#243f4a'], sandRoof: '#7d7459',
      shadow: 'rgba(4,14,22,.42)', roofEdge: 'rgba(0,0,0,.30)', roofLight: 'rgba(255,246,214,.06)',
      linkStreet: 'rgba(150,170,180,.55)', linkFerry: '#cfe8f0', linkFerryUnder: 'rgba(6,20,28,.55)',
      routeUnder: 'rgba(6,20,28,.55)', routeGold: '#ffd184',
      markerOuter: '#0c212b', markerInner: '#2a4a57', markerVisited: '#35594c', markerActive: '#ffd184',
      pulse: 'rgba(255,209,132,.6)',
      actor: '#17303a', actorHead: '#d4aa73', actorCap: '#ce8e4c', bike: '#b99756',
      cart: '#7d6748', gardenKnown: '#4f6b52', gardenUnknown: 'rgba(79,107,82,.4)',
      chip: 'rgba(20,42,52,.94)', chipInk: '#f3d9a6', chipBorder: 'rgba(255,209,132,.30)',
      chipActive: 'rgba(255,209,132,.96)', chipActiveInk: '#24313a',
      leader: 'rgba(255,224,160,.4)',
      hud: 'rgba(10,28,38,.82)', hudText: '#f0d6a0', hudTextDim: '#cdb98d',
      scaleBar: '#f0d6a0', scaleBarEdge: '#0c212b',
      districtLabel: 'rgba(214,224,206,.62)', districtHalo: 'rgba(8,24,32,.6)'
    }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function fail(message) { throw new TypeError('DistrictScene: ' + message); }

  // Deterministic 0..1 FNV hash; cosmetic choices are fixed per feature, never
  // Math.random, so identical views produce identical cached frames.
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

  // Conservative text width estimator (Latin ~0.58em, fullwidth ~1em). The
  // same estimator drives layout and painting, so chips never clip glyphs.
  function estimateTextWidth(text, px) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      var f;
      if (code === 0x20) f = 0.32;
      else if (code >= 0x2E80 && code <= 0xA0CF || code >= 0xFE30) f = 1.0;
      else if (code >= 0x2000 && code <= 0x27BF) f = 0.55;
      else f = 0.58;
      w += f * px;
    }
    return w;
  }

  function labelFont(px, weight) {
    return (weight || '600') + ' ' + px + 'px "PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  }

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

  // Word/character wrapping used only for the active target chip; names are
  // never truncated.
  function wrapLabel(text, px, maxW, measure) {
    var mw = function (t) { return measure(t, px); };
    if (mw(text) <= maxW) return [text];
    var lines = [], line = '';
    function push() { if (line) lines.push(line); line = ''; }
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var code = ch.charCodeAt(0);
      if (ch === ' ' || ch === '\n') {
        if (line && mw(line + ' ') > maxW) { push(); } else { line += ' '; }
        continue;
      }
      if (code >= 0x2E80 && code <= 0xA0CF || code >= 0xFE30) {
        if (line && mw(line + ch) > maxW) push();
        line += ch;
      } else {
        var j = i;
        while (j < text.length && !/\s/.test(text[j])) {
          var u = text[j].charCodeAt(0);
          if (u >= 0x2E80 && u <= 0xA0CF || u >= 0xFE30) break;
          j++;
        }
        var word = text.slice(i, j);
        while (mw(word) > maxW) {
          var cut = Math.max(1, Math.floor(maxW / (px * 0.58)));
          var part = word.slice(0, cut);
          word = word.slice(cut);
          if (line) push();
          line = part; push();
        }
        if (line && mw(line + word) > maxW) push();
        line += word;
        i = j - 1;
      }
    }
    push();
    return lines.length ? lines : [text];
  }

  // Bounded content signature for the district labels painted into the static
  // cache (id + bounds + name hash), so equivalent fresh arrays still reuse.
  function districtSignature(districts) {
    if (!Array.isArray(districts)) return '-';
    var parts = districts.map(function (d) {
      if (!d || typeof d !== 'object') return 'x';
      var b = Array.isArray(d.bounds) ? d.bounds.join(',') : '';
      var e = (d.entrance && isNum(d.entrance.x) && isNum(d.entrance.y))
        ? d.entrance.x + ',' + d.entrance.y : '';
      return d.id + ':' + b + ':' + e + ':' + hash01(String(typeof d.name === 'string' ? d.name : ''));
    });
    return parts.join(';');
  }

  function prettyId(id) {
    return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }

  // --------------------------------------------------------------------------
  // Validation. The attached schema v1 fixtures are trusted data, but required
  // fields and finiteness are enforced so a malformed frame fails loudly
  // instead of drawing NaN geometry.
  // --------------------------------------------------------------------------

  function readPoint(p, where) {
    if (Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1])) return { x: p[0], y: p[1] };
    if (p && typeof p === 'object' && isNum(p.x) && isNum(p.y)) return { x: p.x, y: p.y };
    fail(where + ' is not a finite {x,y} point');
    return null;
  }

  function validateBounds(bounds, where) {
    if (!Array.isArray(bounds) || bounds.length !== 4 ||
        !bounds.every(isNum)) fail(where + ' must be [minX,minY,maxX,maxY] finite numbers');
    if (!(bounds[2] > bounds[0]) || !(bounds[3] > bounds[1])) {
      fail(where + ' must have positive width and height');
    }
    return [bounds[0], bounds[1], bounds[2], bounds[3]];
  }

  function validateData(data) {
    if (!data || typeof data !== 'object') fail('view.data must be the attached schema object');
    if (data.schemaVersion !== 1) fail('view.data.schemaVersion must be 1');
    var bounds = validateBounds(data.bounds, 'view.data.bounds');
    if (!Array.isArray(data.shapes)) fail('view.data.shapes must be an array');
    data.shapes.forEach(function (shape, si) {
      var where = 'view.data.shapes[' + si + ']';
      if (!shape || typeof shape !== 'object') fail(where + ' is not an object');
      if (SHAPE_KINDS.indexOf(shape.kind) === -1) fail(where + ' has unknown kind ' + shape.kind);
      if (!Array.isArray(shape.rings) || !shape.rings.length) fail(where + '.rings must be a non-empty array');
      shape.rings.forEach(function (ring, ri) {
        var rwhere = where + '.rings[' + ri + ']';
        if (!Array.isArray(ring) || ring.length < 3) fail(rwhere + ' needs at least 3 points');
        ring.forEach(function (point, pi) {
          if (!Array.isArray(point) || point.length < 2 || !isNum(point[0]) || !isNum(point[1])) {
            fail(rwhere + '[' + pi + '] is not a finite [x,y] point');
          }
        });
      });
    });
    if (data.markers !== undefined && data.markers !== null && !Array.isArray(data.markers)) {
      fail('view.data.markers must be an array');
    }
    if (data.travelLinks !== undefined && data.travelLinks !== null && !Array.isArray(data.travelLinks)) {
      fail('view.data.travelLinks must be an array');
    }
    return {
      bounds: bounds,
      shapes: data.shapes,
      mapVersion: typeof data.mapVersion === 'string' ? data.mapVersion : (isNum(data.mapVersion) ? String(data.mapVersion) : ''),
      markers: Array.isArray(data.markers) ? data.markers : [],
      anchors: data.anchors && typeof data.anchors === 'object' ? data.anchors : {},
      travelLinks: Array.isArray(data.travelLinks) ? data.travelLinks : []
    };
  }

  function versionOf(data) {
    return typeof data.mapVersion === 'string' ? data.mapVersion
      : (isNum(data.mapVersion) ? String(data.mapVersion) : '');
  }

  function validateView(view, prevalidated) {
    if (!view || typeof view !== 'object') fail('draw(view) requires a view object');
    if (view.mode !== 'overview' && view.mode !== 'district') {
      fail("view.mode must be 'overview' or 'district'");
    }
    if (view.camera !== undefined && view.camera !== null &&
        view.camera !== 'fit' && view.camera !== 'street') {
      fail("view.camera must be 'fit' or 'street'");
    }
    // Static geometry is validated at most once per (data object identity,
    // mapVersion): see DistrictScene#_validatedData. A same-object mutation
    // must bump mapVersion.
    var data = prevalidated || validateData(view.data);
    var street = view.camera === 'street';

    if (!view.position || typeof view.position !== 'object' ||
        !isNum(view.position.x) || !isNum(view.position.y)) {
      fail('view.position needs finite x,y');
    }
    if (view.position.bike !== undefined && view.position.bike !== null) {
      var b = view.position.bike;
      if (typeof b !== 'object' || !isNum(b.x) || !isNum(b.y)) {
        fail('view.position.bike needs finite x,y');
      }
    }
    if (view.position.visited !== undefined && view.position.visited !== null &&
        !Array.isArray(view.position.visited)) {
      fail('view.position.visited must be an array');
    }
    if (Array.isArray(view.path)) {
      view.path.forEach(function (p, i) {
        if (p === null || typeof p === 'object' && p.break === true) return; // explicit schematic gap
        if (!p || typeof p !== 'object' || !isNum(p.x) || !isNum(p.y)) {
          fail('view.path[' + i + '] needs finite x,y (or null for a gap)');
        }
      });
    } else if (view.path !== undefined && view.path !== null) {
      fail('view.path must be an array');
    }
    if (view.target !== undefined && view.target !== null && typeof view.target !== 'string') {
      fail('view.target must be a string id or null');
    }
    ['flowerCart', 'garden'].forEach(function (key) {
      var o = view[key];
      if (o === undefined || o === null) return;
      if (typeof o !== 'object' || !isNum(o.x) || !isNum(o.y)) fail('view.' + key + ' needs finite x,y');
    });
    if (Array.isArray(view.districts)) {
      view.districts.forEach(function (d, i) {
        var where = 'view.districts[' + i + ']';
        if (!d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.name !== 'string') {
          fail(where + ' needs string id and name');
        }
        validateBounds(d.bounds, where + '.bounds');
        if (d.entrance !== undefined && d.entrance !== null &&
            (typeof d.entrance !== 'object' || !isNum(d.entrance.x) || !isNum(d.entrance.y))) {
          fail(where + '.entrance needs finite x,y');
        }
      });
    }
    if (Array.isArray(view.places)) {
      view.places.forEach(function (p, i) {
        var where = 'view.places[' + i + ']';
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.name !== 'string') {
          fail(where + ' needs string id and name');
        }
        if (p.x !== undefined && p.x !== null && !isNum(p.x)) fail(where + '.x must be finite');
        if (p.y !== undefined && p.y !== null && !isNum(p.y)) fail(where + '.y must be finite');
      });
    }
    return { data: data, street: street };
  }

  // --------------------------------------------------------------------------
  // Marker / link resolution. Marker positions come from place details when
  // present, otherwise from the attached overview markers / district anchors.
  // --------------------------------------------------------------------------

  function resolveMarkers(view, data) {
    var dropped = 0;
    var byId = new Map();
    function put(id, x, y, rec) {
      var existing = byId.get(id);
      if (existing) {
        if (!isNum(existing.x) && isNum(x)) { existing.x = x; existing.y = y; }
        if (rec) {
          if (rec.name && (!existing.name || existing._synthetic)) existing.name = rec.name;
          if (rec.icon) existing.icon = rec.icon;
          if (rec.districtId) existing.districtId = rec.districtId;
          existing._synthetic = false;
        }
      } else {
        byId.set(id, {
          id: id, x: isNum(x) ? x : NaN, y: isNum(y) ? y : NaN,
          name: rec && rec.name || prettyId(id),
          icon: rec && rec.icon || '',
          districtId: rec && rec.districtId || '',
          _synthetic: !(rec && rec.name)
        });
      }
    }
    var activeId = typeof view.activeDistrictId === 'string' ? view.activeDistrictId
      : (typeof view.data.id === 'string' ? view.data.id : '');

    if (view.mode === 'overview') {
      data.markers.forEach(function (m) {
        if (!m || typeof m.id !== 'string' || !isNum(m.x) || !isNum(m.y)) { dropped++; return; }
        put(m.id, m.x, m.y, { districtId: typeof m.districtId === 'string' ? m.districtId : '' });
      });
    } else {
      Object.keys(data.anchors).forEach(function (id) {
        var a = data.anchors[id];
        if (!a || !isNum(a.x) || !isNum(a.y)) { dropped++; return; }
        put(id, a.x, a.y, { districtId: activeId });
      });
    }
    (Array.isArray(view.places) ? view.places : []).forEach(function (p) {
      if (view.mode === 'district' && p.districtId && p.districtId !== activeId) return;
      var x = isNum(p.x) ? p.x : NaN, y = isNum(p.y) ? p.y : NaN;
      put(p.id, x, y, {
        name: p.name, icon: typeof p.icon === 'string' ? p.icon : '',
        districtId: typeof p.districtId === 'string' ? p.districtId : ''
      });
    });
    var out = [];
    byId.forEach(function (m) {
      if (!isNum(m.x) || !isNum(m.y)) { dropped++; return; }
      if (view.mode === 'district' && m.districtId && m.districtId !== activeId) { dropped++; return; }
      delete m._synthetic;
      out.push(m);
    });
    return { markers: out, dropped: dropped };
  }

  function resolveLinks(view, data, markers) {
    var dropped = 0;
    var byId = new Map(markers.map(function (m) { return [m.id, m]; }));
    // Real overview links name DISTRICTS in from/to (e.g. "station" ->
    // "noord"). Resolve them through the district entrance documented in the
    // view, falling back to bounds center. A bare id that also matches a
    // marker keeps the older marker-ID endpoint support.
    var districtById = new Map();
    (Array.isArray(view.districts) ? view.districts : []).forEach(function (d) {
      if (d && typeof d === 'object' && typeof d.id === 'string') districtById.set(d.id, d);
    });
    function markerPoint(key) {
      var mm = byId.get(key);
      return mm && isNum(mm.x) && isNum(mm.y) ? { x: mm.x, y: mm.y } : null;
    }
    function districtPoint(id) {
      var d = districtById.get(id);
      if (!d) return null;
      if (d.entrance && isNum(d.entrance.x) && isNum(d.entrance.y)) {
        return { x: d.entrance.x, y: d.entrance.y };
      }
      if (Array.isArray(d.bounds) && d.bounds.length === 4 && d.bounds.every(isNum)) {
        return { x: (d.bounds[0] + d.bounds[2]) / 2, y: (d.bounds[1] + d.bounds[3]) / 2 };
      }
      return null;
    }
    function endpoint(ep) {
      if (ep === null || ep === undefined) return null;
      if (typeof ep === 'string') {
        return markerPoint(ep) || districtPoint(ep);
      }
      if (Array.isArray(ep)) return readPointSafe(ep);
      if (ep && typeof ep === 'object') {
        if (isNum(ep.x) && isNum(ep.y)) return { x: ep.x, y: ep.y };
        if (typeof ep.district === 'string') return districtPoint(ep.district);
        var key = typeof ep.marker === 'string' ? ep.marker : (typeof ep.id === 'string' ? ep.id : null);
        if (key) return markerPoint(key) || districtPoint(key);
      }
      return null;
    }
    var links = [];
    data.travelLinks.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') { dropped++; return; }
      var pts = [];
      if (Array.isArray(raw.points)) {
        for (var i = 0; i < raw.points.length; i++) {
          var pp = raw.points[i] === null ? null : readPointSafe(raw.points[i]);
          if (pp) pts.push(pp);
        }
      } else {
        var a = endpoint(raw.from !== undefined ? raw.from : raw.a);
        var b = endpoint(raw.to !== undefined ? raw.to : raw.b);
        if (a) pts.push(a);
        if (b) pts.push(b);
      }
      if (pts.length < 2) { dropped++; return; }
      var kind = String(raw.kind || raw.mode || raw.type || 'street').toLowerCase();
      var ferry = /ferry|boat|veer/.test(kind);
      links.push({ points: pts, ferry: ferry, id: typeof raw.id === 'string' ? raw.id : '' });
    });
    return { links: links, dropped: dropped };

    function readPointSafe(p) {
      if (Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1])) return { x: p[0], y: p[1] };
      if (p && typeof p === 'object' && isNum(p.x) && isNum(p.y)) return { x: p.x, y: p.y };
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Frame measurement: CSS content box, never author CSS writes.
  // --------------------------------------------------------------------------

  function computedChrome(canvas) {
    var zero = { left: 0, top: 0, right: 0, bottom: 0 };
    try {
      var doc = canvas && canvas.ownerDocument;
      var win = doc && doc.defaultView;
      if (win && typeof win.getComputedStyle === 'function') {
        var cs = win.getComputedStyle(canvas);
        if (cs) {
          function px(prop) {
            var v = parseFloat(cs[prop]);
            return isNum(v) && v > 0 ? v : 0;
          }
          return {
            left: px('borderLeftWidth') + px('paddingLeft'),
            right: px('borderRightWidth') + px('paddingRight'),
            top: px('borderTopWidth') + px('paddingTop'),
            bottom: px('borderBottomWidth') + px('paddingBottom')
          };
        }
      }
    } catch (e) { /* non-CSS embedder: unframed */ }
    return zero;
  }

  function measureContent(canvas, fallbackW, fallbackH) {
    var chrome = computedChrome(canvas);
    var cssW = 0, cssH = 0;
    if (canvas && typeof canvas.getBoundingClientRect === 'function') {
      var rect = null;
      try { rect = canvas.getBoundingClientRect(); } catch (e) { rect = null; }
      if (rect) {
        var cx = chrome.left + chrome.right, cy = chrome.top + chrome.bottom;
        if (isNum(rect.width) && rect.width > cx) cssW = rect.width - cx;
        if (isNum(rect.height) && rect.height > cy) cssH = rect.height - cy;
        if (isNum(rect.left)) chrome._rectLeft = rect.left;
        if (isNum(rect.top)) chrome._rectTop = rect.top;
      }
    }
    if (!(cssW > 0) && canvas && isNum(canvas.clientWidth) && canvas.clientWidth > 0) {
      cssW = canvas.clientWidth;
      if (!(cssH > 0) && isNum(canvas.clientHeight) && canvas.clientHeight > 0) cssH = canvas.clientHeight;
    }
    if (!(cssW > 0)) cssW = fallbackW;
    if (!(cssH > 0)) cssH = fallbackH;
    return { cssW: cssW, cssH: cssH, chrome: chrome };
  }

  function defaultOffscreen(w, h) {
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

  function centerOn(worldMin, worldMax, span, c) {
    var world = worldMax - worldMin;
    if (span >= world) return (worldMin + worldMax) / 2;
    return clamp(c, worldMin + span / 2, worldMax - span / 2);
  }

  // --------------------------------------------------------------------------
  // Static painting. All coordinates passed here are world metres inside the
  // already-translated/scaled context. Every ring of every shape is traced
  // and filled evenodd, so holes and gaps stay empty. Nothing infers
  // collisions: shapes are decoration only.
  // --------------------------------------------------------------------------

  function traceRings(c, shape, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    c.beginPath();
    for (var ri = 0; ri < shape.rings.length; ri++) {
      var ring = shape.rings[ri];
      c.moveTo(ring[0][0] + ox, ring[0][1] + oy);
      for (var k = 1; k < ring.length; k++) c.lineTo(ring[k][0] + ox, ring[k][1] + oy);
      c.closePath();
    }
  }

  function shapeBounds(shape) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shape.rings.forEach(function (ring) {
      ring.forEach(function (p) {
        if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
        if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1];
      });
    });
    return [x0, y0, x1, y1];
  }

  function paintStaticWorld(c, view, data, links, theme, counters) {
    var s = view.scale, vis = view.vis;
    c.save();
    c.beginPath();
    c.rect(vis[0], vis[1], vis[2] - vis[0], vis[3] - vis[1]);
    c.clip();

    // Sparse fixed stone seams: deterministic, bounded and subordinate. They
    // are decoration on the surveyed ground, never painted past the attached
    // data bounds (letterbox bands stay clean).
    var seamMax = 90;
    c.save();
    c.beginPath();
    c.rect(data.bounds[0], data.bounds[1], data.bounds[2] - data.bounds[0], data.bounds[3] - data.bounds[1]);
    c.clip();
    var spanW = vis[2] - vis[0], spanH = vis[3] - vis[1];
    var step = Math.max(18, Math.sqrt(spanW * spanH / seamMax));
    c.strokeStyle = theme.texture;
    c.lineWidth = 0.9 / s;
    c.beginPath();
    var seams = 0;
    for (var gx = Math.floor(vis[0] / step); gx <= Math.ceil(vis[2] / step) && seams < seamMax; gx++) {
      for (var gy = Math.floor(vis[1] / step); gy <= Math.ceil(vis[3] / step) && seams < seamMax; gy++) {
        var key = gx * 73 + gy * 131;
        if (hash01('seam' + key) > 0.3) continue;
        var jx = gx * step + hash01('jx' + key) * step;
        var jy = gy * step + hash01('jy' + key) * step;
        if (hash01('dir' + key) > 0.5) { c.moveTo(jx, jy); c.lineTo(jx + step * 0.4, jy); }
        else { c.moveTo(jx, jy); c.lineTo(jx, jy + step * 0.4); }
        seams++;
      }
    }
    c.stroke();
    c.restore();

    function byKind(kind) {
      var out = [];
      for (var i = 0; i < data.shapes.length; i++) {
        var sh = data.shapes[i];
        if (sh.kind !== kind) continue;
        var b = shapeBounds(sh);
        if (b[2] < vis[0] || b[3] < vis[1] || b[0] > vis[2] || b[1] > vis[3]) continue;
        out.push({ shape: sh, b: b, i: i });
      }
      return out;
    }

    function water(item) {
      var sh = item.shape, b = item.b, w = b[2] - b[0], h = b[3] - b[1], id = 'water' + item.i;
      traceRings(c, sh);
      c.fillStyle = theme.water;
      c.fill('evenodd');
      counters.fills++;
      c.save();
      traceRings(c, sh);
      c.clip('evenodd');
      c.fillStyle = theme.waterDeep;
      if (w >= h) c.fillRect(b[0], b[1] + h * 0.24, w, Math.max(1.2 / s, h * 0.14));
      else c.fillRect(b[0] + w * 0.24, b[1], Math.max(1.2 / s, w * 0.14), h);
      c.strokeStyle = theme.waterRipple;
      c.lineWidth = 1.1 / s;
      c.beginPath();
      var n = w >= h ? 3 : 2;
      for (var k = 0; k < n; k++) {
        var rx = b[0] + 6 + hash01(id + 'r' + k) * Math.max(1, w - 40);
        var ry = b[1] + 6 + hash01(id + 'y' + k) * Math.max(1, h - 12);
        var len = 12 + hash01(id + 'l' + k) * 16;
        c.moveTo(rx, ry);
        c.lineTo(Math.min(b[2] - 4, rx + len), ry);
      }
      c.stroke();
      c.restore();
      traceRings(c, sh);
      c.strokeStyle = theme.quay;
      c.lineWidth = 1.3 / s;
      c.stroke();
    }

    function road(item) {
      traceRings(c, item.shape);
      c.fillStyle = theme.road;
      c.fill('evenodd');
      counters.fills++;
      traceRings(c, item.shape);
      c.strokeStyle = theme.roadEdge;
      c.lineWidth = 0.8 / s;
      c.stroke();
    }

    function bridge(item) {
      var sh = item.shape, b = item.b;
      traceRings(c, sh);
      c.fillStyle = theme.bridge;
      c.fill('evenodd');
      counters.fills++;
      c.save();
      traceRings(c, sh);
      c.clip('evenodd');
      var horizontal = (b[2] - b[0]) >= (b[3] - b[1]);
      c.strokeStyle = 'rgba(24,59,72,.18)';
      c.lineWidth = 0.6 / s;
      c.beginPath();
      var gap = 5;
      if (horizontal) {
        for (var x = b[0] + gap; x < b[2] - 2; x += gap) { c.moveTo(x, b[1] + 1 / s); c.lineTo(x, b[3] - 1 / s); }
      } else {
        for (var y = b[1] + gap; y < b[3] - 2; y += gap) { c.moveTo(b[0] + 1 / s, y); c.lineTo(b[2] - 1 / s, y); }
      }
      c.stroke();
      c.restore();
      traceRings(c, sh);
      c.strokeStyle = theme.bridgeEdge;
      c.lineWidth = 1.5 / s;
      c.stroke();
    }

    function building(item) {
      var sh = item.shape, b = item.b, r = hash01('building' + item.i), fill;
      traceRings(c, sh, 2.2 / s, 2.4 / s);
      c.fillStyle = theme.shadow;
      c.fill('evenodd');
      counters.fills++;
      if (r < 0.12) fill = theme.sandRoof;
      else if (r < 0.55) fill = theme.brick[Math.floor(r * 40) % theme.brick.length];
      else fill = theme.slate[Math.floor(r * 30) % theme.slate.length];
      traceRings(c, sh);
      c.fillStyle = fill;
      c.fill('evenodd');
      counters.fills++;
      traceRings(c, sh);
      c.strokeStyle = theme.roofEdge;
      c.lineWidth = 0.8 / s;
      c.stroke();
      if (b[2] - b[0] >= 6) {
        c.beginPath();
        c.moveTo(b[0] + 0.6, b[1] + 0.6);
        c.lineTo(b[2] - 0.6, b[1] + 0.6);
        c.strokeStyle = theme.roofLight;
        c.lineWidth = 0.6 / s;
        c.stroke();
      }
    }

    byKind('water').forEach(water);
    byKind('road').forEach(road);
    byKind('bridge').forEach(bridge);
    byKind('building').forEach(building);

    // Schematic travel links: streets read as quiet solid survey lines; the
    // ferry/boat journey is a visibly different cool dashed line. Neither is a
    // claim of walkable ground.
    links.forEach(function (link) {
      c.beginPath();
      link.points.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
      if (link.ferry) {
        c.setLineDash([11 / s, 8 / s]);
        c.strokeStyle = theme.linkFerryUnder;
        c.lineWidth = 5 / s;
        c.stroke();
        c.strokeStyle = theme.linkFerry;
        c.lineWidth = 2.6 / s;
        c.stroke();
        c.setLineDash([]);
        link.points.forEach(function (p) {
          c.beginPath();
          c.arc(p.x, p.y, 2.4 / s, 0, Math.PI * 2);
          c.fillStyle = theme.linkFerry;
          c.fill();
          counters.fills++;
        });
        if (link.id) {
          // Schematic line label (e.g. the F3 ferry number), kept tiny and
          // haloed; it annotates the journey, not walkable ground.
          c.save();
          var mx = 0, my = 0;
          link.points.forEach(function (p) { mx += p.x; my += p.y; });
          mx /= link.points.length; my /= link.points.length;
          var fpx = 11 / s;
          c.font = '700 ' + fpx + 'px system-ui,sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.lineWidth = 3 / s;
          c.strokeStyle = theme.linkFerryUnder;
          c.strokeText(link.id, mx, my);
          c.fillStyle = theme.linkFerry;
          c.fillText(link.id, mx, my);
          c.restore();
        }
      } else {
        c.setLineDash([6 / s, 5 / s]);
        c.strokeStyle = theme.linkStreet;
        c.lineWidth = 1.6 / s;
        c.stroke();
        c.setLineDash([]);
      }
    });

    c.restore();
  }

  // --------------------------------------------------------------------------
  // DistrictScene
  // --------------------------------------------------------------------------

  function DistrictScene(canvas, options) {
    if (!canvas || typeof canvas !== 'object' || typeof canvas.getContext !== 'function') {
      fail('constructor requires a canvas element');
    }
    options = options || {};
    this.canvas = canvas;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) fail('canvas 2D context unavailable');
    this.ctx = ctx;
    this._makeOffscreen = typeof options.canvasFactory === 'function' ? options.canvasFactory : defaultOffscreen;
    this._off = null;
    this._canCache = true;
    this._cacheKey = null;
    this._fallbackW = isNum(options.width) && options.width > 0 ? options.width : 300;
    this._fallbackH = isNum(options.height) && options.height > 0 ? options.height : 150;
    this._forceDpr = isNum(options.dpr) && options.dpr > 0 ? options.dpr : null;
    this._staticBuilds = 0;
    this._cacheReuses = 0;
    this._directFrames = 0;
    this._droppedLinks = 0;
    this._droppedMarkers = 0;
    this._drawnShapes = 0;
    this._backingW = 0;
    this._backingH = 0;
    this._cssW = 0;
    this._cssH = 0;
    this._dpr = 1;
    this._chrome = { left: 0, top: 0, right: 0, bottom: 0 };
    this._transform = null;
    this._hitMarkers = [];
    this._hitDistricts = [];
    this._disposed = false;
  }

  DistrictScene.prototype._currentDpr = function () {
    var raw = this._forceDpr;
    if (raw === null) {
      try { raw = (typeof devicePixelRatio !== 'undefined' && isNum(devicePixelRatio)) ? devicePixelRatio : 1; }
      catch (e) { raw = 1; }
    }
    raw = clamp(raw, 1, MAX_DPR);
    return raw;
  };

  DistrictScene.prototype._camera = function (view, data, cssW, cssH) {
    var b = data.bounds, x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3];
    var wW = x1 - x0, wH = y1 - y0;
    var fit = Math.min(cssW / wW, cssH / wH);
    var street = view.camera === 'street';
    var s = street ? fit * STREET_ZOOM : fit;
    var visW = cssW / s, visH = cssH / s;
    var p = view.position;
    var cx = street ? centerOn(x0, x1, visW, p.x) : (x0 + x1) / 2;
    var cy = street ? centerOn(y0, y1, visH, p.y) : (y0 + y1) / 2;
    var vx0 = cx - visW / 2, vy0 = cy - visH / 2;
    return {
      mode: view.mode, camera: street ? 'street' : 'fit',
      scale: s, tx: -vx0 * s, ty: -vy0 * s,
      vis: [vx0, vy0, vx0 + visW, vy0 + visH]
    };
  };

  DistrictScene.prototype._buildCacheKey = function (view, data, camera, cssW, cssH, backingW, backingH, dpr) {
    return [
      view.mode,
      view.afterHours ? 1 : 0,
      view.camera === 'street' ? 'street' : 'fit',
      data.mapVersion,
      view.activeDistrictId || (view.data && view.data.id) || '',
      cssW.toFixed(3), cssH.toFixed(3), backingW, backingH, dpr.toFixed(3),
      camera.vis[0].toFixed(4), camera.vis[1].toFixed(4),
      camera.vis[2].toFixed(4), camera.vis[3].toFixed(4),
      // District labels are static; key them by their actual contents so a
      // caller that rebuilds an equivalent districts array still reuses.
      districtSignature(view.districts),
      data.travelLinks.length,
      // identity token: the same attached data object reuses; a new data
      // object (or changed mapVersion) rebuilds.
      this._idToken(view.data)
    ].join('|');
  };

  DistrictScene.prototype._idToken = function (obj) {
    if (!obj || typeof obj !== 'object') return '0';
    if (!this._tokens) this._tokens = new WeakMap();
    var t = this._tokens.get(obj);
    if (t === undefined) { t = 't' + (this._tokenSeq = (this._tokenSeq || 0) + 1); this._tokens.set(obj, t); }
    return t;
  };

  // Validate attached static geometry once per data identity AND mapVersion.
  // Retention is a WeakMap keyed by the data object itself: an old map object
  // that the caller drops is collectable, so idle draws never re-walk rings
  // and no per-map entry accumulates for the lifetime of the scene. A malformed
  // object throws out of validateData and is never cached.
  DistrictScene.prototype._validatedData = function (data) {
    if (!data || typeof data !== 'object') return validateData(data); // throws
    if (!this._geoValid) this._geoValid = new WeakMap();
    var version = versionOf(data);
    var hit = this._geoValid.get(data);
    if (hit && hit.version === version) return hit.result;
    var result = validateData(data);
    this._geoValid.set(data, { version: result.mapVersion, result: result });
    return result;
  };

  DistrictScene.prototype._paintStatic = function (c, view, data, camera, links, cssW, cssH, dpr) {
    var theme = view.afterHours ? THEMES.night : THEMES.day;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = theme.ground;
    c.fillRect(0, 0, cssW, cssH);
    var counters = { fills: 0 };
    c.save();
    c.translate(camera.tx, camera.ty);
    c.scale(camera.scale, camera.scale);
    var painterView = { scale: camera.scale, vis: camera.vis };
    paintStaticWorld(c, painterView, data, links, theme, counters);
    c.restore();
    this._paintDistrictLabels(c, view, camera, theme, cssW, cssH, dpr);
    return counters;
  };

  DistrictScene.prototype._paintDistrictLabels = function (c, view, camera, theme, cssW, cssH, dpr) {
    if (view.mode !== 'overview' || !Array.isArray(view.districts)) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    view.districts.forEach(function (d) {
      var b = d.bounds;
      var wcx = (b[0] + b[2]) / 2, wcy = (b[1] + b[3]) / 2;
      var sx = wcx * camera.scale + camera.tx, sy = wcy * camera.scale + camera.ty;
      var bw = (b[2] - b[0]) * camera.scale, bh = (b[3] - b[1]) * camera.scale;
      if (sx < -bw || sx > cssW + bw || sy < -bh || sy > cssH + bh) return;
      var px = clamp(Math.min(bw / Math.max(1, d.name.length * 0.62), bh / 2.2), 9, 15);
      if (px < 10) return; // too small to keep legible on a phone-width overview
      if (estimateTextWidth(d.name, px) > Math.max(bw * 1.6, 28)) return;
      c.font = '600 ' + px + 'px Georgia, "Times New Roman", serif';
      c.fillStyle = theme.districtHalo;
      c.fillText(d.name, sx + 0.5, sy + 0.5);
      c.fillStyle = theme.districtLabel;
      c.fillText(d.name, sx, sy);
    });
  };

  DistrictScene.prototype.draw = function (view, timeSeconds) {
    if (this._disposed) fail('scene has been disposed');
    timeSeconds = isNum(timeSeconds) ? timeSeconds : 0;
    var clean = validateView(view, this._validatedData(view.data));
    var data = clean.data;
    var frame = measureContent(this.canvas, this._fallbackW, this._fallbackH);
    var cssW = frame.cssW, cssH = frame.cssH;
    if (!(cssW > 0) || !(cssH > 0)) fail('canvas content box has no layout size');
    this._chrome = frame.chrome;
    var rawDpr = this._currentDpr();
    var dpr = Math.min(rawDpr, MAX_BACKING_SIDE / cssW, MAX_BACKING_SIDE / cssH);
    var backingW = clamp(Math.round(cssW * dpr), 1, MAX_BACKING_SIDE);
    var backingH = clamp(Math.round(cssH * dpr), 1, MAX_BACKING_SIDE);
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }
    this._backingW = backingW; this._backingH = backingH;
    this._cssW = cssW; this._cssH = cssH; this._dpr = dpr;

    var camera = this._camera(view, data, cssW, cssH);
    var resolved = resolveMarkers(view, data);
    var markers = resolved.markers;
    this._droppedMarkers = resolved.dropped;
    var linkInfo = resolveLinks(view, data, markers);
    this._droppedLinks = linkInfo.dropped;
    var theme = view.afterHours ? THEMES.night : THEMES.day;
    var reduced = !!view.reducedMotion;
    try {
      if (!reduced && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) reduced = true;
    } catch (e) { reduced = !!view.reducedMotion; }
    var t = reduced ? 0 : timeSeconds;

    var cacheKey = this._buildCacheKey(view, data, camera, cssW, cssH, backingW, backingH, dpr);
    var ctx = this.ctx;
    if (this._cacheKey !== cacheKey) {
      var built = false;
      if (this._canCache) {
        if (!this._off) {
          var off = null;
          try { off = this._makeOffscreen(backingW, backingH); } catch (e) { off = null; }
          if (!off || typeof off.getContext !== 'function') {
            this._canCache = false;
          } else {
            this._off = off;
          }
        }
        if (this._off) {
          if (this._off.width !== backingW || this._off.height !== backingH) {
            this._off.width = backingW;
            this._off.height = backingH;
          }
          var octx = this._off.getContext('2d');
          this._paintStatic(octx, view, data, camera, linkInfo.links, cssW, cssH, dpr);
          built = true;
        }
      }
      if (built) {
        this._staticBuilds++;
      } else {
        this._canCache = false;
        this._directFrames++;
      }
      this._cacheKey = cacheKey;
    } else {
      this._cacheReuses++;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, cssW, cssH);
    if (this._off) {
      ctx.drawImage(this._off, 0, 0, backingW, backingH, 0, 0, cssW, cssH);
    } else {
      this._paintStatic(ctx, view, data, camera, linkInfo.links, cssW, cssH, dpr);
    }

    var self = this;
    var w2s = function (x, y) { return { x: x * camera.scale + camera.tx, y: y * camera.scale + camera.ty }; };
    var visited = view.position && Array.isArray(view.position.visited) ? view.position.visited : [];
    var targetId = typeof view.target === 'string' ? view.target : null;
    var markerR = (view.camera === 'street' ? 8.5 : 7.2);

    var screenMarkers = markers.map(function (m) {
      var s = w2s(m.x, m.y);
      var active = m.id === targetId;
      var known = visited.indexOf(m.id) !== -1;
      return { id: m.id, name: m.name, icon: m.icon, sx: s.x, sy: s.y,
        r: markerR + (active ? 2 : 0), active: active, known: known, districtId: m.districtId };
    }).filter(function (m) {
      return m.sx >= -40 && m.sx <= cssW + 40 && m.sy >= -40 && m.sy <= cssH + 40;
    });

    // Live safe route: exactly the supplied points, straight segments between
    // consecutive pairs; null entries are gaps (never interpolated).
    this._drawRoute(ctx, view, camera, theme, t, cssW, cssH);

    // Footprints of actors/props/markers (drawn later) are reserved before
    // chips are placed, so labels never hide the player or nearby venues and
    // later-drawn actors can never bury the active target chip.
    var footprints = this._liveFootprints(view, camera, screenMarkers, cssW, cssH);
    var labels = this._layoutLabels(screenMarkers, view, cssW, cssH, footprints);
    this._drawLabels(ctx, labels, theme);
    this._drawMarkers(ctx, screenMarkers, theme, t);
    this._drawActors(ctx, view, camera, screenMarkers, theme, t, cssW, cssH);
    this._drawHud(ctx, view, data, camera, theme, cssW, cssH);

    this._transform = {
      scale: camera.scale, tx: camera.tx, ty: camera.ty,
      vis: camera.vis, mode: camera.mode, camera: camera.camera,
      cssWidth: cssW, cssHeight: cssH, dpr: dpr
    };
    this._hitMarkers = screenMarkers;
    this._hitDistricts = view.mode === 'overview' && Array.isArray(view.districts)
      ? view.districts.map(function (d) { return { id: d.id, bounds: d.bounds }; }) : [];
    this._drawnShapes = data.shapes.length;
    return this;
  };

  DistrictScene.prototype._drawRoute = function (ctx, view, camera, theme, t, cssW, cssH) {
    var path = Array.isArray(view.path) ? view.path : [];
    var start = view.position;
    if (!start || !path.length) return;
    var pts = [{ x: start.x, y: start.y, gap: false }];
    for (var i = 0; i < path.length; i++) {
      var p = path[i];
      if (p === null || typeof p === 'object' && p.break === true) pts.push({ x: NaN, y: NaN, gap: true });
      else pts.push({ x: p.x, y: p.y, gap: false, ferry: p.transport === 'ferry' });
    }
    // Only straight segments between consecutive supplied points. A null/break
    // entry splits the line; nothing is invented across the gap.
    var segments = [];
    for (var k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1];
      if (a.gap || b.gap) continue;
      segments.push({
        ax: a.x * camera.scale + camera.tx, ay: a.y * camera.scale + camera.ty,
        bx: b.x * camera.scale + camera.tx, by: b.y * camera.scale + camera.ty,
        ferry: a.ferry || b.ferry
      });
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function seg(s) { ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); }

    // Walking segments share one dashed path per contiguous run; ferry
    // segments are drawn as visibly separate cool dashed boat journeys.
    var walking = segments.filter(function (s) { return !s.ferry; });
    if (walking.length) {
      ctx.beginPath();
      var px = NaN, py = NaN;
      walking.forEach(function (s) {
        if (s.ax !== px || s.ay !== py) ctx.moveTo(s.ax, s.ay);
        ctx.lineTo(s.bx, s.by);
        px = s.bx; py = s.by;
      });
      ctx.setLineDash([10, 9]);
      ctx.lineDashOffset = -t * 12;
      ctx.strokeStyle = theme.routeUnder;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = theme.routeGold;
      ctx.lineWidth = 4.4;
      ctx.stroke();
    }
    segments.filter(function (s) { return s.ferry; }).forEach(function (s) {
      seg(s);
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = 0;
      ctx.strokeStyle = theme.linkFerryUnder;
      ctx.lineWidth = 8;
      ctx.stroke();
      seg(s);
      ctx.setLineDash([11, 8]);
      ctx.strokeStyle = theme.linkFerry;
      ctx.lineWidth = 3.4;
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.restore();
  };

  DistrictScene.prototype._hudRects = function (cssW, cssH) {
    return [
      { x: 10, y: 10, w: 168, h: 26 },
      { x: 8, y: cssH - 52, w: 120, h: 40 },
      { x: cssW - 250, y: cssH - 30, w: 244, h: 22 }
    ];
  };

  // Screen-space rectangles of everything drawn live ON TOP of the labels:
  // marker dots (incl. the active pulse ring), the player figure, a parked or
  // mounted bike, the flower cart and the garden. Chips are placed clear of
  // these footprints, so an actor or nearby marker drawn later can never bury
  // a label and no actor is hidden behind a chip.
  DistrictScene.prototype._liveFootprints = function (view, camera, screenMarkers, cssW, cssH) {
    var rects = [];
    function addSx(sx, sy, hw, hh) {
      if (sx + hw < 0 || sx - hw > cssW || sy + hh < 0 || sy - hh > cssH) return;
      rects.push({ x: sx - hw, y: sy - hh, w: 2 * hw, h: 2 * hh });
    }
    function add(wx, wy, hw, hh) {
      addSx(wx * camera.scale + camera.tx, wy * camera.scale + camera.ty, hw, hh);
    }
    screenMarkers.forEach(function (m) {
      // Reserve the marker dot (drop shadow sits 1.4px low). The active chip
      // clears even the pulsing ring via its 8px gap (ring reaches r + 6.4);
      // sibling chips only need the dot pad, keeping crowded sides available.
      var pad = m.r + 3.5;
      addSx(m.sx, m.sy + 1.4, pad, pad);
    });
    var p = view.position;
    if (view.mode === 'overview') {
      add(p.x, p.y, 8, 8);
    } else {
      // Figure incl. cap, legs and contact shadow spans about +-12 x and
      // -14..+13 y. A mounted bike fits that box; a parked local bike gets
      // its own footprint.
      add(p.x, p.y, 12, 14);
      var bike = p.bike;
      var activeId = view.activeDistrictId || (view.data && view.data.id) || '';
      if (bike && !bike.mounted && isNum(bike.x) && isNum(bike.y) &&
          (!bike.districtId || bike.districtId === activeId)) {
        add(bike.x, bike.y, 12, 11);
      }
    }
    if (view.flowerCart && isNum(view.flowerCart.x)) add(view.flowerCart.x, view.flowerCart.y, 12, 13);
    if (view.garden && isNum(view.garden.x)) add(view.garden.x, view.garden.y, 10, 14);
    return rects;
  };

  DistrictScene.prototype._layoutLabels = function (markers, view, cssW, cssH, footprints) {
    var measure = makeMeasurer(this.ctx);
    var reserved = this._hudRects(cssW, cssH).concat(Array.isArray(footprints) ? footprints : []);
    function overlapArea(a, b) {
      var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    }
    function overlaps(a, b, pad) {
      pad = pad || 0;
      return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
             a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
    }
    var ordered = markers.slice().sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.known !== b.known) return a.known ? -1 : 1;
      return 0;
    });
    var labels = [];
    ordered.forEach(function (m) {
      var fp = m.active ? 12 : 11;
      var padX = 7, padY = 4, lineH = fp * 1.24;
      var maxChipW = Math.max(96, Math.min(190, cssW * 0.66));
      var lines;
      if (m.active) {
        lines = wrapLabel(m.name, fp, maxChipW - 2 * padX, measure);
      } else {
        if (measure(m.name, fp) + 2 * padX > Math.min(maxChipW, cssW - 8)) return;
        lines = [m.name];
      }
      var textW = 0;
      lines.forEach(function (ln) { textW = Math.max(textW, measure(ln, fp)); });
      var bw = textW + 2 * padX, bh = lines.length * lineH + 2 * padY;
      // The 8 CSS px gap clears the reserved dot pad (r+3.5) and even the
      // active pulse ring (reaches r+6.4), so a chip never touches a marker.
      var gap = 8;
      var bases = [
        { x: m.sx - bw / 2, y: m.sy - m.r - gap - bh },
        { x: m.sx - bw / 2, y: m.sy + m.r + gap },
        { x: m.sx + m.r + gap, y: m.sy - bh / 2 },
        { x: m.sx - m.r - gap - bw, y: m.sy - bh / 2 }
      ];
      var candidates = bases.map(function (p) {
        return {
          x: clamp(p.x, 4, Math.max(4, cssW - 4 - bw)),
          y: clamp(p.y, 4, Math.max(4, cssH - 4 - bh)),
          w: bw, h: bh
        };
      });
      var picked = null;
      for (var i = 0; i < candidates.length; i++) {
        var ok = true;
        for (var j = 0; j < reserved.length; j++) {
          if (overlaps(candidates[i], reserved[j], 2)) { ok = false; break; }
        }
        if (ok) { picked = candidates[i]; break; }
      }
      if (!picked) {
        if (!m.active) return; // clustered non-target markers keep their dot only
        // Active target must keep its chip: take the least-colliding side so
        // it still covers the least possible actor/marker area.
        var best = candidates[0], bestPenalty = Infinity;
        for (var ci = 0; ci < candidates.length; ci++) {
          var penalty = 0;
          for (var ri = 0; ri < reserved.length; ri++) {
            penalty += overlapArea(candidates[ci], reserved[ri]);
          }
          if (penalty < bestPenalty) { bestPenalty = penalty; best = candidates[ci]; }
        }
        picked = best;
      }
      reserved.push(picked);
      labels.push({
        id: m.id, x: picked.x, y: picked.y, w: bw, h: bh,
        lines: lines, fp: fp, padX: padX, padY: padY, lineH: lineH, active: m.active,
        anchorX: m.sx, anchorY: m.sy, markerR: m.r
      });
    });
    return labels;
  };

  DistrictScene.prototype._drawLabels = function (ctx, labels, theme) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    labels.forEach(function (lb) {
      ctx.strokeStyle = lb.active ? theme.chipBorder : theme.leader;
      ctx.lineWidth = 1;
      // Small pointer when the chip is detached from its marker.
      var cx = clamp(lb.anchorX, lb.x + 4, lb.x + lb.w - 4);
      var edgeY = lb.anchorY < lb.y ? lb.y : (lb.anchorY > lb.y + lb.h ? lb.y + lb.h : null);
      if (edgeY !== null && Math.abs(lb.anchorY - edgeY) > lb.markerR + 3) {
        ctx.beginPath();
        ctx.moveTo(cx, edgeY);
        ctx.lineTo(cx, lb.anchorY - Math.sign(edgeY - lb.anchorY) * lb.markerR);
        ctx.stroke();
      }
      ctx.fillStyle = lb.active ? theme.chipActive : theme.chip;
      ctx.fillRect(lb.x, lb.y, lb.w, lb.h);
      ctx.strokeStyle = theme.chipBorder;
      ctx.strokeRect(lb.x, lb.y, lb.w, lb.h);
      ctx.fillStyle = lb.active ? theme.chipActiveInk : theme.chipInk;
      ctx.font = labelFont(lb.fp);
      for (var i = 0; i < lb.lines.length; i++) {
        ctx.fillText(lb.lines[i], lb.x + lb.padX, lb.y + lb.padY + lb.fp * 0.92 + i * lb.lineH);
      }
    });
    ctx.restore();
  };

  DistrictScene.prototype._drawMarkers = function (ctx, markers, theme, t) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Non-target markers first, active target last so close venues never bury
    // the current destination.
    markers.slice().sort(function (a, b) {
      return (a.active === b.active) ? 0 : (a.active ? 1 : -1);
    }).forEach(function (m) {
      if (m.active) {
        ctx.beginPath();
        ctx.arc(m.sx, m.sy, m.r + 4 + Math.sin(t * 3) * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = theme.pulse;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(m.sx, m.sy + 1.4, m.r, 0, Math.PI * 2);
      ctx.fillStyle = theme.markerOuter;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(m.sx, m.sy, m.r - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = m.active ? theme.markerActive : (m.known ? theme.markerVisited : theme.markerInner);
      ctx.fill();
      if (m.icon) {
        ctx.fillStyle = m.active ? '#24313a' : '#f0e6cc';
        ctx.font = (m.r + 2.5) + 'px system-ui,sans-serif';
        ctx.fillText(m.icon, m.sx, m.sy + 0.5);
      }
    });
    ctx.restore();
  };

  DistrictScene.prototype._drawBike = function (ctx, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
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
  };

  DistrictScene.prototype._drawActors = function (ctx, view, camera, markers, theme, t, cssW, cssH) {
    var p = view.position;
    var ps = { x: p.x * camera.scale + camera.tx, y: p.y * camera.scale + camera.ty };
    if (ps.x < -40 || ps.x > cssW + 40 || ps.y < -40 || ps.y > cssH + 40) return;
    var bike = p.bike || null;
    var mounted = !!(bike && bike.mounted);
    var activeId = view.activeDistrictId || (view.data && view.data.id) || '';
    ctx.save();

    if (view.mode === 'overview') {
      // Compact player pip at city scale; no bike/cart clutter.
      ctx.beginPath();
      ctx.arc(ps.x, ps.y + 1, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.markerOuter;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = mounted ? theme.markerActive : theme.actor;
      ctx.fill();
      ctx.restore();
      return;
    }

    // District view: clear, legible figure plus local props only.
    ctx.fillStyle = 'rgba(10,30,38,.30)';
    ctx.beginPath();
    ctx.ellipse(ps.x, ps.y + 8.5, 9, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mounted) this._drawBike(ctx, ps.x, ps.y + 2, 1, theme.bike);
    ctx.fillStyle = theme.actor;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y + 1, 7.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.actorHead;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y - 8.2, 4.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.actorCap;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y - 9.4, 4.1, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(ps.x - 4.2, ps.y - 9.8, 8.4, 1.4);
    var swing = mounted ? Math.sin(t * 6) * 1.6 : 0;
    ctx.strokeStyle = theme.actor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ps.x - 2.4, ps.y + 6);
    ctx.lineTo(ps.x - 3.4 + swing, ps.y + 10.5);
    ctx.moveTo(ps.x + 2.4, ps.y + 6);
    ctx.lineTo(ps.x + 3.4 - swing, ps.y + 10.5);
    ctx.stroke();

    // A parked bike is drawn only when it is in the current district; a bike
    // parked in a remote district stays hidden.
    if (!mounted && bike && (!bike.districtId || bike.districtId === activeId)) {
      var bs = { x: bike.x * camera.scale + camera.tx, y: bike.y * camera.scale + camera.ty };
      if (bs.x > -30 && bs.x < cssW + 30 && bs.y > -30 && bs.y < cssH + 30) {
        this._drawBike(ctx, bs.x, bs.y, 1, theme.bike);
      }
    }

    var cart = view.flowerCart;
    if (cart) {
      var cs = { x: cart.x * camera.scale + camera.tx, y: cart.y * camera.scale + camera.ty };
      if (cs.x > -30 && cs.x < cssW + 30 && cs.y > -30 && cs.y < cssH + 30) {
        ctx.fillStyle = theme.cart;
        ctx.fillRect(cs.x - 9, cs.y - 5, 18, 10);
        ctx.strokeStyle = theme.markerOuter;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(cs.x - 9, cs.y - 5, 18, 10);
        ctx.fillStyle = theme.markerOuter;
        ctx.beginPath(); ctx.arc(cs.x - 6, cs.y + 7, 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cs.x + 6, cs.y + 7, 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d87b68';
        ctx.beginPath(); ctx.arc(cs.x - 3, cs.y - 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e2b864';
        ctx.beginPath(); ctx.arc(cs.x + 3, cs.y - 8.5, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    var garden = view.garden;
    if (garden) {
      var gs = { x: garden.x * camera.scale + camera.tx, y: garden.y * camera.scale + camera.ty };
      if (gs.x > -30 && gs.x < cssW + 30 && gs.y > -30 && gs.y < cssH + 30) {
        ctx.save();
        ctx.globalAlpha = garden.known === false ? 0.55 : 1;
        ctx.fillStyle = garden.known === false ? theme.gardenUnknown : theme.gardenKnown;
        ctx.fillRect(gs.x - 8, gs.y - 6, 16, 12);
        ctx.strokeStyle = theme.markerOuter;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(gs.x - 8, gs.y - 6, 16, 12);
        ctx.beginPath();
        ctx.moveTo(gs.x - 8, gs.y - 6); ctx.lineTo(gs.x, gs.y - 12); ctx.lineTo(gs.x + 8, gs.y - 6);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  };

  DistrictScene.prototype._drawHud = function (ctx, view, data, camera, theme, cssW, cssH) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    var mode = (view.afterHours ? 'Night' : 'Day') + ' · ' +
      (view.mode === 'overview' ? 'City overview' : 'Local district') +
      (view.camera === 'street' ? ' · street' : ' · fit');
    ctx.font = labelFont(12);
    var chipW = estimateTextWidth(mode, 12) + 22;
    ctx.fillStyle = theme.hud;
    ctx.fillRect(12, 12, chipW, 26);
    ctx.fillStyle = theme.hudText;
    ctx.textAlign = 'left';
    ctx.fillText(mode, 23, 29.5);

    // Scale bar: a rounded metre step landing around 64+ CSS px.
    var cssPerM = camera.scale;
    var steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    var metres = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * cssPerM >= 64) { metres = steps[i]; break; }
    }
    var barW = metres * camera.scale, bx = 14, by = cssH - 34;
    ctx.fillStyle = theme.scaleBarEdge;
    ctx.fillRect(bx - 1.5, by - 1.5, barW + 3, 8);
    ctx.fillStyle = theme.scaleBar;
    ctx.fillRect(bx, by, barW, 5);
    ctx.font = '11px ui-monospace,Menlo,monospace';
    ctx.fillStyle = theme.hudText;
    ctx.fillText(metres >= 1000 ? (metres / 1000) + ' km' : metres + ' m', bx, by - 5);

    ctx.font = labelFont(10);
    ctx.textAlign = 'right';
    var cw = estimateTextWidth(SHORT_CREDIT, 10);
    ctx.fillStyle = theme.hud;
    ctx.fillRect(cssW - cw - 18, cssH - 28, cw + 14, 20);
    ctx.fillStyle = theme.hudTextDim;
    ctx.fillText(SHORT_CREDIT, cssW - 11, cssH - 14);
    ctx.restore();
  };

  // --------------------------------------------------------------------------
  // Coordinate mapping / hit testing.
  // --------------------------------------------------------------------------

  DistrictScene.prototype._contentPoint = function (clientX, clientY) {
    if (!isNum(clientX) || !isNum(clientY)) return null;
    var chrome = computedChrome(this.canvas);
    var rect = null;
    try { rect = this.canvas.getBoundingClientRect(); } catch (e) { rect = null; }
    var left = 0, top = 0, borderW = 0, borderH = 0;
    if (rect) {
      left = rect.left; top = rect.top;
      borderW = (isNum(rect.width) ? rect.width : 0);
      borderH = (isNum(rect.height) ? rect.height : 0);
    }
    var x = clientX - left - chrome.left;
    var y = clientY - top - chrome.top;
    // Content box width is the border box minus chrome on both sides.
    var contentW = this._cssW, contentH = this._cssH;
    if (rect && borderW > 0) contentW = borderW - chrome.left - chrome.right;
    if (rect && borderH > 0) contentH = borderH - chrome.top - chrome.bottom;
    if (x < 0 || y < 0 || x > contentW || y > contentH) return null;
    return { x: x, y: y };
  };

  DistrictScene.prototype.screenToWorld = function (clientX, clientY) {
    if (this._disposed || !this._transform) return null;
    var p = this._contentPoint(clientX, clientY);
    if (!p) return null;
    var tr = this._transform;
    return { x: (p.x - tr.tx) / tr.scale, y: (p.y - tr.ty) / tr.scale };
  };

  DistrictScene.prototype.hitTest = function (clientX, clientY) {
    if (this._disposed || !this._transform) return null;
    var p = this._contentPoint(clientX, clientY);
    if (!p) return null;
    // Place markers first; the active target wins ties with nearby venues.
    var hits = [];
    for (var i = 0; i < this._hitMarkers.length; i++) {
      var m = this._hitMarkers[i];
      var d = Math.hypot(p.x - m.sx, p.y - m.sy);
      if (d <= m.r + 4) hits.push({ m: m, d: d });
    }
    if (hits.length) {
      hits.sort(function (a, b) {
        if (a.m.active !== b.m.active) return a.m.active ? -1 : 1;
        return a.d - b.d;
      });
      return { type: 'place', id: hits[0].m.id };
    }
    if (this._hitDistricts.length) {
      var w = this.screenToWorld(clientX, clientY);
      if (!w) return null;
      var containing = this._hitDistricts.filter(function (d) {
        var b = d.bounds;
        return w.x >= b[0] && w.x <= b[2] && w.y >= b[1] && w.y <= b[3];
      }).sort(function (a, b2) {
        var aa = (a.bounds[2] - a.bounds[0]) * (a.bounds[3] - a.bounds[1]);
        var bb = (b2.bounds[2] - b2.bounds[0]) * (b2.bounds[3] - b2.bounds[1]);
        return aa - bb;
      });
      if (containing.length) return { type: 'district', id: containing[0].id };
    }
    return null;
  };

  DistrictScene.prototype.diagnostics = function () {
    var liveCanvases = 1 + (this._off ? 1 : 0);
    var cacheBytes = this._off ? this._off.width * this._off.height * 4 : 0;
    return {
      disposed: this._disposed,
      staticBuilds: this._staticBuilds,
      cacheReuses: this._cacheReuses,
      directFrames: this._directFrames,
      liveCanvases: liveCanvases,
      backingWidth: this._backingW,
      backingHeight: this._backingH,
      cssWidth: this._cssW,
      cssHeight: this._cssH,
      dpr: this._dpr,
      cacheBytes: cacheBytes,
      droppedLinks: this._droppedLinks,
      droppedMarkers: this._droppedMarkers,
      shapes: this._drawnShapes,
      transform: this._transform
    };
  };

  DistrictScene.prototype.dispose = function () {
    if (this._off) {
      // Release the backing buffer itself (browsers free it on resize to 1).
      try { this._off.width = 1; this._off.height = 1; } catch (e) { /* noop */ }
      this._off = null;
    }
    this._cacheKey = null;
    this._transform = null;
    this._hitMarkers = [];
    this._hitDistricts = [];
    this._lastLabels = [];
    this._tokens = null;
    this._geoValid = null;
    this._disposed = true;
    return this;
  };

  return {
    DistrictScene: DistrictScene,
    // Pure helpers exposed for synthetic tests/benchmarks only.
    _internals: {
      estimateTextWidth: estimateTextWidth,
      wrapLabel: wrapLabel,
      hash01: hash01,
      validateView: validateView,
      THEMES: THEMES,
      MAX_BACKING_SIDE: MAX_BACKING_SIDE,
      MAX_DPR: MAX_DPR
    }
  };
});

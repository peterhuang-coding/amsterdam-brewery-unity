/*
 * DistrictRuntime — shape-first district loader + 1 m grid navigator.
 *
 * UMD: works with require() and window.DistrictRuntime. No external deps.
 *
 * Contract (see brief.md / schema.md):
 *  - DistrictRuntime.open(manifestUrl, {signal, onProgress, fetch})
 *  - DistrictRuntime.createNavigator(district)
 * The compiled JSON fixture is untrusted input: everything is validated
 * before any observable state is replaced. Navigation uses only the RLE
 * walk/bike masks; there is no full geometry and no route cache.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DistrictRuntime = factory();
  }
})(typeof self !== 'undefined' ? self
  : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var SHAPE_KINDS = ['water', 'building', 'road', 'bridge'];
  var GRID_CAP = 4000000;
  var MAX_RADIUS = 0.4;
  var MANIFEST_CAP = 256 * 1024;
  var OVERVIEW_GZIP_CAP = 2 * 1024 * 1024;
  var OVERVIEW_RAW_CAP = 16 * 1024 * 1024;
  var DISTRICT_GZIP_CAP = 8 * 1024 * 1024;
  var DISTRICT_RAW_CAP = 24 * 1024 * 1024;
  var YIELD_EVERY_EXPANSIONS = 2048;
  var YIELD_EVERY_MS = 8;

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function int(v) { return typeof v === 'number' && Number.isInteger(v); }

  function err(name, code, message) {
    var e = new Error(message);
    e.name = name;
    e.code = code;
    return e;
  }
  function abortError(message) {
    return err('AbortError', 'ABORT_ERR', message || 'The operation was aborted');
  }
  function invalid(message) {
    return err('TypeError', 'ERR_DISTRICT_VALIDATION', message);
  }
  function limitError(message) {
    return err('Error', 'ERR_BYTE_LIMIT', message);
  }
  function isAbort(e) {
    return e && (e.name === 'AbortError' || e.code === 'ABORT_ERR' ||
      e.code === 20 /* Node-style AbortError */);
  }

  function getCrypto() {
    var g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (g && g.crypto && g.crypto.subtle) return g.crypto;
    try {
      if (typeof require === 'function') {
        var c = require('crypto');
        if (c.webcrypto) return c.webcrypto;
      }
    } catch (e) { /* no node crypto */ }
    throw err('Error', 'ERR_NO_CRYPTO', 'WebCrypto subtle digest is unavailable');
  }

  function safeProgress(fn, info) {
    if (typeof fn !== 'function') return;
    try { fn(info); } catch (e) { /* observer errors never break loading */ }
  }

  /* ------------------------------------------------------------------ */
  /* URL safety                                                          */
  /* ------------------------------------------------------------------ */

  function rejectResourceUrl(ref, baseUrl, why) {
    throw err('TypeError', 'ERR_UNSAFE_RESOURCE_URL',
      'Unsafe resource URL ' + JSON.stringify(ref) + ': ' + why);
  }

  // Immutable relative refs only; same origin, inside manifest directory.
  function safeResourceUrl(ref, baseUrl) {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > 2048) {
      rejectResourceUrl(ref, baseUrl, 'must be a non-empty string');
    }
    if (ref.indexOf('\\') !== -1 || /[\x00-\x1f\x7f]/.test(ref) || /[\x00-\x1f]/.test(ref)) {
      rejectResourceUrl(ref, baseUrl, 'control characters or backslash');
    }
    var q = ref.indexOf('?');
    var path = q === -1 ? ref : ref.slice(0, q);
    if (path.indexOf('#') !== -1) {
      rejectResourceUrl(ref, baseUrl, 'fragment is not allowed');
    }
    if (/%(2f|5c)/i.test(path)) {
      rejectResourceUrl(ref, baseUrl, 'encoded path separators');
    }
    // Reject traversal under every percent-decoding layer (incl. double).
    var decoded = path;
    for (var i = 0; i < 4; i++) {
      var segs = decoded.split('/');
      for (var j = 0; j < segs.length; j++) {
        if (segs[j] === '..') rejectResourceUrl(ref, baseUrl, 'parent traversal');
      }
      if (!/%[0-9a-f]{2}/i.test(decoded)) break;
      try { decoded = decodeURIComponent(decoded); }
      catch (e) { rejectResourceUrl(ref, baseUrl, 'malformed percent encoding'); }
    }
    var probe = path.replace(/^[ \t]+/, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) {
      rejectResourceUrl(ref, baseUrl, 'absolute scheme/protocol');
    }
    if (probe.charAt(0) === '/') rejectResourceUrl(ref, baseUrl, 'absolute path');
    if (probe.slice(0, 2) === '//') rejectResourceUrl(ref, baseUrl, 'protocol-relative');

    var u;
    try { u = new URL(ref, baseUrl); }
    catch (e) { rejectResourceUrl(ref, baseUrl, 'unparseable'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      rejectResourceUrl(ref, baseUrl, 'non-http(s) resolution');
    }
    if (u.origin !== baseUrl.origin) rejectResourceUrl(ref, baseUrl, 'cross-origin');
    var dir = baseUrl.pathname.slice(0, baseUrl.pathname.lastIndexOf('/') + 1);
    if (u.pathname.charAt(0) !== '/' || u.pathname.indexOf(dir) !== 0) {
      rejectResourceUrl(ref, baseUrl, 'escapes manifest directory');
    }
    return u;
  }

  function manifestBaseUrl(manifestUrl) {
    if (typeof manifestUrl !== 'string' || manifestUrl.length === 0) {
      throw invalid('manifestUrl must be a non-empty string');
    }
    function httpUrl(v) {
      return v && (v.protocol === 'http:' || v.protocol === 'https:') ? v : null;
    }
    // Absolute http(s) manifest URLs work in Node and the browser.
    var u = null;
    try { u = httpUrl(new URL(manifestUrl)); } catch (e) { u = null; }
    if (!u) {
      // Browser contract: a relative ref resolves against the document URL.
      // Strict http(s)/same-origin confinement for resources still applies.
      var g = typeof globalThis !== 'undefined' ? globalThis : null;
      var href = g && g.location && typeof g.location.href === 'string'
        ? g.location.href : null;
      if (href) {
        try { u = httpUrl(new URL(manifestUrl, href)); } catch (e2) { u = null; }
      }
    }
    if (!u) {
      throw invalid('manifestUrl must be an absolute http(s) URL or resolve ' +
        'against location.href');
    }
    return u;
  }

  /* ------------------------------------------------------------------ */
  /* Fetch with hard byte caps, optional gzip + exact hash verification  */
  /* ------------------------------------------------------------------ */

  function concatChunks(chunks, total) {
    if (chunks.length === 1 && chunks[0].byteLength === total) return chunks[0];
    var out = new Uint8Array(total);
    var off = 0;
    for (var i = 0; i < chunks.length; i++) {
      out.set(chunks[i], off);
      off += chunks[i].byteLength;
    }
    return out;
  }

  // Read an entire stream, rejecting (and cancelling) the moment the cap
  // is exceeded. Boundary: exactly `cap` bytes is allowed.
  async function readLimited(stream, cap, onProgress, signal, label) {
    if (!stream || typeof stream.getReader !== 'function') {
      throw err('Error', 'ERR_BAD_RESPONSE', label + ': response has no readable body');
    }
    var reader = stream.getReader();
    var chunks = [];
    var total = 0;
    try {
      while (true) {
        if (signal && signal.aborted) throw abortError();
        var step = await reader.read();
        if (step.done) break;
        var v = step.value;
        var len = v ? v.byteLength : 0;
        if (len) {
          if (total + len > cap) {
            try { await reader.cancel(); } catch (e2) { /* ignore */ }
            throw limitError(label + ': exceeded ' + cap + ' byte limit');
          }
          chunks.push(v);
          total += len;
          safeProgress(onProgress, { phase: 'bytes', resource: label, received: total });
        }
      }
    } catch (e) {
      if (isAbort(e)) throw e;
      if (e && e.code === 'ERR_BYTE_LIMIT') throw e;
      try { await reader.cancel(); } catch (e2) { /* ignore */ }
      throw e;
    }
    return concatChunks(chunks, total);
  }

  function gunzipBytes(wire, cap, onProgress, signal, label) {
    var DS = (typeof globalThis !== 'undefined' && globalThis.DecompressionStream) || null;
    if (DS) {
      var src;
      if (typeof Response !== 'undefined') src = new Response(wire);
      if (!src || !src.body) throw err('Error', 'ERR_BAD_RESPONSE', label + ': cannot create gzip stream');
      var expanded = src.body.pipeThrough(new DS('gzip'));
      return readLimited(expanded, cap, onProgress, signal, label);
    }
    // Deterministic Node fallback for runtimes without DecompressionStream.
    // Inflate incrementally so the decoded result is bounded by `cap` while
    // streaming; never expose a whole pooled ArrayBuffer (respect each
    // Buffer's byteOffset/byteLength).
    return new Promise(function (resolve, reject) {
      var zlib = require('zlib');
      if (signal && signal.aborted) { reject(abortError()); return; }
      var gunzip = zlib.createGunzip();
      var chunks = [];
      var total = 0;
      var settled = false;
      function fail(e) {
        if (settled) return;
        settled = true;
        try { gunzip.destroy(); } catch (e2) { /* ignore */ }
        reject(e);
      }
      gunzip.on('data', function (chunk) {
        if (settled) return;
        var len = chunk.byteLength;
        if (total + len > cap) {
          fail(limitError(label + ': exceeded ' + cap + ' byte raw limit'));
          return;
        }
        chunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        total += len;
        safeProgress(onProgress, { phase: 'gunzip', resource: label, received: total });
      });
      gunzip.on('end', function () {
        if (settled) return;
        settled = true;
        if (signal && signal.aborted) { reject(abortError()); return; }
        resolve(concatChunks(chunks, total));
      });
      gunzip.on('error', function (e) { fail(e); });
      gunzip.end(Buffer.from(wire));
    });
  }

  function hasGzipMagic(b) {
    return b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
  }

  // Returns the exact decoded bytes.
  async function download(fetchImpl, url, wireCap, rawCap, signal, onProgress, label) {
    var res;
    try {
      res = await fetchImpl(url.toString(), { signal: signal });
    } catch (e) {
      if (isAbort(e)) throw abortError();
      throw e;
    }
    if (!res || typeof res !== 'object') {
      throw err('Error', 'ERR_BAD_RESPONSE', label + ': empty fetch response');
    }
    if (res.redirected === true) {
      throw err('Error', 'ERR_REDIRECT', label + ': redirects are not permitted');
    }
    var ok = res.ok;
    if (ok !== undefined && ok !== true) {
      throw err('Error', 'ERR_HTTP_STATUS', label + ': HTTP ' + (res.status || 'unknown'));
    }
    var ce = '';
    try {
      if (res.headers && typeof res.headers.get === 'function') {
        ce = (res.headers.get('content-encoding') || '').toLowerCase();
      }
    } catch (e) { ce = ''; }
    var encodings = ce.split(',').map(function (s) { return s.trim(); });
    if (encodings.indexOf('gzip') !== -1) {
      // Browser/user agent already decoded the body: cap as raw, do not
      // decompress again.
      return readLimited(res.body, rawCap, onProgress, signal, label);
    }
    var wire = await readLimited(res.body, wireCap, onProgress, signal, label);
    if (hasGzipMagic(wire)) {
      safeProgress(onProgress, { phase: 'gunzip', resource: label, received: wire.byteLength });
      return gunzipBytes(wire, rawCap, onProgress, signal, label);
    }
    return wire;
  }

  async function sha256Hex(bytes, cryptoApi) {
    var digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    var arr = new Uint8Array(digest);
    var s = '';
    for (var i = 0; i < arr.length; i++) {
      s += arr[i].toString(16).padStart(2, '0');
    }
    return s;
  }

  async function fetchJson(fetchImpl, url, meta, wireCap, rawCap, signal, onProgress, label, cryptoApi) {
    var raw = await download(fetchImpl, url, wireCap, rawCap, signal, onProgress, label);
    if (isAbortSignalAborted(signal)) throw abortError();
    if (meta) {
      if (raw.byteLength !== meta.bytes) {
        throw err('Error', 'ERR_LENGTH_MISMATCH',
          label + ': expected ' + meta.bytes + ' raw bytes, got ' + raw.byteLength);
      }
    }
    var hash = await sha256Hex(raw, cryptoApi);
    if (meta && hash !== meta.sha256) {
      throw err('Error', 'ERR_CHECKSUM', label + ': sha256 mismatch');
    }
    var text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch (e) {
      throw invalid(label + ': payload is not valid UTF-8');
    }
    try {
      return { json: JSON.parse(text), bytes: raw.byteLength, sha256: hash };
    } catch (e) {
      throw invalid(label + ': invalid JSON: ' + e.message);
    }
  }

  function isAbortSignalAborted(signal) {
    return !!(signal && signal.aborted);
  }

  // Declared metadata bounds are enforced before the resource is requested,
  // so an oversized bundle never produces a second fetch.
  function checkMetadataCaps(meta, rawCap, gzipCap, where) {
    if (meta.bytes > rawCap) {
      throw limitError(where + ': metadata declares ' + meta.bytes +
        ' raw bytes, exceeding the ' + rawCap + ' byte raw cap');
    }
    if (meta.gzipBytes > gzipCap) {
      throw limitError(where + ': metadata declares ' + meta.gzipBytes +
        ' gzip bytes, exceeding the ' + gzipCap + ' byte gzip cap');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Strict fixture validation                                          */
  /* ------------------------------------------------------------------ */

  function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function nonEmptyString(v) { return typeof v === 'string' && v.length > 0; }

  function isSha256(v) {
    return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  }
  function metaOf(m, where) {
    if (!obj(m) || !nonEmptyString(m.url) || !isSha256(m.sha256) ||
      !int(m.bytes) || m.bytes <= 0 ||
      !int(m.gzipBytes) || m.gzipBytes <= 0) {
      throw invalid(where + ': resource metadata needs url/sha256/bytes/gzipBytes');
    }
    return m;
  }

  function validateShapes(shapes, where) {
    if (!Array.isArray(shapes)) throw invalid(where + ': shapes must be an array');
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      if (!obj(s) || SHAPE_KINDS.indexOf(s.kind) === -1) {
        throw invalid(where + ': shape #' + i + ' has unsupported kind');
      }
      if (!Array.isArray(s.rings)) throw invalid(where + ': shape #' + i + ' rings missing');
      for (var r = 0; r < s.rings.length; r++) {
        var ring = s.rings[r];
        if (!Array.isArray(ring) || ring.length < 3) {
          throw invalid(where + ': shape #' + i + ' ring ' + r + ' needs >= 3 points');
        }
        for (var p = 0; p < ring.length; p++) {
          var pt = ring[p];
          if (!Array.isArray(pt) || pt.length !== 2 || !finite(pt[0]) || !finite(pt[1])) {
            throw invalid(where + ': shape #' + i + ' ring ' + r + ' point ' + p + ' malformed');
          }
        }
      }
    }
  }

  function validateBounds4(b, where) {
    if (!Array.isArray(b) || b.length !== 4 ||
      !finite(b[0]) || !finite(b[1]) || !finite(b[2]) || !finite(b[3])) {
      throw invalid(where + ': bounds must be four finite numbers');
    }
    if (!(b[2] > b[0]) || !(b[3] > b[1])) {
      throw invalid(where + ': bounds must be strictly increasing');
    }
    return b;
  }

  function validateManifest(m) {
    if (!obj(m)) throw invalid('manifest: object expected');
    if (m.schemaVersion !== 1) throw invalid('manifest: unsupported schemaVersion');
    if (!nonEmptyString(m.mapVersion)) throw invalid('manifest: mapVersion missing');
    if (!obj(m.projection)) throw invalid('manifest: projection missing');
    if (!obj(m.source)) throw invalid('manifest: source provenance missing');
    metaOf(m.overview, 'manifest.overview');
    if (!Array.isArray(m.districts) || m.districts.length === 0) {
      throw invalid('manifest: districts must be a non-empty array');
    }
    if (m.travelLinks !== undefined && !Array.isArray(m.travelLinks)) {
      throw invalid('manifest: travelLinks must be an array');
    }
    var seen = Object.create(null);
    for (var i = 0; i < m.districts.length; i++) {
      var d = m.districts[i];
      metaOf(d, 'manifest.districts[' + i + ']');
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(d.id)) {
        throw invalid('manifest.districts[' + i + ']: invalid id');
      }
      if (seen[d.id]) throw invalid('manifest: duplicate district id ' + d.id);
      seen[d.id] = true;
      if (!nonEmptyString(d.name)) throw invalid('district ' + d.id + ': name missing');
      validateBounds4(d.bounds, 'district ' + d.id);
      if (!Array.isArray(d.anchorIds) || d.anchorIds.length === 0) {
        throw invalid('district ' + d.id + ': anchorIds must be non-empty');
      }
      for (var a = 0; a < d.anchorIds.length; a++) {
        if (!nonEmptyString(d.anchorIds[a])) {
          throw invalid('district ' + d.id + ': empty anchorId');
        }
      }
      if (new Set(d.anchorIds).size !== d.anchorIds.length) {
        throw invalid('district ' + d.id + ': duplicate anchorIds');
      }
    }
    return m;
  }

  function validateOverview(o, manifest) {
    if (!obj(o)) throw invalid('overview: object expected');
    if (o.schemaVersion !== 1) throw invalid('overview: unsupported schemaVersion');
    if (o.mapVersion !== manifest.mapVersion) {
      throw invalid('overview: mapVersion does not match manifest');
    }
    var b = validateBounds4(o.bounds, 'overview');
    if (b[0] !== 0 || b[1] !== 0) throw invalid('overview: bounds must start at 0,0');
    validateShapes(o.shapes, 'overview');
    if (!Array.isArray(o.markers)) throw invalid('overview: markers must be an array');
    var ids = new Set(manifest.districts.map(function (d) { return d.id; }));
    for (var i = 0; i < o.markers.length; i++) {
      var mk = o.markers[i];
      if (!obj(mk) || !nonEmptyString(mk.id) || !finite(mk.x) || !finite(mk.y) ||
        !nonEmptyString(mk.districtId) || !ids.has(mk.districtId)) {
        throw invalid('overview: marker #' + i + ' malformed or unknown district');
      }
    }
    if (o.travelLinks !== undefined && !Array.isArray(o.travelLinks)) {
      throw invalid('overview: travelLinks must be an array');
    }
    return o;
  }

  function compileMasks(n, runs, label) {
    if (!Array.isArray(runs)) throw invalid(label + ': runs must be an array');
    var mask = new Uint8Array(n);
    var prevEnd = 0;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (!Array.isArray(r) || r.length !== 2 || !int(r[0]) || !int(r[1])) {
        throw invalid(label + ': run #' + i + ' must be [int, int]');
      }
      var start = r[0];
      var len = r[1];
      if (start < 0 || len < 1) throw invalid(label + ': run #' + i + ' empty/negative');
      if (start < prevEnd) {
        throw invalid(label + ': run #' + i + ' overlaps or is not sorted');
      }
      if (start + len > n) throw invalid(label + ': run #' + i + ' exceeds grid');
      for (var k = start; k < start + len; k++) mask[k] = 1;
      prevEnd = start + len;
    }
    return mask;
  }

  // Internal consistency. Cross-document identity only when `expected`
  // (manifest entry + mapVersion) is supplied.
  function validateDistrict(d, expected) {
    if (!obj(d)) throw invalid('district: object expected');
    if (d.schemaVersion !== 1) throw invalid('district: unsupported schemaVersion');
    if (!nonEmptyString(d.mapVersion)) throw invalid('district: mapVersion missing');
    if (expected && d.mapVersion !== expected.mapVersion) {
      throw invalid('district ' + d.id + ': mapVersion mismatch');
    }
    if (!nonEmptyString(d.id)) throw invalid('district: id missing');
    if (expected && d.id !== expected.id) {
      throw invalid('district: id mismatch (expected ' + expected.id + ')');
    }
    if (!nonEmptyString(d.name)) throw invalid('district ' + d.id + ': name missing');
    if (expected && d.name !== expected.name) {
      throw invalid('district ' + d.id + ': name mismatch');
    }
    var b = validateBounds4(d.bounds, 'district ' + d.id);
    if (expected) {
      for (var bi = 0; bi < 4; bi++) {
        if (b[bi] !== expected.bounds[bi]) {
          throw invalid('district ' + d.id + ': bounds do not match manifest');
        }
      }
    }
    validateShapes(d.shapes, 'district ' + d.id);

    var nav = d.nav;
    if (!obj(nav)) throw invalid('district ' + d.id + ': nav missing');
    if (!Array.isArray(nav.origin) || nav.origin.length !== 2 ||
      !finite(nav.origin[0]) || !finite(nav.origin[1])) {
      throw invalid('district ' + d.id + ': nav.origin must be [x, y]');
    }
    if (nav.origin[0] !== b[0] || nav.origin[1] !== b[1]) {
      throw invalid('district ' + d.id + ': nav.origin must equal bounds origin');
    }
    if (!finite(nav.cellSize) || nav.cellSize <= 0 || nav.cellSize > 10) {
      throw invalid('district ' + d.id + ': bad cellSize');
    }
    if (!int(nav.cols) || !int(nav.rows) || nav.cols <= 0 || nav.rows <= 0) {
      throw invalid('district ' + d.id + ': cols/rows must be positive integers');
    }
    var w = b[2] - b[0];
    var h = b[3] - b[1];
    if (nav.cols * nav.cellSize !== w || nav.rows * nav.cellSize !== h) {
      throw invalid('district ' + d.id + ': grid dimensions inconsistent with bounds');
    }
    var n = nav.cols * nav.rows;
    if (n > GRID_CAP) throw invalid('district ' + d.id + ': grid exceeds 4,000,000 cells');
    var walk = compileMasks(n, nav.walkRuns, 'district ' + d.id + '.walkRuns');
    var bike = compileMasks(n, nav.bikeRuns, 'district ' + d.id + '.bikeRuns');
    for (var ci = 0; ci < n; ci++) {
      if (bike[ci] && !walk[ci]) {
        throw invalid('district ' + d.id + ': bike mask is not a subset of walk mask');
      }
    }

    if (!obj(d.anchors)) throw invalid('district ' + d.id + ': anchors missing');
    // Required identities come from the manifest array when loading. JSON
    // property enumeration order carries no semantic authority, so it is
    // never used to decide which anchor is the entrance.
    var anchorKeys = Object.keys(d.anchors);
    var anchorIds = expected ? expected.anchorIds : anchorKeys;
    if (expected && anchorKeys.length !== anchorIds.length) {
      throw invalid('district ' + d.id + ': anchor set mismatch');
    }
    var present = Object.create(null);
    for (var ak = 0; ak < anchorKeys.length; ak++) present[anchorKeys[ak]] = true;
    for (var ai = 0; ai < anchorIds.length; ai++) {
      var aid = anchorIds[ai];
      if (!present[aid]) throw invalid('district ' + d.id + ': missing anchor ' + aid);
      var an = d.anchors[aid];
      if (!finite(an.x) || !finite(an.y) || !finite(an.sourceX) || !finite(an.sourceY)) {
        throw invalid('district ' + d.id + ': anchor ' + aid + ' has non-finite coordinates');
      }
      if (!nonEmptyString(an.featureId)) {
        throw invalid('district ' + d.id + ': anchor ' + aid + ' featureId missing');
      }
      var cx = Math.floor((an.x - nav.origin[0]) / nav.cellSize);
      var cy = Math.floor((an.y - nav.origin[1]) / nav.cellSize);
      if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows ||
        !walk[cy * nav.cols + cx]) {
        throw invalid('district ' + d.id + ': anchor ' + aid + ' is not on a safe walk cell');
      }
    }
    if (!obj(d.entrance) || !finite(d.entrance.x) || !finite(d.entrance.y)) {
      throw invalid('district ' + d.id + ': entrance malformed');
    }
    // Entrance must always be finite and land on a safe walk cell.
    var enx = Math.floor((d.entrance.x - nav.origin[0]) / nav.cellSize);
    var eny = Math.floor((d.entrance.y - nav.origin[1]) / nav.cellSize);
    if (enx < 0 || eny < 0 || enx >= nav.cols || eny >= nav.rows ||
      !walk[eny * nav.cols + enx]) {
      throw invalid('district ' + d.id + ': entrance is not on a safe walk cell');
    }
    if (expected) {
      // When a manifest is present its anchorIds array holds the compiler's
      // required order; the entrance is its first identity.
      var first = d.anchors[anchorIds[0]];
      if (d.entrance.x !== first.x || d.entrance.y !== first.y) {
        throw invalid('district ' + d.id + ': entrance must be the first required anchor');
      }
    }

    return {
      cols: nav.cols, rows: nav.rows, n: n,
      origin: [nav.origin[0], nav.origin[1]],
      cellSize: nav.cellSize, walk: walk, bike: bike
    };
  }

  /* ------------------------------------------------------------------ */
  /* Navigator                                                          */
  /* ------------------------------------------------------------------ */

  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }
  function yieldTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function resolveModeOptions(options, where) {
    var o = options || {};
    var mode = o.mode === undefined ? 'walk' : o.mode;
    if (mode !== 'walk' && mode !== 'bike') {
      throw err('TypeError', 'ERR_UNSUPPORTED_MODE', where + ': mode must be "walk" or "bike"');
    }
    var radius = o.radius === undefined ? MAX_RADIUS : o.radius;
    if (typeof radius !== 'number' || !Number.isFinite(radius)) {
      throw err('TypeError', 'ERR_BAD_RADIUS', where + ': radius must be a finite number');
    }
    if (radius > MAX_RADIUS) {
      throw err('RangeError', 'ERR_UNSUPPORTED_RADIUS',
        where + ': radius ' + radius + ' exceeds supported 0.4 m');
    }
    if (radius < 0) {
      throw err('RangeError', 'ERR_BAD_RADIUS', where + ': radius must be >= 0');
    }
    return { mode: mode, radius: radius };
  }

  function requirePoint(p, where) {
    if (!p || typeof p !== 'object' || !finite(p.x) || !finite(p.y)) {
      throw err('TypeError', 'ERR_BAD_POINT', where + ': point needs finite numeric x and y');
    }
  }

  function buildNavigator(compiled) {
    var disposed = false;
    var cols = compiled.cols, rows = compiled.rows, n = compiled.n;
    var ox = compiled.origin[0], oy = compiled.origin[1], cs = compiled.cellSize;
    var walk = compiled.walk, bike = compiled.bike;
    var width = cols * cs, height = rows * cs;
    var navAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;

    function ensure() {
      if (disposed) throw err('Error', 'ERR_NAV_DISPOSED', 'navigator has been disposed');
    }
    function maskFor(mode) { return mode === 'bike' ? bike : walk; }

    function cellIndexOf(x, y) {
      if (x < ox || y < oy || x >= ox + width || y >= oy + height) return -1;
      var cx = Math.floor((x - ox) / cs);
      var cy = Math.floor((y - oy) / cs);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
      return cy * cols + cx;
    }

    function isWalkable(p, options) {
      ensure();
      requirePoint(p, 'isWalkable');
      var o = resolveModeOptions(options, 'isWalkable');
      var idx = cellIndexOf(p.x, p.y);
      if (idx < 0) return false;
      return maskFor(o.mode)[idx] === 1;
    }

    // Every closed grid cell touched by the centre segment. When the line
    // crosses a grid corner exactly, both corner-adjacent side cells are
    // included so diagonal corner cutting is rejected.
    function supercover(ax, ay, bx, by) {
      var x0 = (ax - ox) / cs, y0 = (ay - oy) / cs;
      var x1 = (bx - ox) / cs, y1 = (by - oy) / cs;
      var ix = Math.floor(x0), iy = Math.floor(y0);
      var ex = Math.floor(x1), ey = Math.floor(y1);
      var dx = x1 - x0, dy = y1 - y0;
      var sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      var sy = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
      var EPS = 1e-9;
      var cells = [[ix, iy]];
      if (sx === 0 && sy === 0) return cells;
      var tMaxX = sx === 0 ? Infinity :
        ((sx > 0 ? (ix + 1 - x0) : (x0 - ix)) / Math.abs(dx));
      var tMaxY = sy === 0 ? Infinity :
        ((sy > 0 ? (iy + 1 - y0) : (y0 - iy)) / Math.abs(dy));
      var tDeltaX = sx === 0 ? Infinity : (1 / Math.abs(dx));
      var tDeltaY = sy === 0 ? Infinity : (1 / Math.abs(dy));
      var guard = 0;
      while ((ix !== ex || iy !== ey) && guard++ <= n + 4) {
        if (tMaxX < tMaxY - EPS) {
          ix += sx; tMaxX += tDeltaX;
        } else if (tMaxY < tMaxX - EPS) {
          iy += sy; tMaxY += tDeltaY;
        } else {
          // Exact corner crossing: both side cells and the diagonal.
          if (ix + sx >= 0 && ix + sx < cols) cells.push([ix + sx, iy]);
          if (iy + sy >= 0 && iy + sy < rows) cells.push([ix, iy + sy]);
          ix += sx; iy += sy;
          tMaxX += tDeltaX; tMaxY += tDeltaY;
        }
        cells.push([ix, iy]);
      }
      return cells;
    }

    function segmentWalkable(a, b, options) {
      ensure();
      requirePoint(a, 'segmentWalkable.a');
      requirePoint(b, 'segmentWalkable.b');
      var o = resolveModeOptions(options, 'segmentWalkable');
      // Endpoints are included explicitly and must be safe.
      if (!isWalkable(a, o) || !isWalkable(b, o)) return false;
      var mask = maskFor(o.mode);
      var cells = supercover(a.x, a.y, b.x, b.y);
      for (var i = 0; i < cells.length; i++) {
        var cx = cells[i][0], cy = cells[i][1];
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
        if (mask[cy * cols + cx] !== 1) return false;
      }
      return true;
    }

    var NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    function BinaryHeap() {
      this.a = [];
    }
    BinaryHeap.prototype.size = function () { return this.a.length; };
    BinaryHeap.prototype.push = function (node) {
      var a = this.a;
      a.push(node);
      var i = a.length - 1;
      while (i > 0) {
        var par = (i - 1) >> 1;
        if (a[par].f <= a[i].f) break;
        var t = a[par]; a[par] = a[i]; a[i] = t;
        i = par;
      }
    };
    BinaryHeap.prototype.pop = function () {
      var a = this.a;
      var top = a[0];
      var last = a.pop();
      if (a.length > 0) {
        a[0] = last;
        var i = 0;
        for (;;) {
          var l = 2 * i + 1, r = l + 1, best = i;
          if (l < a.length && a[l].f < a[best].f) best = l;
          if (r < a.length && a[r].f < a[best].f) best = r;
          if (best === i) break;
          var t = a[best]; a[best] = a[i]; a[i] = t;
          i = best;
        }
      }
      return top;
    };

    function checkSignal(signal) {
      if ((signal && signal.aborted) || (navAbort && navAbort.signal.aborted)) {
        throw abortError('route cancelled');
      }
    }

    // A* on the bounded four-neighbour cell graph. No route cache; every
    // call allocates its own bounded arrays and releases them on return.
    async function route(a, b, options) {
      ensure();
      requirePoint(a, 'route.start');
      requirePoint(b, 'route.end');
      var o = resolveModeOptions(options || {}, 'route');
      var signal = options && options.signal;
      var onProgress = options && options.onProgress;
      checkSignal(signal);
      var result = function (found, reason, points, length, visited) {
        return { found: found, reason: reason, points: points, length: length, visited: visited };
      };
      var sIdx = cellIndexOf(a.x, a.y);
      var gIdx = cellIndexOf(b.x, b.y);
      if (sIdx < 0 || !maskFor(o.mode)[sIdx]) {
        return result(false, 'start-not-walkable', [], 0, 0);
      }
      if (gIdx < 0 || !maskFor(o.mode)[gIdx]) {
        return result(false, 'end-not-walkable', [], 0, 0);
      }
      if (sIdx === gIdx) {
        return result(true, null, [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
          Math.hypot(b.x - a.x, b.y - a.y), 1);
      }
      var mask = maskFor(o.mode);
      var gx0 = gIdx % cols, gy0 = (gIdx - gx0) / cols;
      var gCost = new Int32Array(n).fill(-1);
      var came = new Int32Array(n).fill(-1);
      var closed = new Uint8Array(n);
      var heap = new BinaryHeap();
      gCost[sIdx] = 0;
      heap.push({ f: Math.abs((sIdx % cols) - gx0) + Math.abs(((sIdx - (sIdx % cols)) / cols) - gy0), idx: sIdx });
      var visited = 0;
      var expansions = 0;
      var lastYield = nowMs();

      try {
        while (heap.size() > 0) {
          if (++expansions >= YIELD_EVERY_EXPANSIONS || nowMs() - lastYield >= YIELD_EVERY_MS) {
            await yieldTick();
            checkSignal(signal);
            expansions = 0;
            lastYield = nowMs();
            safeProgress(onProgress, { phase: 'search', visited: visited });
          }
          var cur = heap.pop().idx;
          if (closed[cur]) continue;
          closed[cur] = 1;
          visited++;
          if (cur === gIdx) {
            var built = buildPoints(came, sIdx, gIdx, a, b, o);
            return result(true, null, built.points, built.length, visited);
          }
          var cx = cur % cols, cy = (cur - cx) / cols;
          for (var ni = 0; ni < 4; ni++) {
            var nx = cx + NEIGH[ni][0], ny = cy + NEIGH[ni][1];
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            var nidx = ny * cols + nx;
            if (mask[nidx] !== 1) continue;
            var ng = gCost[cur] + 1;
            if (gCost[nidx] === -1 || ng < gCost[nidx]) {
              gCost[nidx] = ng;
              came[nidx] = cur;
              var h = Math.abs(nx - gx0) + Math.abs(ny - gy0);
              heap.push({ f: ng + h, idx: nidx });
            }
          }
        }
        return result(false, 'no-route', [], 0, visited);
      } finally {
        gCost = null; came = null; closed = null; heap = null;
      }
    }

    function buildPoints(came, sIdx, gIdx, a, b, o) {
      var chain = [];
      var cur = gIdx;
      while (cur !== -1) {
        chain.push(cur);
        if (cur === sIdx) break;
        cur = came[cur];
      }
      chain.reverse();
      // Actual metre points: supplied exact endpoints, cell centres between.
      var pts = [{ x: a.x, y: a.y }];
      for (var i = 1; i < chain.length - 1; i++) {
        var idx = chain[i];
        var cx = idx % cols, cy = (idx - cx) / cols;
        pts.push({ x: ox + (cx + 0.5) * cs, y: oy + (cy + 0.5) * cs });
      }
      pts.push({ x: b.x, y: b.y });
      // Compress only collinear points whose merged segment is provably safe.
      if (pts.length > 2) {
        var kept = [pts[0]];
        for (var k = 1; k < pts.length - 1; k++) {
          var prev = kept[kept.length - 1];
          var p = pts[k];
          var q = pts[k + 1];
          var collinear = ((p.x - prev.x) * (q.y - p.y)) === ((p.y - prev.y) * (q.x - p.x));
          if (!collinear || !segmentWalkable(prev, q, o)) kept.push(p);
        }
        kept.push(pts[pts.length - 1]);
        pts = kept;
      }
      var length = 0;
      for (var t = 1; t < pts.length; t++) {
        length += Math.hypot(pts[t].x - pts[t - 1].x, pts[t].y - pts[t - 1].y);
      }
      return { points: pts, length: length };
    }

    return {
      isWalkable: isWalkable,
      segmentWalkable: segmentWalkable,
      route: route,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (navAbort) { try { navAbort.abort(); } catch (e) { /* ignore */ } }
        walk = null; bike = null;
      },
      get disposed() { return disposed; }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Session                                                            */
  /* ------------------------------------------------------------------ */

  function linkSignal(external, ctrl, already) {
    if (!external) return;
    if (external.aborted) { ctrl.abort(external.reason); return; }
    var onAbort = function () { ctrl.abort(external.reason); };
    external.addEventListener('abort', onAbort, { once: true });
  }

  async function open(manifestUrl, options) {
    var opts = options || {};
    var base = manifestBaseUrl(manifestUrl);
    var fetchImpl = opts.fetch || (typeof globalThis !== 'undefined' && globalThis.fetch);
    if (typeof fetchImpl !== 'function') {
      throw err('Error', 'ERR_NO_FETCH', 'fetch implementation is unavailable');
    }
    var cryptoApi = getCrypto();
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl && opts.signal) linkSignal(opts.signal, ctrl);
    var signal = ctrl ? ctrl.signal : opts.signal;

    var fetchCount = 0;
    function countingFetch(u, fopts) {
      fetchCount++;
      return fetchImpl(u, fopts);
    }

    // Manifest cap is enforced on the wire before any resource is fetched.
    var mRaw = await download(countingFetch, base, MANIFEST_CAP, MANIFEST_CAP,
      signal, opts.onProgress, 'manifest');
    if (isAbortSignalAborted(signal)) throw abortError();
    var mJson;
    try {
      mJson = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(mRaw));
    } catch (e) {
      throw invalid('manifest: invalid JSON or not UTF-8');
    }
    var manifest = validateManifest(mJson);
    // Bounds are checked before the overview request is issued.
    checkMetadataCaps(manifest.overview, OVERVIEW_RAW_CAP, OVERVIEW_GZIP_CAP, 'manifest.overview');

    var overviewUrl = safeResourceUrl(manifest.overview.url, base);
    var overviewLoaded = await fetchJson(countingFetch, overviewUrl, manifest.overview,
      OVERVIEW_GZIP_CAP, OVERVIEW_RAW_CAP, signal, opts.onProgress, 'overview', cryptoApi);
    var overview = validateOverview(overviewLoaded.json, manifest);

    var disposed = false;
    var rootAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var activeEntry = null;
    var pending = null; // {req, id, ctrl}
    var seq = 0;
    var overviewBytes = overviewLoaded.bytes;

    function throwIfDisposed() {
      if (disposed) throw err('Error', 'ERR_SESSION_DISPOSED', 'session has been disposed');
    }

    var session = {
      manifest: manifest,
      overview: overview,
      active: null,
      loadDistrict: function (id, loadOpts) {
        var lo = loadOpts || {};
        if (disposed) return Promise.reject(
          err('Error', 'ERR_SESSION_DISPOSED', 'session has been disposed'));
        var entry = null;
        for (var i = 0; i < manifest.districts.length; i++) {
          if (manifest.districts[i].id === id) { entry = manifest.districts[i]; break; }
        }
        if (!entry) {
          return Promise.reject(invalid('unknown district id: ' + String(id)));
        }
        var url;
        try { url = safeResourceUrl(entry.url, base); }
        catch (e) { return Promise.reject(e); }
        // Declared bounds are enforced before any district request.
        try {
          checkMetadataCaps(entry, DISTRICT_RAW_CAP, DISTRICT_GZIP_CAP,
            'district:' + id);
        } catch (e) { return Promise.reject(e); }

        var req = ++seq;
        if (pending) { try { pending.ctrl.abort(abortError('superseded')); } catch (e2) {} }
        var loadCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (loadCtrl) {
          if (lo.signal) linkSignal(lo.signal, loadCtrl);
          if (rootAbort) linkSignal(rootAbort.signal, loadCtrl);
        }
        var loadSignal = loadCtrl ? loadCtrl.signal : lo.signal;
        pending = { req: req, id: id, ctrl: loadCtrl };

        var clearPending = function () {
          if (pending && pending.req === req) pending = null;
        };

        return fetchJson(countingFetch, url, entry,
          DISTRICT_GZIP_CAP, DISTRICT_RAW_CAP, loadSignal, lo.onProgress,
          'district:' + id, cryptoApi).then(function (loaded) {
          try {
            if (disposed || (loadCtrl && loadCtrl.signal.aborted) || req !== seq) {
              throw abortError(req !== seq ? 'superseded' : 'aborted');
            }
            // Validate fully before replacing any observable state.
            var compiled = validateDistrict(loaded.json,
              { id: entry.id, name: entry.name, bounds: entry.bounds,
                anchorIds: entry.anchorIds, mapVersion: manifest.mapVersion });
            if (disposed || (loadCtrl && loadCtrl.signal.aborted) || req !== seq) {
              throw abortError(req !== seq ? 'superseded' : 'aborted');
            }
            var navigator = buildNavigator(compiled);
            var newActive = { data: loaded.json, navigator: navigator };
            var old = activeEntry;
            activeEntry = { holder: newActive, bytes: loaded.bytes, n: compiled.n };
            session.active = newActive; // atomic replacement; exact object returned
            old = null; // release previous district immediately
            return newActive;
          } finally {
            // Every terminal branch (success, validation failure, abort and
            // supersede) releases the pending slot. Active is only replaced
            // above, so a failure keeps the previous district and retry works.
            clearPending();
          }
        }, function (error) {
          clearPending();
          if (isAbort(error)) throw abortError(error.message || 'aborted');
          throw error; // failure leaves active untouched and permits retry
        });
      },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (pending && pending.ctrl) { try { pending.ctrl.abort(); } catch (e) {} }
        pending = null;
        if (rootAbort) { try { rootAbort.abort(); } catch (e) {} }
        if (activeEntry && activeEntry.holder && activeEntry.holder.navigator) {
          try { activeEntry.holder.navigator.dispose(); } catch (e) {}
        }
        activeEntry = null;
        session.active = null;
        session.overview = null;
        overviewBytes = 0;
      },
      diagnostics: function () {
        var retained = 0, gridBytes = 0, resourceBytes = 0, activeId = null, pendingId = null;
        if (activeEntry) {
          retained++;
          gridBytes += activeEntry.n * 2;
          resourceBytes += activeEntry.bytes;
          activeId = activeEntry.holder.data.id;
        }
        if (pending) pendingId = pending.id;
        if (overviewBytes) resourceBytes += overviewBytes;
        return {
          disposed: disposed,
          activeDistrictId: activeId,
          pendingDistrictId: pendingId,
          retainedDistrictCount: retained,
          gridBytes: gridBytes,
          resourceBytes: resourceBytes,
          fetchCount: fetchCount
        };
      }
    };
    return session;
  }

  return {
    open: open,
    createNavigator: function (district) {
      var compiled = validateDistrict(district, null);
      return buildNavigator(compiled);
    },
    // Exposed for tests/diagnostics only.
    _internal: {
      safeResourceUrl: safeResourceUrl,
      validateManifest: validateManifest,
      validateDistrict: validateDistrict
    }
  };
});

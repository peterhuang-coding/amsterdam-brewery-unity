/*
 * D27 compact-runtime loader (amsterdam-geo-runtime-manifest/v1).
 *
 * Loads the deterministic chunked output of pack-runtime.py into exactly one
 * decoded coordinate buffer, exposes the accepted GEO v1 feature semantics
 * through lazy array-compatible ring views (no retained [x,y] pair arrays),
 * validates every declared checksum/count/offset/cap, and builds the accepted
 * navigator/renderer through their cooperative async factories.
 *
 * Guarantees:
 *  - gzip is decoded exactly once per response, whether the server sends a
 *    raw .gz body or transport Content-Encoding: gzip that the platform has
 *    already inflated (decision is made on the actual response bytes);
 *  - the runtime is published only after every chunk is fetched, inflated,
 *    verified and assembled and both indexes are ready;
 *  - abort/dispose/retry/checksum/cap failures reject and release everything;
 *  - precomputed routes bind to the manifest geometry hash; an unknown hash
 *    never makes an edge compatible, walk-only edges never serve bike queries,
 *    endpoints are never snapped or moved.
 *
 * UMD: globalThis.AmsterdamGeoRuntime / module.exports. No bundler required.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AmsterdamGeoRuntime = factory();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MANIFEST_FORMAT = 'amsterdam-geo-runtime-manifest/v1';
  var METADATA_FORMAT = 'amsterdam-geo-runtime-metadata/v1';
  var ROUTES_FORMAT = 'amsterdam-geo-routes/v1';
  var LAYER_NAMES = ['water', 'buildings', 'roads', 'bridges'];
  var GZIP_MAGIC_0 = 0x1f;
  var GZIP_MAGIC_1 = 0x8b;

  var DEFAULT_CONCURRENCY = 4;
  var DEFAULT_MAX_RETRIES = 2;
  var DEFAULT_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
  var DEFAULT_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
  var DEFAULT_MAX_INFLIGHT_BYTES = 32 * 1024 * 1024;
  var DEFAULT_MAX_CHUNKS = 4096;

  // --------------------------------------------------------------------------
  // Error types (names are part of the observable contract).
  // --------------------------------------------------------------------------

  function makeError(name, message) {
    var err = new Error(message);
    err.name = name;
    return err;
  }
  function FormatError(message) { return makeError('FormatError', message); }
  function ChecksumMismatchError(message) { return makeError('ChecksumMismatchError', message); }
  function CapExceededError(message) { return makeError('CapExceededError', message); }
  function HttpError(status, url, message) {
    var err = makeError('HttpError', message || ('HTTP ' + status + ' for ' + url));
    err.status = status;
    err.url = url;
    return err;
  }
  function RetriesExhaustedError(message, last) {
    var err = makeError('RetriesExhaustedError', message);
    err.lastError = last || null;
    return err;
  }
  function abortError(message) {
    try { return new DOMException(message || 'operation aborted', 'AbortError'); }
    catch (e) {
      var err = new Error(message || 'operation aborted');
      err.name = 'AbortError';
      return err;
    }
  }
  function disposedError() { return makeError('ObjectDisposedError', 'runtime has been disposed'); }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function tick(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms || 0); });
  }

  // --------------------------------------------------------------------------
  // Dependency resolution (UMD globals in browsers, relative require in Node).
  // --------------------------------------------------------------------------

  function relativeRequire(path) {
    try {
      if (typeof require === 'function') return require(path);
    } catch (e) { /* module unavailable */ }
    return null;
  }
  var Nav = (typeof globalThis !== 'undefined' && globalThis.AmsterdamGeoNavigation) ||
    relativeRequire('../navigation/geo-navigation.js');
  var Renderer = (typeof globalThis !== 'undefined' && globalThis.AmsterdamGeoRenderer) ||
    relativeRequire('../renderer/geo-map-renderer.js');

  // --------------------------------------------------------------------------
  // Streaming SHA-256 (FIPS 180-4). Pure JS so browsers and Node share the
  // exact incremental implementation and the geometry hash never needs a
  // second full-size coordinate copy.
  // --------------------------------------------------------------------------

  var K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function Sha256() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    this.buf = new Uint8Array(64);
    this.buflen = 0;
    this.bytes = 0;
    this.w = new Uint32Array(64);
  }

  Sha256.prototype._block = function (data, off) {
    var w = this.w, h = this.h;
    for (var i = 0; i < 16; i++) {
      w[i] = ((data[off + i * 4] << 24) | (data[off + i * 4 + 1] << 16) |
        (data[off + i * 4 + 2] << 8) | (data[off + i * 4 + 3])) >>> 0;
    }
    for (var j = 16; j < 64; j++) {
      var v15 = w[j - 15], v2 = w[j - 2];
      var s0 = ((v15 >>> 7) | (v15 << 25)) ^ ((v15 >>> 18) | (v15 << 14)) ^ (v15 >>> 3);
      var s1 = ((v2 >>> 17) | (v2 << 15)) ^ ((v2 >>> 19) | (v2 << 13)) ^ (v2 >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (var t = 0; t < 64; t++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  };

  Sha256.prototype.update = function (bytes) {
    var n = bytes.length, pos = 0;
    this.bytes += n;
    if (this.buflen) {
      while (pos < n && this.buflen < 64) this.buf[this.buflen++] = bytes[pos++];
      if (this.buflen === 64) { this._block(this.buf, 0); this.buflen = 0; }
    }
    while (n - pos >= 64) { this._block(bytes, pos); pos += 64; }
    while (pos < n) this.buf[this.buflen++] = bytes[pos++];
    return this;
  };

  Sha256.prototype.hex = function () {
    var bitHi = Math.floor(this.bytes / 0x20000000) >>> 0;
    var bitLo = (this.bytes << 3) >>> 0;
    var padLen = this.buflen < 56 ? 56 - this.buflen : 120 - this.buflen;
    var tail = new Uint8Array(this.buflen + padLen + 8);
    tail.set(this.buf.subarray(0, this.buflen), 0);
    tail[this.buflen] = 0x80;
    var dv = new DataView(tail.buffer);
    dv.setUint32(tail.length - 8, bitHi);
    dv.setUint32(tail.length - 4, bitLo);
    this._block(tail, 0);
    if (tail.length > 64) this._block(tail, 64);
    var out = '';
    for (var i = 0; i < 8; i++) {
      var s = this.h[i].toString(16);
      out += '00000000'.slice(s.length) + s;
    }
    return out;
  };

  function sha256Hex(bytes) { return new Sha256().update(bytes).hex(); }

  // --------------------------------------------------------------------------
  // Exactly-once gzip handling.
  //
  // Raw .gz files arrive with gzip magic bytes and no Content-Encoding header;
  // transport-encoded responses are inflated by the HTTP stack (fetch/undici/
  // browsers do this transparently), so the bytes handed to the runtime then
  // have no magic. The decision is made from the ACTUAL bytes, never from the
  // URL extension (query strings/hashes must not matter), so double inflation
  // is impossible and an undecoded-but-header-marked body is still handled.
  // --------------------------------------------------------------------------

  function hasGzipMagic(bytes) {
    return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
  }

  function inflateBytes(bytes) {
    if (typeof DecompressionStream !== 'undefined' &&
        typeof Blob !== 'undefined' && typeof Response !== 'undefined') {
      try {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer().then(function (ab) {
          return new Uint8Array(ab);
        });
      } catch (e) { /* fall through to zlib */ }
    }
    var zlib = relativeRequire('zlib');
    if (zlib && typeof zlib.gunzipSync === 'function') {
      return Promise.resolve(zlib.gunzipSync(bytes));
    }
    return Promise.reject(FormatError('no gzip decoder available in this runtime'));
  }

  async function decodeBody(rawBytes, contentEncoding, stats) {
    var magic = hasGzipMagic(rawBytes);
    var headerGzip = /(^|,)\s*gzip(\s*($|,)|\s*;)/i.test(contentEncoding || '');
    if (magic) {
      var payload = await inflateBytes(rawBytes);
      stats.decompressedByRuntime++;
      return payload;
    }
    if (headerGzip) stats.decompressedByTransport++;
    return rawBytes;
  }

  // --------------------------------------------------------------------------
  // Manifest / metadata validation
  // --------------------------------------------------------------------------

  function requireNum(v, where) {
    if (!isNum(v)) throw FormatError(where + ' must be a finite number');
    return v;
  }

  function validateManifest(m) {
    if (!m || typeof m !== 'object') throw FormatError('manifest must be a JSON object');
    if (m.format !== MANIFEST_FORMAT) throw FormatError('unsupported manifest format: ' + m.format);
    if (m.schemaVersion !== 1) throw FormatError('manifest schemaVersion must be 1');
    if (!m.data || typeof m.data !== 'object') throw FormatError('manifest.data is required');
    if (m.data.schemaVersion !== 1) throw FormatError('data.schemaVersion must be 1');
    if (!isNum(m.data.width) || !isNum(m.data.height) || m.data.width <= 0 || m.data.height <= 0) {
      throw FormatError('data.width/data.height must be positive finite metres');
    }
    if (!m.data.projection || typeof m.data.projection !== 'object') {
      throw FormatError('data.projection must be retained in the manifest');
    }
    if (m.coordEncoding !== 'int32-millimetres' && m.coordEncoding !== 'float64-le') {
      throw FormatError('unsupported coordEncoding: ' + m.coordEncoding);
    }
    if (m.endianness !== 'little' || m.interleaved !== true) {
      throw FormatError('runtime expects little-endian interleaved coordinates');
    }
    var ob = m.coordEncoding === 'int32-millimetres' ? 4 : 8;
    if (m.ordinateBytes !== ob) throw FormatError('ordinateBytes/encoding mismatch');
    if (!isInt(m.pairCount) || m.pairCount <= 0) throw FormatError('pairCount must be a positive integer');
    if (m.ordinateCount !== m.pairCount * 2) throw FormatError('ordinateCount must be 2*pairCount');
    if (!isInt(m.featureCount) || m.featureCount <= 0) throw FormatError('featureCount must be a positive integer');
    if (typeof m.geometrySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(m.geometrySha256)) {
      throw FormatError('manifest.geometrySha256 must be 64 hex characters');
    }
    if (!Array.isArray(m.chunks) || !m.chunks.length) throw FormatError('manifest.chunks must be non-empty');
    var layerCounts = m.layerCounts || {};
    var sumLayers = 0;
    for (var i = 0; i < LAYER_NAMES.length; i++) {
      var c = layerCounts[LAYER_NAMES[i]];
      if (!isInt(c) || c < 0) throw FormatError('layerCounts.' + LAYER_NAMES[i] + ' missing');
      sumLayers += c;
    }
    if (sumLayers !== m.featureCount) throw FormatError('layerCounts do not sum to featureCount');
    if (Array.isArray(m.layerOrder)) {
      for (var li = 0; li < m.layerOrder.length; li++) {
        if (m.layerOrder[li] !== LAYER_NAMES[li]) {
          throw FormatError('unexpected layer order: ' + m.layerOrder.join(','));
        }
      }
    }
    var features = 0, pairs = 0, coordBytes = 0, downloadBytes = 0, metaBytes = 0;
    for (var ci = 0; ci < m.chunks.length; ci++) {
      var ch = m.chunks[ci];
      if (!ch || typeof ch !== 'object') throw FormatError('chunks[' + ci + '] malformed');
      if (ch.index !== ci) throw FormatError('chunk index discontinuity at ' + ci);
      if (typeof ch.metadata !== 'string' || typeof ch.coords !== 'string') {
        throw FormatError('chunks[' + ci + '] file names missing');
      }
      if (!isInt(ch.features) || ch.features <= 0) throw FormatError('chunks[' + ci + '].features invalid');
      if (!isInt(ch.pairCount) || ch.pairCount <= 0) throw FormatError('chunks[' + ci + '].pairCount invalid');
      if (!isInt(ch.pairOffset) || ch.pairOffset !== pairs) {
        throw FormatError('chunks[' + ci + '].pairOffset discontinuity');
      }
      if (!isInt(ch.coordBytes) || ch.coordBytes !== ch.pairCount * 2 * ob) {
        throw FormatError('chunks[' + ci + '].coordBytes/count mismatch');
      }
      [['coordCompressedBytes'], ['metadataCompressedBytes'], ['metadataBytes'],
       ['coordSha256'], ['metadataSha256']].forEach(function (k) {
        if (typeof ch[k[0]] !== 'string' && !isInt(ch[k[0]])) {
          throw FormatError('chunks[' + ci + '].' + k[0] + ' missing');
        }
      });
      if (!/^[0-9a-f]{64}$/.test(ch.coordSha256) || !/^[0-9a-f]{64}$/.test(ch.metadataSha256)) {
        throw FormatError('chunks[' + ci + '] hashes must be 64 hex characters');
      }
      features += ch.features;
      pairs += ch.pairCount;
      coordBytes += ch.coordBytes;
      metaBytes += ch.metadataBytes;
      downloadBytes += ch.coordCompressedBytes + ch.metadataCompressedBytes;
    }
    if (features !== m.featureCount) throw FormatError('chunk feature counts do not sum to featureCount');
    if (pairs !== m.pairCount) throw FormatError('chunk pair counts do not sum to pairCount');
    if (coordBytes !== m.totalCoordBytes) throw FormatError('totalCoordBytes mismatch');
    if (downloadBytes !== m.totalDownloadBytes) throw FormatError('totalDownloadBytes mismatch');
    if (m.totalMetadataCompressedBytes + m.totalCoordCompressedBytes !== m.totalDownloadBytes) {
      throw FormatError('compressed byte totals mismatch');
    }
    return { uncompressedBytes: coordBytes + metaBytes, downloadBytes: downloadBytes };
  }

  function validateFeatureRecord(rec, where, prevOffset, pairCount) {
    if (!rec || typeof rec !== 'object') throw FormatError(where + ': record must be an object');
    if (!isInt(rec.l) || rec.l < 0 || rec.l > 3) throw FormatError(where + ': bad layer code');
    if (typeof rec.id !== 'string' || !rec.id) throw FormatError(where + ': id must be a non-empty string');
    if (rec.s !== null && typeof rec.s !== 'string') throw FormatError(where + ': sourceId must be string|null');
    if (rec.u !== null && typeof rec.u !== 'string') throw FormatError(where + ': localId must be string|null');
    if (!rec.p || typeof rec.p !== 'object') throw FormatError(where + ': properties must be an object');
    if (!isInt(rec.o) || rec.o !== prevOffset) throw FormatError(where + ': feature pair offset discontinuity');
    if (!Array.isArray(rec.g) || !rec.g.length) throw FormatError(where + ': polygon groups missing');
    if (!Array.isArray(rec.b) || rec.b.length !== 4 ||
        !rec.b.every(isNum) || rec.b[2] < rec.b[0] || rec.b[3] < rec.b[1]) {
      throw FormatError(where + ': bounds must be four finite numbers ordered min/max');
    }
    var verts = 0;
    for (var pi = 0; pi < rec.g.length; pi++) {
      var rings = rec.g[pi];
      if (!Array.isArray(rings) || !rings.length) throw FormatError(where + ': polygon ' + pi + ' malformed');
      for (var ri = 0; ri < rings.length; ri++) {
        var n = rings[ri];
        if (!isInt(n) || n < 4) throw FormatError(where + ': ring ' + ri + ' must have >= 4 vertices');
        verts += n;
      }
    }
    if (rec.o + verts > pairCount) throw FormatError(where + ': vertices exceed global pair count');
    return verts;
  }

  // --------------------------------------------------------------------------
  // Lazy array-compatible ring views over the single coordinate buffer.
  //
  // The proxy target is a real Array (so Array.isArray, for..of and every
  // existing predicate work unchanged), with only its length pre-set; numeric
  // indices read straight from the global typed buffer. Accessing ring[i]
  // yields a fresh [x,y] pair (nothing is retained); existing geometry code
  // consumes the two scalars immediately.
  // --------------------------------------------------------------------------

  function makeRingView(coordBuffer, encoding, basePair, vertexCount) {
    var intView = encoding === 'int32-millimetres' ? coordBuffer.ints : null;
    var dblView = encoding === 'float64-le' ? coordBuffer.doubles : null;
    function pairAt(within, target) {
      var j = (basePair + within) * 2;
      var x, y;
      if (intView) { x = intView[j] / 1000; y = intView[j + 1] / 1000; }
      else { x = dblView[j]; y = dblView[j + 1]; }
      target[0] = x; target[1] = y;
      return target;
    }
    var target = new Array(vertexCount);
    return new Proxy(target, {
      get: function (t, prop, receiver) {
        if (typeof prop === 'string') {
          var idx = +prop;
          if (Number.isInteger(idx) && idx >= 0 && idx < vertexCount) {
            return pairAt(idx, [0, 0]);
          }
        }
        return Reflect.get(t, prop, receiver);
      }
    });
  }

  function assembleData(manifest, chunkRecords) {
    var encoding = manifest.coordEncoding;
    var layers = { water: [], buildings: [], roads: [], bridges: [] };
    var featureIndex = 0, cursor = 0;
    for (var ci = 0; ci < chunkRecords.length; ci++) {
      var doc = chunkRecords[ci];
      if (doc.format !== METADATA_FORMAT) throw FormatError('bad metadata format in chunk ' + ci);
      if (doc.chunk !== ci) throw FormatError('metadata chunk index mismatch ' + ci);
      if (!isInt(doc.pairOffset) || doc.pairOffset !== manifest.chunks[ci].pairOffset) {
        throw FormatError('metadata pairOffset disagrees with manifest for chunk ' + ci);
      }
      var recs = doc.features;
      if (!Array.isArray(recs) || recs.length !== manifest.chunks[ci].features) {
        throw FormatError('metadata feature count disagrees with manifest for chunk ' + ci);
      }
      for (var fi = 0; fi < recs.length; fi++) {
        var rec = recs[fi];
        var verts = validateFeatureRecord(rec, 'feature ' + (rec && rec.id || featureIndex), cursor, manifest.pairCount);
        var ringCursor = 0;
        var polygons = rec.g.map(function (ringCounts) {
          return ringCounts.map(function (n) {
            var base = rec.o + ringCursor;
            ringCursor += n;
            return makeRingView(manifest._coordBuffer, encoding, base, n);
          });
        });
        if (ringCursor !== verts) throw FormatError('feature ' + rec.id + ': ring counts inconsistent');
        var feature = {
          id: rec.id,
          sourceId: rec.s,
          localId: rec.u,
          properties: rec.p,
          polygons: polygons,
          bounds: rec.b
        };
        layers[LAYER_NAMES[rec.l]].push(feature);
        cursor += verts;
        featureIndex++;
      }
    }
    if (featureIndex !== manifest.featureCount) throw FormatError('assembled feature count mismatch');
    if (cursor !== manifest.pairCount) throw FormatError('assembled pair count mismatch');
    for (var ln = 0; ln < LAYER_NAMES.length; ln++) {
      if (layers[LAYER_NAMES[ln]].length !== manifest.layerCounts[LAYER_NAMES[ln]]) {
        throw FormatError('assembled layer count mismatch for ' + LAYER_NAMES[ln]);
      }
    }
    var data = Object.assign({}, manifest.data, { layers: layers });
    return data;
  }

  // --------------------------------------------------------------------------
  // Geometry hash: canonical little-endian Float64 of every ordinate in
  // flatten order, independent of the storage encoding. The int32 path fills
  // one reused scratch block (never a second coordinate copy).
  // --------------------------------------------------------------------------

  function hostIsLittleEndian() {
    var b = new ArrayBuffer(8);
    new Float64Array(b)[0] = 1;
    return new Uint8Array(b)[0] === 0 && new Uint8Array(b)[7] === 0x3f;
  }

  var HASH_BLOCK_PAIRS = 8192;

  function computeGeometrySha(manifest) {
    if (!hostIsLittleEndian()) throw FormatError('big-endian hosts are not supported');
    var pairCount = manifest.pairCount;
    var hash = new Sha256();
    var scratch = new Float64Array(HASH_BLOCK_PAIRS * 2);
    var scratchBytes = new Uint8Array(scratch.buffer);
    if (manifest.coordEncoding === 'int32-millimetres') {
      var ints = manifest._coordBuffer.ints;
      for (var p = 0; p < pairCount; p += HASH_BLOCK_PAIRS) {
        var n = Math.min(HASH_BLOCK_PAIRS, pairCount - p);
        for (var k = 0; k < n * 2; k++) {
          var v = ints[(p * 2) + k] / 1000;
          if (!isFinite(v)) throw FormatError('non-finite decoded ordinate');
          scratch[k] = v;
        }
        hash.update(new Uint8Array(scratch.buffer, 0, n * 16));
      }
    } else {
      var doubles = manifest._coordBuffer.doubles;
      for (var d = 0; d < pairCount * 2; d++) {
        if (!isFinite(doubles[d])) throw FormatError('non-finite decoded ordinate');
      }
      var allBytes = new Uint8Array(manifest._coordBuffer.buffer);
      var pos = 0;
      while (pos < allBytes.length) {
        var take = Math.min(scratchBytes.length, allBytes.length - pos);
        hash.update(new Uint8Array(allBytes.buffer, pos, take));
        pos += take;
      }
    }
    return hash.hex();
  }

  // --------------------------------------------------------------------------
  // Chunk fetch pipeline
  // --------------------------------------------------------------------------

  function isRetryableFetchError(err) {
    if (!err) return false;
    if (err.name === 'HttpError') {
      return err.status === 429 || (err.status >= 500 && err.status < 600);
    }
    if (err.name === 'TypeError') return true; // fetch network failure
    if (err.name === 'ChecksumMismatchError' || err.name === 'FormatError' ||
        err.name === 'CapExceededError' || err.name === 'AbortError') {
      return false;
    }
    return /network|socket|reset|timeout|terminated|econn/i.test(err.message || '');
  }

  async function fetchDecoded(url, fetchImpl, internalSignal, externalSignal, stats) {
    var attempts = 0;
    var maxAttempts = stats.maxAttempts;
    var lastError = null;
    while (attempts < maxAttempts) {
      attempts++;
      stats.fetchAttempts++;
      try {
        if (externalSignal && externalSignal.aborted) throw abortError();
        var resp = await fetchImpl(url, { signal: internalSignal });
        if (!resp || resp.ok === false) {
          throw HttpError(resp ? resp.status : 0, url);
        }
        var ce = resp.headers && typeof resp.headers.get === 'function'
          ? (resp.headers.get('content-encoding') || '') : '';
        var ab = await resp.arrayBuffer();
        var raw = new Uint8Array(ab);
        return await decodeBody(raw, ce, stats);
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') {
          if (externalSignal && externalSignal.aborted) throw abortError();
          throw err;
        }
        if (attempts >= maxAttempts || !isRetryableFetchError(err)) {
          if (attempts >= maxAttempts && isRetryableFetchError(err)) {
            throw RetriesExhaustedError(
              'fetch of ' + url + ' failed after ' + attempts + ' attempts', err);
          }
          throw err;
        }
        stats.retries++;
        await tick(Math.min(10 * Math.pow(2, attempts - 1), 200));
        if (externalSignal && externalSignal.aborted) throw abortError();
      }
    }
    throw RetriesExhaustedError('fetch of ' + url + ' failed', lastError);
  }

  async function loadChunk(index, manifest, ctx) {
    var ch = manifest.chunks[index];
    var base = new URL(manifest._baseHref);
    var metaUrl = new URL(ch.metadata, base).href;
    var coordUrl = new URL(ch.coords, base).href;
    var stats = ctx.stats;

    var metaBytes = await fetchDecoded(metaUrl, ctx.fetchImpl, ctx.controller.signal, ctx.externalSignal, stats);
    if (metaBytes.length !== ch.metadataBytes) {
      throw ChecksumMismatchError(ch.metadata + ': expected ' + ch.metadataBytes +
        ' uncompressed bytes, got ' + metaBytes.length);
    }
    if (sha256Hex(metaBytes) !== ch.metadataSha256) {
      throw ChecksumMismatchError(ch.metadata + ': sha256 mismatch');
    }
    var metaText;
    try {
      metaText = new TextDecoder('utf-8').decode(metaBytes);
    } catch (e) {
      throw FormatError(ch.metadata + ': invalid UTF-8');
    }
    var metaDoc;
    try { metaDoc = JSON.parse(metaText); }
    catch (e) { throw FormatError(ch.metadata + ': invalid JSON (' + e.message + ')'); }

    var coordBytes = await fetchDecoded(coordUrl, ctx.fetchImpl, ctx.controller.signal, ctx.externalSignal, stats);
    if (coordBytes.length !== ch.coordBytes) {
      throw ChecksumMismatchError(ch.coords + ': expected ' + ch.coordBytes +
        ' uncompressed bytes, got ' + coordBytes.length);
    }
    if (sha256Hex(coordBytes) !== ch.coordSha256) {
      throw ChecksumMismatchError(ch.coords + ': sha256 mismatch');
    }

    // Copy into the single global typed buffer (aligned typed-array set).
    var ordinateBytes = manifest.ordinateBytes;
    var pairs = ch.pairCount * 2;
    var byteOffset = ch.pairOffset * 2 * ordinateBytes;
    var src;
    var aligned = (coordBytes.byteOffset % ordinateBytes) === 0 &&
      coordBytes.byteLength + coordBytes.byteOffset === coordBytes.buffer.byteLength;
    if (!aligned) {
      var copy = new Uint8Array(ch.coordBytes);
      copy.set(coordBytes);
      coordBytes = copy;
    }
    if (ordinateBytes === 4) {
      src = new Int32Array(coordBytes.buffer, coordBytes.byteOffset, pairs);
      manifest._coordBuffer.ints.set(src, ch.pairOffset * 2);
    } else {
      src = new Float64Array(coordBytes.buffer, coordBytes.byteOffset, pairs);
      manifest._coordBuffer.doubles.set(src, ch.pairOffset * 2);
    }

    stats.compressedBytes += ch.coordCompressedBytes + ch.metadataCompressedBytes;
    stats.uncompressedBytes += ch.coordBytes + ch.metadataBytes;
    return metaDoc;
  }

  async function fetchAllChunks(manifest, ctx) {
    var concurrency = ctx.concurrency;
    var records = new Array(manifest.chunks.length);
    var next = 0, active = 0, inflight = 0, completed = 0, settled = false;
    ctx.stats.inflightPeakBytes = 0;
    return new Promise(function (resolve, reject) {
      function weight(i) {
        var c = manifest.chunks[i];
        return c.coordCompressedBytes + c.metadataCompressedBytes;
      }
      function done() {
        return completed === manifest.chunks.length;
      }
      function pump() {
        if (settled) return;
        while (active < concurrency && next < manifest.chunks.length) {
          var idx = next;
          var w = weight(idx);
          // Respect the in-flight byte budget, but never stall forever on a
          // single chunk larger than the budget (run it alone).
          if (inflight > 0 && inflight + w > ctx.maxInflightBytes) break;
          next++;
          active++;
          inflight += w;
          if (inflight > ctx.stats.inflightPeakBytes) ctx.stats.inflightPeakBytes = inflight;
          loadChunk(idx, manifest, ctx).then(function (doc) {
            if (settled) return;
            records[idx] = doc;
            active--;
            inflight -= w;
            completed++;
            if (ctx.onProgress) {
              ctx.onProgress({
                phase: 'fetch-chunks', loaded: completed, total: manifest.chunks.length,
                bytesLoaded: ctx.stats.compressedBytes, bytesTotal: manifest.totalDownloadBytes
              });
            }
            if (done()) { settled = true; resolve(records); return; }
            pump();
          }, function (err) {
            if (settled) return;
            settled = true;
            reject(err);
          });
        }
      }
      pump();
    });
  }

  // --------------------------------------------------------------------------
  // Precomputed routes service
  // --------------------------------------------------------------------------

  function validateRoutesDoc(doc) {
    if (!doc || typeof doc !== 'object') throw FormatError('routes document must be an object');
    if (doc.format !== ROUTES_FORMAT) throw FormatError('unsupported routes format: ' + doc.format);
    if (typeof doc.geometrySha256 !== 'string') throw FormatError('routes.geometrySha256 missing');
    if (!isNum(doc.radius) || doc.radius < 0) throw FormatError('routes.radius must be a non-negative number');
    if (!doc.anchors || typeof doc.anchors !== 'object') throw FormatError('routes.anchors missing');
    if (!Array.isArray(doc.edges)) throw FormatError('routes.edges must be an array');
    var anchorIds = Object.keys(doc.anchors);
    for (var i = 0; i < anchorIds.length; i++) {
      var a = doc.anchors[anchorIds[i]];
      if (!a || !isNum(a.x) || !isNum(a.y)) throw FormatError('anchor ' + anchorIds[i] + ' needs finite x,y');
    }
    for (var e = 0; e < doc.edges.length; e++) {
      var edge = doc.edges[e];
      if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
        throw FormatError('edges[' + e + '] needs from/to anchor names');
      }
      if (!doc.anchors[edge.from] || !doc.anchors[edge.to]) {
        throw FormatError('edges[' + e + '] references an unknown anchor');
      }
      ['walk', 'bike'].forEach(function (mode) {
        var r = edge[mode];
        if (!r || typeof r !== 'object') throw FormatError('edges[' + e + '].' + mode + ' missing');
        if (typeof r.found !== 'boolean') throw FormatError('edges[' + e + '].' + mode + '.found missing');
        if (r.found) {
          if (!Array.isArray(r.points) || r.points.length < 2) {
            throw FormatError('edges[' + e + '].' + mode + ' found route needs >=2 points');
          }
          r.points.forEach(function (p, pi) {
            if (!isNum(p.x) || !isNum(p.y)) {
              throw FormatError('edges[' + e + '].' + mode + '.points[' + pi + '] malformed');
            }
          });
          if (!isNum(r.length) || r.length < 0) {
            throw FormatError('edges[' + e + '].' + mode + '.length malformed');
          }
        }
      });
    }
  }

  function samePoint(p, x, y) { return p.x === x && p.y === y; }

  function makeRoutesService(doc, navigator, stats) {
    var anchors = doc.anchors;
    var radius = doc.radius;
    var graphs = { walk: new Map(), bike: new Map() };
    var direct = { walk: new Map(), bike: new Map() };
    var verification = { total: 0, verified: 0, dropped: 0, unverifiable: 0 };

    function edgeKey(a, b) { return a < b ? a + ' ' + b : b + ' ' + a; }

    function register(edge, mode) {
      var r = edge[mode];
      verification.total++;
      if (!r.found) return;
      var from = anchors[edge.from], to = anchors[edge.to];
      // Endpoint anchors must be carried by exact coordinates, never snapped.
      if (!samePoint(r.points[0], from.x, from.y) ||
          !samePoint(r.points[r.points.length - 1], to.x, to.y)) {
        verification.dropped++;
        stats.routeEdgesDropped++;
        return;
      }
      var verified = !!r.segmentsVerified;
      if (navigator) {
        // Independently revalidate every stored segment with the accepted
        // predicate over the actual loaded geometry.
        verified = true;
        for (var i = 0; i < r.points.length - 1; i++) {
          if (!navigator.segmentWalkable(r.points[i], r.points[i + 1], { mode: mode, radius: radius })) {
            verified = false;
            break;
          }
        }
      } else {
        verification.unverifiable++;
      }
      if (!verified) {
        verification.dropped++;
        stats.routeEdgesDropped++;
        return;
      }
      verification.verified++;
      var record = {
        from: edge.from, to: edge.to, length: r.length, points: r.points,
        visited: r.visited || 0, reason: r.reason || 'ok'
      };
      direct[mode].set(edgeKey(edge.from, edge.to), record);
      [edge.from, edge.to].forEach(function (name) {
        if (!graphs[mode].has(name)) graphs[mode].set(name, []);
      });
      graphs[mode].get(edge.from).push({ to: edge.to, length: r.length, edge: record });
      graphs[mode].get(edge.to).push({ to: edge.from, length: r.length, edge: record, reverse: true });
    }

    for (var i = 0; i < doc.edges.length; i++) {
      register(doc.edges[i], 'walk');
      register(doc.edges[i], 'bike');
    }

    function cloneResult(rec, mode) {
      return {
        found: true, reason: 'ok', mode: mode,
        points: rec.points.map(function (p) { return { x: p.x, y: p.y }; }),
        length: rec.length, visited: rec.visited,
        startSnap: null, endSnap: null, precomputed: true
      };
    }

    // Deterministic shortest chain across the verified anchor graph.
    function graphPath(startName, goalName, mode) {
      if (!graphs[mode].has(startName) || !graphs[mode].has(goalName)) return null;
      var dist = new Map(), prev = new Map(), closed = new Set();
      dist.set(startName, 0);
      for (var n = 0; n <= graphs[mode].size; n++) {
        var cur = null, best = Infinity;
        dist.forEach(function (d, name) {
          if (!closed.has(name) && d < best) { best = d; cur = name; }
        });
        if (cur === null) break;
        if (cur === goalName) break;
        closed.add(cur);
        var adj = graphs[mode].get(cur) || [];
        for (var i = 0; i < adj.length; i++) {
          var nb = adj[i];
          if (closed.has(nb.to)) continue;
          var nd = best + nb.length;
          if (!dist.has(nb.to) || nd + 1e-9 < dist.get(nb.to)) {
            dist.set(nb.to, nd);
            prev.set(nb.to, { from: cur, link: nb });
          }
        }
      }
      if (!prev.has(goalName) && startName !== goalName) return null;
      var links = [];
      var node = goalName;
      while (node !== startName) {
        var step = prev.get(node);
        if (!step) return null;
        links.unshift(step.link);
        node = step.from;
      }
      return { links: links, length: dist.get(goalName) };
    }

    function stitch(links) {
      var points = [], length = 0, visited = 0;
      for (var i = 0; i < links.length; i++) {
        var pts = links[i].edge.points;
        var seq = links[i].reverse ? pts.slice().reverse() : pts;
        if (i === 0) points.push({ x: seq[0].x, y: seq[0].y });
        for (var k = 1; k < seq.length; k++) {
          var last = points[points.length - 1];
          if (last.x === seq[k].x && last.y === seq[k].y) continue;
          points.push({ x: seq[k].x, y: seq[k].y });
          length += Math.hypot(seq[k].x - seq[k - 1].x, seq[k].y - seq[k - 1].y);
        }
        visited += links[i].edge.visited;
      }
      return { points: points, length: length, visited: visited };
    }

    function pointOf(from) {
      if (typeof from === 'string') {
        var a = anchors[from];
        if (!a) return null;
        return { name: from, x: a.x, y: a.y };
      }
      if (from && isNum(from.x) && isNum(from.y)) return { name: null, x: from.x, y: from.y };
      return null;
    }

    async function liveRoute(a, b, options, mode) {
      if (!navigator) {
        throw makeError('NoNavigatorError',
          'no live navigator is available and no precomputed edge matches the query');
      }
      // snapDistance is deliberately never forwarded: endpoints stay exact.
      var r = isNum(options.radius) ? options.radius : radius;
      return navigator.routeAsync({ x: a.x, y: a.y }, { x: b.x, y: b.y }, {
        mode: mode,
        radius: r,
        maxNodes: options.maxNodes,
        signal: options.signal,
        onProgress: options.onProgress
      });
    }

    function joinRoute(prefix, middle, suffix, mode) {
      var points = [];
      function append(pts, dropFirst) {
        for (var i = dropFirst ? 1 : 0; i < pts.length; i++) {
          var p = pts[i], last = points[points.length - 1];
          if (last && last.x === p.x && last.y === p.y) continue;
          points.push({ x: p.x, y: p.y });
        }
      }
      if (prefix) append(prefix.points, false);
      append(middle.points, !!prefix);
      if (suffix) append(suffix.points, true);
      var length = (prefix ? prefix.length : 0) + middle.length + (suffix ? suffix.length : 0);
      var visited = (prefix ? prefix.visited : 0) + middle.visited + (suffix ? suffix.visited : 0);
      return {
        found: true, reason: 'ok', mode: mode, points: points, length: length,
        visited: visited, startSnap: null, endSnap: null, precomputed: true
      };
    }

    var service = {
      format: doc.format,
      geometrySha256: doc.geometrySha256,
      radius: radius,
      anchors: anchors,
      forbiddenPairs: Array.isArray(doc.forbiddenPairs) ? doc.forbiddenPairs : [],
      verification: verification,
      disposed: false,

      async route(from, to, options) {
        options = options || {};
        if (this.disposed) throw disposedError();
        var mode = options.mode === 'bike' ? 'bike' : 'walk';
        // Precomputed edges are valid only at their stored radius.
        var useGraph = !isNum(options.radius) || options.radius === radius;

        var a = pointOf(from), b = pointOf(to);
        if (!a || !b) throw makeError('ValidationError', 'route endpoints must be anchor names or finite points');

        if (a.name && b.name) {
          if (useGraph) {
            var exact = direct[mode].get(edgeKey(a.name, b.name));
            if (exact) return cloneResult(exact, mode);
            var chain = graphPath(a.name, b.name, mode);
            if (chain && chain.links.length) {
              var mid = stitch(chain.links);
              return {
                found: true, reason: 'ok', mode: mode,
                points: mid.points, length: mid.length, visited: mid.visited,
                startSnap: null, endSnap: null, precomputed: true
              };
            }
          }
          return liveRoute(a, b, options, mode);
        }

        if (!useGraph || !navigator) {
          // Live fallback keeps the exact endpoints; with no navigator we
          // cannot connect arbitrary points to the graph.
          return liveRoute(a, b, options, mode);
        }

        // Bounded safe endpoint connectors: nearest anchors first, exact end
        // coordinates preserved by the accepted navigator (no snapping).
        var named = Object.keys(graphs[mode]);
        function nearest(point) {
          return named.map(function (n) {
            var p = anchors[n];
            return { name: n, d: Math.hypot(p.x - point.x, p.y - point.y) };
          }).sort(function (x, y) { return x.d - y.d; }).slice(0, 4);
        }
        var rankedStart = nearest(a);
        var rankedGoal = nearest(b);

        var best = null;
        for (var si = 0; si < rankedStart.length; si++) {
          var sa = anchors[rankedStart[si].name];
          var prefixRes = await liveRoute(a, { x: sa.x, y: sa.y }, options, mode);
          if (!prefixRes.found) continue;
          for (var gi = 0; gi < rankedGoal.length; gi++) {
            var ga = anchors[rankedGoal[gi].name];
            var path2 = graphPath(rankedStart[si].name, rankedGoal[gi].name, mode);
            if (!path2 || !path2.links.length) continue;
            var suffixRes = await liveRoute({ x: ga.x, y: ga.y }, b, options, mode);
            if (!suffixRes.found) continue;
            var candidate = joinRoute(prefixRes, stitch(path2.links), suffixRes, mode);
            if (!best || candidate.length < best.length) best = candidate;
          }
        }
        if (best) return best;
        return liveRoute(a, b, options, mode);
      },

      dispose: function () { this.disposed = true; }
    };
    return service;
  }

  // --------------------------------------------------------------------------
  // load()
  // --------------------------------------------------------------------------

  async function load(manifestUrl, options) {
    options = options || {};
    var concurrency = isInt(options.concurrency) && options.concurrency > 0 ? options.concurrency : DEFAULT_CONCURRENCY;
    var maxRetries = isInt(options.maxRetries) && options.maxRetries >= 0 ? options.maxRetries : DEFAULT_MAX_RETRIES;
    var maxDownloadBytes = isNum(options.maxDownloadBytes) && options.maxDownloadBytes > 0
      ? options.maxDownloadBytes : DEFAULT_MAX_DOWNLOAD_BYTES;
    var maxUncompressedBytes = isNum(options.maxUncompressedBytes) && options.maxUncompressedBytes > 0
      ? options.maxUncompressedBytes : DEFAULT_MAX_UNCOMPRESSED_BYTES;
    var maxInflightBytes = isNum(options.maxInflightBytes) && options.maxInflightBytes > 0
      ? options.maxInflightBytes : DEFAULT_MAX_INFLIGHT_BYTES;
    var maxChunks = isInt(options.maxChunks) && options.maxChunks > 0 ? options.maxChunks : DEFAULT_MAX_CHUNKS;
    var fetchImpl = options.fetch || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
    if (typeof fetchImpl !== 'function') {
      throw makeError('ValidationError', 'no fetch implementation available; pass options.fetch');
    }
    var externalSignal = options.signal || null;
    if (externalSignal && externalSignal.aborted) throw abortError();
    var controller = new AbortController();
    var onExternalAbort = function () { controller.abort(); };
    if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort);

    var stats = {
      maxAttempts: maxRetries + 1,
      chunks: 0,
      fetchAttempts: 0,
      retries: 0,
      filesFetched: 0,
      compressedBytes: 0,
      uncompressedBytes: 0,
      decompressedByRuntime: 0,
      decompressedByTransport: 0,
      inflightPeakBytes: 0,
      coordEncoding: null,
      pairCount: 0,
      featureCount: 0,
      geometrySha256: null,
      retainedCoordinateCopies: 1,
      retainedCoordinatePairArrays: 0,
      routeEdgesTotal: 0,
      routeEdgesVerified: 0,
      routeEdgesDropped: 0
    };

    function progress(p) { if (options.onProgress) options.onProgress(p); }

    var manifest, navigatorInst = null, rendererInst = null, routesService = null, coordBuffer = null;
    try {
      progress({ phase: 'manifest', loaded: 0, total: 1 });
      var manifestBytes = await fetchDecoded(String(manifestUrl), fetchImpl,
        controller.signal, externalSignal, stats);
      var manifestDoc;
      try { manifestDoc = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes)); }
      catch (e) { throw FormatError('manifest is not valid JSON: ' + e.message); }
      var totals = validateManifest(manifestDoc);
      manifest = manifestDoc;
      manifest._baseHref = String(manifestUrl);
      stats.chunks = manifest.chunks.length;
      stats.coordEncoding = manifest.coordEncoding;
      stats.pairCount = manifest.pairCount;
      stats.featureCount = manifest.featureCount;

      // Bound BEFORE allocating anything.
      if (manifest.chunks.length > maxChunks) {
        throw CapExceededError('manifest declares ' + manifest.chunks.length +
          ' chunks, cap is ' + maxChunks);
      }
      if (manifest.totalDownloadBytes > maxDownloadBytes) {
        throw CapExceededError('encoded payload ' + manifest.totalDownloadBytes +
          ' bytes exceeds maxDownloadBytes ' + maxDownloadBytes);
      }
      if (totals.uncompressedBytes > maxUncompressedBytes) {
        throw CapExceededError('decoded payload ' + totals.uncompressedBytes +
          ' bytes exceeds maxUncompressedBytes ' + maxUncompressedBytes);
      }

      // The single decoded coordinate copy.
      var totalOrdinates = manifest.pairCount * 2;
      var buffer = new ArrayBuffer(totalOrdinates * manifest.ordinateBytes);
      coordBuffer = {
        buffer: buffer,
        ints: manifest.ordinateBytes === 4 ? new Int32Array(buffer) : null,
        doubles: manifest.ordinateBytes === 8 ? new Float64Array(buffer) : null
      };
      manifest._coordBuffer = coordBuffer;

      var records = await fetchAllChunks(manifest, {
        fetchImpl: fetchImpl,
        controller: controller,
        externalSignal: externalSignal,
        onProgress: options.onProgress,
        stats: stats,
        concurrency: concurrency,
        maxInflightBytes: maxInflightBytes
      });
      stats.filesFetched = manifest.chunks.length * 2;

      progress({ phase: 'verify-geometry', loaded: 0, total: 1 });
      var computedSha = computeGeometrySha(manifest);
      if (computedSha !== manifest.geometrySha256) {
        throw ChecksumMismatchError('geometrySha256 mismatch: manifest ' +
          manifest.geometrySha256.slice(0, 12) + ' computed ' + computedSha.slice(0, 12));
      }
      stats.geometrySha256 = computedSha;
      progress({ phase: 'verify-geometry', loaded: 1, total: 1 });

      progress({ phase: 'assemble', loaded: 0, total: manifest.featureCount });
      var data = assembleData(manifest, records);
      // Records retain no decoded geometry; only structural metadata.
      progress({ phase: 'assemble', loaded: manifest.featureCount, total: manifest.featureCount });

      function relay(phase) {
        return function (p) {
          progress(Object.assign({ runtimePhase: phase }, p));
        };
      }

      if (options.navigation) {
        if (!Nav) throw makeError('DependencyMissingError', 'AmsterdamGeoNavigation is not available');
        var navOpts = typeof options.navigation === 'object' && options.navigation ? options.navigation : {};
        progress({ phase: 'index-navigation', loaded: 0, total: 1 });
        navigatorInst = await Nav.createNavigatorAsync(data, Object.assign({}, navOpts, {
          signal: externalSignal,
          onProgress: relay('index-navigation')
        }));
        progress({ phase: 'index-navigation', loaded: 1, total: 1 });
      }

      if (options.rendering) {
        if (!Renderer) throw makeError('DependencyMissingError', 'AmsterdamGeoRenderer is not available');
        var renOpts = typeof options.rendering === 'object' && options.rendering ? options.rendering : {};
        progress({ phase: 'index-rendering', loaded: 0, total: 1 });
        rendererInst = await Renderer.createAsync(data, Object.assign({}, renOpts, {
          signal: externalSignal,
          onProgress: relay('index-rendering')
        }));
        progress({ phase: 'index-rendering', loaded: 1, total: 1 });
      }

      var routesDoc = null;
      if (options.routesUrl) {
        progress({ phase: 'routes', loaded: 0, total: 1 });
        var routesBase = new URL(manifest._baseHref);
        var routesBytes = await fetchDecoded(new URL(options.routesUrl, routesBase).href,
          fetchImpl, controller.signal, externalSignal, stats);
        try { routesDoc = JSON.parse(new TextDecoder('utf-8').decode(routesBytes)); }
        catch (e) { throw FormatError('routes artifact is not valid JSON: ' + e.message); }
        validateRoutesDoc(routesDoc);
        if (routesDoc.geometrySha256 !== manifest.geometrySha256) {
          throw ChecksumMismatchError('routes artifact binds geometry ' +
            routesDoc.geometrySha256.slice(0, 12) + ' but loaded geometry is ' +
            manifest.geometrySha256.slice(0, 12));
        }
        stats.routeEdgesTotal = routesDoc.edges.length;
        routesService = makeRoutesService(routesDoc, navigatorInst, stats);
        stats.routeEdgesVerified = routesService.verification.verified;
        progress({ phase: 'routes', loaded: 1, total: 1 });
      }

      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

      var runtime = {
        data: data,
        manifest: publicManifest(manifest),
        navigator: navigatorInst,
        renderer: rendererInst,
        routes: routesService,
        stats: stats,
        disposed: false,
        dispose: function () {
          if (this.disposed) return;
          this.disposed = true;
          try { controller.abort(); } catch (e) { /* already aborted */ }
          if (navigatorInst && typeof navigatorInst.dispose === 'function') navigatorInst.dispose();
          if (rendererInst && typeof rendererInst.dispose === 'function') rendererInst.dispose();
          if (routesService) routesService.dispose();
          // Drop the only decoded coordinate copy and every view over it.
          manifest._coordBuffer = null;
          coordBuffer = null;
          this.data = null;
          this.navigator = null;
          this.renderer = null;
          this.routes = null;
        }
      };
      return runtime;
    } catch (err) {
      try { controller.abort(); } catch (e) { /* noop */ }
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (navigatorInst && typeof navigatorInst.dispose === 'function') {
        try { navigatorInst.dispose(); } catch (e2) { /* noop */ }
      }
      if (rendererInst && typeof rendererInst.dispose === 'function') {
        try { rendererInst.dispose(); } catch (e2) { /* noop */ }
      }
      if (externalSignal && externalSignal.aborted && err.name !== 'AbortError') {
        throw abortError();
      }
      throw err;
    }
  }

  // Manifest without internal buffer references.
  function publicManifest(m) {
    var copy = Object.assign({}, m);
    delete copy._coordBuffer;
    delete copy._baseHref;
    return copy;
  }

  return {
    load: load,
    FORMAT: MANIFEST_FORMAT,
    ROUTES_FORMAT: ROUTES_FORMAT,
    errors: {
      FormatError: function (m) { return makeError('FormatError', m); },
      ChecksumMismatchError: ChecksumMismatchError,
      CapExceededError: CapExceededError,
      HttpError: HttpError,
      RetriesExhaustedError: RetriesExhaustedError
    },
    _internals: {
      Sha256: Sha256,
      sha256Hex: sha256Hex,
      hasGzipMagic: hasGzipMagic,
      decodeBody: decodeBody,
      inflateBytes: inflateBytes,
      validateManifest: validateManifest,
      validateRoutesDoc: validateRoutesDoc,
      assembleData: assembleData,
      computeGeometrySha: computeGeometrySha,
      makeRingView: makeRingView,
      makeRoutesService: makeRoutesService
    }
  };
});

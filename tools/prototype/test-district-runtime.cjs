'use strict';

/*
 * Tests for tools/prototype/district-runtime.js (node:test).
 *
 * All network is faked with Response objects (no loopback server). Every
 * generated fixture lives in memory; nothing is written to disk. The public
 * sample fixture under map-fixture/ is read read-only.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const DR = require(path.join(__dirname, 'district-runtime.js'));
const FIX = path.join(__dirname, 'map-fixture');
const BASE = 'http://example.test/map/manifest.json';

const PUB = { x: 1100.5, y: 3243.5 };
const LOTTE = { x: 1056.5, y: 3247.5 };

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function enc(obj) { return Buffer.from(JSON.stringify(obj), 'utf8'); }
function abortErr() {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

/* ------------------------------------------------------------------ */
/* In-memory bundle + fetch stub                                      */
/* ------------------------------------------------------------------ */

const MP = '/map/manifest.json';
const OP = '/map/overview.json';

function runsFromCells(cols, rows, isOpen) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < cols * rows; i++) {
    if (isOpen(i % cols, (i - (i % cols)) / cols, i)) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      runs.push([start, i - start]);
      start = -1;
    }
  }
  if (start !== -1) runs.push([start, cols * rows - start]);
  return runs;
}

function makeDistrictJson(spec) {
  const { id, name, bounds, cols, rows, walkRuns, bikeRuns, anchors, cellSize = 1 } = spec;
  const [x0, y0] = bounds;
  const anchorObj = {};
  for (const a of anchors) {
    const x = x0 + (a.cx + 0.5) * cellSize;
    const y = y0 + (a.cy + 0.5) * cellSize;
    anchorObj[a.id] = {
      x, y, sourceX: x - 0.01, sourceY: y - 0.02,
      featureId: 'feature:' + a.id
    };
  }
  return {
    schemaVersion: 1,
    mapVersion: 'test-map-v1',
    id, name,
    bounds: [x0, y0, x0 + cols * cellSize, y0 + rows * cellSize],
    shapes: [{ kind: 'road', rings: [[[x0 + 0.1, y0 + 0.1], [x0 + 0.2, y0 + 0.1], [x0 + 0.1, y0 + 0.2]]] }],
    anchors: anchorObj,
    entrance: { x: anchorObj[anchors[0].id].x, y: anchorObj[anchors[0].id].y },
    nav: {
      origin: [x0, y0], cellSize, cols, rows,
      walkRuns, bikeRuns: bikeRuns || walkRuns
    }
  };
}

function makeOverview(spec) {
  return {
    schemaVersion: 1,
    mapVersion: 'test-map-v1',
    bounds: [0, 0, 1000, 1000],
    shapes: [{ kind: 'water', rings: [[[0, 1], [2, 1], [1, 2]]] }],
    markers: spec.anchors.map((a) => ({
      id: a.id,
      x: spec.bounds[0] + a.cx + 0.5,
      y: spec.bounds[1] + a.cy + 0.5,
      districtId: spec.id
    })),
    travelLinks: []
  };
}

// spec: {id,name,bounds,cols,rows,walkRuns,bikeRuns,anchors,overviewUrl?,districtUrl?}
function makeBundle(spec) {
  spec = Object.assign({
    id: 'd1', name: 'District one', bounds: [0, 0, 10, 10],
    overviewUrl: 'overview.json', districtUrl: 'districts/d1.json'
  }, spec);
  const district = makeDistrictJson(spec);
  const overview = makeOverview(spec);
  const manifest = {
    schemaVersion: 1,
    mapVersion: 'test-map-v1',
    projection: { type: 'local-equirectangular', units: 'metres' },
    source: { provider: 'test', license: 'CC0-1.0', snapshot: 'test', complete: false },
    overview: { url: spec.overviewUrl, sha256: '', bytes: 0, gzipBytes: 0 },
    districts: [{
      id: spec.id, name: spec.name, bounds: district.bounds,
      url: spec.districtUrl, sha256: '', bytes: 0, gzipBytes: 0,
      anchorIds: spec.anchors.map((a) => a.id)
    }],
    travelLinks: [],
    attribution: 'test'
  };
  const bundle = {
    manifest, district, overview,
    districtPath: '/map/' + spec.districtUrl,
    overviewPath: '/map/' + spec.overviewUrl.split('?')[0],
    bytes: new Map(),
    mode: new Map(), // path -> {gzip,contentGzip,override,stall,redirected,status}
    calls: [],
    setJson(p, obj) { this.bytes.set(p, enc(obj)); return this; },
    meta(p) {
      const b = this.bytes.get(p);
      return { sha256: sha256(b), bytes: b.length, gzipBytes: zlib.gzipSync(b, { level: 9 }).length };
    },
    refreshMeta() {
      this.setJson(MP, this.manifest);
      this.setJson(OP, this.overview);
      this.setJson(this.districtPath, this.district);
      const om = this.meta(OP), dm = this.meta(this.districtPath);
      this.manifest.overview.sha256 = om.sha256;
      this.manifest.overview.bytes = om.bytes;
      this.manifest.overview.gzipBytes = om.gzipBytes;
      const d = this.manifest.districts[0];
      d.sha256 = dm.sha256; d.bytes = dm.bytes; d.gzipBytes = dm.gzipBytes;
      this.setJson(MP, this.manifest);
      return this;
    },
    patchDistrict(fn) {
      fn(this.district);
      return this.refreshMeta();
    },
    patchManifest(fn) {
      fn(this.manifest);
      return this.refreshMeta();
    },
    setOverviewObject(obj) {
      this.overview = obj;
      return this.refreshMeta();
    },
    async fetchImpl(url, init) {
      const u = new URL(url);
      this.calls.push(u.pathname);
      const m = this.mode.get(u.pathname) || {};
      const signal = init && init.signal;
      if (m.stall) {
        await new Promise((resolve, reject) => {
          if (signal) {
            signal.addEventListener('abort', () => reject(abortErr()), { once: true });
          }
          m.gate = { resolve, reject };
        });
      }
      if (signal && signal.aborted) throw abortErr();
      if (m.redirected) {
        return {
          ok: true, redirected: true, status: 200,
          headers: { get: () => null },
          body: new Response(Buffer.alloc(0)).body
        };
      }
      if (m.status) return new Response(Buffer.from('nope'), { status: m.status });
      let body = m.override || this.bytes.get(u.pathname) || Buffer.alloc(0);
      const headers = {};
      if (m.gzip) body = zlib.gzipSync(body);
      if (m.contentGzip) headers['content-encoding'] = 'gzip';
      return new Response(body, { headers });
    },
    open(options) {
      return DR.open(BASE, Object.assign({ fetch: (u, i) => this.fetchImpl(u, i) }, options));
    }
  };
  return bundle.refreshMeta();
}

async function openSample(options = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(FIX, 'manifest.json'), 'utf8'));
  const overview = fs.readFileSync(path.join(FIX, 'overview.json'));
  const district = fs.readFileSync(path.join(FIX, 'districts', 'pub-sample.json'));
  const files = new Map();
  files.set('/map/manifest.json', enc(manifest));
  files.set('/map/overview.json', overview);
  files.set('/map/districts/pub-sample.json', district);
  const mode = options.mode || {};
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    let body = files.get(u.pathname);
    const headers = {};
    if (mode[u.pathname] === 'gzip') body = zlib.gzipSync(body);
    if (mode[u.pathname] === 'decoded-gzip') headers['content-encoding'] = 'gzip';
    return new Response(body, { headers });
  };
  return DR.open('http://example.test/map/manifest.json',
    Object.assign({ fetch: fetchImpl }, options.open));
}

/* ------------------------------------------------------------------ */
/* Sample fixture end to end                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* RUNTIME01 regression coverage                                       */
/* ------------------------------------------------------------------ */

test('createNavigator accepts unchanged fixture regardless of anchor key order', async () => {
  // The compiler writes sort_keys JSON: anchors enumerate as lotte,pub while
  // the entrance is the pub anchor. Property order has no semantic authority.
  const d = JSON.parse(fs.readFileSync(path.join(FIX, 'districts', 'pub-sample.json'), 'utf8'));
  assert.deepEqual(Object.keys(d.anchors), ['lotte', 'pub']);
  assert.equal(d.entrance.x, d.anchors.pub.x);
  const nav = DR.createNavigator(d);
  const r = await nav.route(PUB, LOTTE);
  assert.equal(r.found, true);
  assert.equal(r.reason, null);
  assert.deepEqual(r.points[0], PUB);
  assert.deepEqual(r.points[r.points.length - 1], LOTTE);
  nav.dispose();
});

test('relative manifest URL resolves against globalThis.location.href', async () => {
  const b = await open3x1();
  const hadLocation = 'location' in globalThis;
  const oldLocation = globalThis.location;
  globalThis.location = { href: 'http://example.test/index.html' };
  const requested = [];
  try {
    const s = await DR.open('/map/manifest.json', {
      fetch: (u, i) => { requested.push(u); return b.fetchImpl(u, i); }
    });
    assert.equal(requested[0], 'http://example.test/map/manifest.json');
    assert.equal(requested[1], 'http://example.test/map/overview.json');
    assert.equal(typeof s.overview, 'object');
    const loaded = await s.loadDistrict('d1');
    assert.equal(loaded.data.id, 'd1');
    assert.equal(s.active, loaded);
    s.dispose();
  } finally {
    if (hadLocation) globalThis.location = oldLocation;
    else delete globalThis.location;
  }
});

test('relative manifest without document location is rejected in Node', async () => {
  const hadLocation = 'location' in globalThis;
  const oldLocation = globalThis.location;
  delete globalThis.location;
  try {
    await assert.rejects(DR.open('/map/manifest.json', { fetch: async () => new Response('{}') }),
      (e) => e.code === 'ERR_DISTRICT_VALIDATION');
  } finally {
    if (hadLocation) globalThis.location = oldLocation;
  }
});

test('failed validation on first load clears pending and leaves active null', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.nav.walkRuns = [[0, 2], [1, 2]]; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
  const diag = s.diagnostics();
  assert.equal(diag.pendingDistrictId, null);
  assert.equal(diag.activeDistrictId, null);
  assert.equal(s.active, null);
  s.dispose();
});

test('validation failure on switch keeps old active, clears pending and loading recovers', async () => {
  // Two districts with individually correct metadata: d1 is valid, d2 has
  // malformed RLE. Hash/length checks pass for d2, so its failure happens in
  // validation — it must not poison the session or the retained district.
  const b = await open3x1();
  const bad = makeDistrictJson({
    id: 'd2', name: 'District two', bounds: [20, 0, 24, 1],
    cols: 4, rows: 1,
    walkRuns: [[0, 2], [1, 2]], bikeRuns: [[0, 2], [1, 2]],
    anchors: [{ id: 'c', cx: 0, cy: 0 }]
  });
  const badBytes = enc(bad);
  b.manifest.districts.push({
    id: 'd2', name: 'District two', bounds: bad.bounds, url: 'districts/d2.json',
    sha256: sha256(badBytes), bytes: badBytes.length,
    gzipBytes: zlib.gzipSync(badBytes, { level: 9 }).length,
    anchorIds: ['c']
  });
  b.bytes.set('/map/districts/d2.json', badBytes);
  b.setJson(MP, b.manifest);

  const s = await b.open();
  const first = await s.loadDistrict('d1');
  assert.equal(s.active, first);
  await assert.rejects(s.loadDistrict('d2'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
  assert.equal(s.diagnostics().pendingDistrictId, null);
  assert.equal(s.active, first, 'previous active retained after validation failure');
  // Deterministic re-attempt stays an honest failure.
  await assert.rejects(s.loadDistrict('d2'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
  assert.equal(s.active, first);
  // The session is not poisoned: loading d1 again succeeds.
  const again = await s.loadDistrict('d1');
  assert.equal(s.active, again);
  assert.equal(s.diagnostics().retainedDistrictCount, 1);
  s.dispose();
});

test('overview metadata over raw/gzip cap is rejected before the overview fetch', async () => {
  const overRaw = await open3x1();
  overRaw.manifest.overview.bytes = 16 * 1024 * 1024 + 1;
  overRaw.setJson(MP, overRaw.manifest);
  await assert.rejects(overRaw.open(), (e) => e.code === 'ERR_BYTE_LIMIT');
  assert.deepEqual(overRaw.calls, [MP], 'only the manifest was fetched');

  const overGzip = await open3x1();
  overGzip.manifest.overview.gzipBytes = 2 * 1024 * 1024 + 1;
  overGzip.setJson(MP, overGzip.manifest);
  await assert.rejects(overGzip.open(), (e) => e.code === 'ERR_BYTE_LIMIT');
  assert.deepEqual(overGzip.calls, [MP], 'only the manifest was fetched');
});

test('district metadata over cap is rejected before the district fetch', async () => {
  const b = await open3x1();
  b.manifest.districts[0].gzipBytes = 8 * 1024 * 1024 + 1;
  b.setJson(MP, b.manifest);
  const s = await b.open();
  assert.equal(b.calls.length, 2);
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_BYTE_LIMIT');
  assert.equal(b.calls.length, 2, 'oversized district is never requested');
  assert.equal(s.diagnostics().pendingDistrictId, null);
  s.dispose();
});

test('Node gzip fallback (no DecompressionStream) returns exact bytes and caps output', async () => {
  const oldDS = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    // The real 2,838-byte overview must not surface as a 16 KiB pool buffer.
    const s = await openSample({
      mode: { '/map/overview.json': 'gzip', '/map/districts/pub-sample.json': 'gzip' }
    });
    const loaded = await s.loadDistrict('pub-sample');
    const r = await loaded.navigator.route(PUB, LOTTE);
    assert.equal(r.found, true);
    assert.deepEqual(r.points[0], PUB);
    s.dispose();

    // The fallback enforces the raw cap while decompressing.
    const bomb = await open3x1();
    bomb.mode.set(OP, { override: zlib.gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1)) });
    await assert.rejects(bomb.open(), (e) => e.code === 'ERR_BYTE_LIMIT');
  } finally {
    if (oldDS === undefined) delete globalThis.DecompressionStream;
    else globalThis.DecompressionStream = oldDS;
  }
});

test('sample fixture: plain JSON open, load and pub -> Lotte walk route', async () => {
  const s = await openSample();
  assert.equal(s.active, null);
  const loaded = await s.loadDistrict('pub-sample');
  assert.equal(s.active, loaded);
  assert.equal(loaded.data.id, 'pub-sample');
  assert.equal(typeof loaded.navigator.route, 'function');
  const r = await loaded.navigator.route(PUB, LOTTE);
  assert.equal(r.found, true);
  assert.equal(r.reason, null);
  assert.ok(r.visited > 0);
  assert.deepEqual(r.points[0], PUB);
  assert.deepEqual(r.points[r.points.length - 1], LOTTE);
  assert.ok(r.length > 40 && r.length < 200);
  let len = 0;
  for (let i = 1; i < r.points.length; i++) {
    len += Math.hypot(r.points[i].x - r.points[i - 1].x, r.points[i].y - r.points[i - 1].y);
  }
  assert.ok(Math.abs(len - r.length) < 1e-9);
  s.dispose();
});

test('sample fixture: raw gzip-magic delivery is decompressed and verified', async () => {
  const s = await openSample({ mode: { '/map/overview.json': 'gzip', '/map/districts/pub-sample.json': 'gzip' } });
  const loaded = await s.loadDistrict('pub-sample');
  const r = await loaded.navigator.route(PUB, LOTTE);
  assert.equal(r.found, true);
  assert.deepEqual(r.points[0], PUB);
  s.dispose();
});

test('sample fixture: Content-Encoding: gzip pre-decoded body is not gunzipped twice', async () => {
  const s = await openSample({ mode: { '/map/overview.json': 'decoded-gzip', '/map/districts/pub-sample.json': 'decoded-gzip' } });
  const loaded = await s.loadDistrict('pub-sample');
  assert.equal(loaded.data.id, 'pub-sample');
  s.dispose();
});

/* ------------------------------------------------------------------ */
/* Hash / length / redirect failures                                   */
/* ------------------------------------------------------------------ */

test('wrong sha256 rejects before parse', async () => {
  const b = makeBundle({
    cols: 3, rows: 1, anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  b.manifest.overview.sha256 = '0'.repeat(64);
  b.setJson(MP, b.manifest);
  await assert.rejects(b.open(), (e) => e.code === 'ERR_CHECKSUM');
});

test('wrong raw length rejects', async () => {
  const b = makeBundle({
    cols: 3, rows: 1, anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  b.manifest.overview.bytes += 1;
  b.setJson(MP, b.manifest);
  await assert.rejects(b.open(), (e) => e.code === 'ERR_LENGTH_MISMATCH');
});

test('redirect responses are rejected', async () => {
  const b = makeBundle({
    cols: 3, rows: 1, anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  b.mode.set(OP, { redirected: true });
  await assert.rejects(b.open(), (e) => e.code === 'ERR_REDIRECT');
});

/* ------------------------------------------------------------------ */
/* Strict validation                                                  */
/* ------------------------------------------------------------------ */

async function open3x1(extra) {
  return makeBundle(Object.assign({
    cols: 3, rows: 1,
    walkRuns: [[0, 3]], bikeRuns: [[0, 3]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  }, extra || {}));
}

test('malformed RLE: overlapping runs rejected', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.nav.walkRuns = [[0, 2], [1, 2]]; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('malformed RLE: run past grid end rejected', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.nav.walkRuns = [[0, 4]]; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('schemaVersion mismatch rejected (district and manifest)', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.schemaVersion = 2; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');

  const b2 = await open3x1();
  b2.manifest.schemaVersion = 1;
  b2.patchManifest((m) => { m.schemaVersion = 0; });
  await assert.rejects(b2.open(), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('mapVersion mismatch rejected', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.mapVersion = 'other'; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('anchor on blocked cell rejected', async () => {
  const b = makeBundle({
    cols: 3, rows: 1,
    walkRuns: [[0, 1], [2, 1]], bikeRuns: [[0, 1], [2, 1]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  // Move anchor b onto the blocked middle cell.
  b.patchDistrict((d) => {
    d.anchors.b.x = d.bounds[0] + 1.5;
    d.anchors.b.sourceX = d.anchors.b.x;
  });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('entrance must equal first required anchor', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.entrance = { x: d.anchors.b.x, y: d.anchors.b.y }; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('grid/bounds inconsistency rejected', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.nav.cols = 4; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('unsupported shape kind rejected', async () => {
  const b = await open3x1();
  b.patchDistrict((d) => { d.shapes[0].kind = 'teleporter'; });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('bike mask outside walk mask rejected', async () => {
  const b = makeBundle({
    cols: 4, rows: 1,
    walkRuns: [[0, 2]], bikeRuns: [[2, 1]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 1, cy: 0 }]
  });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

test('grid over 4,000,000 cells rejected', async () => {
  const b = makeBundle({
    cols: 2001, rows: 2001, bounds: [0, 0, 2001, 2001],
    walkRuns: [[0, 1]], bikeRuns: [[0, 1]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }]
  });
  b.patchDistrict((d) => {
    d.nav.walkRuns = [[0, 1]];
    d.nav.bikeRuns = [[0, 1]];
  });
  const s = await b.open();
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_DISTRICT_VALIDATION');
});

/* ------------------------------------------------------------------ */
/* URL confinement                                                     */
/* ------------------------------------------------------------------ */

test('resource URL escapes rejected before fetch', async () => {
  const bad = ['../overview.json', '/overview.json', '//evil.test/overview.json',
    'http://evil.test/overview.json', '%2e%2e/overview.json', 'sub/../../x.json',
    'overview\x00.json', 'back\\slash.json', 'overview.json%2f..'];
  for (const url of bad) {
    const b = await open3x1();
    b.manifest.overview.url = url;
    b.setJson(MP, b.manifest);
    await assert.rejects(b.open(), (e) => e.code === 'ERR_UNSAFE_RESOURCE_URL', url);
    const nonManifest = b.calls.filter((c) => c !== MP);
    assert.deepEqual(nonManifest, [], 'no resource fetch for escape ' + url);
  }
});

test('query strings allowed and do not bypass gzip handling', async () => {
  const b = makeBundle({
    cols: 3, rows: 1,
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }],
    overviewUrl: 'overview.json?v=2'
  });
  b.refreshMeta();
  // File is served under the query-less path, gzip magic bytes.
  b.mode.set(OP, { gzip: true });
  const s = await b.open();
  assert.ok(b.calls.some((c) => c === OP));
  s.dispose();
});

/* ------------------------------------------------------------------ */
/* Byte caps                                                           */
/* ------------------------------------------------------------------ */

test('manifest cap: 256 KiB+1 rejected, exactly 256 KiB not a cap error', async () => {
  const base = makeBundle({
    cols: 2, rows: 1, anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 1, cy: 0 }]
  });
  const over = JSON.parse(JSON.stringify(base.manifest));
  over.source = Object.assign({}, over.source, { pad: 'x'.repeat(256 * 1024) });
  const fetchOver = async () => new Response(enc(over));
  await assert.rejects(DR.open(BASE, { fetch: fetchOver }), (e) => e.code === 'ERR_BYTE_LIMIT');

  const at = JSON.parse(JSON.stringify(base.manifest));
  const target = 256 * 1024;
  at.source = Object.assign({}, at.source, { pad: '' });
  const withEmptyPad = enc(at).length;
  at.source.pad = 'x'.repeat(Math.max(0, target - withEmptyPad));
  const atBuf = enc(at);
  assert.equal(atBuf.length, 256 * 1024);
  const fetchAt = async (u) => {
    if (new URL(u).pathname === MP) return new Response(atBuf);
    return new Response(Buffer.alloc(0));
  };
  // Exactly at the cap: failure (if any) must not be the byte cap.
  await assert.rejects(DR.open(BASE, { fetch: fetchAt }), (e) => e.code !== 'ERR_BYTE_LIMIT');
});

test('overview raw cap enforced while decompressing gzip stream', async () => {
  const b = await open3x1();
  const bomb = zlib.gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1));
  b.mode.set(OP, { override: bomb });
  await assert.rejects(b.open(), (e) => e.code === 'ERR_BYTE_LIMIT');
});

test('overview wire (gzip) cap enforced on incompressible body', async () => {
  const b = await open3x1();
  const big = crypto.randomBytes(2 * 1024 * 1024 + 4096);
  assert.ok(zlib.gzipSync(big).length > 2 * 1024 * 1024);
  b.mode.set(OP, { gzip: true, override: big });
  await assert.rejects(b.open(), (e) => e.code === 'ERR_BYTE_LIMIT');
});

test('decoded Content-Encoding stream is bounded by raw cap, not gzip cap', async () => {
  const b = await open3x1();
  const bigOverview = JSON.parse(JSON.stringify(b.overview));
  bigOverview.padding = 'x'.repeat(2 * 1024 * 1024 + 8192);
  b.setOverviewObject(bigOverview);
  b.mode.set(OP, { contentGzip: true });
  const s = await b.open(); // 2.1 MiB raw is fine; a 2 MiB wire cap would wrongly fail
  assert.equal(typeof s.overview, 'object');
  s.dispose();
});

/* ------------------------------------------------------------------ */
/* Cancellation, retry, races, dispose                                 */
/* ------------------------------------------------------------------ */

test('pre-aborted open rejects with AbortError', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(openSample({ open: { signal: ac.signal } }),
    (e) => e.name === 'AbortError');
});

test('aborted load rejects AbortError, active untouched, retry succeeds', async () => {
  const b = await open3x1();
  b.mode.set(b.districtPath, { stall: true });
  const s = await b.open();
  const ac = new AbortController();
  const p = s.loadDistrict('d1', { signal: ac.signal });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.diagnostics().pendingDistrictId, 'd1');
  ac.abort();
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.equal(s.active, null);
  b.mode.delete(b.districtPath);
  const loaded = await s.loadDistrict('d1');
  assert.equal(s.active, loaded);
  s.dispose();
});

test('superseded load rejects AbortError and never replaces active', async () => {
  const b = makeBundle({
    cols: 2, rows: 1,
    walkRuns: [[0, 2]], bikeRuns: [[0, 2]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 1, cy: 0 }]
  });
  b.mode.set(b.districtPath, { stall: true });
  const s = await b.open();
  const first = s.loadDistrict('d1');
  await new Promise((r) => setTimeout(r, 5));
  b.mode.delete(b.districtPath);
  const second = s.loadDistrict('d1');
  await assert.rejects(first, (e) => e.name === 'AbortError');
  const win = await second;
  assert.equal(s.active, win);
  assert.equal(s.diagnostics().retainedDistrictCount, 1);
  s.dispose();
});

test('failure keeps old active and permits retry', async () => {
  let armBad = false;
  const b = await open3x1();
  const origFetch = (u, i) => b.fetchImpl(u, i);
  const s = await DR.open(BASE, {
    fetch: async (u, i) => {
      if (armBad && new URL(u).pathname === b.districtPath) {
        armBad = false;
        // Correct length, wrong content: fails sha256, not the length check.
        const meta = b.manifest.districts[0];
        return new Response(Buffer.alloc(meta.bytes, 0x78));
      }
      return origFetch(u, i);
    }
  });
  const first = await s.loadDistrict('d1');
  armBad = true;
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_CHECKSUM');
  assert.equal(s.active, first, 'old active retained after failure');
  const retry = await s.loadDistrict('d1');
  assert.equal(s.active, retry);
  s.dispose();
});

test('dispose aborts pending load, is idempotent and poisons use', async () => {
  const b = await open3x1();
  b.mode.set(b.districtPath, { stall: true });
  const s = await b.open();
  const p = s.loadDistrict('d1');
  await new Promise((r) => setTimeout(r, 5));
  s.dispose();
  s.dispose();
  await assert.rejects(p, (e) => e.name === 'AbortError');
  const d = s.diagnostics();
  assert.equal(d.disposed, true);
  assert.equal(d.activeDistrictId, null);
  assert.equal(d.retainedDistrictCount, 0);
  assert.equal(d.gridBytes, 0);
  await assert.rejects(s.loadDistrict('d1'), (e) => e.code === 'ERR_SESSION_DISPOSED');

  const b2 = await open3x1();
  const s2 = await b2.open();
  const nav = (await s2.loadDistrict('d1')).navigator;
  s2.dispose();
  assert.throws(() => nav.isWalkable({ x: 0.5, y: 0.5 }), (e) => e.code === 'ERR_NAV_DISPOSED');
  await assert.rejects(nav.route({ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }),
    (e) => e.code === 'ERR_NAV_DISPOSED');
  nav.dispose();
});

test('diagnostics counts are truthful', async () => {
  const b = await open3x1();
  const s = await b.open();
  let d = s.diagnostics();
  assert.equal(d.disposed, false);
  assert.equal(d.activeDistrictId, null);
  assert.equal(d.retainedDistrictCount, 0);
  assert.equal(d.gridBytes, 0);
  assert.equal(d.fetchCount, 2);
  assert.equal(d.resourceBytes, b.bytes.get(OP).length);
  await s.loadDistrict('d1');
  d = s.diagnostics();
  assert.equal(d.activeDistrictId, 'd1');
  assert.equal(d.retainedDistrictCount, 1);
  assert.ok([0, 1, 2].includes(d.retainedDistrictCount));
  assert.equal(d.gridBytes, 2 * 3);
  assert.equal(d.resourceBytes, b.bytes.get(OP).length + b.bytes.get(b.districtPath).length);
  assert.equal(d.fetchCount, 3);
  s.dispose();
  assert.equal(s.diagnostics().resourceBytes, 0);
  assert.equal(s.diagnostics().fetchCount, 3, 'cumulative fetch count survives dispose');
});

/* ------------------------------------------------------------------ */
/* Navigation semantics                                                */
/* ------------------------------------------------------------------ */

test('walk/bike mask distinction', async () => {
  const b = makeBundle({
    cols: 4, rows: 1, bounds: [0, 0, 4, 1],
    walkRuns: [[0, 4]], bikeRuns: [[0, 2]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 3, cy: 0 }]
  });
  const s = await b.open();
  const { navigator } = await s.loadDistrict('d1');
  assert.equal(navigator.isWalkable({ x: 3.5, y: 0.5 }, { mode: 'walk' }), true);
  assert.equal(navigator.isWalkable({ x: 3.5, y: 0.5 }, { mode: 'bike' }), false);
  const walk = await navigator.route({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 });
  assert.equal(walk.found, true);
  const bike = await navigator.route({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }, { mode: 'bike' });
  assert.deepEqual(bike, { found: false, reason: 'end-not-walkable', points: [], length: 0, visited: 0 });
  s.dispose();
});

test('diagonal corner cutting rejected through blocked side cells', async () => {
  // 2x2 grid: only the two diagonal cells are safe; exact corner crossing.
  const b = makeBundle({
    cols: 2, rows: 2, bounds: [0, 0, 2, 2],
    walkRuns: [[0, 1], [3, 1]], bikeRuns: [[0, 1], [3, 1]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }]
  });
  const s = await b.open();
  const { navigator } = await s.loadDistrict('d1');
  const a = { x: 0.5, y: 0.5 }, c = { x: 1.5, y: 1.5 };
  assert.equal(navigator.segmentWalkable(a, c), false);
  s.dispose();

  const b2 = makeBundle({
    cols: 2, rows: 2, bounds: [0, 0, 2, 2],
    walkRuns: [[0, 4]], bikeRuns: [[0, 4]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }]
  });
  const s2 = await b2.open();
  const nav2 = (await s2.loadDistrict('d1')).navigator;
  assert.equal(nav2.segmentWalkable(a, c), true);
  s2.dispose();
});

test('wall forces detour; sealed divider means no-route', async () => {
  const cols = 7, rows = 7;
  const wallGap = (x, y) => !(x === 3 && y < 6);
  const openRuns = runsFromCells(cols, rows, wallGap);
  const b = makeBundle({
    cols, rows, bounds: [0, 0, cols, rows],
    walkRuns: openRuns, bikeRuns: openRuns,
    anchors: [{ id: 'a', cx: 1, cy: 1 }, { id: 'b', cx: 5, cy: 1 }]
  });
  const s = await b.open();
  const { navigator } = await s.loadDistrict('d1');
  const r = await navigator.route({ x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 });
  assert.equal(r.found, true);
  assert.ok(r.points.some((p) => p.y >= 6.5), 'route dips through the gap');
  assert.ok(r.length > 10, 'detour is longer than direct path');

  const sealed = runsFromCells(cols, rows, (x) => x !== 3);
  const b2 = makeBundle({
    cols, rows, bounds: [0, 0, cols, rows],
    walkRuns: sealed, bikeRuns: sealed,
    anchors: [{ id: 'a', cx: 1, cy: 1 }, { id: 'b', cx: 5, cy: 1 }]
  });
  const s2 = await b2.open();
  const nav2 = (await s2.loadDistrict('d1')).navigator;
  const none = await nav2.route({ x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 });
  assert.equal(none.found, false);
  assert.equal(none.reason, 'no-route');
  assert.ok(none.visited > 1);
  s.dispose();
  s2.dispose();
});

test('edges and endpoints: outside grid false, blocked endpoint explicit reason', async () => {
  const b = await open3x1();
  const s = await b.open();
  const { navigator: nav } = await s.loadDistrict('d1');
  assert.equal(nav.isWalkable({ x: -0.01, y: 0.5 }), false);
  assert.equal(nav.isWalkable({ x: 3.0, y: 0.5 }), false);
  assert.equal(nav.isWalkable({ x: 0.5, y: 0.5 }), true);
  assert.equal(nav.segmentWalkable({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }), false);
  const r = await nav.route({ x: 0.5, y: 0.5 }, { x: 5.0, y: 0.5 });
  assert.deepEqual(r, { found: false, reason: 'end-not-walkable', points: [], length: 0, visited: 0 });
  const r2 = await nav.route({ x: 5.0, y: 0.5 }, { x: 0.5, y: 0.5 });
  assert.equal(r2.found, false);
  assert.equal(r2.reason, 'start-not-walkable');
  s.dispose();
});

test('bad inputs fail explicitly; radius > 0.4 rejected', () => {
  const d = makeDistrictJson({
    id: 'd1', name: 'District one', bounds: [0, 0, 3, 1],
    cols: 3, rows: 1, walkRuns: [[0, 3]], bikeRuns: [[0, 3]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  const nav = DR.createNavigator(d);
  assert.throws(() => nav.isWalkable({ x: NaN, y: 0 }), (e) => e.code === 'ERR_BAD_POINT');
  assert.throws(() => nav.isWalkable({ x: 0.5, y: 0.5 }, { mode: 'fly' }),
    (e) => e.code === 'ERR_UNSUPPORTED_MODE');
  assert.throws(() => nav.isWalkable({ x: 0.5, y: 0.5 }, { radius: 0.41 }),
    (e) => e.code === 'ERR_UNSUPPORTED_RADIUS');
  assert.throws(() => nav.isWalkable({ x: 0.5, y: 0.5 }, { radius: -0.1 }),
    (e) => e.code === 'ERR_BAD_RADIUS');
  assert.throws(() => nav.isWalkable({ x: 0.5, y: 0.5 }, { radius: 'bad' }),
    (e) => e.code === 'ERR_BAD_RADIUS');
});

test('createNavigator: same navigator behaviour, route visited/zero-length cell', async () => {
  const d = makeDistrictJson({
    id: 'd1', name: 'District one', bounds: [0, 0, 3, 1],
    cols: 3, rows: 1, walkRuns: [[0, 3]], bikeRuns: [[0, 3]],
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 2, cy: 0 }]
  });
  const nav = DR.createNavigator(d);
  const r = await nav.route({ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 });
  assert.equal(r.found, true);
  assert.equal(r.visited, 3);
  const same = await nav.route({ x: 0.6, y: 0.6 }, { x: 0.7, y: 0.7 });
  assert.equal(same.found, true);
  assert.equal(same.points.length, 2);
  assert.ok(Math.abs(same.length - Math.hypot(0.1, 0.1)) < 1e-12);
});

/* ------------------------------------------------------------------ */
/* Large grid: yielding + cancellation, concurrent searches           */
/* ------------------------------------------------------------------ */

function bigBundle() {
  const cols = 500, rows = 400;
  // Isolate the top-right corner cell (goal) from its two neighbours.
  const open = (x, y) => !((x === 498 && y === 399) || (x === 499 && y === 398));
  const runs = runsFromCells(cols, rows, open);
  return makeBundle({
    cols, rows, bounds: [0, 0, cols, rows],
    walkRuns: runs, bikeRuns: runs,
    anchors: [{ id: 'a', cx: 0, cy: 0 }, { id: 'b', cx: 499, cy: 399 }]
  });
}

test('200k-cell search yields to event loop and is cancellable', async () => {
  const b = bigBundle();
  const s = await b.open();
  const { navigator } = await s.loadDistrict('d1');
  const ac = new AbortController();
  let progressPhases = 0;
  const p = navigator.route(
    { x: 0.5, y: 0.5 }, { x: 499.5, y: 399.5 },
    {
      signal: ac.signal,
      onProgress: (info) => {
        if (info.phase === 'search') {
          progressPhases++;
          if (info.visited > 4096) ac.abort();
        }
      }
    });
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.ok(progressPhases >= 1, 'event loop yielded with progress');
  s.dispose();
});

test('two concurrent routes stay independent (and independent cancellation)', async () => {
  const b = bigBundle();
  const s = await b.open();
  const { navigator } = await s.loadDistrict('d1');
  const r1 = navigator.route({ x: 0.5, y: 0.5 }, { x: 499.5, y: 0.5 });
  const r2 = navigator.route({ x: 0.5, y: 0.5 }, { x: 0.5, y: 399.5 });
  const [a, c] = await Promise.all([r1, r2]);
  assert.equal(a.found, true);
  assert.equal(c.found, true);
  assert.deepEqual(a.points[a.points.length - 1], { x: 499.5, y: 0.5 });
  assert.deepEqual(c.points[c.points.length - 1], { x: 0.5, y: 399.5 });

  // Aborting one search must not cancel the other.
  const ac = new AbortController();
  let doomed = navigator.route(
    { x: 0.5, y: 0.5 }, { x: 499.5, y: 399.5 },
    { signal: ac.signal, onProgress: (info) => { if (info.visited > 4096) ac.abort(); } });
  const fine = navigator.route({ x: 0.5, y: 0.5 }, { x: 499.5, y: 0.5 });
  const results = await Promise.allSettled([doomed, fine]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason.name, 'AbortError');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[1].value.found, true);
  s.dispose();
});

'use strict';
/*
 * Bounded synthetic benchmark for D26 RENDER01.
 *
 * It generates a deterministic 20,000-feature city on the real sample's
 * world dimensions (7127.775 m x 6671.705 m) and measures:
 *   - one-time validation + spatial index construction
 *   - first static-cache build vs reused frames (city + street)
 *   - direct (no offscreen capability) fallback cost
 *   - canvas allocation count and the 2048 px side cap
 *
 * Numbers are raw local measurements, not performance claims. The null 2D
 * context removes rasterisation cost (not available in Node), so timings
 * cover indexing, culling and path generation only.
 */
const R = require('./geo-map-renderer.js');

const WORLD_W = 7127.775;
const WORLD_H = 6671.705;
const COUNTS = { water: 300, buildings: 18000, roads: 1500, bridges: 200 };

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261017);

function ring(coords) { return coords.concat([coords[0].slice()]); }
function rect(x, y, w, h) {
  return ring([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}
function irregular(x, y, w, h) {
  // Axis box with two jittered corners; stays >= 3 distinct finite points.
  const j = 1 + rand() * Math.min(w, h) * 0.25;
  return ring([
    [x, y],
    [x + w, y + (rand() - 0.5) * j],
    [x + w, y + h],
    [x + (rand() - 0.5) * j, y + h]
  ]);
}
function feature(id, polygons, properties) {
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const poly of polygons) for (const r of poly) for (const p of r) {
    if (p[0] < bx0) bx0 = p[0]; if (p[1] < by0) by0 = p[1];
    if (p[0] > bx1) bx1 = p[0]; if (p[1] > by1) by1 = p[1];
  }
  return { id, sourceId: id, localId: null, properties: properties || {}, polygons, bounds: [bx0, by0, bx1, by1] };
}

function generate() {
  const layers = { water: [], buildings: [], roads: [], bridges: [] };
  for (let i = 0; i < COUNTS.water; i++) {
    // Long thin canals, a few carrying an island hole or a second component.
    const horizontal = rand() > 0.4;
    const x = rand() * (WORLD_W - 900), y = rand() * (WORLD_H - 400);
    const len = 300 + rand() * 900, wid = 12 + rand() * 22;
    const outer = horizontal ? rect(x, y, len, wid) : rect(x, y, wid, len);
    const polys = [[outer]];
    if (rand() < 0.15) polys[0].push(rect(x + len * 0.4, y + (horizontal ? 2 : len * 0.4), 8, 8));
    if (rand() < 0.1) {
      polys.push([horizontal ? rect(x + len + 30, y, 60, wid) : rect(x, y + len + 30, wid, 60)]);
    }
    layers.water.push(feature('water:' + i, polys));
  }
  for (let i = 0; i < COUNTS.buildings; i++) {
    const x = rand() * (WORLD_W - 40), y = rand() * (WORLD_H - 40);
    const w = 7 + rand() * 22, h = 7 + rand() * 26;
    const polys = [[irregular(x, y, w, h)]];
    if (rand() < 0.04) polys.push([irregular(x + w + 2, y, 8 + rand() * 10, 8 + rand() * 10)]);
    layers.buildings.push(feature('pand:' + i, polys));
  }
  for (let i = 0; i < COUNTS.roads; i++) {
    const horizontal = rand() > 0.5;
    const x = rand() * (WORLD_W - 500), y = rand() * (WORLD_H - 80);
    const len = 60 + rand() * 440;
    layers.roads.push(feature('wegdeel:' + i,
      [[horizontal ? irregular(x, y, len, 4 + rand() * 6) : irregular(x, y, 4 + rand() * 6, len)]],
      { functie: rand() < 0.3 ? 'voetpad' : 'rijbaan' }));
  }
  for (let i = 0; i < COUNTS.bridges; i++) {
    const x = rand() * (WORLD_W - 40), y = rand() * (WORLD_H - 40);
    layers.bridges.push(feature('brug:' + i, [[rect(x, y, 10 + rand() * 14, 6 + rand() * 8)]],
      { type_overbruggingsdeel: rand() < 0.8 ? 'dek' : 'pijler' }));
  }
  return {
    schemaVersion: 1, width: WORLD_W, height: WORLD_H,
    projection: { type: 'local-equirectangular' },
    source: { provider: 'Kadaster / PDOK BGT', license: 'CC0-1.0', complete: false },
    layers
  };
}

// Null 2D surface: Node has no canvas; we measure CPU work up to the driver.
class NullCtx {
  constructor() { this.fillStyle = this.strokeStyle = this.font = ''; }
  save() {} restore() {} scale() {} translate() {} rotate() {}
  setTransform() {} resetTransform() {} clearRect() {} fillRect() {} strokeRect() {}
  beginPath() {} closePath() {} moveTo() {} lineTo() {} rect() {} arc() {} ellipse() {}
  clip() {} fill() {} stroke() {} setLineDash() {} drawImage() {} fillText() {}
  measureText() { return { width: 0 }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
}
class NullCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.createdAt = NullCanvas.count++; }
  getContext() { return new NullCtx(); }
}
NullCanvas.count = 0;
function countingFactory() {
  const canvases = [];
  const f = function (w, h) { const c = new NullCanvas(w, h); canvases.push(c); return c; };
  f.canvases = canvases;
  return f;
}

const ns = () => Number(process.hrtime.bigint() / 1000n) / 1000;
function timed(label, fn) {
  const t0 = ns();
  const result = fn();
  const t1 = ns();
  return { label, ms: Math.round((t1 - t0) * 1000) / 1000, result };
}

const data = generate();
const total = COUNTS.water + COUNTS.buildings + COUNTS.roads + COUNTS.bridges;

const factory = countingFactory();
let renderer;
const tCreate = timed('create+index', () => { renderer = R.create(data, { canvasFactory: factory }); });

const places = [
  { id: 'pub', name: '酒馆 Tweede Kans', icon: 'B', x: 1100.211, y: 3243.117 },
  { id: 'lotte', name: 'Lotte 的桥', icon: 'N', x: 1056.057, y: 3247.41 }
];
const nullMain = new NullCtx();

function frame(camera, x, y, extra) {
  return renderer.draw(nullMain, Object.assign({
    camera, position: { x, y, visited: ['pub'] }, zoom: 1, time: 4
  }, extra || {}), { width: 1100, height: 640, cssWidth: 1100, places });
}

const tCityBuild = timed('city zoom1 build', () => frame('city', 1100, 3243));
const tCityReuse = timed('city zoom1 reuse', () => frame('city', 1100, 3243));
const tCityZoom2 = timed('city zoom2 reuse', () => frame('city', 1100, 3243, { zoom: 2 }));
const tCityNight = timed('city night rebuild', () => frame('city', 1100, 3243, { afterHours: true }));

let streetBuilds = 0, streetReuses = 0;
const t0Street = ns();
for (let i = 0; i < 30; i++) {
  // 40 m steps stay inside the padded street window (~110 m inset), so most
  // adjacent frames reuse the same painted cache.
  const x = 400 + i * 40;
  const before = renderer.stats().cacheBuilds;
  frame('street', x, 3200 + i * 8, { afterHours: i >= 28 });
  if (renderer.stats().cacheBuilds === before) streetReuses++; else streetBuilds++;
}
const streetMs = Math.round((ns() - t0Street) * 1000) / 1000;

const tDispose = timed('dispose', () => renderer.dispose());

const directFactory = () => null;
const direct = R.create(data, { canvasFactory: directFactory });
const t0Direct = ns();
for (let i = 0; i < 3; i++) {
  direct.draw(new NullCtx(), { camera: 'city', zoom: 1, position: { x: 1100, y: 3243 } },
    { width: 1100, height: 640, cssWidth: 1100, places });
}
const directMs = Math.round((ns() - t0Direct) * 1000) / 1000;

const s = renderer.stats();
const maxSide = factory.canvases.reduce((m, c) => Math.max(m, c.width, c.height), 0);

const out = {
  synthetic_features: total,
  layer_counts: COUNTS,
  world_metres: [WORLD_W, WORLD_H],
  index_buckets: s.indexBuckets,
  timings_ms: {
    create_index: tCreate.ms,
    city_first_build: tCityBuild.ms,
    city_reuse_frame: tCityReuse.ms,
    city_zoom2_frame: tCityZoom2.ms,
    city_night_rebuild: tCityNight.ms,
    street_30_frames_total: streetMs,
    street_frames_avg: Math.round(streetMs / 30 * 1000) / 1000,
    dispose: tDispose.ms,
    direct_city_3_frames_total: directMs
  },
  street_frames: { builds: streetBuilds, reuses: streetReuses },
  canvases: { created: s.canvasesCreated, max_side_px: maxSide },
  direct_fallback_frames: direct.stats().directFrames,
  last_city_frame: tCityBuild.result && renderer.stats().lastFrame
};

console.log('D26 RENDER01 synthetic benchmark (measured on this machine, not a performance claim)');
console.log(JSON.stringify(out, null, 2));

const invariants = [
  [s.indexedFeatures === total, 'all features indexed'],
  [s.canvasesCreated <= 4, 'at most 4 live cache allocations across day/night city+street'],
  [maxSide <= 2048, 'no cache side exceeds 2048 px'],
  [streetReuses > streetBuilds, 'padded street cache is reused more often than rebuilt'],
  [direct.stats().directFrames === 3, 'direct fallback path exercised']
];
let failed = 0;
for (const [ok, label] of invariants) {
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;

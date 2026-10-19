#!/usr/bin/env node
/*
 * D27 deterministic offline precomputation of the common-venue route graph.
 *
 *   node precompute-routes.cjs --data input.json --anchors anchors.json \
 *       --out routes.json
 *
 * Uses the accepted navigator with its DEFAULT 2 m lattice and documented
 * node budget, exact reviewed anchor coordinates, radius 0.4 m and NO endpoint
 * snapping. Every stored segment of every found route is revalidated with the
 * accepted navigator.segmentWalkable in the same mode at radius 0.4; the
 * parent independently checks all stored walking segments with GEOS.
 *
 * The artifact is honest by construction:
 *  - unwalkable / unreachable / budget-limited pairs are recorded as failures
 *    with the navigator's reason, never replaced by a moved endpoint, an
 *    invented bridge or a claimed connection;
 *  - budget exhaustion (reason "limit") is not reported as disconnection;
 *  - walk and bike are stored separately; a voetpad-only ("walk") result is
 *    never copied into the bike edge;
 *  - no edge is ever produced between ferrySouth and ferryNorth;
 *  - the artifact binds to the geometry with the same encoding-independent
 *    SHA-256 the packer computes (canonical Float64-LE ordinates), so the
 *    runtime can reject an artifact produced for another map.
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Nav = require('../navigation/geo-navigation.js');

const ROUTES_FORMAT = 'amsterdam-geo-routes/v1';
const RADIUS = 0.4;
const CELL_SIZE = 2;
const MAX_NODES = 250000;
const LAYER_ORDER = ['water', 'buildings', 'roads', 'bridges'];

// Common-venue graph mandated by the brief. Pairs are treated as undirected;
// the A->B result is what gets stored.
const GRAPH_PAIRS = [
  ['pub', 'lotte'],
  ['pub', 'coffee'],
  ['pub', 'ferrySouth'],
  ['coffee', 'lab'],
  ['coffee', 'market'],
  ['market', 'flowers'],
  ['flowers', 'flowerCart'],
  ['flowers', 'garden'],
  ['flowerCart', 'garden']
];

// Forbidden by review: a walking edge across the ferry gap must never exist.
const FORBIDDEN_PAIRS = [
  { from: 'ferrySouth', to: 'ferryNorth',
    reason: 'ferry crossing is a transport link, never a generated walking/biking edge' }
];

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data' || a === '--anchors' || a === '--out') {
      out[a.slice(2)] = argv[++i];
    } else {
      throw new Error('unknown argument: ' + a);
    }
  }
  if (!out.data || !out.anchors || !out.out) {
    throw new Error('usage: precompute-routes.cjs --data FILE --anchors FILE --out FILE');
  }
  return out;
}

function geometrySha256(data) {
  const hash = crypto.createHash('sha256');
  const buf = Buffer.alloc(8);
  const layers = data.layers;
  for (const layerName of LAYER_ORDER) {
    const arr = layers[layerName];
    if (!Array.isArray(arr)) throw new Error('layers.' + layerName + ' must be an array');
    for (const feature of arr) {
      for (const polygon of feature.polygons) {
        for (const ring of polygon) {
          for (const point of ring) {
            buf.writeDoubleLE(Number(point[0]), 0);
            hash.update(buf);
            buf.writeDoubleLE(Number(point[1]), 0);
            hash.update(buf);
          }
        }
      }
    }
  }
  return hash.digest('hex');
}

function collectFeatureIds(data) {
  const ids = new Set();
  for (const layerName of LAYER_ORDER) {
    for (const f of data.layers[layerName] || []) {
      if (typeof f.id === 'string') ids.add(f.id);
    }
  }
  return ids;
}

function runEdge(navigator, a, b, mode) {
  const started = process.hrtime.bigint();
  let result;
  try {
    result = navigator.route(
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { mode: mode, radius: RADIUS, maxNodes: MAX_NODES }
      // snapDistance deliberately omitted: endpoints must stay exact.
    );
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    return {
      attempted: true, mode: mode, cellSize: CELL_SIZE, maxNodes: MAX_NODES,
      found: false, reason: 'error', error: String(err && err.message || err),
      length: 0, points: [], visited: 0, elapsedMs: elapsedMs,
      endpointExact: false, segmentsVerified: false, segmentsChecked: 0,
      startSnap: null, endSnap: null
    };
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  let endpointExact = false;
  let segmentsVerified = false;
  let segmentsChecked = 0;
  if (result.found) {
    endpointExact =
      result.points[0].x === a.x && result.points[0].y === a.y &&
      result.points[result.points.length - 1].x === b.x &&
      result.points[result.points.length - 1].y === b.y;
    segmentsVerified = true;
    for (let i = 0; i < result.points.length - 1; i++) {
      segmentsChecked++;
      const ok = navigator.segmentWalkable(result.points[i], result.points[i + 1], {
        mode: mode, radius: RADIUS
      });
      if (!ok) segmentsVerified = false;
    }
  }

  return {
    attempted: true,
    mode: mode,
    cellSize: CELL_SIZE,
    maxNodes: MAX_NODES,
    found: !!result.found,
    reason: result.reason,
    length: result.found ? result.length : 0,
    points: result.found ? result.points.map(function (p) { return { x: p.x, y: p.y }; }) : [],
    visited: result.visited,
    elapsedMs: elapsedMs,
    endpointExact: endpointExact,
    segmentsVerified: segmentsVerified,
    segmentsChecked: segmentsChecked,
    startSnap: result.startSnap || null,
    endSnap: result.endSnap || null
  };
}

function main() {
  const args = parseArgs(process.argv);
  const raw = fs.readFileSync(args.data);
  const data = JSON.parse(raw.toString('utf-8'));
  if (!data || data.schemaVersion !== 1 || !data.layers) {
    throw new Error('--data must be GEO v1 converter JSON');
  }
  const anchorsDoc = JSON.parse(fs.readFileSync(args.anchors, 'utf-8'));
  if (!anchorsDoc || typeof anchorsDoc !== 'object') throw new Error('bad anchors document');

  const startedAll = process.hrtime.bigint();
  const navigator = Nav.createNavigator(data, { cellSize: CELL_SIZE, maxNodes: MAX_NODES });
  const featureIds = collectFeatureIds(data);

  const anchorsOut = {};
  for (const name of Object.keys(anchorsDoc)) {
    const a = anchorsDoc[name];
    if (typeof a.x !== 'number' || typeof a.y !== 'number' || !isFinite(a.x) || !isFinite(a.y)) {
      throw new Error('anchor ' + name + ' needs finite numeric x/y');
    }
    anchorsOut[name] = {
      x: a.x,
      y: a.y,
      featureId: typeof a.featureId === 'string' ? a.featureId : null,
      basis: typeof a.basis === 'string' ? a.basis : null,
      fictionalVenue: !!a.fictionalVenue,
      presentInSource: typeof a.featureId === 'string' && featureIds.has(a.featureId)
    };
  }

  // Safety net: the forbidden pair must never sneak into the graph.
  for (const fp of FORBIDDEN_PAIRS) {
    for (const pair of GRAPH_PAIRS) {
      if ((pair[0] === fp.from && pair[1] === fp.to) ||
          (pair[1] === fp.from && pair[0] === fp.to)) {
        throw new Error('forbidden pair present in graph definition: ' + fp.from + '/' + fp.to);
      }
    }
    if (!anchorsOut[fp.from] || !anchorsOut[fp.to]) {
      throw new Error('forbidden pair names missing from anchors');
    }
  }

  const edges = [];
  const summary = { walk: { found: 0, failed: 0, limits: 0 }, bike: { found: 0, failed: 0, limits: 0 } };
  for (const pair of GRAPH_PAIRS) {
    const from = pair[0], to = pair[1];
    if (!anchorsOut[from] || !anchorsOut[to]) {
      throw new Error('graph pair references unknown anchor: ' + from + '/' + to);
    }
    const edge = { from: from, to: to };
    for (const mode of ['walk', 'bike']) {
      const r = runEdge(navigator, anchorsOut[from], anchorsOut[to], mode);
      edge[mode] = r;
      if (r.found && r.segmentsVerified && r.endpointExact) summary[mode].found++;
      else summary[mode].failed++;
      if (r.reason === 'limit') summary[mode].limits++;
    }
    edges.push(edge);
  }

  const totalElapsedMs = Number(process.hrtime.bigint() - startedAll) / 1e6;
  const doc = {
    format: ROUTES_FORMAT,
    schemaVersion: 1,
    geometrySha256: geometrySha256(data),
    sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
    radius: RADIUS,
    snapDistance: 0,
    cellSize: CELL_SIZE,
    maxNodes: MAX_NODES,
    anchors: anchorsOut,
    edges: edges,
    forbiddenPairs: FORBIDDEN_PAIRS,
    summary: summary,
    generated: {
      node: process.version,
      totalElapsedMs: totalElapsedMs
    },
    sourceComplete: false,
    notes: [
      'Generated from the accepted GEO v1 navigator at radius 0.4 m with no endpoint snapping.',
      'A failed edge (unwalkable/unreachable/limit) is a truthful observation on this input, ' +
        'not proof of city-wide disconnection and never a license to invent geometry.',
      'reason=limit means the node budget was exhausted; it never proves unreachability.',
      'This bounded diagnostic subset is not complete city coverage. The parent runs the full map.'
    ]
  };

  fs.writeFileSync(args.out, JSON.stringify(doc, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    ok: true,
    out: path.resolve(args.out),
    edges: edges.length,
    walkFound: summary.walk.found,
    bikeFound: summary.bike.found,
    walkFailed: summary.walk.failed,
    bikeFailed: summary.bike.failed,
    limits: { walk: summary.walk.limits, bike: summary.bike.limits },
    geometrySha256: doc.geometrySha256,
    elapsedMs: totalElapsedMs
  }) + '\n');
}

main();

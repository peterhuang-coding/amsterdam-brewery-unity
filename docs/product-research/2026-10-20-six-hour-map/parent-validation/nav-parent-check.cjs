'use strict';
// Parent-only independent oracle; no candidate test imports or implementation edits.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const [modulePath, samplePath, oraclePath, outputPath] = process.argv.slice(2);
if (!outputPath) throw Error('module, real sample, independent GEOS oracle, output paths required');
const G = require(modulePath);
const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
const sampleHash = crypto.createHash('sha256').update(fs.readFileSync(samplePath)).digest('hex');
if (sampleHash !== oracle.source_sha256) throw Error('Independent oracle source SHA does not match the candidate input');
const t = performance.now();
const nav = G.createNavigator(data, {radius: .4});
const failures = [];
for (const [i, c] of oracle.cases.entries()) {
  const options = {mode: c.mode, radius: c.radius};
  const actual = c.kind === 'point' ? nav.isWalkable(c.point, options) : nav.segmentWalkable(c.start, c.end, options);
  if (actual !== c.expected) failures.push({i, ...c, actual});
}
const transformed = [];
for (const offset of [0, -6000, 3000, 6000, 10000]) {
  for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI]) {
    const map = ([x, y]) => [offset + x * Math.cos(angle) - y * Math.sin(angle),
                           -offset + x * Math.sin(angle) + y * Math.cos(angle)];
    const polygon = [[[0, 0], [.2, 0], [0, .2], [0, 0]].map(map)];
    const n = G.createNavigator({layers: {roads: [{id: 'independent-triangle', properties: {functie: 'voetpad'}, polygons: [polygon]}]}});
    for (const [label, raw, expected] of [['outside', [.15, .15], false], ['inside', [.03, .03], true], ['outer-boundary', [.1, .1], true]]) {
      const xy = map(raw), p = {x: xy[0], y: xy[1]};
      const inPolygon = G.pointInPolygon(p, polygon), walkable = n.isWalkable(p, {radius: 0});
      transformed.push({offset, angle, label, expected, inPolygon, walkable,
                        pass: inPolygon === expected && walkable === expected});
    }
  }
}
const classifications = [];
const polygon = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
for (const [functie, expectedWalk, expectedBike] of [
  ['autosnelweg', false, false], ['autoweg', false, false],
  ['rijbaan autosnelweg', false, false], ['rijbaan autoweg', false, false],
  ['voetpad', true, false], ['fietspad', true, true], ['rijbaan lokale weg', true, true]
]) {
  const n = G.createNavigator({layers: {roads: [{id: functie, properties: {functie}, polygons: [polygon]}]}}, {radius: .4});
  const walk = n.isWalkable({x: 5, y: 5}, {mode: 'walk'}), bike = n.isWalkable({x: 5, y: 5}, {mode: 'bike'});
  classifications.push({functie, walk, bike, expectedWalk, expectedBike, pass: walk === expectedWalk && bike === expectedBike});
}
const result = {basis: 'Independent GEOS domain oracle plus exact affine triangle and actual source classification regressions; not full-map routes or gameplay',
  sample_sha256: sampleHash, cases: oracle.cases.length, failures, falseSafe: failures.filter(f => f.actual && !f.expected).length,
  falseBlocked: failures.filter(f => !f.actual && f.expected).length,
  transformed, classifications, milliseconds: performance.now() - t,
  passed: !failures.length && transformed.every(r => r.pass) && classifications.every(r => r.pass)};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({...result, failures: failures.slice(0, 3), transformed: transformed.filter(r => !r.pass), classifications: classifications.filter(r => !r.pass)}));
process.exitCode = result.passed ? 0 : 1;

'use strict';
const fs = require('node:fs');
const {performance} = require('node:perf_hooks');
const [modulePath, dataPath, anchorPath, reportPath, target = 'lotte', nodes = '250000'] = process.argv.slice(2);
if (!reportPath) throw Error('module/data/anchor/report paths required');
const G = require(modulePath), started = performance.now();
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const read = performance.now();
const nav = G.createNavigator(data, {radius: .4, maxNodes: +nodes});
const indexed = performance.now();
const anchors = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
const safe = Object.fromEntries(Object.entries(anchors).map(([k, p]) => [k, {
  walk: nav.isWalkable(p, {mode: 'walk', radius: .4}),
  bike: nav.isWalkable(p, {mode: 'bike', radius: .4})
}]));
const base = {dataPath, target, maxNodes: +nodes,
  featureCount: Object.values(data.layers).reduce((sum, fs) => sum + fs.length, 0),
  readMs: read - started, indexMs: indexed - read, anchors: safe,
  basis: 'Full supplied data and unchanged reviewed anchor coordinates; source/packed provenance is explicit in dataPath. Not a game playthrough.'};
fs.writeFileSync(reportPath, JSON.stringify({...base, state: 'routing'}, null, 2) + '\n');
console.log(JSON.stringify({...base, state: 'routing'}));
const t = performance.now();
const route = nav.route(anchors.pub, anchors[target], {radius: .4, mode: 'walk', maxNodes: +nodes});
const result = {...base, state: 'complete', routeMs: performance.now() - t, route,
  stats: nav.stats(), memory: process.memoryUsage()};
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({...result, route: {...route, points: route.points.length}}));
process.exitCode = route.found ? 0 : 1;

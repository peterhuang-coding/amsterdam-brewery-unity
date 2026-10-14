const fs = require('node:fs');
const crypto = require('node:crypto');
const source = '/tmp/amsterdam-map-morphology-design-r2-20261015/input/tools/prototype/reopening-city.js';
const C = require(source);
const touches = (a, b) => Math.max(a.x, b.x) <= Math.min(a.x + a.w, b.x + b.w) && Math.max(a.y, b.y) <= Math.min(a.y + a.h, b.y + b.h);
const connections = [];
for (let i = 0; i < C.WATERS.length; i++) for (let j = i + 1; j < C.WATERS.length; j++) if (touches(C.WATERS[i], C.WATERS[j])) connections.push([i, j]);
const seen = new Set([0]);
let previous;
do { previous = seen.size; for (const [a, b] of connections) { if (seen.has(a)) seen.add(b); if (seen.has(b)) seen.add(a); } } while (seen.size !== previous);
const narrow = C.CROSSINGS.filter(x => x.kind !== 'ferry' && x.h < 80).map(rect => {
  const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
  return { rect, x, y, walkable: C.walkable(x, y), rideable: C.rideable(x, y) };
});
const result = { baseline: 'dad6b38c54fda94f541764242f61820d8177bd19', source_sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), water_rects: C.WATERS, edge_or_area_contacts: connections, all_water_rects_in_one_connected_union: seen.size === C.WATERS.length, narrow_bridge_centers: narrow, limitation: 'Existing source only; no future geometry or player experience tested. Adjacency refers to the union of the water rectangles, not boat navigation.' };
fs.writeFileSync('/tmp/map01-existing-geometry-evidence.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ connected: result.all_water_rects_in_one_connected_union, narrow: narrow.map(x => ({walkable:x.walkable, rideable:x.rideable})), output: '/tmp/map01-existing-geometry-evidence.json' }));

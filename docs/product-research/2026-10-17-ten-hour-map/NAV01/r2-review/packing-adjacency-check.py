import json,pathlib
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import unary_union
r=pathlib.Path(__file__).parent;orig=json.loads((r/'final/real-pub-sample.json').read_text());packed=json.loads((r/'packed-pub.json').read_text());old={f['id']:(k,f,unary_union([Polygon(p[0],p[1:])for p in f['polygons']]))for k,fs in orig['layers'].items()for f in fs};new={f['id']:unary_union([Polygon(p[0],p[1:])for p in f['polygons']])for fs in packed['layers'].values()for f in fs};rows=[]
for id,(layer,f,g)in old.items():
 if layer not in ['roads','bridges']:continue
 for id2,(layer2,f2,g2)in old.items():
  if id2<=id or layer2 not in ['roads','bridges']:continue
  if not g.is_valid or not g2.is_valid:continue
  if g.intersects(g2) and not new[id].intersects(new[id2]):rows.append({'a':id,'b':id2,'originalIntersectionLength':g.intersection(g2).length,'packedGap':new[id].distance(new[id2])})
rows.sort(key=lambda x:-x['originalIntersectionLength']);out={'basis':'Original vs tolerance0.05 packed real62-feature source: per-feature preservation does not guarantee shared boundaries.', 'lostAdjacencies':rows};(r/'packing-adjacency-check.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
if rows:
 ids={rows[0]['a'],rows[0]['b']};mini={**orig,'layers':{k:[f for f in fs if f['id']in ids]for k,fs in orig['layers'].items()}};(r/'shared-edge-pair.json').write_text(json.dumps(mini,separators=(',',':')))

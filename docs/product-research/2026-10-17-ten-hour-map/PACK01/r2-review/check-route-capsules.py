from pathlib import Path
import json
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
p=Path(__file__).parent;small=json.loads((p/'sample/real-pub-source.json').read_text());ids={f['id']for fs in small['layers'].values()for f in fs};d=json.loads((p/'full/runtime.json').read_text());d['layers']={k:[f for f in fs if f['id']in ids]for k,fs in d['layers'].items()};assert sum(map(len,d['layers'].values()))==62
excluded={'autosnelweg','autoweg','rijbaan autosnelweg','rijbaan autoweg','spoorbaan','OV-baan','baan voor vliegverkeer'}
def shapes(layer,predicate=lambda f:True):return [Polygon(x[0],x[1:])for f in d['layers'][layer] if predicate(f)for x in f['polygons']]
assert all(g.is_valid for k in d['layers']for g in shapes(k))
water=unary_union(shapes('water'));buildings=unary_union(shapes('buildings'));decks=unary_union(shapes('bridges',lambda f:f['properties'].get('type_overbruggingsdeel')=='dek'));roads=unary_union(shapes('roads',lambda f:f['properties'].get('functie')not in excluded));domain=roads.union(decks).difference(buildings.union(water.difference(decks))).intersection(box(0,0,d['width'],d['height']))
route=json.loads((p/'full-lotte.json').read_text())['route'];xy=[(a['x'],a['y'])for a in route['points']];rows=[]
for a,b in zip(xy,xy[1:]):
 line=LineString([a,b]);clearance=line.distance(domain.boundary);rows.append({'from':a,'to':b,'centreline_covered':domain.covers(line),'min_clearance_m':clearance,'radius_0_4_capsule_safe':domain.covers(line)and clearance>=.4})
r={'basis':'Independent GEOS clearance for three segments from diagnostic NAV-R2 route, using 62 real features extracted from full PACK-R2 output. NAV-R2 remains rejected for other cases; not full-city routing/game acceptance.','route_length_m':route['length'],'segments':rows,'all_safe':all(x['radius_0_4_capsule_safe']for x in rows)};(p/'route-capsules.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))

import json, random, hashlib, pathlib
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union

root=pathlib.Path(__file__).parent
source=pathlib.Path('/tmp/amsterdam-d26-geo-navigation-r2-20261017/input/real-pub-sample.json')
data=json.loads(source.read_text())
excluded={'autosnelweg','autoweg','spoorbaan','OV-baan','baan voor vliegverkeer'}
bike_excluded={'voetpad','voetpad op trap','voetgangergebied','voetgangersgebied','ruiterpad'}
def shapes(layer, predicate=lambda f: True):
    return [Polygon(p[0],p[1:]) for f in data['layers'][layer] if predicate(f) for p in f['polygons']]
for layer in data['layers']:
    assert all(g.is_valid for g in shapes(layer)), layer
water=unary_union(shapes('water')); buildings=unary_union(shapes('buildings'))
decks=unary_union(shapes('bridges',lambda f:f['properties'].get('type_overbruggingsdeel')=='dek'))
obstacles=buildings.union(water.difference(decks))
domains={}
for mode in ['walk','bike']:
    denied=excluded | (bike_excluded if mode=='bike' else set())
    roads=unary_union(shapes('roads',lambda f:f['properties'].get('functie') not in denied))
    domains[mode]=roads.union(decks).difference(obstacles).intersection(box(0,0,data['width'],data['height']))
    assert domains[mode].is_valid
rng=random.Random(261017)
points=[(1100.211,3243.117),(1056.057,3247.410)]
points += [(rng.uniform(1043,1112),rng.uniform(3228,3267)) for _ in range(248)]
cases=[]
for mode,g in domains.items():
    for x,y in points:
        p=Point(x,y)
        for radius in [0,0.1,0.4,1]:
            clearance=g.boundary.distance(p)
            if abs(clearance-radius)<1e-7: continue
            cases.append(dict(kind='point',mode=mode,radius=radius,point=dict(x=x,y=y),expected=bool(g.covers(p) and clearance>=radius)))
    for _ in range(250):
        x,y=rng.uniform(1043,1112),rng.uniform(3228,3267)
        x2,y2=x+rng.uniform(-8,8),y+rng.uniform(-8,8)
        line=LineString([(x,y),(x2,y2)])
        for radius in [0,0.4]:
            clearance=g.boundary.distance(line)
            if abs(clearance-radius)<1e-7 and radius: continue
            cases.append(dict(kind='segment',mode=mode,radius=radius,start=dict(x=x,y=y),end=dict(x=x2,y=y2),expected=bool(g.covers(line) and clearance>=radius)))
out={'basis':'Independent GEOS union of valid real BGT road/deck polygons, subtract buildings and uncovered water; minimum boundary distance gives full disk/capsule clearance. No buffer approximation. Boundary ties avoided. Not a natural playthrough or full-city route proof.', 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'feature_count':sum(map(len,data['layers'].values())),'polygon_count':sum(len(f['polygons']) for fs in data['layers'].values() for f in fs),'cases':cases}
(root/'real-geos-oracle.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps({'cases':len(cases),'true':sum(c['expected'] for c in cases),'features':out['feature_count'],'polygons':out['polygon_count']}))

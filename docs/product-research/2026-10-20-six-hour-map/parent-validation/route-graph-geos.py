"""Parent oracle for every stored edge; never imports the candidate navigator."""
import argparse, hashlib, json, math, time
from pathlib import Path
from shapely import make_valid
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

p = argparse.ArgumentParser()
p.add_argument('--source', type=Path, required=True)
p.add_argument('--routes', type=Path, required=True)
p.add_argument('--anchors', type=Path, required=True)
p.add_argument('--geometry-sha', required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
start = time.monotonic()
raw = a.source.read_bytes()
source_sha = hashlib.sha256(raw).hexdigest()
data = json.loads(raw)
del raw
doc = json.loads(a.routes.read_text())
anchors_doc = json.loads(a.anchors.read_text())
anchors = anchors_doc.get('anchors', anchors_doc)
assert doc['geometrySha256'] == a.geometry_sha
assert doc['sourceSha256'] == source_sha
assert doc['radius'] == .4 and doc['snapDistance'] == 0
for name, original in anchors.items():
    got = doc['anchors'][name]
    assert got['x'] == original['x'] and got['y'] == original['y'], name

blocked = {'autosnelweg','autoweg','spoorbaan','OV-baan','baan voor vliegverkeer'}
bike_blocked = {'voetpad','voetpad op trap','voetgangergebied','voetgangersgebied','ruiterpad'}
shapes, records = [], []
for layer, features in data['layers'].items():
    for f in features:
        props = f['properties']
        if layer == 'bridges' and props.get('type_overbruggingsdeel') != 'dek':
            continue
        function = props.get('functie')
        bare = function[8:] if isinstance(function,str) and function.startswith('rijbaan ') else function
        if layer == 'roads' and (function in blocked or bare in blocked):
            continue
        pieces = [Polygon(poly[0],poly[1:]) for poly in f['polygons']]
        g = pieces[0] if len(pieces)==1 else MultiPolygon(pieces)
        invalid = not g.is_valid
        shapes.append(make_valid(g) if invalid else g)
        records.append((layer, function not in bike_blocked, f['id'] if invalid else None))
extent = box(0,0,data['width'],data['height'])
del data
tree = STRtree(shapes)
rows, missing = [], []
edge_seen = set()
for edge in doc['edges']:
    from_id, to_id = edge['from'], edge['to']
    assert from_id in anchors and to_id in anchors and from_id != to_id
    assert frozenset((from_id,to_id)) != frozenset(('ferrySouth','ferryNorth'))
    for mode in ('walk','bike'):
        route = edge[mode]
        key = (from_id,to_id,mode)
        assert key not in edge_seen
        edge_seen.add(key)
        if not route['found']:
            assert route['points'] == []
            missing.append({'from':from_id,'to':to_id,'mode':mode,'reason':route['reason']})
            continue
        points = route['points']
        assert len(points)>=2 and route['startSnap'] is None and route['endSnap'] is None
        assert points[0]['x']==anchors[from_id]['x'] and points[0]['y']==anchors[from_id]['y']
        assert points[-1]['x']==anchors[to_id]['x'] and points[-1]['y']==anchors[to_id]['y']
        length = sum(math.hypot(q['x']-p['x'],q['y']-p['y']) for p,q in zip(points,points[1:]))
        assert abs(length-route['length']) < 1e-6
        for number,(left,right) in enumerate(zip(points,points[1:])):
            assert all(math.isfinite(v) for pt in (left,right) for v in (pt['x'],pt['y']))
            line = LineString([(left['x'],left['y']),(right['x'],right['y'])])
            x0,y0,x1,y1 = line.bounds
            groups = {k:[] for k in ('roads','buildings','water','bridges')}
            normalized = []
            for i in tree.query(box(x0-.5,y0-.5,x1+.5,y1+.5)):
                i=int(i); layer,bike_ok,invalid_id=records[i]
                if layer=='roads' and mode=='bike' and not bike_ok: continue
                groups[layer].append(shapes[i])
                if invalid_id: normalized.append(invalid_id)
            merged={k:unary_union(v) for k,v in groups.items()}
            ground=merged['roads'].union(merged['bridges'])
            obstacles=merged['buildings'].union(merged['water'].difference(merged['bridges']))
            domain=ground.difference(obstacles).intersection(extent)
            covered=domain.covers(line); clearance=domain.boundary.distance(line)
            rows.append({'from':from_id,'to':to_id,'mode':mode,'segment':number,
                         'pass':bool(covered and clearance>=.4-1e-7),
                         'line_covered':bool(covered),'clearance_m':clearance,
                         'comparison_only_make_valid_features':normalized})
report={'basis':'Independent GEOS union of allowed road/deck surfaces minus buildings and water outside decks; line coverage and exact distance to boundary. make_valid only for oracle comparison, source untouched.',
        'source_sha256':source_sha,'routes_sha256':hashlib.sha256(a.routes.read_bytes()).hexdigest(),
        'geometry_sha256':a.geometry_sha,'segments':len(rows),'failed':sum(not r['pass'] for r in rows),
        'minimum_clearance_m':min((r['clearance_m'] for r in rows),default=None),
        'missing':missing,'rows':rows,'seconds':time.monotonic()-start}
a.out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('rows','basis')},indent=2))
raise SystemExit(1 if report['failed'] or not rows else 0)

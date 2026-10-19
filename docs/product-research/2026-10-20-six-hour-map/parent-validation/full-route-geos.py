"""Independent GEOS disk/capsule acceptance for explicit full-data route results."""
import argparse
import json
import time
from pathlib import Path
from collections import Counter
from shapely import make_valid
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--route', type=Path, required=True)
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
started = time.monotonic()
data = json.loads(args.source.read_bytes())
route = json.loads(args.route.read_text())['route']
assert route['found'] and len(route['points']) >= 2
denied = {'autosnelweg', 'autoweg', 'rijbaan autosnelweg', 'rijbaan autoweg',
          'spoorbaan', 'OV-baan', 'baan voor vliegverkeer'}
shapes, kinds, ids, originally_invalid = [], [], [], []
for layer, features in data['layers'].items():
    for f in features:
        if layer == 'bridges' and f['properties'].get('type_overbruggingsdeel') != 'dek':
            continue
        if layer == 'roads' and f['properties'].get('functie') in denied:
            continue
        parts = [Polygon(p[0], p[1:]) for p in f['polygons']]
        g = parts[0] if len(parts) == 1 else MultiPolygon(parts)
        originally_invalid.append(not g.is_valid)
        shapes.append(g if g.is_valid else make_valid(g))
        kinds.append(layer)
        ids.append(f['id'])
extent = box(0, 0, data['width'], data['height'])
del data
tree = STRtree(shapes)
points = route['points']
rows = []
for index, (a, b) in enumerate(zip(points, points[1:])):
    line = LineString([(a['x'], a['y']), (b['x'], b['y'])])
    bounds = line.bounds
    query = box(bounds[0] - .5, bounds[1] - .5, bounds[2] + .5, bounds[3] + .5)
    groups = {k: [] for k in ('roads', 'buildings', 'water', 'bridges')}
    normalized = []
    for i in tree.query(query):
        i = int(i)
        groups[kinds[i]].append(shapes[i])
        if originally_invalid[i]:
            normalized.append(ids[i])
    merged = {k: unary_union(v) for k, v in groups.items()}
    ground = merged['roads'].union(merged['bridges'])
    blocked = merged['buildings'].union(merged['water'].difference(merged['bridges']))
    domain = ground.difference(blocked).intersection(extent)
    covered = domain.covers(line)
    clearance = domain.boundary.distance(line)
    rows.append({'segment': index, 'line_covered': bool(covered), 'clearance_m': clearance,
                 'pass': bool(covered and clearance >= .4 - 1e-7),
                 'comparison_only_make_valid_features': normalized})
result = {'basis': 'Independent GEOS local union-minus-obstacles domain and exact minimum line-to-boundary distance; make_valid is comparison-only and disclosed per segment, never source mutation',
          'source_path': str(args.source), 'route_path': str(args.route),
          'segments': len(rows), 'radius_m': .4, 'tolerance_m': 1e-7,
          'failed': sum(not r['pass'] for r in rows),
          'minimum_clearance_m': min(r['clearance_m'] for r in rows),
          'rows': rows, 'seconds': time.monotonic() - started}
args.report.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'rows'}, indent=2))
raise SystemExit(1 if result['failed'] else 0)

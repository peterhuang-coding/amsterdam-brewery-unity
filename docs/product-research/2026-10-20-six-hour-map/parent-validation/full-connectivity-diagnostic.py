"""Read-only GEOS component diagnostic; never a production pathfinder or source edit."""
import argparse
import json
import time
from pathlib import Path
from shapely import make_valid
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.ops import unary_union

p = argparse.ArgumentParser()
p.add_argument('--source', type=Path, required=True)
p.add_argument('--anchors', type=Path, required=True)
p.add_argument('--report', type=Path, required=True)
a = p.parse_args()
t = time.monotonic()
data = json.loads(a.source.read_bytes())
anchors = json.loads(a.anchors.read_text())
print('anchors shape', type(anchors).__name__, flush=True)
denied = {'autosnelweg', 'autoweg', 'rijbaan autosnelweg', 'rijbaan autoweg',
          'spoorbaan', 'OV-baan', 'baan voor vliegverkeer'}
groups = {k: [] for k in data['layers']}
normalized = {k: 0 for k in groups}
for layer, features in data['layers'].items():
    for f in features:
        if layer == 'roads' and f['properties'].get('functie') in denied:
            continue
        if layer == 'bridges' and f['properties'].get('type_overbruggingsdeel') != 'dek':
            continue
        parts = [Polygon(poly[0], poly[1:]) for poly in f['polygons']]
        g = parts[0] if len(parts) == 1 else MultiPolygon(parts)
        if not g.is_valid:
            g = make_valid(g)
            normalized[layer] += 1
        groups[layer].append(g)
extent = box(0, 0, data['width'], data['height'])
del data
merged = {}
for k in groups:
    merged[k] = unary_union(groups[k])
    groups[k] = []
    print('union', k, time.monotonic() - t, flush=True)
ground = merged['roads'].union(merged['bridges'])
blocked = merged['buildings'].union(merged['water'].difference(merged['bridges']))
domain = ground.difference(blocked).intersection(extent)
safe = domain.buffer(-.4, quad_segs=16)
parts = list(safe.geoms) if hasattr(safe, 'geoms') else [safe]
rows = []
items = anchors.get('anchors', anchors) if isinstance(anchors, dict) else anchors
if isinstance(items, dict):
    items = [dict(v, id=k) for k, v in items.items()]
for anchor in items:
    point = Point(anchor['x'], anchor['y'])
    matches = [i for i, part in enumerate(parts) if part.covers(point)]
    rows.append({'id': anchor['id'], 'safe_components': matches,
                 'domain_covers_center': domain.covers(point),
                 'center_clearance_m': domain.boundary.distance(point)})
result = {'basis': 'Read-only GEOS union-minus-obstacles, negative0.4m buffer with16 quadrant segments. Diagnostic component IDs are not route existence proof; comparison-only make_valid is disclosed and does not edit source.',
          'source': str(a.source), 'component_count': len(parts),
          'comparison_normalized_features': normalized, 'anchors': rows,
          'seconds': time.monotonic() - t}
a.report.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2), flush=True)

"""Independent GEOS coverage audit over every original bounding-box neighbour.

No output geometry is repaired. make_valid is only used to define the comparison
set for an already-invalid source feature, and those pairs are reported apart.
Candidate vertices must remain original vertices (checked by geometry oracle),
so a candidate envelope cannot extend outside its original envelope.
"""
import argparse
import hashlib
import json
import time
from collections import Counter
from pathlib import Path

from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon
from shapely.strtree import STRtree


def geometry(feature):
    parts = [Polygon(p[0], p[1:]) for p in feature['polygons']]
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def components(value):
    if value.is_empty:
        return
    if hasattr(value, 'geoms'):
        for item in value.geoms:
            yield from components(item)
    else:
        yield value


def audit(source, output):
    assert set(source['layers']) == set(output['layers'])
    src = [f for key in sorted(source['layers']) for f in source['layers'][key]]
    dst = [f for key in sorted(output['layers']) for f in output['layers'][key]]
    assert [f['id'] for f in src] == [f['id'] for f in dst]
    original = [geometry(f) for f in src]
    candidate = [geometry(f) for f in dst]
    source_valid = [g.is_valid for g in original]
    old_sets = [g if g.is_valid else make_valid(g) for g in original]
    new_sets = [g if g.is_valid else make_valid(g) for g in candidate]
    for i, (a, b) in enumerate(zip(original, candidate)):
        assert all(b.bounds[k] >= a.bounds[k] for k in (0, 1)), src[i]['id']
        assert all(b.bounds[k] <= a.bounds[k] for k in (2, 3)), src[i]['id']
        if not source_valid[i]:
            assert src[i]['polygons'] == dst[i]['polygons'], src[i]['id']
    tree = STRtree(original)
    counts = Counter()
    overlaps, added_intersections, contacts_lost, errors = [], [], [], []
    max_new_area = 0.0
    max_lost_line = 0.0
    max_point_distance = 0.0
    for i, a in enumerate(original):
        for j in tree.query(a):
            j = int(j)
            if j <= i:
                continue
            counts['bbox_pairs'] += 1
            category = 'valid_original_pair' if source_valid[i] and source_valid[j] else 'invalid_original_comparison_pair'
            counts[category] += 1
            try:
                old_intersection = old_sets[i].intersection(old_sets[j])
                new_intersection = new_sets[i].intersection(new_sets[j])
                old_area = old_intersection.area
                new_area = new_intersection.area
                added_area = new_intersection.difference(old_intersection).area
                if added_area > 1e-8:
                    added_intersections.append({'a': src[i]['id'], 'b': src[j]['id'],
                                                'category': category,
                                                'added_area_m2': added_area,
                                                'old_area_m2': old_area,
                                                'new_area_m2': new_area})
                if old_area <= 1e-8 and new_area > 1e-8:
                    max_new_area = max(max_new_area, new_area)
                    overlaps.append({'a': src[i]['id'], 'b': src[j]['id'],
                                     'category': category, 'old_area_m2': old_area,
                                     'new_area_m2': new_area})
                contact = a.boundary.intersection(original[j].boundary)
                if contact.is_empty:
                    counts['no_original_boundary_contact'] += 1
                    continue
                kinds = {v.geom_type for v in components(contact)}
                counts['original_boundary_contacts'] += 1
                counts['contact_type:' + '+'.join(sorted(kinds))] += 1
                losses = []
                for atom in components(contact):
                    if atom.geom_type == 'Point':
                        distance = max(atom.distance(candidate[i].boundary), atom.distance(candidate[j].boundary))
                        max_point_distance = max(max_point_distance, distance)
                        if distance > 1e-7:
                            losses.append({'point_distance_m': distance, 'xy': [atom.x, atom.y]})
                    elif atom.geom_type in ('LineString', 'LinearRing'):
                        # Exact coverage implies coverage within the declared tolerance.
                        # Avoid buffering an entire large boundary for an already-covered
                        # seam; the original tolerance computation is only needed on a
                        # nonzero remainder. This changes cost, not the pass criterion.
                        remaining = []
                        for index in (i, j):
                            boundary = candidate[index].boundary
                            exact = atom.difference(boundary)
                            counts['exact_line_checks'] += 1
                            if exact.length > 1e-7:
                                counts['line_tolerance_refinements'] += 1
                                remaining.append(atom.difference(boundary.buffer(1e-7)).length)
                            else:
                                remaining.append(exact.length)
                        lost = max(remaining)
                        max_lost_line = max(max_lost_line, lost)
                        if lost > 1e-7:
                            losses.append({'lost_line_m': lost, 'original_line_m': atom.length})
                    else:
                        raise AssertionError('Unexpected boundary contact type ' + atom.geom_type)
                if losses:
                    contacts_lost.append({'a': src[i]['id'], 'b': src[j]['id'], 'losses': losses})
            except Exception as exc:
                errors.append({'a': src[i]['id'], 'b': src[j]['id'], 'error': str(exc)})
        if i and i % 25000 == 0:
            print(json.dumps({'features_done': i, 'pairs': counts['bbox_pairs'],
                              'new_overlaps': len(overlaps), 'lost_contacts': len(contacts_lost),
                              'errors': len(errors)}), flush=True)
    return {'feature_count': len(src), 'counts': dict(counts),
            'area_reporting_threshold_m2': 1e-8, 'contact_tolerance_m': 1e-7,
            'max_new_area_m2': max_new_area, 'max_lost_line_m': max_lost_line,
            'max_contact_point_distance_m': max_point_distance,
            'new_overlaps': overlaps, 'added_intersections': added_intersections,
            'lost_contacts': contacts_lost, 'errors': errors,
            'passed': not (overlaps or added_intersections or contacts_lost or errors)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    start = time.monotonic()
    raw_source = args.source.read_bytes()
    raw_candidate = args.candidate.read_bytes()
    hashes = {'source_sha256': hashlib.sha256(raw_source).hexdigest(),
              'candidate_sha256': hashlib.sha256(raw_candidate).hexdigest()}
    source = json.loads(raw_source)
    del raw_source
    candidate = json.loads(raw_candidate)
    del raw_candidate
    result = {**hashes, **audit(source, candidate), 'seconds': time.monotonic() - start}
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in result.items()}, indent=2))
    raise SystemExit(0 if result['passed'] else 1)

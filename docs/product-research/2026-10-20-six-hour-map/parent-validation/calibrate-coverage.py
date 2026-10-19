"""Calibrate the parent oracle with independent failure classes and unchanged data."""
import importlib.util
import json
from pathlib import Path

root = Path(__file__).parent
spec = importlib.util.spec_from_file_location('coverage', root / 'coverage-oracle.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def feature(name, points):
    return {'id': name, 'polygons': [[points]]}


def document(*features):
    return {'layers': {'roads': list(features)}}


old_a = feature('a', [[0, 0], [4, 0], [4, 4], [2.1, 4], [2.1, 1], [1.9, 1], [1.9, 4], [0, 4], [0, 0]])
new_a = feature('a', [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]])
b = feature('b', [[1.95, 2], [2.05, 2], [2.05, 3], [1.95, 3], [1.95, 2]])
nearby = module.audit(document(old_a, b), document(new_a, b))
assert not nearby['passed'] and len(nearby['new_overlaps']) == 1
assert nearby['counts']['no_original_boundary_contact'] == 1

overlapping = feature('existing-overlap', [[1, 0], [3, 0], [3, 3], [1, 3], [1, 0]])
increased = module.audit(document(old_a, overlapping), document(new_a, overlapping))
assert not increased['passed'] and not increased['new_overlaps']
assert len(increased['added_intersections']) == 1

square = feature('square', [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])
triangle = feature('square', [[0, 0], [2, 0], [0, 2], [0, 0]])
touch = feature('touch', [[2, 1], [3, 0], [3, 2], [2, 1]])
point = module.audit(document(square, touch), document(triangle, touch))
assert not point['passed'] and len(point['lost_contacts']) == 1
assert point['counts']['contact_type:Point'] == 1
assert not point['new_overlaps']

old = root.parents[1] / '2026-10-17-ten-hour-map/PACK01/r2-review'
source = json.loads((old / 'overlap-source.json').read_text())
candidate = json.loads((old / 'overlap-packed.json').read_text())
mixed = module.audit(source, candidate)
unchanged = module.audit(source, source)
assert not mixed['passed'] and len(mixed['new_overlaps']) == 1 and len(mixed['lost_contacts']) == 1
assert unchanged['passed']
result = {'passed': True, 'unchanged_real_source': unchanged,
          'old_real_mixed_contact_failure_detected': mixed,
          'point_only_loss_detected': point, 'nearby_without_contact_overlap_detected': nearby,
          'existing_overlap_new_area_detected': increased}
(root / 'coverage-calibration.json').write_text(json.dumps(result, indent=2) + '\n')
print('PASS: unchanged real geometry; reject old mixed contact, pure point loss, and new overlap without original contact')

from pathlib import Path
import collections
import gzip
import hashlib
import json
import subprocess

work = Path('/Volumes/SanDisk2TB/amsterdam-brewery-unity/.claude/worktrees/push-review-20260914')
base = work / 'docs/product-research/2026-10-13-four-day-demo/map-morphology-design'
task_id = 'amsterdam-map-morphology-design-r3-20261015'
state = Path.home() / '.local/state/taskrouter/claude-plan' / task_id
status = json.loads((state / 'status.json').read_text())
assert status['state'] == 'done', 'Original request still running; do not collect/restart'
receipt = json.loads((state / 'result.json').read_text())
launch = json.loads((state / 'launch.json').read_text())
pid = launch['pid']
ps = subprocess.run(['ps', '-p', str(pid), '-o', 'pid=,stat=,comm='], capture_output=True, text=True)
assert ps.returncode != 0, 'Worker still live; wait'
contract = json.loads((base / 'r3/handoff.json').read_text())
manifest = json.loads((base / 'r3/input-sha256.json').read_text())
dest = base / 'r3-review'
dest.mkdir(exist_ok=False)
parent = Path('/tmp/amsterdam-map01-r3-parent')
parent.mkdir(exist_ok=False)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None

for name in ['handoff.json', 'launch.json', 'status.json', 'result.json', 'stderr.log']:
    p = state / name
    if p.exists():
        (dest / name).write_bytes(p.read_bytes())
raw_events = (state / 'events.jsonl').read_bytes()
(dest / 'events.jsonl.gz').write_bytes(gzip.compress(raw_events, mtime=0))
checks = {}
for f, original_entry in manifest.items():
    original_sha = original_entry["sha256"]
    staged = state / 'workspace' / f
    checks[f] = {
        'original_sha256': original_sha,
        'source_unchanged': sha(Path(contract['workspace']) / f) == original_sha,
        'staged_unchanged': sha(staged) == original_sha,
        'writable': f in contract['write_files'],
        'staged_sha256': sha(staged),
    }
    if staged.exists():
        target = parent / f
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(staged.read_bytes())
for f in contract['write_files'] + ['handoff-result.json']:
    p = state / 'workspace' / f
    if p.exists():
        (dest / f).parent.mkdir(parents=True, exist_ok=True)
        (dest / f).write_bytes(p.read_bytes())
        (parent / f).parent.mkdir(parents=True, exist_ok=True)
        (parent / f).write_bytes(p.read_bytes())
uses = []
for line in raw_events.splitlines():
    try:
        e = json.loads(line)
    except (ValueError, UnicodeDecodeError):
        continue
    if not isinstance(e, dict):
        continue
    m = e.get('message', {})
    content = m.get('content', []) if isinstance(m, dict) else []
    if not isinstance(content, list):
        continue
    for x in content:
        if isinstance(x, dict) and x.get('type') == 'tool_use':
            args = x.get('input', {})
            uses.append({'tool': x['name'], 'id': x.get('id'), 'input': {k: v for k, v in args.items() if k in ['file_path', 'command', 'offset', 'limit']}})
commands = [x['input'].get('command') for x in uses if x['tool'] == 'Bash']
allowed_paths = set(contract['read_files'] + contract['write_files'] + ['handoff-result.json'])
path_checks = []
for x in uses:
    value = x['input'].get('file_path')
    if not value:
        continue
    candidate = Path(value)
    resolved = candidate.resolve() if candidate.is_absolute() else (state / 'workspace' / candidate).resolve()
    try:
        relative = str(resolved.relative_to((state / 'workspace').resolve()))
    except ValueError:
        relative = None
    path_checks.append({'tool': x['tool'], 'path': value, 'relative': relative, 'in_scope': relative in allowed_paths})

audit = {
    'task_id': task_id,
    'worker_exited': True,
    'input_checks': checks,
    'actual_tool_uses': uses,
    'tool_counts': dict(collections.Counter(x['tool'] for x in uses)),
    'extra_commands': [c for c in commands if c not in contract['commands']],
    'path_checks': path_checks,
    'workspace_files': sorted(str(p.relative_to(state / 'workspace')) for p in (state / 'workspace').rglob('*') if p.is_file()),
    'receipt_permission_denials': receipt.get('permission_denials'),
    'receipt_disallowed_changes': receipt.get('disallowed_changes'),
}
(dest / 'parent-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
result = subprocess.run(['python3', 'validate_design.py'], cwd=parent, capture_output=True, text=True)
verification = {'command': 'python3 validate_design.py', 'cwd': str(parent), 'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr, 'scope': 'Structural validation only; parent semantic and rendered image review still required.'}
(dest / 'parent-structure.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2) + '\n')
raster = subprocess.run(['/opt/homebrew/bin/rsvg-convert', '-w', '1600', 'concept.svg', '-o', 'concept-preview.png'], cwd=parent, capture_output=True, text=True, timeout=60)
if raster.returncode == 0:
    (dest / 'concept-render.png').write_bytes((parent / 'concept-preview.png').read_bytes())
render_result = {'command': contract['commands'][1], 'cwd': str(parent), 'exit_code': raster.returncode, 'stdout': raster.stdout, 'stderr': raster.stderr, 'worker_preview_sha256': sha(dest / 'concept-preview.png'), 'parent_render_sha256': sha(dest / 'concept-render.png'), 'preview_matches_parent': sha(dest / 'concept-preview.png') == sha(dest / 'concept-render.png')}
(dest / 'render-result.json').write_text(json.dumps(render_result, indent=2) + '\n')
(dest / 'collect-amsterdam-map01-r3.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'task_id': task_id, 'status': receipt.get('status'), 'claude': {k: receipt.get('claude', {}).get(k) for k in ['returncode','outcome','final_subtype','is_error']}, 'started_at': receipt.get('started_at'), 'finished_at': receipt.get('finished_at'), 'elapsed_seconds': receipt.get('elapsed_seconds'), 'tool_counts': audit['tool_counts'], 'extra_commands': audit['extra_commands'], 'all_sources_unchanged': all(c['source_unchanged'] for c in checks.values()), 'readonly_staged_unchanged': all(c['staged_unchanged'] for c in checks.values() if not c['writable']), 'parent_validator_exit': result.returncode, 'evidence': str(dest)}, ensure_ascii=False))

"""Run the original declared tests on a separate parent copy after collection."""
import argparse,json,pathlib,shlex,shutil,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--review',type=pathlib.Path,required=True);p.add_argument('--work',type=pathlib.Path,required=True);a=p.parse_args()
h=json.loads((a.review/'handoff.json').read_text());scope=json.loads((a.review/'scope-check.json').read_text())
assert not scope['path_violations'] and not scope['disallowed_changes']
assert all(s['source_match'] and (not s['readonly'] or s['staged_match']) for s in scope['input_sha'])
assert not a.work.exists(),'Parent copy already exists; do not overwrite an unknown run'
shutil.copytree(a.review/'original',a.work);rows=[]
for i,cmd in enumerate(h['commands']):
 start=time.monotonic()
 with (a.review/f'command-{i}.log').open('w') as log:
  try:r=subprocess.run(shlex.split(cmd),cwd=a.work,stdout=log,stderr=subprocess.STDOUT,timeout=240);code=r.returncode
  except subprocess.TimeoutExpired:code=124
 row={'command':cmd,'exit_code':code,'seconds':time.monotonic()-start};rows.append(row);(a.review/'commands.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
raise SystemExit(0 if all(x['exit_code']==0 for x in rows) else 1)

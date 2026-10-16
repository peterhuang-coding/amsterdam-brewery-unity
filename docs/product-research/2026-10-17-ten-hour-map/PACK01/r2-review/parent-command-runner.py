from pathlib import Path
import json,shutil,subprocess,time,hashlib,collections,shlex
root=Path('/tmp/amsterdam-d26-pack-r2-parent-20261017');root.mkdir(exist_ok=True);l=Path.home()/'.local/state/taskrouter/claude-plan/amsterdam-d26-runtime-pack-r2-20261017';h=json.loads((l/'handoff.json').read_text());r=json.loads((l/'result.json').read_text());dst=root/'sample';shutil.copytree(l/'workspace',dst,dirs_exist_ok=True)
counts=collections.Counter();uses=[];extra=[];violations=[]
for line in (l/'events.jsonl').open():
 try:e=json.loads(line)
 except:continue
 m=e.get('message')
 for z in m.get('content',[]) if isinstance(m,dict) else []:
  if isinstance(z,dict)and z.get('type')=='tool_use':
   n=z.get('name');a=z.get('input',{});counts[n]+=1;uses.append({'tool':n,'input':a})
   if n=='Bash' and a.get('command')not in h['commands']:extra.append(a.get('command'))
   if n in ['Read','Edit','Write']:
    key='file_path' if 'file_path'in a else 'path';raw=a.get(key,'');q=Path(raw);q=q if q.is_absolute()else l/'workspace'/q
    try:rel=str(q.resolve().relative_to((l/'workspace').resolve()))
    except ValueError:rel=None
    allowed=set(h['read_files']+h['write_files']+['handoff-result.json'])if n=='Read'else set(h['write_files']+['handoff-result.json'])
    if rel not in allowed:violations.append({'tool':n,'path':raw,'resolved_relative':rel})
sha=[]
for n,expected in r['input_hashes'].items():
 source=hashlib.sha256((Path(h['workspace'])/n).read_bytes()).hexdigest();staged=hashlib.sha256((l/'workspace'/n).read_bytes()).hexdigest();sha.append({'file':n,'source_match':source==expected,'readonly':n not in h['write_files'],'staged_match':staged==expected})
scope={'finished_at':r['finished_at'],'elapsed_seconds':r['elapsed_seconds'],'cli_returncode':r['claude']['returncode'],'is_error':r['claude']['is_error'],'report_valid':bool(r.get('report')),'tool_counts':dict(counts),'extra_bash_attempts':len(extra),'permission_denials':r['permission_denials'],'disallowed_changes':r['disallowed_changes'],'input_sha':sha,'path_violations':violations};(root/'scope-check.json').write_text(json.dumps(scope,ensure_ascii=False,indent=2));(root/'actual-tools.json').write_text(json.dumps(uses,ensure_ascii=False,indent=2));print({k:v for k,v in scope.items()if k not in ['permission_denials','input_sha']},flush=True)
assert not violations and all(x['source_match']and(not x['readonly']or x['staged_match'])for x in sha)
rows=[]
for i,c in enumerate(h['commands']):
 t=time.monotonic()
 with(root/f'command-{i}.log').open('w')as f:q=subprocess.run(shlex.split(c),cwd=dst,stdout=f,stderr=subprocess.STDOUT,timeout=90)
 row={'command':c,'exit_code':q.returncode,'seconds':time.monotonic()-t};rows.append(row);print(row,flush=True)
(root/'commands.json').write_text(json.dumps(rows,indent=2));assert all(x['exit_code']==0 for x in rows)
full=root/'full';full.mkdir(exist_ok=True);cmd=['/tmp/amsterdam-d26-geo-tools-venv/bin/python',str(dst/'pack_geo.py'),'--input','/Volumes/SanDisk2TB/amsterdam-geodata/d26-bgt-20261017/converted/geo-data.json','--json',str(full/'runtime.json'),'--gzip',str(full/'runtime.json.gz'),'--audit',str(full/'runtime-audit.json'),'--tolerance','0.05'];t=time.monotonic()
try:
 with(full/'pack.log').open('w')as f:q=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=600)
 row={'command':cmd,'exit_code':q.returncode,'seconds':time.monotonic()-t}
except subprocess.TimeoutExpired:row={'command':cmd,'exit_code':None,'parent_timeout_seconds':600,'seconds':time.monotonic()-t}
(full/'run.json').write_text(json.dumps(row,indent=2));print(row,flush=True)
if row['exit_code']==0:
 a=json.loads((full/'runtime-audit.json').read_text());print('audit_keys',list(a));print(json.dumps({k:v for k,v in a.items()if k not in ['features','per_feature','source','layers']},ensure_ascii=False)[:4000],flush=True)

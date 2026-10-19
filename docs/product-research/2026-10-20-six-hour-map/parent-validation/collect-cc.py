"""Snapshot a terminal original CC attempt; distinguish receipt from disk report."""
import argparse,collections,gzip,hashlib,importlib.util,json,pathlib,shutil
p=argparse.ArgumentParser();p.add_argument('task_id');p.add_argument('out',type=pathlib.Path);a=p.parse_args()
ledger=pathlib.Path.home()/'.local/state/taskrouter/claude-plan'/a.task_id
status=json.loads((ledger/'status.json').read_text());assert status['state']=='done','Original attempt is not terminal'
h=json.loads((ledger/'handoff.json').read_text());r=json.loads((ledger/'result.json').read_text());out=a.out;out.mkdir(parents=True,exist_ok=False)
for f in ['handoff.json','status.json','result.json','stderr.log','launch.json']:
 if (ledger/f).exists():shutil.copy2(ledger/f,out/f)
with (ledger/'events.jsonl').open('rb') as src,gzip.open(out/'events.jsonl.gz','wb') as dst:shutil.copyfileobj(src,dst)
shutil.copytree(ledger/'workspace',out/'original')
spec=importlib.util.spec_from_file_location('claude_plan','/Volumes/SanDisk2TB/toolkits/scripts/claude_plan.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
reportpath=ledger/'workspace/handoff-result.json';report=None;reporterror='missing on disk'
if reportpath.exists():
 try:report=json.loads(reportpath.read_text());reporterror=mod.validate_report(report,h)
 except Exception as exc:reporterror=str(exc)
uses=[];violations=[];extra=[];counts=collections.Counter()
for line in (ledger/'events.jsonl').read_text().splitlines():
 try:e=json.loads(line)
 except Exception:continue
 if not isinstance(e,dict) or not isinstance(e.get('message'),dict):continue
 content=e['message'].get('content',[])
 if not isinstance(content,list):continue
 for z in content:
  if not isinstance(z,dict) or z.get('type')!='tool_use':continue
  n=z.get('name');args=z.get('input',{});counts[n]+=1;uses.append({'tool':n,'input':args})
  if n=='Bash' and args.get('command') not in h['commands']:extra.append(args.get('command'))
  if n in ['Read','Edit','Write']:
   raw=args.get('file_path',args.get('path',''));q=pathlib.Path(raw);q=q if q.is_absolute() else ledger/'workspace'/q
   try:rel=str(q.resolve().relative_to((ledger/'workspace').resolve()))
   except ValueError:rel=None
   allowed=set(h['read_files']+h['write_files']+['handoff-result.json']) if n=='Read' else set(h['write_files']+['handoff-result.json'])
   if rel not in allowed:violations.append({'tool':n,'path':raw,'resolved_relative':rel})
sha=[]
for rel,expected in r['input_hashes'].items():
 src=pathlib.Path(h['workspace'])/rel;staged=ledger/'workspace'/rel
 sha.append({'file':rel,'source_match':src.exists() and hashlib.sha256(src.read_bytes()).hexdigest()==expected,'readonly':rel not in h['write_files'],'staged_match':staged.exists() and hashlib.sha256(staged.read_bytes()).hexdigest()==expected})
summary={'task_id':a.task_id,'receipt_status':r['status'],'finished_at':r['finished_at'],'elapsed_seconds':r['elapsed_seconds'],'cli':r['claude'],'observed_models':r['observed_models'],'receipt_report_present':r.get('report') is not None,'disk_report_present':reportpath.exists(),'disk_report_sha256':hashlib.sha256(reportpath.read_bytes()).hexdigest() if reportpath.exists() else None,'disk_report_validation_error':reporterror,'disk_report_status':report.get('status') if isinstance(report,dict) else None,'tool_counts':dict(counts),'extra_bash_commands':extra,'permission_denials':r['permission_denials'],'disallowed_changes':r['disallowed_changes'],'path_violations':violations,'input_sha':sha}
(out/'scope-check.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');(out/'actual-tools.json').write_text(json.dumps(uses,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['input_sha','permission_denials']},ensure_ascii=False,indent=2))
assert not violations and not r['disallowed_changes'] and all(x['source_match'] and(not x['readonly'] or x['staged_match']) for x in sha),'Scope/input mismatch requires parent review'

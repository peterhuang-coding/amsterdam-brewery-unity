from pathlib import Path
import json,hashlib,collections
root=Path('/tmp/amsterdam-d23-20261013'); ledger=Path.home()/'.local/state/taskrouter/claude-plan/amsterdam-first-street-r2-20261013';stage=ledger/'workspace'
h=json.loads((root/'handoff.json').read_text());hashes=json.loads((root/'input-sha256.json').read_text());allowed=set(h['write_files']);stats=collections.Counter();extra=[];denials=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changed=[];readonly=[];source=[]
for f,digest in hashes.items():
 if sha(root/'input'/f)!=digest:source.append(f)
 if not (stage/f).exists() or sha(stage/f)!=digest:
  changed.append(f)
  if f not in allowed:readonly.append(f)
for f in allowed:
 if f not in hashes and (stage/f).exists():changed.append(f)
for line in (ledger/'events.jsonl').read_text().splitlines():
 try:e=json.loads(line)
 except:continue
 if not isinstance(e,dict) or not isinstance(e.get('message',{}),dict):continue
 for b in e.get('message',{}).get('content',[]):
  if not isinstance(b,dict):continue
  if b.get('type')=='tool_use':
   n=b.get('name');stats[n]+=1
   if n=='Bash' and b.get('input',{}).get('command') not in h['commands']:extra.append(b.get('input',{}).get('command'))
result=json.loads((ledger/'result.json').read_text()) if (ledger/'result.json').exists() else None
out={'ledger':json.loads((ledger/'status.json').read_text()),'result_status':result.get('status') if result else None,'changed_files':changed,'readonly_changed':readonly,'source_changed':source,'tool_counts':dict(stats),'extra_commands':extra,'report':result.get('report') if result else None,'claude':result.get('claude') if result else None,'elapsed_seconds':result.get('elapsed_seconds') if result else None}
(root/'scope-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))

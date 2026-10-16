import pathlib,json,hashlib,shutil,subprocess,time,collections
root=pathlib.Path('/tmp/amsterdam-d26-nav-parent-20261017');ledger=pathlib.Path('/Users/peter_mini/.local/state/taskrouter/claude-plan/amsterdam-d26-geo-navigation-20261017'); src=ledger/'workspace';dst=root/'final';dst.mkdir(exist_ok=True)
for f in src.iterdir():
 if f.is_file():shutil.copy2(f,dst/f.name)
r=json.loads((ledger/'result.json').read_text()); h=json.loads(pathlib.Path('/tmp/amsterdam-d26-geo-navigation-20261017/handoff.json').read_text());counts=collections.Counter();uses=[];bad=[]
for l in (ledger/'events.jsonl').open():
 try:e=json.loads(l)
 except:continue
 for z in e.get('message',{}).get('content',[]):
  if z.get('type')=='tool_use':
   name=z.get('name');inp=z.get('input',{});counts[name]+=1;uses.append({'tool':name,'input':inp})
   if name=='Bash' and inp.get('command') not in h['commands']:bad.append(inp.get('command'))
hashes=[]
for n,sha in r['input_hashes'].items():
 a=hashlib.sha256((pathlib.Path(h['workspace'])/n).read_bytes()).hexdigest();b=hashlib.sha256((src/n).read_bytes()).hexdigest();hashes.append({'file':n,'expected':sha,'source':a,'staged':b,'match':a==b==sha})
scope={'finished_at':r['finished_at'],'cli':r['claude'],'status':r['status'],'counts':dict(counts),'extra_commands':bad,'input_sha':hashes,'disallowed_changes':r['disallowed_changes'],'permission_denials':r.get('permission_denials'),'report_valid':bool(r.get('report'))};(root/'scope-check.json').write_text(json.dumps(scope,ensure_ascii=False,indent=2));(root/'actual-tools.json').write_text(json.dumps(uses,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in scope.items() if k!='cli'},ensure_ascii=False),flush=True)
rows=[]
for i,cmd in enumerate(h['commands']):
 start=time.monotonic()
 with (root/('command-%s.log'%i)).open('w') as f:
  try:q=subprocess.run(cmd.split(),cwd=dst,stdout=f,stderr=subprocess.STDOUT,timeout=150);code=q.returncode
  except subprocess.TimeoutExpired:code=124
 row={'command':cmd,'exit_code':code,'seconds':time.monotonic()-start};rows.append(row);print(json.dumps(row),flush=True)
(root/'commands.json').write_text(json.dumps(rows,indent=2))
for name,cmd,limit in [('radius-hole',['node',str(root/'radius-hole-repro.cjs'),str(dst/'geo-navigation.js')],10),('real-pub',['node',str(root/'real-pub-probe.cjs'),str(dst/'geo-navigation.js')],35)]:
 start=time.monotonic()
 with (root/(name+'.log')).open('w') as f:
  try:q=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=limit);code=q.returncode
  except subprocess.TimeoutExpired:code=124
 row={'name':name,'exit_code':code,'seconds':time.monotonic()-start};print(json.dumps(row),flush=True);(root/(name+'-run.json')).write_text(json.dumps(row,indent=2))

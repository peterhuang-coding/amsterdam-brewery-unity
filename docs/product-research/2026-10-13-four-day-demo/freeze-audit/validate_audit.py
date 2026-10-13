import json,pathlib
p=pathlib.Path('.');j=json.loads((p/'findings.json').read_text())
assert j['baseline']=='dad6b38c54fda94f541764242f61820d8177bd19'
assert j['scope']=='read-only freeze audit'
assert isinstance(j['blockers'],list) and len(j['blockers'])<=3
for b in j['blockers']:
 assert all(b.get(k) for k in ['id','title','trigger','impact','evidence','status','acceptance'])
 assert b['status'] in ['new-independent','shelved','human-check']
 assert all(any(str(f) in e for f in pathlib.Path('tools/prototype').glob('*')) for e in b['evidence'])
assert {r['stage'] for r in j['route']}=={'day1','day2','day3','ending'}
assert all(r['actions'] and r['observe'] for r in j['route'])
assert j['limits'] and len((p/'audit.md').read_text())>=500
print('Audit structure PASS; semantic/browser/human verification not performed by this check')

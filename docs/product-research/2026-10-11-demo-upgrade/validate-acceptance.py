from pathlib import Path
p=Path('playtest-gates.md')
s=p.read_text()
assert len(s)>1800, 'document lacks substance'
assert 'd89421e' in s, 'baseline missing'
assert '待' in s and '验收' in s, 'truthful acceptance states missing'
assert 'tools/prototype/' in s, 'code anchoring missing'
assert 'TODO' not in s and 'TBD' not in s, 'unresolved placeholders'
print('Document structure OK; semantic and source validation reserved for parent')

from pathlib import Path
import re
p=Path('gameplay-concept.md')
s=p.read_text(encoding='utf-8')
visible=re.sub(r'https?://[^\s)]+','',s)
assert 1200 <= len(visible) <= 3300, ('visible_chars',len(visible))
for w in ['故事','探索','白天','夜','提案','demo']:
    assert w in s.lower(), w
for d in ['graybeardgames.com','steamstatic.com','frictionalgames.com']:
    assert d in s, d
assert s.count('\n|')>=5, 'needs compact gameplay table'
print('PASS: concept length, topics, source links, gameplay table; substantive review remains with parent')
print('visible_chars=',len(visible))

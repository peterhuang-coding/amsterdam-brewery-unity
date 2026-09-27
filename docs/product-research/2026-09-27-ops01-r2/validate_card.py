"""Validate the single proposal artifact; no game code or external dependencies."""
import json
from pathlib import Path

card = json.loads(Path('event-card.json').read_text(encoding='utf-8'))
assert card['status'] == 'proposal'
assert card['id'] == 'NIGHT-SUPERMARKET-01'
assert card['source'] == 'OPS01/card1'
for key in ('title', 'setup', 'player_goal', 'variation', 'falsification'):
    assert isinstance(card[key], str) and card[key].strip(), key
assert isinstance(card['choices'], list) and len(card['choices']) == 2
assert [item['id'] for item in card['choices']] == ['A', 'B']
for item in card['choices']:
    for key in ('action', 'benefit', 'cost', 'failure_recovery', 'next_day'):
        assert isinstance(item[key], str) and item[key].strip(), key
assert card['choices'][0]['action'] != card['choices'][1]['action']
assert card['choices'][0]['cost'] != card['choices'][1]['cost']
assert card['choices'][0]['next_day'] != card['choices'][1]['next_day']
assert isinstance(card['acceptance'], list) and len(card['acceptance']) == 3
assert all(isinstance(item, str) and item.strip() for item in card['acceptance'])
assert len(set(card['acceptance'])) == 3
print('PASS: proposal schema; two distinct choices with costs/recovery/consequences; three acceptance observations and falsification. Design only; no gameplay tests.')

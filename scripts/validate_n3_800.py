import json
from collections import Counter
from pathlib import Path

data = json.loads(Path('src/data/bank/n3_800.json').read_text(encoding='utf-8'))
questions = data['questions']
passages = data['readingPassages']

assert len(questions) == data['totalQuestions'] == 800
assert Counter(q['section'] for q in questions) == Counter({'文字・語彙': 360, '文法': 320, '読解': 120})
assert len({q['id'] for q in questions}) == 800
assert len(passages) == 30
passage_ids = {p['id'] for p in passages}
assert len(passage_ids) == 30
for q in questions:
    if q['type'] == 'sorting':
        assert len(q['options']) == 5
        assert sorted(q['sortedAnswer']) == list(range(5))
    else:
        assert len(q['options']) in {3, 4}
        assert 0 <= q['answer'] < len(q['options'])
    if q['type'] == 'reading_comp':
        assert q['passageId'] in passage_ids
assert sum(1 for q in questions if q['type'] == 'reading_comp') == sum(p['questionCount'] for p in passages)
print('validated: n3_800.json contains 800 questions across 30 reading passages')

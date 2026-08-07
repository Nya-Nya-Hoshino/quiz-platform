import json
from collections import Counter
from pathlib import Path

path = Path('src/data/bank/n3_n4_notes_practice_200.json')
data = json.loads(path.read_text(encoding='utf-8'))
questions = data['questions']
passages = data['readingPassages']

assert data['totalQuestions'] == 200
assert len(questions) == 200
assert len(passages) == 20
assert Counter(q['type'] for q in questions) == {'vocab': 40, 'grammar': 60, 'sorting': 20, 'reading_comp': 80}
assert Counter(q['section'] for q in questions) == {'文字・語彙': 40, '文法': 60, '文法・並べ替え': 20, '読解': 80}
assert len({q['id'] for q in questions}) == 200
assert len({q['question'] for q in questions}) == 200
assert len({p['passage'] for p in passages}) == 20
passage_ids = {p['id'] for p in passages}

for q in questions:
    assert q['difficulty'] in {'N3', 'N4'}
    assert q['score'] == 2
    assert len(q['options']) == 4 if q['type'] != 'sorting' else len(q['options']) == 5
    assert len(set(q['options'])) == len(q['options'])
    if q['type'] == 'sorting':
        assert sorted(q['sortedAnswer']) == list(range(5))
        assert 0 <= q['answer'] < 5
    else:
        assert 0 <= q['answer'] < 4
    if q['type'] == 'reading_comp':
        assert q['passageId'] in passage_ids

assert sum(1 for q in questions if q['type'] == 'reading_comp') == sum(p['questionCount'] for p in passages)
print('validated: 200 questions; vocab 40; grammar 60; sorting 20; reading 80; passages 20')

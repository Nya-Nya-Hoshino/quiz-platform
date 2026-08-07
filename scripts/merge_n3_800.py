import json
from collections import Counter
from pathlib import Path

TARGET = Path('src/data/bank/n3_800.json')
SOURCE = Path('src/data/bank/n3_n4_notes_practice_200.json')

def choice(qid, passage_id, question, correct, wrong):
    options = [correct, *wrong]
    answer = qid % 4
    options[0], options[answer] = options[answer], options[0]
    return {
        'id': qid, 'section': '読解', 'type': 'reading_comp', 'difficulty': 'N3',
        'score': 2, 'question': question, 'options': options, 'answer': answer,
        'explanation': '本文中の情報と一致する選択肢を選ぶ。', 'passageId': passage_id,
    }

def main():
    target = json.loads(TARGET.read_text(encoding='utf-8'))
    source = json.loads(SOURCE.read_text(encoding='utf-8'))
    old_questions = target['questions']
    old_ids = {q['id'] for q in old_questions}
    old_texts = {q['question'] for q in old_questions}
    incoming = source['questions']
    assert not old_texts.intersection(q['question'] for q in incoming)

    old_passages = []
    for pid in sorted({q['passageId'] for q in old_questions if q.get('type') == 'reading_comp'}):
        members = [q for q in old_questions if q.get('type') == 'reading_comp' and q.get('passageId') == pid]
        old_passages.append({'id': pid, 'passage': members[0]['passage'], 'questionCount': len(members)})

    max_old_id = max(q['id'] for q in old_questions)
    passage_offset = max(p['id'] for p in old_passages) + 1
    merged = list(old_questions)
    for position, q in enumerate(incoming, 1):
        item = dict(q)
        item['id'] = max_old_id + position
        if item.get('type') == 'sorting':
            item['section'] = '文法'
        if item.get('type') == 'reading_comp':
            item['passageId'] += passage_offset - 1
        merged.append(item)

    passages = old_passages + [
        {'id': p['id'] + passage_offset - 1, 'passage': p['passage'], 'questionCount': p['questionCount']}
        for p in source['readingPassages']
    ]
    extra = [
        ('地域の見学会', '市では、川の水をきれいにする施設の見学会を開いた。参加者は、家庭で流した水がどのように処理されるかを知った。市は、この見学会を通じて、水を大切に使う人が増えることを期待している。',
         [('見学会で主に見せたものは何ですか。', '川の水をきれいにする施設', ['新しい住宅地', '学校の教室', '電車の駅']),
          ('市が見学会を開いた目的は何ですか。', '水を大切に使う人を増やすため', ['観光客を集めるため', '新しい店を紹介するため', '川で泳ぐ人を増やすため']),
          ('参加者は見学会で何を知りましたか。', '家庭の水が処理される仕組み', ['川の魚の名前', '水道料金の計算', '施設で働く人の休み']),
          ('文章の内容に合うものはどれですか。', '見学会は水の使い方を考えるきっかけになる。', ['見学会は毎日学校で行われる。', '市は水の使用を禁止した。', '参加者は川の工事をした。'])]),
        ('学習アプリ', '中村さんは、毎晩十分だけ日本語の学習アプリを使っている。長い時間勉強できない日でも、短い練習を続ければ言葉を忘れにくいと考えている。週末には、間違えた問題を見直している。',
         [('中村さんは毎晩どのくらいアプリを使いますか。', '十分', ['一時間', '三十分', '二時間']),
          ('中村さんが短い練習を続ける理由は何ですか。', '言葉を忘れにくくするため', ['新しいアプリを作るため', '週末を短くするため', '問題を難しくするため']),
          ('中村さんは週末に何をしますか。', '間違えた問題を見直す', ['先生に電話する', '日本へ旅行する', 'アプリを消す']),
          ('文章から分かる中村さんの学習方法はどれですか。', '短時間でも毎日続け、間違いも確認する。', ['週末だけ長時間勉強する。', '簡単な問題だけを選ぶ。', '勉強した内容を記録しない。'])]),
    ]
    next_id = max(q['id'] for q in merged) + 1
    next_passage = max(p['id'] for p in passages) + 1
    for title, passage, items in extra:
        passages.append({'id': next_passage, 'passage': passage, 'questionCount': 4, 'title': title})
        for question, correct, wrong in items:
            merged.append(choice(next_id, next_passage, question, correct, wrong))
            next_id += 1
        next_passage += 1

    assert len(merged) == 800
    assert len({q['id'] for q in merged}) == 800
    assert not old_texts.intersection(q['question'] for q in incoming)
    target['questions'] = merged
    target['readingPassages'] = passages
    target['totalQuestions'] = 800
    counts = Counter(q['section'] for q in merged)
    target['sections'] = [{'name': name, 'count': counts[name]} for name in ('文字・語彙', '文法', '読解')]
    TARGET.write_text(json.dumps(target, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()

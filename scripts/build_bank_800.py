#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建 800 题库：词汇 320 + 语法 240 + 读解 240
题源：
- 现有唯一题（vocab/reading读音→词汇, grammar/sorting→语法, reading_comp→读解）
- .doc 1551 练习题（语法 493 + 词汇 1051）
- AI 生成读解（208 道，单独补充）
"""
import json, re, os

def load(path):
    return json.load(open(path, encoding='utf-8'))

def main():
    bank = load(r'src\data\bank\n3.json')
    doc = load(r'src\data\bank\doc_questions.json')

    # 1. 现有唯一题
    seen = set()
    existing = []
    for q in bank['questions']:
        k = f"{q['question']}||{(q.get('options') or [''])[0]}"
        if k not in seen:
            seen.add(k)
            existing.append(q)

    # 分类现有题
    vocab_ex = [q for q in existing if q['type'] in ('vocab', 'reading')]  # 读音题→词汇
    grammar_ex = [q for q in existing if q['type'] in ('grammar', 'sorting')]  # 排序→语法
    reading_ex = [q for q in existing if q['type'] == 'reading_comp']

    print(f"现有: 词汇 {len(vocab_ex)} + 语法 {len(grammar_ex)} + 读解 {len(reading_ex)}")

    # 2. .doc 题分类
    doc_qs = doc['questions']
    doc_grammar = [q for q in doc_qs if len(' '.join(q['options'])) <= 12]
    doc_vocab = [q for q in doc_qs if len(' '.join(q['options'])) > 12]
    print(f".doc: 语法 {len(doc_grammar)} + 词汇 {len(doc_vocab)}")

    # 3. 组装
    target = {'vocab': 320, 'grammar': 240, 'reading': 240}
    vocab_pick = doc_vocab[: target['vocab'] - len(vocab_ex)]
    grammar_pick = doc_grammar[: target['grammar'] - len(grammar_ex)]

    print(f"从 .doc 选: 词汇 {len(vocab_pick)} + 语法 {len(grammar_pick)}")

    # 转换 .doc 题到标准格式
    def to_std(q, idx, section, qtype):
        return {
            'id': idx,
            'section': section,
            'type': qtype,
            'difficulty': 'N3',
            'score': 2,
            'question': q['question'],
            'options': q['options'],
            'answer': q['answer'] - 1,  # 1-based → 0-based
            'explanation': '',
            'source': 'doc-1551',
        }

    questions = []
    # 现有词汇题（保持原始格式）
    for q in vocab_ex:
        q['source'] = 'existing-vocab'
        questions.append(q)
    # .doc 词汇题
    for i, q in enumerate(vocab_pick):
        questions.append(to_std(q, 20000 + i, '文字・語彙', 'vocab'))
    # 现有语法题
    for q in grammar_ex:
        q['source'] = 'existing-grammar'
        questions.append(q)
    # .doc 语法题
    for i, q in enumerate(grammar_pick):
        questions.append(to_std(q, 30000 + i, '文法', 'grammar'))
    # 现有读解题
    for q in reading_ex:
        q['source'] = 'existing-reading'
        questions.append(q)

    # 输出当前（读解待 AI 补充）
    out = {
        'title': 'N3 综合题库（800）',
        'level': 'N3',
        'totalQuestions': 800,
        'questions': questions,
        'sections': [
            {'name': '文字・語彙', 'count': target['vocab']},
            {'name': '文法', 'count': target['grammar']},
            {'name': '読解', 'count': target['reading']},
        ],
        'status': 'vocab-grammar-done',  # 读解待补
    }
    with open(r'src\data\bank\n3_800.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 统计
    from collections import Counter
    sec = Counter(q['section'] for q in questions)
    print(f"\n当前库: 总 {len(questions)}")
    print(f"  板块: {dict(sec)}")
    print(f"  待补读解: {target['reading'] - len(reading_ex)} 道")

if __name__ == '__main__':
    main()

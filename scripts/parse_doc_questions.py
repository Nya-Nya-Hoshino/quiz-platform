#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解析 .doc 练习题（1551题）→ 结构化 JSON"""
import docx, re, json, os

def parse(path):
    d = docx.Document(path)
    paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]
    questions = []
    current = None
    for p in paras:
        m = re.match(r'^(\d+)\s+(.+)$', p)
        if m and ('）' in p or '　' in p) and '答案' not in p:
            num = int(m.group(1))
            if num <= 2000:
                if current: questions.append(current)
                current = {'num': num, 'question': p, 'options': [], 'answer': None}
                continue
        if current and '答案' in p:
            opts_raw = re.findall(r'(\d)\)\s*(.*?)(?=\d\)|答案)', p)
            for o in opts_raw:
                opt_text = o[1].strip()
                if opt_text:
                    current['options'].append(opt_text)
            ans = re.search(r'答案[:：](\d+)', p)
            if ans:
                current['answer'] = int(ans.group(1))
    if current: questions.append(current)
    valid = [q for q in questions if q['answer'] is not None and len(q['options']) >= 3]
    for q in valid:
        q['options'] = [re.sub(r'[　\s]+答案.*$', '', o).replace('　','').strip() for o in q['options']][:4]
    return valid

if __name__ == '__main__':
    path = r'C:\Users\l1526\AppData\Local\Temp\doc-convert\clipboard-20260805-214652.500656-000009.docx'
    qs = parse(path)
    out = {'source': '日语3级语法与词汇练习大全(1551个)附答案', 'level': 'N3', 'questions': qs}
    os.makedirs(r'src\data\bank', exist_ok=True)
    with open(r'src\data\bank\doc_questions.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'入库 {len(qs)} 题 → src/data/bank/doc_questions.json')

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
处理用户整理的 N3 练习题：
1. 解析对象流，删除 163-168 中第一次出现的题（保留第二次）
2. 校验序号连续、字段完整
3. 均分 4 份练习卷，输出为 exam JSON
"""
import json
import re
import sys
from collections import Counter

SRC = r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-161530.929054-000001.txt'
OUT_DIR = r'src\data\jlpt-user'

def extract_objects(text):
    objects = []
    i = 0
    n = len(text)
    while i < n:
        j = text.find('{', i)
        if j < 0:
            break
        depth = 0
        k = j
        in_str = False
        while k < n:
            ch = text[k]
            if ch == '"' and (k == 0 or text[k - 1] != '\\'):
                in_str = not in_str
            elif not in_str:
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        break
            k += 1
        if k >= n:
            break
        try:
            objects.append(json.loads(text[j:k + 1]))
        except Exception:
            pass
        i = k + 1
    return objects

def main():
    raw = open(SRC, encoding='utf-8').read()
    objs = extract_objects(raw)
    print(f'解析: {len(objs)} 个对象')

    # 删除 163-168 第一次出现的题（保留每组第二个）
    seen = Counter()
    filtered = []
    for o in objs:
        oid = o.get('id')
        if oid in (163, 164, 165, 166, 167, 168):
            seen[oid] += 1
            if seen[oid] == 1:
                print(f'删除 id={oid} 第一次出现: {o.get("question","")[:30]}')
                continue
        filtered.append(o)
    print(f'删除后: {len(filtered)} 道')

    # 重新编号 1-N（保持顺序）
    for idx, o in enumerate(filtered, 1):
        o['id'] = idx
        o['section'] = o.get('section', '文字・語彙')
        # 统一 section 名
        if o['section'] == '文字':
            o['section'] = '文字・語彙'
        if o['section'] == '語彙':
            o['section'] = '文字・語彙'
        # type 标准化
        t = o.get('type', '')
        if t in ('reading', 'vocab'):
            o['type'] = 'reading' if o.get('prompt') and '読み' in o.get('prompt', '') else 'vocab'
        # 添加 difficulty 兜底
        if not o.get('difficulty'):
            o['difficulty'] = 'N3'
        if not o.get('score'):
            o['score'] = 2

    print(f'重新编号后: {len(filtered)} 道 (id 1-{len(filtered)})')

    # 校验
    nums = [o['id'] for o in filtered]
    missing = [n for n in range(1, len(filtered) + 1) if n not in nums]
    print(f'序号连续: {"✓" if not missing else f"缺失{missing}"}')
    no_ans = [o for o in filtered if o.get('answer') is None]
    bad_range = [o for o in filtered if o.get('answer') is not None and not (0 <= o['answer'] < len(o.get('options', [])))]
    print(f'缺 answer: {len(no_ans)}, 越界: {len(bad_range)}')

    # 类型分布
    types = Counter(o.get('type') for o in filtered)
    print(f'题型: {dict(types)}')
    sections = Counter(o.get('section') for o in filtered)
    print(f'板块: {dict(sections)}')

    # 均分 4 份（按顺序切块）
    n = len(filtered)
    chunk = (n + 3) // 4
    parts = [filtered[i:i + chunk] for i in range(0, n, chunk)]
    print(f'\n均分 4 份: {[len(p) for p in parts]}')

    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    for idx, part in enumerate(parts, 1):
        total_score = sum(o.get('score', 2) for o in part)
        exam = {
            'testId': f'user-{idx}',
            'title': f'N3 自主练习 第{idx}套',
            'timeLimit': 60,
            'passScore': max(1, total_score // 2),
            'totalScore': total_score,
            'totalQuestions': len(part),
            'sections': [
                {'name': '文字・語彙', 'count': sum(1 for o in part if o['section'] == '文字・語彙')},
                {'name': '文法', 'count': sum(1 for o in part if o['section'] == '文法')},
            ],
            'questions': part,
            'readingPassages': [],
        }
        path = f'{OUT_DIR}/n3-user-{idx}.json'
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(exam, f, ensure_ascii=False, indent=1)
        print(f'写入 {path}: {len(part)} 题, {total_score} 分')

if __name__ == '__main__':
    main()

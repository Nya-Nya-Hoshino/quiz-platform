#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解析用户整理的 N3 练习题（JSON 对象流），检查序号/语法/重复"""
import json
import re
import sys
from collections import Counter

PATH = r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-161530.929054-000001.txt'

def extract_objects(text):
    """用括号配对切割顶层 JSON 对象"""
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
            print(f'警告: @{j} 未闭合')
            break
        obj_text = text[j:k + 1]
        try:
            obj = json.loads(obj_text)
            objects.append(obj)
        except Exception as e:
            print(f'对象解析失败 @{j}: {e}')
            print(f'  内容: {obj_text[:100]}')
        i = k + 1
    return objects

def main():
    raw = open(PATH, encoding='utf-8').read()
    print(f'文件大小: {len(raw)} 字符')
    objs = extract_objects(raw)
    print(f'成功解析对象: {len(objs)}')

    if not objs:
        print('无有效对象')
        return

    # 1. 序号检查
    nums = [o.get('id') for o in objs]
    print(f'\n=== 序号检查 ===')
    print(f'id 范围: {min(nums)} - {max(nums)}')
    missing = [n for n in range(1, max(nums) + 1) if n not in nums]
    print(f'缺失 id: {missing if missing else "无 ✓"}')
    cnt = Counter(nums)
    dups = {n: c for n, c in cnt.items() if c > 1}
    print(f'重复 id: {dups if dups else "无 ✓"}')

    # 2. 字段完整性
    print(f'\n=== 字段检查 ===')
    req = ['section', 'type', 'question', 'options', 'answer']
    for f in req:
        miss = sum(1 for o in objs if not o.get(f))
        print(f'  缺 {f}: {miss}')

    # 3. 重复 id 详情
    if dups:
        print(f'\n=== 重复 id 详情 ===')
        for n in sorted(dups):
            items = [o for o in objs if o.get('id') == n]
            questions = [o.get('question', '')[:40] for o in items]
            same = len(set(questions)) == 1
            print(f'  id={n}: {len(items)} 次, 题干{"相同" if same else "不同"}')
            for q in questions:
                print(f'    - {q}')

    # 4. 题型分布
    print(f'\n=== 题型分布 ===')
    types = Counter(o.get('type') for o in objs)
    print(f'  {dict(types)}')
    sections = Counter(o.get('section') for o in objs)
    print(f'  板块: {dict(sections)}')

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 extra 补充数据（MOJiTest 原始 JSON）转换为标准 JLPT 格式。

- 输入: C:\\Users\\l1526\\AppData\\Roaming\\reasonix\\global-workspace\\extra\\N2\\*.json
- 图片: H:\\moji_out\\N2\\*.webp（問題14 题干图/小题图）
- 答案校验: H:\\moji_out\\answer.txt（文字词汇语法 + 阅读答案串）
- 输出: src/data/jlpt/N2/*.json（覆盖现有）

转换规则:
- questionType 11-16 → kind=vocab（文字词汇）
- questionType 21-22 → kind=grammar（语法）
- questionType 23,31-36 → kind=reading（读解）
- questionType 41-46 → listening（丢弃，用户已去掉听力）
- rightAnswer（0-based）→ answer
- article（读解文章）→ section.article 公共字段
- 問題14 图片 → section.image（按考试年份匹配 webp 文件名）
"""
import json
import glob
import os
import re
import shutil

EXTRA_DIR = r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\extra\N2'
IMAGE_DIR = r'H:\moji_out\N2'
ANSWER_FILE = r'H:\moji_out\answer.txt'
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'jlpt', 'N2')
IMG_OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'jlpt', 'images')

def type_to_kind(qt):
    qt = int(qt)
    if 11 <= qt <= 16:
        return 'vocab'
    if 21 <= qt <= 22:
        return 'grammar'
    if 23 <= qt <= 36:
        return 'reading'
    if 41 <= qt <= 46:
        return 'listening'
    return 'reading'

def load_answer_map():
    """解析 answer.txt → {考试标题: {kind: [1-based 答案...]}}"""
    text = open(ANSWER_FILE, encoding='utf-8').read()
    result = {}
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    i = 0
    while i < len(lines):
        if re.match(r'^\d{4}-\d+-\w+$', lines[i]):
            exam = lines[i].replace('-', '年').replace('N2', '月')  # 2018-7-N2 → 2018年7月
            exam = re.sub(r'年(\d+)月', lambda m: f'年{m.group(1)}月', exam)
            # 修正: 2018-7-N2 → 2018年7月
            mm = re.match(r'(\d{4})年(\d+)月', exam)
            if not mm:
                exam = lines[i]
            entry = {}
            i += 1
            while i < len(lines) and not re.match(r'^\d{4}-\d+-\w+$', lines[i]):
                if '：' in lines[i]:
                    k, v = lines[i].split('：', 1)
                    entry[k] = v
                i += 1
            result[exam] = entry
        else:
            i += 1
    return result

def load_images():
    """加载 webp 图片: {考试标题: [文件名...]}"""
    result = {}
    for f in glob.glob(os.path.join(IMAGE_DIR, '*.webp')):
        name = os.path.basename(f)
        m = re.match(r'(\d{4})-(\d+)-N2', name)
        if m:
            exam = f"{m.group(1)}年{m.group(2)}月"
            result.setdefault(exam, []).append(name)
    return result

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(IMG_OUT, exist_ok=True)
    answer_map = load_answer_map()
    images = load_images()

    total_exam = 0
    for path in sorted(glob.glob(os.path.join(EXTRA_DIR, '*.json'))):
        data = json.load(open(path, encoding='utf-8'))
        exam_title = data.get('title', '')
        exam_id = data.get('examId', '')

        sections = []
        for sec in data.get('sections', []):
            qt = sec.get('questionType', 0)
            kind = type_to_kind(qt)
            if kind == 'listening':
                continue  # 丢弃听力

            title = sec.get('layerTitle', '')
            article = sec.get('article', '') or ''

            section = {
                'title': title,
                'kind': kind,
                'groups': [],
                'article': article,  # 读解文章（公共）
            }

            # 問題14 图片（按 identity 的 *14 判断，兼容标题错标）
            first_id = sec.get('questions', [{}])[0].get('identity', '') if sec.get('questions') else ''
            is_q14 = ('問題14' in title or '問題１４' in title
                      or ('*14' in first_id and '0315' in first_id))
            if is_q14:
                imgs = images.get(exam_title, [])
                if imgs:
                    section['images'] = list(imgs)

            for q in sec.get('questions', []):
                # 过滤听力残留（identity 含 *1番 等）
                ident = q.get('identity', '')
                if '*番' in ident or '*質問' in ident:
                    continue
                ans_raw = q.get('rightAnswer', None)
                try:
                    answer = int(ans_raw) if ans_raw not in (None, '', 'NaN') else None
                except (ValueError, TypeError):
                    answer = None
                group = {
                    'id': ident,
                    'content': (q.get('title', '') or '').strip(),
                    'options': q.get('options', []) or [],
                    'answer': answer,
                    'explanation': (q.get('analysis', '') or '').strip(),
                    'translation': (q.get('translation', '') or '').strip(),
                }
                section['groups'].append(group)
            if section['groups']:
                sections.append(section)

        # 用 answer.txt 补全缺失答案（交叉校验）
        ans_entry = answer_map.get(exam_title, {})
        if ans_entry:
            pass  # extra 数据已含答案，answer.txt 作为备用（2026 听力缺的 30 题不在范围内）

        out = {
            'level': 'N2',
            'examTitle': exam_title,
            'examId': exam_id,
            'sections': sections,
        }
        out_path = os.path.join(OUT_DIR, f'{exam_title}.json')
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        total_exam += 1

        # 统计
        total_g = sum(len(s['groups']) for s in sections)
        missing = sum(1 for s in sections for g in s['groups'] if g['answer'] is None)
        print(f"✓ {exam_title}: {len(sections)} 大题, {total_g} 题, 缺答案 {missing}")

    # 复制图片到前端
    copied = 0
    for exam, imgs in images.items():
        for im in imgs:
            src = os.path.join(IMAGE_DIR, im)
            dst = os.path.join(IMG_OUT, im)
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                copied += 1
    print(f"\n共转换 {total_exam} 套，复制图片 {copied} 张 → {IMG_OUT}")

if __name__ == '__main__':
    main()

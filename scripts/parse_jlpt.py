#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
JLPT 真题 Markdown → JSON 解析器
输入: H:\moji_out\N{level}_md\*.md
输出: src/data/jlpt/{level}/ 下的结构化 JSON + audio_manifest.json

结构:
{
  "level": "N2",
  "examTitle": "2018年12月",
  "examId": "1EPlaLzGnX",        # 来自 manifest
  "sections": [
    {
      "title": "問題1 ...",       # 大题标题
      "audioRef": "audio/xxx",   # 听力大题公共音频
      "transcript": "...",        # 听力转录（公共）
      "kind": "listening"|"reading"|"vocab"|"grammar"|"comprehension",
      "groups": [
        {
          "id": "201812N2010101001*01",
          "content": "题目/文章",
          "options": ["...","..."],
          "answer": 1 | null,     # null = NaN 缺失
          "explanation": "...",
          "translation": "...",
          "mediaId": "mojitest/..."  # 来自 manifest
        }
      ]
    }
  ]
}
"""
import re
import json
import os
import sys
import glob

BASE = r'H:\moji_out'
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'jlpt')

# 读取 manifest
def load_manifest():
    with open(os.path.join(BASE, 'audio_manifest.json'), encoding='utf-8') as f:
        return json.load(f)

def classify_section(title):
    """根据大题标题判断题型类别"""
    t = title.strip()
    if re.search(r'聞いて|聞く|返事|話を聞', t) or 'では' in t[:6]:
        return 'listening'
    if re.search(r'文章を読|読んで|の文章|意見|質問に対する回答|ホームページ', t):
        return 'reading'
    if re.search(r'読み方|漢字で書', t):
        return 'vocab'
    if re.search(r'に入れる|入る|★', t):
        return 'grammar'
    if re.search(r'意味が最も近い|言葉の使い方', t):
        return 'vocab'
    return 'comprehension'

def parse_md(path, manifest_map):
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    
    header = lines[0].strip() if lines else ''
    m = re.match(r'# (N\d) (\d{4}年\d+月) 真题', header)
    level, exam_title = (m.group(1), m.group(2)) if m else ('', '')
    
    sections = []
    current_section = None
    pending_audio = ''    # 大题级公共音频引用
    pending_transcript = ''  # 大题级听力转录
    
    i = 0
    while i < len(lines):
        line = lines[i]
        raw = line.rstrip('\n')
        
        # 大题标题
        if line.startswith('## '):
            if current_section and current_section['groups']:
                sections.append(current_section)
            current_section = {
                'title': line[3:].strip(),
                'kind': classify_section(line[3:]),
                'audioRef': pending_audio,
                'transcript': pending_transcript.strip(),
                'groups': [],
            }
            pending_audio = ''
            pending_transcript = ''
            i += 1
            continue
        
        # 大题级公共信息（在小题之前，属于听力组）
        if current_section is not None and not current_section['groups']:
            am = re.match(r'🎧 听力音频：`(.*?)`', raw)
            if am:
                current_section['audioRef'] = am.group(1)
                i += 1
                continue
            if raw.startswith('**听力转录**'):
                # 收集转录行（> 开头）
                i += 1
                trans_lines = []
                while i < len(lines) and (lines[i].strip().startswith('>') or lines[i].strip() == ''):
                    if lines[i].strip().startswith('>'):
                        trans_lines.append(lines[i].strip()[1:].strip())
                    i += 1
                current_section['transcript'] = '\n'.join(trans_lines)
                continue
        
        # 小题/题组
        if line.startswith('### '):
            gid = line[4:].strip()
            # 若当前 section 有未提交的组（多问读解，其实是独立小题），继续往 groups 加
            group = {
                'id': gid,
                'content': '',
                'options': [],
                'answer': None,
                'explanation': '',
                'translation': '',
                '_answer_seen': False,
            }
            current_section['groups'].append(group)
            i += 1
            continue
        
        if current_section is None or not current_section['groups']:
            i += 1
            continue
        
        group = current_section['groups'][-1]
        line = line.strip()
        
        if line.startswith('**答案**'):
            ans = line.replace('**答案**：','').replace('**答案**:','').replace('**答案**','').strip().lstrip(':： ')
            am2 = re.match(r'(\d+)', ans)
            group['answer'] = (int(am2.group(1)) - 1) if am2 else None
            group['_answer_seen'] = True
        elif line.startswith('**解析**'):
            group['explanation'] = line.replace('**解析**：','').replace('**解析**:','').replace('**解析**','').strip().lstrip(':： ')
        elif line.startswith('**译文**'):
            group['translation'] = line.replace('**译文**：','').replace('**译文**:','').replace('**译文**','').strip().lstrip(':： ')
        elif line.startswith('**听力转录**'):
            i += 1
            trans_lines = []
            while i < len(lines) and (lines[i].strip().startswith('>') or lines[i].strip() == ''):
                if lines[i].strip().startswith('>'):
                    trans_lines.append(lines[i].strip()[1:].strip())
                i += 1
            group['transcript'] = '\n'.join(trans_lines)
            continue
        else:
            om = re.match(r'^(\d)\.\s*(.+)$', line)
            if om and not group['_answer_seen']:
                group['options'].append(om.group(2).strip())
            elif line and not group['_answer_seen'] and not line.startswith('---'):
                group['content'] += line + '\n'
        i += 1
    if current_section and current_section['groups']:
        sections.append(current_section)
    
    # 清理内部字段
    for sec in sections:
        for g in sec['groups']:
            g.pop('_answer_seen', None)

    # 从 manifest 获取 examId + 音频映射
    exam_id = ''
    audio_map = {}  # 组id → mediaId
    for entry in manifest_map:
        if entry.get('tag') == level and entry.get('examTitle') == exam_title:
            exam_id = entry.get('examId', '')
            # layer 是组id列表，mediaId 是该层音频
            layer = entry.get('layer', [])
            if layer:
                # 每个 layer 元素对应一个组 id
                audio_map[layer[0]] = entry.get('mediaId', '')
    
    # 将音频映射到 sections/groups
    for sec in sections:
        for g in sec['groups']:
            gid_short = g['id'].split('*')[0]
            if gid_short in audio_map:
                g['mediaId'] = audio_map[gid_short]
            else:
                g['mediaId'] = ''
    
    return {
        'level': level,
        'examTitle': exam_title,
        'examId': exam_id,
        'sections': sections,
    }


# ============ 音频匹配（多策略：文件名 / UUID hash / 问题号 / 子串） ============
import re as _re

def _build_all_files():
    all_files, by_exam = {}, {}
    for level in ['N2', 'N3']:
        base = os.path.join(BASE, level, 'audio')
        for f in glob.glob(base + os.sep + '*') + glob.glob(base + os.sep + 'undefined' + os.sep + '*'):
            name = os.path.basename(f)
            all_files[name.lower()] = f
            us = name.find('_')
            exam = name[:us] if us > 0 else ''
            by_exam.setdefault(exam, []).append(f)
    return all_files, by_exam

_ALL_FILES, _BY_EXAM = _build_all_files()

def _extract_problem_no(name):
    m = _re.search('[問題问题]\s*(\d+)', name)
    if m: return int(m.group(1))
    m = _re.search(r'[\s\-－]\s*(\d+)\s*[-－]\s*\d+', name)
    if m: return int(m.group(1))
    return None

def _match_audio(media_id, exam_title):
    fname = media_id.split('/')[-1]
    if fname.lower() in _ALL_FILES:
        return _ALL_FILES[fname.lower()]
    m = _re.search(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', fname)
    if m:
        hash_tail = m.group(1).rstrip('0123456789')
        for f in _BY_EXAM.get(exam_title, []):
            n = os.path.basename(f).lower()
            fm = _re.search(r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', n)
            if fm and fm.group(1).rstrip('0123456789')[:20] == hash_tail[:20]:
                return f
    pno = _extract_problem_no(fname)
    if pno is not None:
        cands = sorted(((fp, f) for f in _BY_EXAM.get(exam_title, [])
                        for fp in [_extract_problem_no(os.path.basename(f))] if fp), key=lambda x: x[0])
        for fp, f in cands:
            if fp == pno:
                return f
    for f in _BY_EXAM.get(exam_title, []):
        n = os.path.basename(f)
        if fname.lower() in n.lower() or n.lower() in fname.lower():
            return f
    return None

def _attach_audio(data):
    """为 data['sections'] 中每个听力大题写入 audioFile 绝对路径。
    匹配方式：section.groups[0].id 与 manifest.layer[0] 前缀一致（同一听力大题）。"""
    manifest = load_manifest()
    entries = [e for e in manifest
               if e.get('tag') == data['level'] and e.get('examTitle') == data['examTitle']]
    if not entries:
        return
    # 按听力大题顺序分配：第 n 个听力 section 对应 manifest 第 n 条
    listening_idx = 0
    for sec in data['sections']:
        if sec.get('kind') != 'listening' or not sec['groups']:
            continue
        # 用同前缀（听力大题编码段 14 位，如 201812N2020416）找对应 manifest 条目
        gid = sec['groups'][0]['id']
        best = None
        # 精确：取 gid 中听力大题数字段（第13位起 3 位，如 0416/0417/0418/0420/0421）
        m = re.search(r'N20(2?0?4?\d{2})', gid)
        for e in entries:
            layer = e.get('layer', [])
            if not layer:
                continue
            lid = layer[0]
            if gid[:16] == lid[:16]:
                best = e
                break
        if best is None:
            # 兜底：按顺序
            if listening_idx < len(entries):
                best = entries[listening_idx]
        listening_idx += 1
        if best is None:
            continue
        media_id = best.get('mediaId', '')
        if not media_id:
            continue
        path = _match_audio(media_id, data['examTitle'])
        if path:
            sec['audioFile'] = path
            sec['audioMediaId'] = media_id
        else:
            sec['audioFile'] = ''
            sec['audioMissing'] = True

def _filter_no_listening(data):
    """去掉听力大题，只保留 文字词汇/语法/读解（120 分制）"""
    kept = [sec for sec in data['sections'] if sec.get('kind') != 'listening']
    data['sections'] = kept
    # 清理音频相关字段
    for sec in kept:
        sec.pop('audioRef', None)
        sec.pop('transcript', None)
        sec.pop('audioFile', None)
        sec.pop('audioMediaId', None)
    data.pop('audioFile', None)
    data.pop('audioMediaId', None)

def main():
    manifest = load_manifest()
    manifest_map = manifest
    os.makedirs(OUT, exist_ok=True)
    
    total = 0
    for level in ['N2', 'N3']:
        md_dir = os.path.join(BASE, f'{level}_md')
        out_dir = os.path.join(OUT, level)
        os.makedirs(out_dir, exist_ok=True)
        if not os.path.isdir(md_dir):
            print(f'跳过 {level}: 目录不存在')
            continue
        for fn in sorted(os.listdir(md_dir)):
            if not fn.endswith('.md'):
                continue
            path = os.path.join(md_dir, fn)
            try:
                data = parse_md(path, manifest_map)
                _filter_no_listening(data)
                out_path = os.path.join(out_dir, fn.replace('.md', '.json'))
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=1)
                total += 1
                print(f'✓ {level}/{fn}: {len(data["sections"])} 大题, examId={data["examId"]}')
            except Exception as e:
                print(f'✗ {level}/{fn}: {e}')
    
    print(f'\n共解析 {total} 套试卷 → {OUT}')

if __name__ == '__main__':
    main()

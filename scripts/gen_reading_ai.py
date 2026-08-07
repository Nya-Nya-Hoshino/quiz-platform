#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 生成 JLPT N3 读解题（基于知识文档）— 快速版
- 每批 8 道，26 批 ≈ 208 道
- 每批实时写入 ai_reading.json（断点续跑：重启后继续追加）
"""
import json, re, urllib.request, time, os

KB_PATH = r'src\data\bank\knowledge_docs.json'
OUT_PATH = r'src\data\bank\ai_reading.json'
KB = json.load(open(KB_PATH, encoding='utf-8'))

TOPICS = [
    "复合助词（に対して/にとって/によって/に従って/につれて/を問わず/として/において）",
    "特殊五段动词（焦る/帰る/知る/入る/要る/切る/走る/滑る/散る/照る/練る/減る）",
    "动词（出る/入る/上がる/下がる/集める/集まる）自他对应与用法",
    "日常场景（便利店/车站/打工/购物/问路/看病）+ 助词搭配",
    "职场场景（会议/报告/请假/加班）+ 复合助词",
    "校园场景（上课/考试/社团/打工）+ 特殊五段动词",
    "日本文化（节日/食物/交通/礼仪）+ 复合助词",
    "生活场景（租房/银行/邮局/预约）+ 助词用法",
    "复合助词（に基づいて/をもとに/に沿って/を通じて/をめぐって/にかかわらず）",
    "助词辨析（で/に/を/へ/と/から/まで）+ 日常短文",
    "特殊五段动词与一段动词辨析 + 职场短文",
    "动词出る的多种用法（出席/出发/出版/超出）+ 场景短文",
    "复合助词（に応じて/に反して/に比べて/に代わって）场景",
    "情感/心理场景（感谢/道歉/邀请/拒绝）+ 助词",
]

def load_existing():
    if os.path.exists(OUT_PATH):
        d = json.load(open(OUT_PATH, encoding='utf-8'))
        return d.get('questions', [])
    return []

def save(questions):
    out = {'source': 'AI生成（基于知识文档）', 'level': 'N3', 'questions': questions}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

def gen_batch(kb_part, topic, n=8):
    prompt = (
        "你是 JLPT N3 日语出题专家。以下是从日语学习笔记整理的知识要点：\n" + kb_part +
        f"\n\n请基于这些知识要点生成 {n} 道 JLPT N3 读解题，主题围绕：{topic}。\n"
        "要求：\n1. 每道 = 短文（80-120字，日语，重要汉字注假名）+ 1 问题 + 4 选项\n"
        "2. 短文必须自然融入知识点（助词/动词用法）\n"
        "3. 问题考察理解（内容/原因/意图）\n"
        "4. 各道主题互不相同，避免重复\n"
        '5. 严格输出 JSON 数组 [{"passage":"短文","question":"问题","options":["A","B","C","D"],"answer":0}]，answer 为 0-3'
    )
    body = json.dumps({
        'model': 'deepseek-v4-flash',
        'messages': [
            {'role': 'system', 'content': '你是 JLPT N3 日语出题专家，严格输出 JSON。'},
            {'role': 'user', 'content': prompt},
        ],
        'temperature': 0.85,
    }).encode('utf-8')
    req = urllib.request.Request('http://localhost:8080/api/ai/chat', data=body, headers={'Content-Type': 'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=180).read())
    content = resp['choices'][0]['message']['content']
    m = re.search(r'\[[\s\S]*\]', content)
    if not m:
        raise ValueError('AI 未返回数组')
    return json.loads(m.group(0))

def main():
    kb_parts = [KB['助词用法'][:4000], KB['助词用法'][4000:8000], KB['助词用法'][8000:],
                KB['特殊五段动词'], KB['动词出る详解']]
    existing = load_existing()
    all_q = existing
    print(f'已有 {len(all_q)} 道', flush=True)

    batch_num = 0
    while len(all_q) < 120:
        batch_num += 1
        kb_part = kb_parts[batch_num % len(kb_parts)]
        topic = TOPICS[batch_num % len(TOPICS)]
        ok = False
        for attempt in range(3):
            try:
                arr = gen_batch(kb_part, topic)
                # 去重
                seen = set(q['passage'][:40] for q in all_q)
                new = [q for q in arr if q.get('passage','')[:40] not in seen]
                all_q.extend(new)
                save(all_q)  # 实时保存
                print(f"批次{batch_num}: +{len(new)} 累计 {len(all_q)} ({topic[:20]}…)", flush=True)
                ok = True
                break
            except Exception as e:
                print(f"批次{batch_num} 尝试{attempt+1}失败: {str(e)[:60]}", flush=True)
                time.sleep(3)
        if not ok:
            print(f"批次{batch_num} 3次失败，跳过", flush=True)
        time.sleep(1)

    print(f"\n完成: 共 {len(all_q)} 道", flush=True)

if __name__ == '__main__':
    main()

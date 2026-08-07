# -*- coding: utf-8 -*-
"""4 份 N3 综合练习（711-942）→ n3-user-5..8.json"""
import sys, re, json
sys.path.insert(0, 'scripts')
from check_user_questions import extract_objects

FILES = {
    5: r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-184858.528901-000001.txt',
    6: r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-184858.532231-000002.txt',
    7: r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-184858.545860-000003.txt',
    8: r'C:\Users\l1526\AppData\Roaming\reasonix\global-workspace\.reasonix\attachments\clipboard-20260807-184858.552173-000004.txt',
}

# ★ 排序题的权威正确答案（用户核对原卷，1-based 选项号；answer 字段存储 0-based = 值-1）
# 每份试卷的 5 道 ★ 题（按 id 升序），★ 都在第三个横线（starIndex=3）
STAR_ANSWERS = {
    5: {759: 3, 760: 1, 761: 1, 762: 4, 763: 1},   # 31141
    6: {817: 3, 818: 1, 819: 3, 820: 3, 821: 2},   # 31332
    7: {875: 1, 876: 3, 877: 4, 878: 2, 879: 4},   # 13424
    8: {933: 2, 934: 3, 935: 2, 936: 2, 937: 1},   # 23221
}

def fix(q):
    """数据修正：★ 排序题按用户核对原卷的权威答案设置（1-based → 0-based），★ 都在第 3 横线"""
    if '★' in q.get('question', ''):
        # 按题目 id 找对应卷（id 范围 711-768 / 769-826 / 827-884 / 885-942）
        qid = q.get('id')
        tid = 5 if 711 <= qid <= 768 else 6 if 769 <= qid <= 826 else 7 if 827 <= qid <= 884 else 8
        if qid in STAR_ANSWERS.get(tid, {}):
            correct_1based = STAR_ANSWERS[tid][qid]
            q['answer'] = correct_1based - 1  # 0-based
            q['starIndex'] = 3                # ★ 都在第三个横线
            print(f"  ★设置 id={qid}: answer={q['answer']} (选项{correct_1based}), starIndex=3")
    return q

def build_exam(test_id, objs):
    """生成 Exam JSON（长文读解抽为 readingPassages + reading_comp 子题）"""
    # 识别长文组：按文章开头指纹分组（同一文章的题开头相同）
    def head_fp(q):
        text = re.sub(r'\s+', '', q.get('question', ''))
        return text[:40]
    groups = {}
    for o in objs:
        if re.search(r'【(\d+)】', o.get('question', '')):
            fp = head_fp(o)
            groups.setdefault(fp, []).append(o)
    # 只保留 ≥2 题的组（真正的共享文章）
    groups = {k: v for k, v in groups.items() if len(v) >= 2}

    # 文章全文：任取一题 question，把【n】替换为对应题 options[answer]
    passages = []
    passage_seq = []
    for fp, members in groups.items():
        anchor = members[0]
        text = anchor['question']
        by_id = {o['id']: o for o in members}
        def fill(m):
            n = int(m.group(1))
            o = by_id.get(n)
            if o and 0 <= o.get('answer', -1) < len(o.get('options', [])):
                return o['options'][o['answer']]
            return m.group(0)
        full = re.sub(r'【(\d+)】', fill, text)
        pid = len(passages) + 1
        passages.append({'id': pid, 'passage': full})
        for o in members:
            passage_seq.append((o['id'], pid))

    pid_map = dict(passage_seq)
    questions = []
    for o in objs:
        o = fix(o)
        pid = pid_map.get(o['id'])
        if pid is not None:
            # 长文子题：question 用原始 prompt（含挖空编号说明），文章在 passage 展示
            questions.append({
                'id': o['id'],
                'type': 'reading_comp',
                'passageId': pid,
                'section': '読解',
                'difficulty': 'N3',
                'score': 3,
                'question': o.get('prompt') or f"文中の（{o['id']}）に入れる言葉を選びなさい。",
                'options': o['options'],
                'answer': o['answer'],
                'explanation': o.get('explanation', ''),
            })
        else:
            # 普通题：reading 读音题归文字・語彙；sorting 归文法
            t = o['type']
            section = '文字・語彙' if t in ('reading', 'vocab') else '文法'
            q = {
                'id': o['id'],
                'type': t,
                'section': section,
                'difficulty': 'N3',
                'score': 2,
                'question': o['question'],
                'prompt': o.get('prompt', ''),
                'options': o['options'],
                'answer': o['answer'],
                'explanation': o.get('explanation', ''),
            }
            # ★ 排序题：携带反推的 ★ 所在横线位置（1-4）
            if o.get('starIndex'):
                q['starIndex'] = o['starIndex']
            if t == 'sorting':
                # ★ 位置题：answer 是 starIndex（0-based），sortedAnswer 无 → 视为单选
                q['starIndex'] = o['answer']
            questions.append(q)

    # sections 统计
    from collections import Counter
    cnt = Counter(q['section'] for q in questions)
    total_q = len(questions)
    total_score = sum(q['score'] for q in questions)

    return {
        'testId': test_id,
        'title': f'N3 自主练习 第{test_id}套',
        'timeLimit': 60,
        'passScore': total_score * 0.6,
        'totalScore': total_score,
        'totalQuestions': total_q,
        'sections': [{'name': n, 'count': c} for n, c in cnt.items()],
        'questions': questions,
        'readingPassages': passages,
    }

def main():
    for test_id, path in FILES.items():
        objs = [fix(o) for o in extract_objects(open(path, encoding='utf-8').read())]
        exam = build_exam(test_id, objs)
        out = f'src/data/jlpt-user/n3-user-{test_id}.json'
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(exam, f, ensure_ascii=False, indent=1)
        # 汇总
        from collections import Counter
        types = Counter(q['type'] for q in exam['questions'])
        print(f"第{test_id}套: {exam['totalQuestions']}题/{exam['totalScore']}分, 文章{len(exam['readingPassages'])}篇, 类型{dict(types)}")

if __name__ == '__main__':
    main()

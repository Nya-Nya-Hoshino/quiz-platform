# -*- coding: utf-8 -*-
"""生成练习卷清单 manifest.json（首页元数据，避免首屏加载全部卷 JSON）"""
import json, glob, os

out_dir = 'src/data/jlpt-user'
manifest = {'exams': []}

for path in sorted(glob.glob(os.path.join(out_dir, 'n3-user-*.json'))):
    d = json.load(open(path, encoding='utf-8'))
    manifest['exams'].append({
        'id': str(d.get('testId', '')),
        'file': os.path.basename(path),
        'title': d.get('title', ''),
        'timeLimit': d.get('timeLimit', 0),
        'passScore': d.get('passScore', 0),
        'totalScore': d.get('totalScore', 0),
        'totalQuestions': d.get('totalQuestions', 0),
        'sections': d.get('sections', []),
    })

with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

print(f"manifest 生成: {len(manifest['exams'])} 套")
for e in manifest['exams']:
    print(f"  [{e['id']}] {e['file']} - {e['title']} ({e['totalQuestions']}题)")

# 刷题平台 · Quiz Platform

现代化在线学习刷题平台：支持**考试模式**、**练习模式**、**错题本**与 **AI 辅助学习**。

技术栈：Vue 3 + TypeScript + Vite + Vue Router + Pinia + TailwindCSS v4 + Naive UI。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 生产构建（vue-tsc 类型检查 + vite build）
npm run preview    # 预览生产构建
```

## 功能

| 模块 | 说明 |
| --- | --- |
| 考试模式 | 限时作答、交卷前不显示答案、答题卡跳转、结果页逐题解析 |
| 练习模式 | 提交后立即判分、显示答案与解析、累计积分与今日统计 |
| 随机组卷 | 从 N3 题库按分类抽取 70-80 题组成新试卷，支持 AI 赋分与批量补解析 |
| JLPT 真题 | 历年真题（2018-2026 N2/N3）整卷呈现，考试/练习双模式，120 分制赋分 |
| JLPT 倒计时 | 侧边栏 ACG 风格倒计时，按北京时间计算下次考试（7月/12月第一个周日） |
| 错题本 | 自动记录错题（错误次数/最后错误时间/最近答案）、再练习、AI 分析 |
| 历史记录 | 考试/练习完成记录（得分、正确率、耗时） |
| AI 助手 | 侧边栏：解释题目 / 分析错误 / 总结知识点 / 生成类似题 / 自定义提问 |
| AI 逐题解析 | 做题时后台预生成解析（并发限制 2），结果页/提交后即时展示，无需等待 |

## JLPT 真题（src/data/jlpt/）

- 数据源：MOJiTest 爬取（H:\moji_out）+ extra 补充数据，16 套 N2 真题（2018-2026）
- 按原卷整张呈现：问题1→问题N 顺序，不拆散打混
- 无听力：文字词汇 + 语法 + 读解，满分 120 分（言语知识 60 + 读解 60，按题数加权）
- 读解文章（article）与问题14 图片（src/data/jlpt/images/）随题显示
- 答案 100% 补全（1147 题）：来自 extra 修复数据，转换脚本 `scripts/convert_extra.py`

## 题库与组卷

- 内置试卷：`src/data/exams/*.json`（当前 4 套 N5/N4 综合练习）
- 题库池：`src/data/bank/*.json`（N3 综合题库 800 题，用于随机组卷）

随机组卷（`src/services/examBuilder.ts`）：按板块权重随机抽取、题干去重、
阅读整篇抽取（4 题/组）、同板块缺口补偿；组卷结果复用标准解析流程。
AI 智能赋分：让大模型按题型难度分配每题分值（未配置时按规则 2-3 分）。

## 题库格式

系统内置**通用 Question Schema**（`src/types/question.ts`）：

```ts
type QuestionType =
  | 'single_choice' | 'multiple_choice' | 'judge'
  | 'fill_blank' | 'short_answer' | 'sorting' | 'reading'
```

解析器（`src/utils/parser.ts`）自动归一化两种原始格式：

1. **本项目内置题组格式**：`{ testId, questions[], readingPassages[] }`，
   其中 `questions[].type ∈ reading|vocab|grammar|sorting|reading_comp`，
   自动映射为 `single_choice` / `sorting` / 阅读分组。
2. **通用格式**：`{ id, type: 'single_choice'|... , question, options, answer, analysis, score }`。

支持题型：单选题、多选题、判断题、填空题、简答题、排序题、阅读理解综合题（整组显示）。

## 数据访问层

`src/services/api.ts` 抽象了数据源：

- **本地模式**（默认）：`import.meta.glob` 收集 `src/data/exams/*.json`
- **远程模式**：设置环境变量 `VITE_API_MODE=remote` + `VITE_API_BASE=/api`，
  前端将请求 `GET /api/exams` 与 `GET /api/exam/{id}`，无需改动业务代码。

## AI 配置（DeepSeek）

默认接入 **DeepSeek**（OpenAI Compatible）。开发模式下由 Vite 代理转发请求，
API Key 只存在开发服务器端（`.env.local`，已被 gitignore），不会进入前端 bundle。

```bash
# .env.local（已被 .gitignore 忽略）
VITE_AI_ENDPOINT=https://api.deepseek.com/v1/chat/completions
VITE_AI_API_KEY=sk-xxxx            # 仅开发代理使用
VITE_AI_MODEL=deepseek-v4-flash
```

也可以在「设置」页填写任意 OpenAI 兼容端点（OpenAI / DeepSeek / Moonshot / vLLM 等），
密钥仅保存在浏览器 localStorage。未配置时 AI 助手使用本地模拟解析。

学科 Prompt（`src/prompts/index.ts`）：内置日语教师、编程导师、通用三种，按 `subject` 动态切换。

## 目录结构

```
src/
├── components/    # QuestionCard / AnswerPanel / ExplanationPanel / ExamProgress / AIHelper
├── views/         # Home / Exam / Practice / Result / History / WrongBook / Settings
├── stores/        # Pinia：exam / practice / wrongBook / history
├── services/      # api.ts（数据层） / ai.ts（AI 服务）
├── prompts/       # 学科 System Prompt
├── types/         # 通用 Question Schema / Exam 模型
├── utils/         # parser.ts（题库解析）/ judge.ts（判分）
└── data/exams/    # 内置题库 JSON
```

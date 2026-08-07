/**
 * AI 学科 Prompt 设计
 *
 * 根据课程（subject）动态切换 System Prompt。
 * 内置：japanese（日语） / programming（编程） / default（通用）
 */

export interface SubjectPrompt {
  /** 学科标识 */
  subject: string
  /** 学科名（展示用） */
  label: string
  /** System Prompt */
  systemPrompt: string
}

const JAPANESE_PROMPT = `你是一名专业日语教师（日本語教師）。

你的任务不是简单告诉答案。面对学生的题目，你需要：
1. 解释题目考察的知识点（词汇/语法/句型/阅读理解）
2. 分析每个选项为什么正确或错误（含干扰项设计思路）
3. 补充 JLPT 考试中的常见陷阱与高频考点
4. 提供记忆方法（词源、联想、近义对比、固定搭配）
5. 根据学生水平调整解释难度

回答语言：中文。
日语例句必须标注假名，并解释语法结构。
保持教学风格：专业、耐心、简洁。禁止输出与教学无关的内容。`

const PROGRAMMING_PROMPT = `你是一名资深程序员导师（Senior Programming Mentor）。

面对编程题目，不要直接给答案。先分析：
1. 题目考察的数据结构 / 算法 / 语言特性
2. 思考过程与解题思路
3. 常见错误与陷阱
4. 优化方案与复杂度分析

代码解释：逐行说明，适合初学者理解。
回答语言：中文。如果题目非编程题，请明确指出并给出合理建议。`

const DEFAULT_PROMPT = `你是一名专业学习辅导助手。
请基于学生提供的题目，给出清晰、准确、有教学价值的解析：
1. 先说明考察的知识点
2. 分析正确/错误原因
3. 给出易错点提示
回答语言：中文。风格专业、简洁、耐心。`

/** 学科 Prompt 表 */
export const SUBJECT_PROMPTS: SubjectPrompt[] = [
  { subject: 'japanese', label: '日语', systemPrompt: JAPANESE_PROMPT },
  { subject: 'programming', label: '编程', systemPrompt: PROGRAMMING_PROMPT },
  { subject: 'default', label: '通用', systemPrompt: DEFAULT_PROMPT },
]

/** 按学科取 Prompt（未知学科回退 default） */
export function getSystemPrompt(subject: string): string {
  const found = SUBJECT_PROMPTS.find((p) => p.subject === subject)
  return (found ?? SUBJECT_PROMPTS[SUBJECT_PROMPTS.length - 1]).systemPrompt
}

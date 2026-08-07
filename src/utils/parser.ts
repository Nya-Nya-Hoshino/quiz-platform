/**
 * 题库 JSON 解析器
 *
 * 将后端/本地题库的原始 JSON 归一化为标准 Schema（Question / Exam）。
 *
 * 支持两种原始格式：
 * 1. 本项目内置题组格式（如 N5/N4 综合练习）：
 *    { testId, title, timeLimit, passScore, totalScore, totalQuestions,
 *      sections, questions[], readingPassages[] }
 *    其中 questions[].type ∈ reading|vocab|grammar|sorting|reading_comp
 *    - reading / vocab / grammar → single_choice（answer 为选项索引）
 *    - sorting → sorting（answer = sortedAnswer 索引数组）
 *    - reading_comp → 归入 ReadingGroup（共享 passage）
 * 2. 通用格式（需求文档定义的 Schema）：
 *    { id, type: 'single_choice'|'multiple_choice'|'judge'|'fill_blank'|'short_answer'|'reading',
 *      question, options, answer, analysis, score }
 */
import type { Exam, ExamSection, QuestionRef } from '../types/exam'
import type { Question, QuestionType, ReadingGroup, StandardAnswer } from '../types/question'

/** 原始题型 → 标准题型 映射 */
const RAW_TYPE_MAP: Record<string, QuestionType> = {
  reading: 'single_choice',
  vocab: 'single_choice',
  grammar: 'single_choice',
  sorting: 'sorting',
  reading_comp: 'single_choice',
  single_choice: 'single_choice',
  multiple_choice: 'multiple_choice',
  judge: 'judge',
  fill_blank: 'fill_blank',
  short_answer: 'short_answer',
}

/** 字母选项 → 索引（兼容 answer: "A" 形式） */
function letterToIndex(v: unknown): unknown {
  if (typeof v === 'string' && /^[A-Da-d]$/.test(v.trim())) {
    return v.trim().toUpperCase().charCodeAt(0) - 65
  }
  return v
}

/** 归一化 answer（兼容索引 / 字母 / 数组） */
function normalizeAnswer(answer: unknown): StandardAnswer {
  if (Array.isArray(answer)) {
    return answer.map((a) => letterToIndex(a)) as StandardAnswer
  }
  return letterToIndex(answer) as StandardAnswer
}

/** 下划线标记处理：把原文中的下划线词用 <u> 包裹，便于 UI 高亮 */
function highlightUnderline(question: string, prompt?: string): string {
  if (!prompt) return question
  // 从 prompt 中提取「」中的词，例如 下線部「受ける」の読み方はどれですか。
  const m = prompt.match(/「([^」]+)」/)
  if (!m) return question
  const word = m[1]
  // 仅当题干包含该词时才包裹（避免误伤）
  if (!question.includes(word)) return question
  return question.split(word).join(`<u>${word}</u>`)
}

/**
 * 解析一份试卷原始 JSON（内置题组格式）
 */
export function parseExamRaw(raw: Record<string, unknown>): Exam {
  const questionsRaw = (raw.questions ?? []) as Record<string, unknown>[]
  const passagesRaw = (raw.readingPassages ?? []) as Record<string, unknown>[]
  const testId = String(raw.testId ?? raw.id ?? 'exam')

  // readingPassages 索引 → 内容
  const passageMap = new Map<number | string, string>()
  for (const p of passagesRaw) {
    const pid = p.id as number | string
    passageMap.set(pid, String(p.passage ?? ''))
  }

  const questions: Question[] = []
  const readingGroups: ReadingGroup[] = []
  const groupByPassage = new Map<number | string, Question[]>()

  for (const q of questionsRaw) {
    const rawType = String(q.type ?? 'single_choice')
    const stdType = RAW_TYPE_MAP[rawType] ?? 'single_choice'
    const section = String(q.section ?? '')
    const score = Number(q.score ?? 2)

    if (rawType === 'reading_comp' || (stdType === 'single_choice' && rawType === 'reading_comp')) {
      // 阅读子题：归入分组
      const passageId = q.passageId as number | string
      const child: Question = {
        id: `${testId}-${String(q.id)}`,
        type: 'single_choice',
        section,
        difficulty: q.difficulty ? String(q.difficulty) : undefined,
        score,
        question: String(q.question ?? ''),
        prompt: q.prompt ? String(q.prompt) : undefined,
        options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
        answer: normalizeAnswer(q.answer),
        explanation: q.explanation ? String(q.explanation) : q.analysis ? String(q.analysis) : undefined,
        isReadingChild: true,
        passageId: String(passageId),
      }
      if (!groupByPassage.has(passageId)) groupByPassage.set(passageId, [])
      groupByPassage.get(passageId)!.push(child)
      continue
    }

    if (stdType === 'sorting') {
      const sortedAnswer = Array.isArray(q.sortedAnswer)
        ? (q.sortedAnswer as number[])
        : Array.isArray(q.answer)
          ? (q.answer as number[])
          : []
      const options = Array.isArray(q.options) ? (q.options as string[]) : []
      // ★ 位置答案 = 选项索引；question 模板中的（★）用于展示
      const starIndex = typeof q.answer === 'number' ? Number(q.answer) : 0
      questions.push({
        id: `${testId}-${String(q.id)}`,
        type: 'sorting',
        section,
        difficulty: q.difficulty ? String(q.difficulty) : undefined,
        score,
        question: String(q.question ?? ''),
        options,
        answer: sortedAnswer,
        explanation: q.explanation ? String(q.explanation) : undefined,
        starIndex,
      } as Question & { starIndex: number })
      continue
    }

    // 普通单选/多选/判断/填空/简答
    const questionText = String(q.question ?? '')
    const promptText = q.prompt ? String(q.prompt) : undefined
    questions.push({
      id: `${testId}-${String(q.id)}`,
      type: stdType,
      section,
      difficulty: q.difficulty ? String(q.difficulty) : undefined,
      score,
      question: highlightUnderline(questionText, promptText),
      prompt: promptText,
      options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
      answer: normalizeAnswer(q.answer),
      explanation: q.explanation ? String(q.explanation) : q.analysis ? String(q.analysis) : undefined,
      // ★ 排序题：保留 ★ 所在横线位置（1-4）
      ...(q.starIndex != null ? { starIndex: Number(q.starIndex) } : {}),
    })
  }

  // 组装 ReadingGroup（保持原始文章顺序）
  for (const p of passagesRaw) {
    const pid = p.id as number | string
    const children = groupByPassage.get(pid) ?? []
    if (children.length === 0) continue
    readingGroups.push({
      id: `${testId}-p${String(pid)}`,
      content: String(p.passage ?? ''),
      children,
      score: children.reduce((s, c) => s + c.score, 0),
    })
  }
  // 若某些子题的 passageId 不在 passages 列表（兜底），追加
  for (const [pid, children] of groupByPassage) {
    if (!passagesRaw.some((p) => String(p.id) === String(pid))) {
      readingGroups.push({
        id: `${testId}-p${String(pid)}`,
        content: passageMap.get(pid) ?? '',
        children,
        score: children.reduce((s, c) => s + c.score, 0),
      })
    }
  }

  const sections = (raw.sections ?? []) as unknown[]
  const examSections: ExamSection[] = sections.map((s) => {
    const obj = s as Record<string, unknown>
    return { name: String(obj.name ?? ''), count: Number(obj.count ?? 0) }
  })

  return {
    id: testId,
    title: String(raw.title ?? `试卷 ${testId}`),
    timeLimit: Number(raw.timeLimit ?? 120),
    passScore: Number(raw.passScore ?? 0),
    totalScore: Number(raw.totalScore ?? 0),
    totalQuestions: Number(raw.totalQuestions ?? questions.length + readingGroups.reduce((s, g) => s + g.children.length, 0)),
    sections: examSections,
    subject: String(raw.subject ?? 'japanese'),
    questions,
    readingGroups,
    raw,
  }
}

/**
 * 按试卷顺序生成完整题目引用列表（独立题 + 阅读子题）
 * 阅读子题在组内保持连续，便于整体显示
 */
export function buildQuestionRefs(exam: Exam): QuestionRef[] {
  const refs: QuestionRef[] = []
  for (const q of exam.questions) {
    refs.push({ id: q.id })
  }
  for (const g of exam.readingGroups) {
    for (const c of g.children) {
      refs.push({ id: c.id, groupId: g.id })
    }
  }
  return refs
}

/** 从试卷中按 ID 取题 */
export function findQuestion(exam: Exam, questionId: string): Question | undefined {
  const q = exam.questions.find((x) => x.id === questionId)
  if (q) return q
  for (const g of exam.readingGroups) {
    const c = g.children.find((x) => x.id === questionId)
    if (c) return c
  }
  return undefined
}

/** 找到题目所在的 ReadingGroup（若有） */
export function findReadingGroup(exam: Exam, questionId: string): ReadingGroup | undefined {
  return exam.readingGroups.find((g) => g.children.some((c) => c.id === questionId))
}

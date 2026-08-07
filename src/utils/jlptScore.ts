/**
 * JLPT 真题模式类型定义与赋分算法
 *
 * 计分规则（参考 JLPT 官方 180 分制，去掉听力 60 分）：
 * - 言语知识（文字词汇 + 语法）：60 分
 * - 读解（读解 + 综合）：60 分
 * - 总分：120 分
 *
 * 各部分内部按题组数加权平均（每组一题分值 = 60 / 组数）。
 */
import type { JLPTExam, JLPTExamSection, JLPTQuestionGroup } from '../services/api'

/** 各部分分值（120 分制） */
export const JLPT_SCORES = {
  languageKnowledge: 60, // 言语知识（文字词汇+语法）
  reading: 60, // 读解
} as const

export const JLPT_TOTAL = 120

/** 部分归类 */
export function sectionPart(sec: JLPTExamSection): 'languageKnowledge' | 'reading' {
  return sec.kind === 'vocab' || sec.kind === 'grammar'
    ? 'languageKnowledge'
    : 'reading'
}

/** 计算整套试卷中各部分的题组数与每组分值 */
export function calcExamWeight(exam: JLPTExam): {
  partGroups: Record<'languageKnowledge' | 'reading', number>
  partScorePerGroup: Record<'languageKnowledge' | 'reading', number>
  totalGroups: number
} {
  const partGroups = { languageKnowledge: 0, reading: 0 }
  for (const sec of exam.sections) {
    const p = sectionPart(sec)
    partGroups[p] += sec.groups.length
  }
  const partScorePerGroup = {
    languageKnowledge:
      partGroups.languageKnowledge > 0
        ? JLPT_SCORES.languageKnowledge / partGroups.languageKnowledge
        : 0,
    reading:
      partGroups.reading > 0 ? JLPT_SCORES.reading / partGroups.reading : 0,
  }
  return {
    partGroups,
    partScorePerGroup,
    totalGroups: partGroups.languageKnowledge + partGroups.reading,
  }
}

/** 单题组得分（该组在所属部分的权重分；答案缺失的题不计分不扣分） */
export function groupScore(
  group: JLPTQuestionGroup,
  part: 'languageKnowledge' | 'reading',
  partScorePerGroup: Record<'languageKnowledge' | 'reading', number>,
): number {
  if (group.answer === null) return 0 // 答案缺失，不参与计分
  return partScorePerGroup[part]
}

/** 判分：group.answer 为 null 视为「无标准答案」不判 */
export function isGroupCorrect(group: JLPTQuestionGroup, userAnswer: number | null): boolean {
  if (group.answer === null || userAnswer === null || userAnswer === undefined) return false
  return group.answer === userAnswer
}

/** 计算总得分与各部分得分 */
export function calcJLPTResult(
  exam: JLPTExam,
  answers: Record<string, number | null>,
): {
  totalScore: number
  languageKnowledgeScore: number
  readingScore: number
  correctCount: number
  totalCount: number
  missingAnswerCount: number
  details: {
    groupId: string
    part: 'languageKnowledge' | 'reading'
    score: number
    correct: boolean
    answered: boolean
  }[]
} {
  const { partScorePerGroup } = calcExamWeight(exam)
  let languageKnowledgeScore = 0
  let readingScore = 0
  let correctCount = 0
  let totalCount = 0
  let missingAnswerCount = 0
  const details = []

  for (const sec of exam.sections) {
    const part = sectionPart(sec)
    for (const g of sec.groups) {
      totalCount++
      const userAns = answers[g.id] ?? null
      const answered = userAns !== null && userAns !== undefined
      const correct = isGroupCorrect(g, userAns)
      const score = groupScore(g, part, partScorePerGroup)

      if (answered && correct) correctCount++
      if (g.answer === null) missingAnswerCount++

      if (part === 'languageKnowledge') languageKnowledgeScore += correct ? score : 0
      else readingScore += correct ? score : 0

      details.push({
        groupId: g.id,
        part,
        score: correct ? score : 0,
        correct,
        answered,
      })
    }
  }

  return {
    totalScore: languageKnowledgeScore + readingScore,
    languageKnowledgeScore,
    readingScore,
    correctCount,
    totalCount,
    missingAnswerCount,
    details,
  }
}

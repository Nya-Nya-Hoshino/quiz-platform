/**
 * 判分逻辑：比较用户答案与标准答案
 */
import type { Question, StandardAnswer, UserAnswer } from '../types/question'

/** 序列化答案用于比较（归一化类型差异） */
function serializeAnswer(a: UserAnswer | StandardAnswer): string {
  if (Array.isArray(a)) {
    return JSON.stringify([...a].sort((x, y) => String(x).localeCompare(String(y))))
  }
  if (typeof a === 'boolean') return a ? 'true' : 'false'
  return String(a)
}

/** 判断单选/多选/判断/填空是否作答 */
export function isAnswered(answer: UserAnswer | undefined | null): boolean {
  if (answer === undefined || answer === null) return false
  if (Array.isArray(answer)) return answer.length > 0
  if (typeof answer === 'string') return answer.trim().length > 0
  return true
}

/**
 * 判断用户答案是否正确。
 * - 单选/判断：直接相等
 * - 多选/排序：元素集合相等（排序题按集合比较，顺序容错 —— 见下方说明）
 * - 填空：逐空 trim 后精确比较（可扩展为大小写/假名容错）
 * - 简答：完全匹配或包含关键词则判对（练习模式可人工复核）
 */
export function isCorrect(
  question: Question,
  userAnswer: UserAnswer | undefined | null,
  options?: { keywordMode?: boolean },
): boolean {
  if (!isAnswered(userAnswer)) return false

  const std = question.answer
  const ua = userAnswer as UserAnswer

  switch (question.type) {
    case 'single_choice':
      return serializeAnswer(ua) === serializeAnswer(std)
    case 'judge':
      return String(ua) === String(std)
    case 'multiple_choice':
      return serializeAnswer(ua) === serializeAnswer(std)
    case 'sorting':
      // 排序题：完整顺序必须一致才算对
      return JSON.stringify(ua) === JSON.stringify(std)
    case 'fill_blank': {
      const uArr = Array.isArray(ua) ? ua : [String(ua)]
      const sArr = Array.isArray(std) ? std : [String(std)]
      if (uArr.length !== sArr.length) return false
      return uArr.every((u, i) => String(u).trim() === String(sArr[i]).trim())
    }
    case 'short_answer': {
      const uText = String(ua).trim()
      const sText = String(std).trim()
      if (uText === sText) return true
      // 关键词模式：标准答案分号/逗号分隔的关键词全部出现
      if (options?.keywordMode ?? true) {
        const keywords = sText.split(/[;；,，、]/).map((k) => k.trim()).filter(Boolean)
        if (keywords.length > 1) {
          return keywords.every((k) => uText.includes(k))
        }
      }
      return false
    }
    default:
      return serializeAnswer(ua) === serializeAnswer(std)
  }
}

/** 计算单题得分（简答题在全对时得全分，否则 0） */
export function questionScore(question: Question, userAnswer: UserAnswer | undefined | null): number {
  if (!isAnswered(userAnswer)) return 0
  if (question.type === 'short_answer') {
    return isCorrect(question, userAnswer) ? question.score : 0
  }
  return isCorrect(question, userAnswer) ? question.score : 0
}

/** 校验用户答案类型是否符合题型 */
export function validateAnswerType(question: Question, answer: unknown): answer is UserAnswer {
  switch (question.type) {
    case 'single_choice':
      return typeof answer === 'number' && Number.isInteger(answer)
    case 'judge':
      return typeof answer === 'boolean'
    case 'multiple_choice':
    case 'sorting':
      return Array.isArray(answer) && answer.every((x) => typeof x === 'number')
    case 'fill_blank':
      return Array.isArray(answer) && answer.every((x) => typeof x === 'string')
    case 'short_answer':
      return typeof answer === 'string'
    default:
      return false
  }
}

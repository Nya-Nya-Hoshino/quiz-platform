/**
 * 错题系统（Wrong Question Bank）
 *
 * 持久化到 localStorage。
 *
 * 记录：具体错题（题干快照）/ 题型 / JLPT 等级（不记录来源试卷）。
 * 艾宾浩斯回顾：第 2/4/7/15 天四周期，顺延机制，完成全部周期标记「已熟练」。
 *
 * 快速导航：错题点击进入单题练习页（stores/review 相关页面复用本 store）。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { WrongRecord, WrongQuestionSnapshot, UserAnswerValue } from '../types/exam'
import type { Question } from '../types/question'
import { applyReviewResult, initReviewState, isReviewDue } from '../utils/review'

const STORAGE_KEY = 'quiz-platform:wrong-book'

/** 从 Question 生成快照（可附带阅读文章） */
export function toSnapshot(
  question: Question,
  opts?: { passage?: string },
): WrongQuestionSnapshot {
  return {
    section: question.section,
    type: question.type,
    difficulty: question.difficulty,
    question: question.question,
    prompt: question.prompt,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    passage: opts?.passage ?? (question.isReadingChild ? undefined : undefined),
    score: question.score,
  }
}

/** 从快照还原 Question（用于单题练习页渲染） */
export function snapshotToQuestion(snapshot: WrongQuestionSnapshot, questionId: string): Question {
  return {
    id: questionId,
    type: snapshot.type as Question['type'],
    section: snapshot.section,
    difficulty: snapshot.difficulty,
    score: snapshot.score,
    question: snapshot.question,
    prompt: snapshot.prompt,
    options: snapshot.options,
    answer: snapshot.answer as Question['answer'],
    explanation: snapshot.explanation,
    isReadingChild: Boolean(snapshot.passage),
    passageId: snapshot.passage ? 'snapshot' : undefined,
  }
}

function loadAll(): WrongRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WrongRecord[]
      // 兼容：仅保留新结构（含 snapshot）
      return parsed.filter((r) => r.snapshot && r.questionId)
    }
  } catch {
    /* ignore */
  }
  return []
}

function persist(records: WrongRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export const useWrongBookStore = defineStore('wrongBook', () => {
  const records = ref<WrongRecord[]>(loadAll())

  const total = computed(() => records.value.length)
  /** 今日到期的错题（需回顾） */
  const dueReviews = computed(() =>
    records.value.filter((r) => isReviewDue(r)),
  )
  /** 已熟练数量 */
  const masteredCount = computed(() =>
    records.value.filter((r) => r.completed).length,
  )

  /**
   * 记录一次错题（新增或累加错误次数）。
   * 回顾中答错不调用本方法（防重复进错题本）。
   */
  function recordWrong(
    question: Question,
    opts?: {
      passage?: string
      lastAnswer?: UserAnswerValue
    },
  ): void {
    const now = Date.now()
    const found = records.value.find((r) => r.questionId === question.id)
    if (found) {
      found.wrongCount += 1
      found.lastWrongAt = now
      if (opts?.lastAnswer !== undefined) found.lastAnswer = opts.lastAnswer
      // 已熟练的题再次错 → 重置回顾进度（重新开始艾宾浩斯）
      if (found.completed) {
        const st = initReviewState(now)
        found.completed = false
        found.reviewCount = st.reviewCount
        found.currentCycle = st.currentCycle
        found.nextDueAt = st.nextDueAt
      }
    } else {
      const st = initReviewState(now)
      records.value.push({
        questionId: question.id,
        snapshot: toSnapshot(question, opts),
        wrongCount: 1,
        lastWrongAt: now,
        createdAt: now,
        lastAnswer: opts?.lastAnswer,
        reviewCount: st.reviewCount,
        currentCycle: st.currentCycle,
        nextDueAt: st.nextDueAt,
        completed: false,
      })
    }
    persist(records.value)
  }

  /**
   * 提交一次错题回顾结果并推进艾宾浩斯周期。
   * @returns 是否因答错而顺延（未推进）
   */
  function submitReview(questionId: string, correct: boolean): { progressed: boolean; completed: boolean } {
    const found = records.value.find((r) => r.questionId === questionId)
    if (!found) return { progressed: false, completed: false }
    const res = applyReviewResult(found, correct)
    persist(records.value)
    return res
  }

  /**
   * 自由添加错题（手动录入，不经过答题流程）。
   * 直接以单选形式入本，可立即进入单题回顾练习。
   */
  function addCustom(input: {
    section?: string
    difficulty?: string
    question: string
    prompt?: string
    options: string[]
    answer: number
    explanation?: string
  }): string {
    const id = `custom-${Date.now()}`
    const question: Question = {
      id,
      type: 'single_choice',
      section: input.section || '自定义',
      difficulty: input.difficulty || 'N3',
      score: 2,
      question: input.question,
      prompt: input.prompt,
      options: input.options,
      answer: input.answer,
      explanation: input.explanation,
    }
    recordWrong(question)
    return id
  }

  /** 移除错题 */
  function remove(questionId: string): void {
    records.value = records.value.filter((r) => r.questionId !== questionId)
    persist(records.value)
  }

  /** 清空错题本 */
  function clear(): void {
    records.value = []
    persist(records.value)
  }

  /** 检查某题是否在错题本 */
  function isWrong(questionId: string): boolean {
    return records.value.some((r) => r.questionId === questionId)
  }

  /** 按 id 取错题记录 */
  function findRecord(questionId: string): WrongRecord | undefined {
    return records.value.find((r) => r.questionId === questionId)
  }

  return {
    records, total, dueReviews, masteredCount,
    recordWrong, addCustom, submitReview, remove, clear, isWrong, findRecord,
  }
})

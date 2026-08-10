/**
 * 收藏系统（Favorite Question Bank）
 *
 * 持久化到 localStorage。
 *
 * 记录：收藏的题目快照（题干/题型/JLPT等级/选项/答案/解析），不记录来源试卷。
 * 与错题本类似，但无回顾周期 —— 支持勾选任意收藏题目组成一份练习。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Question } from '../types/question'
import type { WrongQuestionSnapshot } from '../types/exam'
import { toSnapshot, snapshotToQuestion as snapshotToQuestionUtil } from './wrongBook'

const STORAGE_KEY = 'quiz-platform:favorites'

export interface FavoriteRecord {
  /** 题目唯一 ID（如 user-1-85） */
  questionId: string
  /** 题目快照 */
  snapshot: WrongQuestionSnapshot
  /** 收藏时间戳 */
  addedAt: number
}

function loadAll(): FavoriteRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FavoriteRecord[]
      return parsed.filter((r) => r.snapshot && r.questionId)
    }
  } catch {
    /* ignore */
  }
  return []
}

function persist(records: FavoriteRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export const useFavoriteStore = defineStore('favorites', () => {
  const records = ref<FavoriteRecord[]>(loadAll())
  /** 最近一次「组成练习」的原始试卷数据（收藏练习重新开始时使用） */
  let lastRaw: Record<string, unknown> | null = null

  const total = computed(() => records.value.length)

  function isFavorite(questionId: string): boolean {
    return records.value.some((r) => r.questionId === questionId)
  }

  /** 收藏（已收藏则取消） */
  function toggleFavorite(question: Question, questionId = question.id): boolean {
    const idx = records.value.findIndex((r) => r.questionId === questionId)
    if (idx >= 0) {
      records.value.splice(idx, 1)
      persist(records.value)
      return false
    }
    records.value.unshift({
      questionId,
      snapshot: toSnapshot(question),
      addedAt: Date.now(),
    })
    persist(records.value)
    return true
  }

  function removeFavorite(questionId: string): void {
    records.value = records.value.filter((r) => r.questionId !== questionId)
    persist(records.value)
  }

  function clear(): void {
    records.value = []
    persist(records.value)
  }

  /** 快照 → Question（收藏练习渲染用） */
  function snapshotToQuestion(snapshot: WrongQuestionSnapshot, questionId: string): Question {
    return snapshotToQuestionUtil(snapshot, questionId)
  }

  return {
    records,
    total,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    clear,
    snapshotToQuestion,
    get lastRaw(): Record<string, unknown> | null { return lastRaw },
    set lastRaw(v: Record<string, unknown> | null) { lastRaw = v },
  }
})

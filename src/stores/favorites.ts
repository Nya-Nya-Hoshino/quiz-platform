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
/** 删除墓碑表（删除传播）：{ questionId: 删除时间戳 } */
const DELETED_KEY = 'quiz-platform:favorites:deleted'

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

/* ===== 删除墓碑（删除传播：防止云端旧数据把已删除的收藏合并回来） ===== */
function loadDeleted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DELETED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>
      return typeof parsed === 'object' && parsed ? parsed : {}
    }
  } catch {
    /* ignore */
  }
  return {}
}
function persistDeleted(deleted: Record<string, number>): void {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deleted))
  } catch {
    /* ignore */
  }
}

export const useFavoriteStore = defineStore('favorites', () => {
  const records = ref<FavoriteRecord[]>(loadAll())
  /** 删除墓碑：{ questionId: 删除时间戳 } */
  const deleted = ref<Record<string, number>>(loadDeleted())
  /** 最近一次「组成练习」的原始试卷数据（收藏练习重新开始时使用） */
  let lastRaw: Record<string, unknown> | null = null

  const total = computed(() => records.value.length)

  function isFavorite(questionId: string): boolean {
    return records.value.some((r) => r.questionId === questionId)
  }

  /** 收藏（已收藏则取消；取消时记录删除墓碑，删除跨设备生效） */
  function toggleFavorite(question: Question, questionId = question.id): boolean {
    const idx = records.value.findIndex((r) => r.questionId === questionId)
    if (idx >= 0) {
      records.value.splice(idx, 1)
      deleted.value[questionId] = Date.now()
      persist(records.value)
      persistDeleted(deleted.value)
      return false
    }
    // 重新收藏 = 重新活跃 → 清除删除墓碑
    if (deleted.value[questionId] != null) {
      delete deleted.value[questionId]
      persistDeleted(deleted.value)
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
    deleted.value[questionId] = Date.now()
    persist(records.value)
    persistDeleted(deleted.value)
  }

  function clear(): void {
    const now = Date.now()
    for (const r of records.value) {
      deleted.value[r.questionId] = now
    }
    records.value = []
    persist(records.value)
    persistDeleted(deleted.value)
  }

  /** 快照 → Question（收藏练习渲染用） */
  function snapshotToQuestion(snapshot: WrongQuestionSnapshot, questionId: string): Question {
    return snapshotToQuestionUtil(snapshot, questionId)
  }

  /** 从云端/外部加载整组记录（覆盖本地并持久化）；可同时载入删除墓碑 */
  function hydrate(loaded: FavoriteRecord[], deletedMap?: Record<string, number>): void {
    records.value = Array.isArray(loaded) ? loaded : []
    if (deletedMap) {
      deleted.value = { ...deletedMap }
      persistDeleted(deleted.value)
    }
    persist(records.value)
  }

  return {
    records,
    deleted,
    total,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    clear,
    snapshotToQuestion,
    hydrate,
    get lastRaw(): Record<string, unknown> | null { return lastRaw },
    set lastRaw(v: Record<string, unknown> | null) { lastRaw = v },
  }
})

/**
 * 历史记录（History）
 *
 * 持久化到 localStorage，保存考试/练习的完成记录。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HistoryRecord, ExamResult } from '../types/exam'

const STORAGE_KEY = 'quiz-platform:history'
/** 删除墓碑表（删除传播）：{ 记录ID: 删除时间戳 } */
const DELETED_KEY = 'quiz-platform:history:deleted'
const MAX_RECORDS = 200

function loadAll(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as HistoryRecord[]
  } catch { /* ignore */ }
  return []
}

function persist(records: HistoryRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function loadDeleted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DELETED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>
      return typeof parsed === 'object' && parsed ? parsed : {}
    }
  } catch { /* ignore */ }
  return {}
}
function persistDeleted(deleted: Record<string, number>): void {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deleted))
  } catch { /* ignore */ }
}

export const useHistoryStore = defineStore('history', () => {
  const records = ref<HistoryRecord[]>(loadAll())
  /** 删除墓碑：{ 记录ID: 删除时间戳 } */
  const deleted = ref<Record<string, number>>(loadDeleted())

  const total = computed(() => records.value.length)

  /** 由考试结果生成记录 */
  function addFromResult(result: ExamResult): HistoryRecord {
    const record: HistoryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      examId: result.examId,
      examTitle: result.examTitle,
      mode: result.mode,
      earnedScore: result.earnedScore,
      totalScore: result.totalScore,
      accuracy: result.accuracy,
      duration: result.duration,
      passed: result.passed,
      finishedAt: result.finishedAt,
    }
    records.value.unshift(record)
    if (records.value.length > MAX_RECORDS) {
      records.value = records.value.slice(0, MAX_RECORDS)
    }
    persist(records.value)
    return record
  }

  /** 直接添加记录（练习模式等） */
  function addRecord(rec: Omit<HistoryRecord, 'id' | 'finishedAt'> & { finishedAt?: number }): HistoryRecord {
    const record: HistoryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      finishedAt: rec.finishedAt ?? Date.now(),
      ...rec,
    } as HistoryRecord
    records.value.unshift(record)
    if (records.value.length > MAX_RECORDS) {
      records.value = records.value.slice(0, MAX_RECORDS)
    }
    persist(records.value)
    return record
  }

  /** 按试卷过滤 */
  function byExam(examId: string): HistoryRecord[] {
    return records.value.filter((r) => r.examId === examId)
  }

  function remove(id: string): void {
    records.value = records.value.filter((r) => r.id !== id)
    deleted.value[id] = Date.now()
    persist(records.value)
    persistDeleted(deleted.value)
  }

  function clear(): void {
    const now = Date.now()
    for (const r of records.value) {
      deleted.value[r.id] = now
    }
    records.value = []
    persist(records.value)
    persistDeleted(deleted.value)
  }

  /** 从云端/外部加载整组记录（覆盖本地并持久化）；可同时载入删除墓碑 */
  function hydrate(loaded: HistoryRecord[], deletedMap?: Record<string, number>): void {
    records.value = Array.isArray(loaded) ? loaded.slice(0, MAX_RECORDS) : []
    if (deletedMap) {
      deleted.value = { ...deletedMap }
      persistDeleted(deleted.value)
    }
    persist(records.value)
  }

  return { records, deleted, total, addFromResult, addRecord, byExam, remove, clear, hydrate }
})

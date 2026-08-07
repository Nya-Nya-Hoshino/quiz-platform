/**
 * 历史记录（History）
 *
 * 持久化到 localStorage，保存考试/练习的完成记录。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HistoryRecord, ExamResult } from '../types/exam'

const STORAGE_KEY = 'quiz-platform:history'
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

export const useHistoryStore = defineStore('history', () => {
  const records = ref<HistoryRecord[]>(loadAll())

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
    persist(records.value)
  }

  function clear(): void {
    records.value = []
    persist(records.value)
  }

  return { records, total, addFromResult, addRecord, byExam, remove, clear }
})

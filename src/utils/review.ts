/**
 * 错题艾宾浩斯回顾算法
 *
 * 周期表（天，相对错题产生日）：第 1 天 / 第 2 天 / 第 4 天 / 第 7 天 / 第 15 天
 *
 * 规则：
 * - 第 1 周期到期日 = 错题产生日 + 1 天
 * - 到期日当天未完成回顾 → 顺延 1 天（次日继续出现，直到完成）
 * - 到期日回顾但答错 → 顺延 1 天（不推进周期，不新增错题记录）
 * - 后续周期（第 2/4/7/15 天）以「上一周期实际完成日」为基准顺延：
 *   下一周期到期日 = 上一周期完成日 + 间隔天数
 * - 完成第 5 周期 → 标记「已熟练」，不再进入回顾
 *
 * 时区：所有「天」均按北京时间（UTC+8）日历日计算，
 * 以北京时区当天 0 点为跨日边界，与运行环境本地时区无关。
 */
import type { WrongRecord } from '../types/exam'

/** 回顾间隔（天）：第 1 / 2 / 4 / 7 / 15 天 */
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15] as const

/** 总周期数 */
export const TOTAL_CYCLES = REVIEW_INTERVALS.length

const DAY_MS = 24 * 60 * 60 * 1000
/** 北京时间偏移（UTC+8） */
const BJ_OFFSET = 8 * 60 * 60 * 1000

/** 某时间戳在北京时区所属的日历日序号（1970-01-01 北京 0 点 = 0） */
export function beijingDayIndex(ts: number): number {
  return Math.floor((ts + BJ_OFFSET) / DAY_MS)
}

/** 某时间戳在北京时区的当天 0 点（返回 UTC 时间戳） */
export function beijingDayStart(ts: number): number {
  return beijingDayIndex(ts) * DAY_MS - BJ_OFFSET
}

/** 错题产生时初始化回顾状态（第一周期到期 = 产生日 + 1 天，北京 0 点） */
export function initReviewState(now = Date.now()): {
  reviewCount: number
  currentCycle: number
  nextDueAt: number
  completed: boolean
} {
  return {
    reviewCount: 0,
    currentCycle: 0,
    nextDueAt: beijingDayStart(now) + REVIEW_INTERVALS[0] * DAY_MS,
    completed: false,
  }
}

/** 某题今天是否到期（需要回顾）：北京今天 >= 到期日 */
export function isReviewDue(record: WrongRecord, now = Date.now()): boolean {
  if (record.completed) return false
  return beijingDayIndex(now) >= beijingDayIndex(record.nextDueAt)
}

/** 距到期的北京日历日数（0 = 今天到期；负数表示已逾期天数） */
export function daysUntilDue(record: WrongRecord, now = Date.now()): number {
  return beijingDayIndex(record.nextDueAt) - beijingDayIndex(now)
}

/**
 * 记录一次回顾结果并推进状态（原地修改 record）
 *
 * @param correct 本次回顾是否答对
 * @param now 当前时间戳
 * @returns 是否有状态变化（完成最后周期 → 已熟练）
 */
export function applyReviewResult(
  record: WrongRecord,
  correct: boolean,
  now = Date.now(),
): { progressed: boolean; completed: boolean } {
  record.lastReviewedAt = now
  record.lastReviewResult = correct ? 'correct' : 'wrong'

  if (!correct) {
    // 答错：顺延 1 天（北京时间次日 0 点），不推进周期，不增加错误次数
    record.nextDueAt = beijingDayStart(now) + 1 * DAY_MS
    return { progressed: false, completed: false }
  }

  // 答对：推进到下一周期
  record.reviewCount += 1
  const nextCycle = record.currentCycle + 1

  if (nextCycle >= TOTAL_CYCLES) {
    // 完成最后周期 → 已熟练
    record.completed = true
    record.currentCycle = TOTAL_CYCLES
    return { progressed: true, completed: true }
  }

  record.currentCycle = nextCycle
  // 下一周期到期日 = 本周期完成日（北京 0 点）+ 间隔天数（整体顺延）
  record.nextDueAt = beijingDayStart(now) + REVIEW_INTERVALS[nextCycle] * DAY_MS
  return { progressed: true, completed: false }
}

/** 格式化剩余/逾期时间描述（用于错题本展示） */
export function dueLabel(record: WrongRecord, now = Date.now()): string {
  if (record.completed) return '已熟练'
  const days = daysUntilDue(record, now)
  if (days <= 0) return '今天需回顾'
  return `${days} 天后回顾`
}

/** 当前周期进度文本，如 1/4 */
export function cycleLabel(record: WrongRecord): string {
  if (record.completed) return `${TOTAL_CYCLES}/${TOTAL_CYCLES}`
  return `${record.currentCycle}/${TOTAL_CYCLES}`
}

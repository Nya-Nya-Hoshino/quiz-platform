/**
 * 跨设备数据合并（解决多设备全量覆盖互相覆盖数据的问题）
 *
 * 同步策略：拉取时把云端数据与本地数据「合并」而不是覆盖，
 * 各设备本地新增（错题/收藏/进度）在任意一方上传后都不会丢失。
 */
import type { WrongRecord, HistoryRecord } from '../types/exam'
import type { FavoriteRecord } from '../stores/favorites'

/** 取回顾进度更深的一条（completed > currentCycle > lastWrongAt） */
function pickDeeper(a: WrongRecord, b: WrongRecord): WrongRecord {
  const depth = (r: WrongRecord): number => {
    const c = r.completed ? 9999 : r.currentCycle
    return c * 100000 + (r.reviewCount ?? 0) * 1000
  }
  return depth(a) >= depth(b) ? a : b
}

/** 合并错题：按 questionId，同题取进度深的一条，wrongCount 取 max，快照/答案取最新的 */
export function mergeWrongBook(local: WrongRecord[], remote: WrongRecord[]): WrongRecord[] {
  const map = new Map<string, WrongRecord>()
  const push = (r: WrongRecord) => {
    const ex = map.get(r.questionId)
    if (!ex) {
      map.set(r.questionId, r)
      return
    }
    // wrongCount 取 max
    const wrongCount = Math.max(ex.wrongCount ?? 0, r.wrongCount ?? 0)
    const base = pickDeeper(ex, r)
    // 快照/答案取 lastWrongAt 更新的那条
    const latest = (ex.lastWrongAt ?? 0) >= (r.lastWrongAt ?? 0) ? ex : r
    map.set(r.questionId, {
      ...base,
      snapshot: latest.snapshot ?? base.snapshot,
      lastAnswer: latest.lastAnswer !== undefined ? latest.lastAnswer : base.lastAnswer,
      wrongCount,
      lastWrongAt: Math.max(ex.lastWrongAt ?? 0, r.lastWrongAt ?? 0),
      createdAt: Math.min(ex.createdAt ?? 0, r.createdAt ?? 0) || base.createdAt,
    })
  }
  for (const r of local) if (r) push(r)
  for (const r of remote) if (r) push(r)
  return [...map.values()]
}

/** 合并收藏：按 questionId，保留 addedAt 更新的 */
export function mergeFavorites(local: FavoriteRecord[], remote: FavoriteRecord[]): FavoriteRecord[] {
  const map = new Map<string, FavoriteRecord>()
  for (const r of [...local, ...remote]) {
    if (!r) continue
    const ex = map.get(r.questionId)
    if (!ex || (r.addedAt ?? 0) > (ex.addedAt ?? 0)) map.set(r.questionId, r)
  }
  return [...map.values()]
}

/** 合并历史：按 id 去重 */
export function mergeHistory(local: HistoryRecord[], remote: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>()
  for (const r of [...local, ...remote]) {
    if (!r) continue
    if (!map.has(r.id)) map.set(r.id, r)
  }
  return [...map.values()]
}

/** 合并进度：按 key，同 key 取 savedAt 更新的 */
export function mergeProgress(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...local }
  for (const [key, v] of Object.entries(remote ?? {})) {
    const lv = out[key] as { savedAt?: number } | null | undefined
    const rv = v as { savedAt?: number } | null | undefined
    const lT = lv?.savedAt ?? 0
    const rT = rv?.savedAt ?? 0
    if (!lv || rT >= lT) out[key] = v
  }
  return out
}

/** 合并每日统计：取完成题数更多的 */
export function mergeDaily(local: unknown, remote: unknown): unknown {
  const l = (local ?? {}) as { done?: number; points?: number }
  const r = (remote ?? {}) as { done?: number; points?: number }
  const lDone = l.done ?? 0
  const rDone = r.done ?? 0
  if (rDone > lDone) return remote
  if (lDone > rDone) return local
  // 相同完成数：取得分更高的
  return (r.points ?? 0) > (l.points ?? 0) ? remote : local
}

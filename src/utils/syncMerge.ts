/**
 * 跨设备数据合并（解决多设备全量覆盖互相覆盖数据的问题）
 *
 * 同步策略：拉取时把云端数据与本地数据「合并」而不是覆盖，
 * 各设备本地新增（错题/收藏/进度）在任意一方上传后都不会丢失。
 *
 * 删除传播：纯合并（并集）无法表达「删除」——本地删除的记录会被云端旧副本合并回来
 * （表现为删除后刷新/同步又复活）。因此引入**删除墓碑（tombstone）**：
 * - 删除记录时在墓碑表记录 { id: 删除时间戳 }
 * - 合并时，若某记录的墓碑时间 ≥ 该记录最近活跃时间（lastWrongAt/addedAt/updatedAt），
 *   说明「删除发生在最后一次活跃之后」→ 丢弃该记录；否则（删除后又重新添加/答错）保留。
 * - 墓碑随同步数据包上传，其他设备拉取后同样丢弃对应记录 → 删除跨设备生效。
 */
import type { WrongRecord, HistoryRecord } from '../types/exam'
import type { FavoriteRecord } from '../stores/favorites'
import type { NoteRecord } from '../stores/notes'

/** 删除墓碑表：{ [记录ID]: 删除时间戳 } */
export type DeletedMap = Record<string, number>

/** 合并两侧墓碑：同 id 取较新的删除时间 */
export function mergeDeleted(local: DeletedMap = {}, remote: DeletedMap = {}): DeletedMap {
  const out: DeletedMap = { ...local }
  for (const [k, v] of Object.entries(remote ?? {})) {
    if (!out[k] || v > out[k]) out[k] = v
  }
  return out
}

/** 记录是否已被删除：墓碑时间 ≥ 该记录最近活跃时间（删除发生在最后一次活跃之后） */
function isTombstoned(id: string, aliveAt: number, deleted: DeletedMap): boolean {
  const d = deleted[id]
  return d != null && d >= aliveAt
}

/** 取回顾进度更深的一条（completed > currentCycle > lastWrongAt） */
function pickDeeper(a: WrongRecord, b: WrongRecord): WrongRecord {
  const depth = (r: WrongRecord): number => {
    const c = r.completed ? 9999 : r.currentCycle
    return c * 100000 + (r.reviewCount ?? 0) * 1000
  }
  return depth(a) >= depth(b) ? a : b
}

/**
 * 合并错题：按 questionId，同题取进度深的一条，wrongCount 取 max，快照/答案取最新的。
 * 墓碑处理：本地/云端任一侧删除过且删除时间晚于该题最近活跃时间 → 该题不再出现。
 */
export function mergeWrongBook(
  local: WrongRecord[] = [],
  remote: WrongRecord[] = [],
  localDeleted: DeletedMap = {},
  remoteDeleted: DeletedMap = {},
): WrongRecord[] {
  const deleted = mergeDeleted(localDeleted, remoteDeleted)
  const map = new Map<string, WrongRecord>()
  const push = (r: WrongRecord) => {
    const aliveAt = Math.max(r.lastWrongAt ?? 0, r.createdAt ?? 0)
    if (isTombstoned(r.questionId, aliveAt, deleted)) return
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

/** 合并收藏：按 questionId，保留 addedAt 更新的；删除过且晚于最近收藏时间 → 丢弃 */
export function mergeFavorites(
  local: FavoriteRecord[] = [],
  remote: FavoriteRecord[] = [],
  localDeleted: DeletedMap = {},
  remoteDeleted: DeletedMap = {},
): FavoriteRecord[] {
  const deleted = mergeDeleted(localDeleted, remoteDeleted)
  const map = new Map<string, FavoriteRecord>()
  for (const r of [...local, ...remote]) {
    if (!r) continue
    if (isTombstoned(r.questionId, r.addedAt ?? 0, deleted)) continue
    const ex = map.get(r.questionId)
    if (!ex || (r.addedAt ?? 0) > (ex.addedAt ?? 0)) map.set(r.questionId, r)
  }
  return [...map.values()]
}

/** 合并历史：按 id 去重；删除过且晚于该记录完成时间 → 丢弃 */
export function mergeHistory(
  local: HistoryRecord[] = [],
  remote: HistoryRecord[] = [],
  localDeleted: DeletedMap = {},
  remoteDeleted: DeletedMap = {},
): HistoryRecord[] {
  const deleted = mergeDeleted(localDeleted, remoteDeleted)
  const map = new Map<string, HistoryRecord>()
  for (const r of [...local, ...remote]) {
    if (!r) continue
    if (isTombstoned(r.id, r.finishedAt ?? 0, deleted)) continue
    if (!map.has(r.id)) map.set(r.id, r)
  }
  return [...map.values()]
}

/** 合并笔记：按 id，保留 updatedAt 更新的那条；删除过且晚于最近更新时间 → 丢弃 */
export function mergeNotes(
  local: NoteRecord[] = [],
  remote: NoteRecord[] = [],
  localDeleted: DeletedMap = {},
  remoteDeleted: DeletedMap = {},
): NoteRecord[] {
  const deleted = mergeDeleted(localDeleted, remoteDeleted)
  const map = new Map<string, NoteRecord>()
  for (const r of [...local, ...remote]) {
    if (!r || !r.id) continue
    if (isTombstoned(r.id, r.updatedAt ?? 0, deleted)) continue
    const ex = map.get(r.id)
    if (!ex || (r.updatedAt ?? 0) > (ex.updatedAt ?? 0)) map.set(r.id, r)
  }
  return [...map.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
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

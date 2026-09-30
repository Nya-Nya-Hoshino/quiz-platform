/**
 * 媒体分段缓存（Segment Cache）
 *
 * 目标：播放不因「音频仍在补全（文件持续写入）」或网络抖动而中断。
 *
 * 做法：
 * 1. 把媒体按固定大小（默认 1 MiB）切段，用 Range 请求逐段下载；
 * 2. 每段以 `url?__seg=start-end` 为键写入浏览器 **Cache Storage**，可跨刷新复用；
 * 3. 播放时把已缓存段拼成一个 Blob，播放器从 `blob:` 地址播放 —— 完全本地，不依赖网络；
 * 4. 源文件补全（体积变大）后，只补拉新增段并重建 Blob，由播放器保留进度换源续播；
 * 5. 超出容量上限时按最近使用时间（LRU）淘汰旧媒体。
 *
 * 兼容性：不支持 Cache Storage / 配额不足 / 超大文件时自动回退为「直连服务器流式播放」。
 */

/** 段大小：1 MiB */
export const SEGMENT_SIZE = 1024 * 1024
/** 单个媒体缓存上限（超过则直连播放，避免占满配额） */
export const MAX_ITEM_BYTES = 300 * 1024 * 1024
/** 缓存总量上限（超出按 LRU 淘汰） */
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024
/** 单次并发下载段数 */
const CONCURRENCY = 3

const CACHE_NAME = 'quiz-media-seg-v1'
const META_KEY = 'quiz-platform:media-cache-meta'

/** 缓存元信息（用于统计与 LRU 淘汰） */
interface CacheMeta {
  /** url → { bytes, lastUsed } */
  [url: string]: { bytes: number; lastUsed: number }
}

/* ==================== 纯函数（可单测） ==================== */

export interface Segment {
  start: number
  end: number
}

/** 按总字节数规划分段（end 为闭区间末字节） */
export function planSegments(total: number, seg = SEGMENT_SIZE): Segment[] {
  if (!Number.isFinite(total) || total <= 0) return []
  const out: Segment[] = []
  for (let start = 0; start < total; start += seg) {
    out.push({ start, end: Math.min(start + seg, total) - 1 })
  }
  return out
}

/** 段缓存键（查询参数形式，避免与真实请求冲突；实际只做本地 match，不发网络） */
export function segmentKey(url: string, start: number, end: number): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}__seg=${start}-${end}`
}

/* ==================== 缓存存储 ==================== */

export function isCacheSupported(): boolean {
  return typeof caches !== 'undefined' && typeof Blob !== 'undefined'
}

async function openCache(): Promise<Cache | null> {
  if (!isCacheSupported()) return null
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    return null
  }
}

function readMeta(): CacheMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const m = JSON.parse(raw) as CacheMeta
      return typeof m === 'object' && m ? m : {}
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writeMeta(meta: CacheMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* ignore */
  }
}

function touchMeta(url: string, addBytes: number): void {
  const meta = readMeta()
  const cur = meta[url] ?? { bytes: 0, lastUsed: 0 }
  meta[url] = { bytes: cur.bytes + addBytes, lastUsed: Date.now() }
  writeMeta(meta)
}

/** 缓存统计 */
export async function cacheStats(): Promise<{ items: number; bytes: number }> {
  const meta = readMeta()
  const keys = Object.keys(meta)
  return { items: keys.length, bytes: keys.reduce((s, k) => s + (meta[k]?.bytes ?? 0), 0) }
}

/** 清空媒体缓存 */
export async function clearMediaCache(): Promise<void> {
  try {
    if (isCacheSupported()) await caches.delete(CACHE_NAME)
  } catch {
    /* ignore */
  }
  writeMeta({})
}

/** 读取单个已缓存段 */
export async function readSegment(url: string, start: number, end: number): Promise<Blob | null> {
  const cache = await openCache()
  if (!cache) return null
  try {
    const res = await cache.match(segmentKey(url, start, end))
    if (!res) return null
    return await res.blob()
  } catch {
    return null
  }
}

/** 写入单个段 */
async function writeSegment(url: string, start: number, end: number, blob: Blob): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  try {
    await cache.put(
      segmentKey(url, start, end),
      new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }),
    )
    touchMeta(url, blob.size)
  } catch {
    /* 配额不足等情况忽略：不影响已缓存段播放 */
  }
}

/** 用 Range 请求下载一段 */
async function fetchSegment(url: string, start: number, end: number): Promise<Blob> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  if (!res.ok && res.status !== 206) {
    throw new Error(`分段下载失败（${res.status}）`)
  }
  return await res.blob()
}

/** LRU 淘汰：超出总量上限时删除最久未使用的媒体 */
async function evictIfNeeded(): Promise<void> {
  const meta = readMeta()
  let total = Object.values(meta).reduce((s, v) => s + (v?.bytes ?? 0), 0)
  if (total <= MAX_TOTAL_BYTES) return
  const urls = Object.keys(meta).sort((a, b) => (meta[a]?.lastUsed ?? 0) - (meta[b]?.lastUsed ?? 0))
  for (const url of urls) {
    if (total <= MAX_TOTAL_BYTES) break
    await removeMediaFromCache(url)
    total -= meta[url]?.bytes ?? 0
  }
}

/** 从缓存中移除某个媒体的全部分段 */
export async function removeMediaFromCache(url: string, size?: number): Promise<void> {
  const cache = await openCache()
  const meta = readMeta()
  const bytes = size ?? meta[url]?.bytes ?? 0
  if (cache) {
    const segs = planSegments(bytes)
    for (const s of segs) {
      try {
        await cache.delete(segmentKey(url, s.start, s.end))
      } catch {
        /* ignore */
      }
    }
  }
  delete meta[url]
  writeMeta(meta)
}

/* ==================== 组装与增量补全 ==================== */

export interface CacheProgress {
  /** 已就绪字节 */
  bytes: number
  /** 目标总字节（服务器当前声明的体积） */
  total: number
  /** 是否已全部缓存 */
  complete: boolean
}

export interface CacheResult {
  /** 已缓存内容组装成的 Blob */
  blob: Blob
  /** 已就绪字节数 */
  bytes: number
  /** 是否已缓存完整文件 */
  complete: boolean
  /** 是否真的用上了缓存（false = 回退直连） */
  cached: boolean
}

/**
 * 确保媒体已按段缓存，返回可直接播放的 Blob。
 *
 * @param url    媒体地址（/api/media/file/<id>）
 * @param size   服务器声明的当前体积
 * @param onProgress 进度回调（可用于显示「缓存 45%」）
 */
export async function ensureCached(
  url: string,
  size: number,
  onProgress?: (p: CacheProgress) => void,
): Promise<CacheResult> {
  if (!isCacheSupported() || !Number.isFinite(size) || size <= 0 || size > MAX_ITEM_BYTES) {
    // 回退：不使用缓存（超大文件或环境不支持）
    return { blob: new Blob([]), bytes: 0, complete: false, cached: false }
  }

  const segments = planSegments(size)
  const parts: (Blob | null)[] = new Array(segments.length).fill(null)
  const missing: number[] = []

  // 1) 先取已缓存段
  await Promise.all(
    segments.map(async (seg, i) => {
      const hit = await readSegment(url, seg.start, seg.end)
      if (hit) parts[i] = hit
      else missing.push(i)
    }),
  )
  const cachedBytes = parts.reduce((s, b) => s + (b?.size ?? 0), 0)
  onProgress?.({ bytes: cachedBytes, total: size, complete: missing.length === 0 })

  // 2) 并发补拉缺失段
  let done = missing.length === 0
  if (missing.length) {
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < missing.length) {
        const i = missing[cursor++]
        const seg = segments[i]
        try {
          const blob = await fetchSegment(url, seg.start, seg.end)
          parts[i] = blob
          await writeSegment(url, seg.start, seg.end, blob)
          const bytes = parts.reduce((s, b) => s + (b?.size ?? 0), 0)
          onProgress?.({ bytes, total: size, complete: false })
        } catch {
          // 单段失败：保留其它已就绪段，稍后重试（补全期间服务器可能正好在写）
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, () => worker()))
    done = parts.every((p) => p != null)
    void evictIfNeeded()
  }

  // 3) 顺序拼接（跳过缺失段，保证已就绪部分可播）
  const usable = parts.filter((p): p is Blob => p != null)
  const bytes = usable.reduce((s, b) => s + b.size, 0)
  const blob = new Blob(usable, { type: 'application/octet-stream' })
  return { blob, bytes, complete: done && bytes >= size, cached: true }
}

/** 媒体是否适合缓存（体积在限制内且环境支持） */
export function isCacheable(size: number): boolean {
  return isCacheSupported() && Number.isFinite(size) && size > 0 && size <= MAX_ITEM_BYTES
}

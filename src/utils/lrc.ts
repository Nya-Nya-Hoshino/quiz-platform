/**
 * 歌词解析（LRC / 纯文本）
 *
 * 支持：
 *   [mm:ss.xx] 行文本          标准 LRC 逐行时间
 *   [mm:ss.xx][mm:ss.xx] 行     一行多时间戳
 *   [offset:+/-ms]              全局偏移
 *   [ti:]/[ar:]/[al:] 等元信息标签（忽略）
 *   无时间戳的纯文本             按行静态展示（不可跳转）
 */
export interface LyricLine {
  /** 起始秒；纯文本歌词为 null */
  time: number | null
  text: string
}

export interface LyricDoc {
  lines: LyricLine[]
  /** 是否为带时间轴的同步歌词 */
  synced: boolean
  /** 解析到的元信息（ti/ar/al） */
  meta: { title?: string; artist?: string; album?: string }
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** 解析歌词文本 */
export function parseLyrics(raw: string): LyricDoc {
  const meta: LyricDoc['meta'] = {}
  let offsetMs = 0
  const lines: LyricLine[] = []
  const text = (raw ?? '').replace(/\r\n?/g, '\n')

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    // 元信息标签
    const metaTag = /^\[(ti|ar|al|by|offset):(.*)\]$/i.exec(line)
    if (metaTag) {
      const key = metaTag[1].toLowerCase()
      const value = metaTag[2].trim()
      if (key === 'offset') {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n)) offsetMs = n
      } else if (key === 'ti') meta.title = value
      else if (key === 'ar') meta.artist = value
      else if (key === 'al') meta.album = value
      continue
    }

    // 收集本行所有时间标签
    const times: number[] = []
    TIME_TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TIME_TAG.exec(line)) !== null) {
      const min = Number.parseInt(m[1], 10)
      const sec = Number.parseInt(m[2], 10)
      const fracRaw = m[3] ?? '0'
      const frac = Number.parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length)
      times.push(min * 60 + sec + frac)
    }
    const content = line.replace(TIME_TAG, '').trim()

    if (times.length) {
      for (const t of times) lines.push({ time: t, text: content })
    } else {
      lines.push({ time: null, text: line })
    }
  }

  const synced = lines.some((l) => l.time != null)
  if (synced) {
    for (const l of lines) {
      if (l.time != null) l.time = Math.max(0, l.time + offsetMs / 1000)
    }
    lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  }
  return { lines, synced, meta }
}

/** 找到当前时间对应的歌词行下标（无可对应行返回 -1） */
export function activeLyricIndex(lines: LyricLine[], currentTime: number): number {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].time
    if (t == null) continue
    if (t <= currentTime + 0.15) idx = i
    else break
  }
  return idx
}

/** 秒 → mm:ss */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

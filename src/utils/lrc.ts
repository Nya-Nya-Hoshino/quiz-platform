/**
 * 歌词解析（LRC / QRC / 增强 LRC / 纯文本）
 *
 * 支持格式（自动识别）：
 * 1. LRC：            [mm:ss.xx]行文本（可一行多时间戳）
 * 2. QRC（QQ 音乐）： [起始毫秒,持续毫秒]行文本(逐字偏移,逐字时长)…   ← 支持逐字时间轴
 * 3. 增强 LRC：       [mm:ss.xx]<mm:ss.xx>词1<mm:ss.xx>词2             ← 行内逐字标签
 * 4. 纯文本：         无时间标签 → 静态展示
 *
 * 元信息标签 [ti:]/[ar:]/[al:]/[offset:] 均识别（offset 单位毫秒）。
 *
 * 注意：QQ 音乐客户端下载的 .qrc 往往是**加密**的，无法直接解析；
 * 用 looksEncrypted() 可判别并给出提示（需先在 QQ 音乐里复制歌词文本，或用未加密的 QRC/LRC）。
 */
export interface LyricWord {
  text: string
  /** 起始秒 */
  start: number
  /** 结束秒 */
  end: number
}

export interface LyricLine {
  /** 起始秒；纯文本歌词为 null */
  time: number | null
  text: string
  /** 逐字时间轴（QRC / 增强 LRC 才有） */
  words?: LyricWord[]
}

export type LyricFormat = 'lrc' | 'qrc' | 'plain'

export interface LyricDoc {
  lines: LyricLine[]
  /** 是否为带时间轴的同步歌词 */
  synced: boolean
  /** 识别出的格式 */
  format: LyricFormat
  /** 解析到的元信息（ti/ar/al） */
  meta: { title?: string; artist?: string; album?: string }
}

/* ==================== 格式判别 ==================== */

/** LRC 时间标签：[mm:ss.xx] / [mm:ss] / [mm:ss:xx] */
const LRC_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
/** QRC 行标签：[起始毫秒,持续毫秒] */
const QRC_LINE = /^\[(\d+),(\d+)\](.*)$/
/** 增强 LRC 行内逐字标签：<mm:ss.xx> */
const ENHANCED_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g
/** 元信息标签 */
const META_TAG = /^\[(ti|ar|al|by|offset|language|kana|roma|total|sign|qqmusic):(.*)\]$/i

/** 判断文本是否像加密/二进制歌词（加密 .qrc 无法解析） */
export function looksEncrypted(text: string): boolean {
  if (!text) return false
  const head = text.slice(0, 4000)
  let bad = 0
  let replaced = 0
  for (const ch of head) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0) return true
    if (c < 9 || (c > 13 && c < 32)) bad++
    if (c === 0xfffd) replaced++
  }
  const n = Math.max(1, head.length)
  // 控制字符或替换字符过多 → 判定为加密/二进制
  return bad / n > 0.02 || replaced / n > 0.02
}

/* ==================== 解析 ==================== */

function parseStamp(mm: string, ss: string, frac?: string): number {
  const m = Number.parseInt(mm, 10)
  const s = Number.parseInt(ss, 10)
  const f = frac ? Number.parseInt(frac, 10) / Math.pow(10, frac.length) : 0
  return m * 60 + s + f
}

/** 解析 QRC 行内逐字：text(offsetMs,durMs)text(offsetMs,durMs)… */
function parseQrcWords(content: string, lineStartMs: number): LyricWord[] {
  const words: LyricWord[] = []
  const re = /\((\d+),(\d+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const text = content.slice(last, m.index)
    const off = Number.parseInt(m[1], 10)
    const dur = Number.parseInt(m[2], 10)
    if (text) {
      words.push({
        text,
        start: (lineStartMs + off) / 1000,
        end: (lineStartMs + off + dur) / 1000,
      })
    }
    last = m.index + m[0].length
  }
  const tail = content.slice(last)
  if (tail) {
    // 末尾无时间标注的部分：接在最后一个逐字片段之后
    const startSec = words.length ? words[words.length - 1].end : lineStartMs / 1000
    words.push({ text: tail, start: startSec, end: Number.POSITIVE_INFINITY })
  }
  return words
}

/** 解析增强 LRC 行内逐字：<mm:ss.xx>词 */
function parseEnhancedWords(content: string, lineTime: number): LyricWord[] {
  const words: LyricWord[] = []
  ENHANCED_TAG.lastIndex = 0
  const marks: { index: number; time: number; len: number }[] = []
  let m: RegExpExecArray | null
  while ((m = ENHANCED_TAG.exec(content)) !== null) {
    marks.push({ index: m.index, time: parseStamp(m[1], m[2], m[3]), len: m[0].length })
  }
  if (!marks.length) return words
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i].len
    const end = i + 1 < marks.length ? marks[i + 1].index : content.length
    const text = content.slice(start, end)
    if (!text) continue
    words.push({
      text,
      start: marks[i].time,
      end: i + 1 < marks.length ? marks[i + 1].time : Number.POSITIVE_INFINITY,
    })
  }
  if (marks[0].index > 0) {
    // 行首在首个逐字标签之前的文字，归到行时间
    const head = content.slice(0, marks[0].index)
    if (head.trim()) words.unshift({ text: head, start: lineTime, end: marks[0].time })
  }
  return words
}

/** 解析歌词文本（自动识别 LRC / QRC / 增强 LRC / 纯文本） */
export function parseLyrics(raw: string): LyricDoc {
  const meta: LyricDoc['meta'] = {}
  let offsetMs = 0
  const lines: LyricLine[] = []
  const text = (raw ?? '').replace(/\r\n?/g, '\n')
  let sawQrc = false
  let sawLrc = false

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const metaTag = META_TAG.exec(line)
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

    // ===== QRC： [起始毫秒,持续毫秒]正文(逐字偏移,逐字时长)… =====
    const qrc = QRC_LINE.exec(line)
    if (qrc) {
      sawQrc = true
      const startMs = Number.parseInt(qrc[1], 10)
      const body = qrc[3] ?? ''
      const words = parseQrcWords(body, startMs)
      lines.push({
        time: startMs / 1000,
        text: words.length ? words.map((w) => w.text).join('') : body,
        ...(words.length ? { words } : {}),
      })
      continue
    }

    // ===== LRC（含增强 LRC 行内逐字）=====
    const times: number[] = []
    LRC_TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LRC_TAG.exec(line)) !== null) {
      times.push(parseStamp(m[1], m[2], m[3]))
    }
    const content = line.replace(LRC_TAG, '').trim()

    if (times.length) {
      sawLrc = true
      const words = parseEnhancedWords(content, times[0])
      const plain = content.replace(ENHANCED_TAG, '').trim()
      for (const t of times) {
        lines.push({
          time: t,
          text: plain,
          ...(words.length ? { words } : {}),
        })
      }
    } else {
      lines.push({ time: null, text: line })
    }
  }

  const synced = lines.some((l) => l.time != null)
  if (synced) {
    for (const l of lines) {
      if (l.time != null) l.time = Math.max(0, l.time + offsetMs / 1000)
      if (l.words) {
        for (const w of l.words) {
          w.start = Math.max(0, w.start + offsetMs / 1000)
          if (Number.isFinite(w.end)) w.end = Math.max(0, w.end + offsetMs / 1000)
        }
      }
    }
    lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  }
  const format: LyricFormat = sawQrc ? 'qrc' : sawLrc ? 'lrc' : 'plain'
  return { lines, synced, format, meta }
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

/** 该逐字片段在 currentTime 是否处于激活状态 */
export function isWordActive(word: LyricWord, currentTime: number): boolean {
  return currentTime >= word.start && currentTime < word.end
}

/** 秒 → mm:ss */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

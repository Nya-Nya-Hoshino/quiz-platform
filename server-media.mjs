/**
 * 媒体库后端（音乐 / 视频在线播放 + 上传管理，零依赖）
 *
 * 存储：data/media/（已被 .gitignore 忽略，属用户数据）
 *   <id>.<ext>           媒体文件本体
 *   <id>.meta.json       标题/艺术家/专辑等元信息（可从 ID3 自动生成）
 *   <id>.lrc             歌词（LRC 或纯文本，可手动上传）
 *   <id>.cover.<imgext>  专辑封面（可从 ID3 APIC 自动提取）
 *
 * 只读接口（公开）：
 *   GET /api/media/list              媒体列表（含元信息、是否有封面/歌词）
 *   GET /api/media/file/<id>         媒体流（支持 Range，可拖动进度条）
 *   GET /api/media/cover/<id>        专辑封面（无封面 → 404）
 *   GET /api/media/lyrics/<id>       歌词文本（无歌词 → 404）
 *
 * 写接口（需登录：Authorization: Bearer <token>）：
 *   POST   /api/media/upload?name=<文件名>&title=&artist=&album=   原始字节流上传
 *   POST   /api/media/cover/<id>?name=<文件名>                     上传封面
 *   PUT    /api/media/lyrics/<id>                                  保存歌词（文本体）
 *   PATCH  /api/media/meta/<id>                                    修改标题/艺术家/专辑（JSON）
 *   DELETE /api/media/item/<id>                                    删除媒体（含附属文件）
 *
 * 元信息自动识别：MP3 的 ID3v2（TIT2/TPE1/TALB 文本帧、APIC 封面、USLT 歌词），
 * 手动放入 data/media/ 的文件也会在首次访问时解析（结果内存缓存，不写入磁盘）。
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { stat, rename } from 'node:fs/promises'
import { join, extname, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { randomBytes } from 'node:crypto'
import { resolveTokenUser, bearerToken } from './server-account.mjs'

const SELF_DIR = dirname(fileURLToPath(import.meta.url))
export const MEDIA_DIR = join(SELF_DIR, 'data', 'media')
mkdirSync(MEDIA_DIR, { recursive: true })

/** 音频 / 视频扩展名白名单 */
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.wma', '.aiff'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi', '.ts', '.ogv'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])
const MEDIA_EXT = new Set([...AUDIO_EXT, ...VIDEO_EXT])

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

/** 上传体积上限：媒体 2GB，封面 10MB，歌词/元信息 512KB */
const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024
const MAX_COVER_BYTES = 10 * 1024 * 1024
const MAX_TEXT_BYTES = 512 * 1024

/* ==================== 工具 ==================== */

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

/** 文件名安全化：去掉路径分隔符与 Windows 非法字符 */
function safeId(name) {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const noDots = cleaned.replace(/^\.+/, '')
  return noDots || 'media'
}

/** 唯一 id：已存在同名时追加 -2、-3… */
function uniqueId(base) {
  let id = base
  let n = 2
  while (existsSync(join(MEDIA_DIR, id + '.meta.json')) || findMediaFile(id)) {
    id = `${base}-${n++}`
  }
  return id
}

/** 在 data/media 中按 id 查找媒体文件（返回完整路径） */
function findMediaFile(id) {
  for (const ext of MEDIA_EXT) {
    const p = join(MEDIA_DIR, id + ext)
    if (existsSync(p)) return p
  }
  return null
}

/** 查找封面附属文件 */
function findCoverFile(id) {
  for (const ext of IMAGE_EXT) {
    const p = join(MEDIA_DIR, `${id}.cover${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

/** 读取侧车元信息 JSON */
function readMetaSidecar(id) {
  const p = join(MEDIA_DIR, `${id}.meta.json`)
  if (!existsSync(p)) return null
  try {
    const m = JSON.parse(readFileSync(p, 'utf-8'))
    return typeof m === 'object' && m ? m : null
  } catch {
    return null
  }
}

function writeMetaSidecar(id, meta) {
  writeFileSync(join(MEDIA_DIR, `${id}.meta.json`), JSON.stringify(meta, null, 1), 'utf-8')
}

function lyricsPath(id) {
  return join(MEDIA_DIR, `${id}.lrc`)
}

/* ==================== ID3v2 解析（MP3 元信息/封面/歌词） ==================== */

const id3Cache = new Map() // 文件路径 → { mtimeMs, data }

function synchsafe(b) {
  return ((b[0] & 0x7f) << 21) | ((b[1] & 0x7f) << 14) | ((b[2] & 0x7f) << 7) | (b[3] & 0x7f)
}

/** 按 ID3 文本编码解码（0=latin1 1=UTF-16BOM 2=UTF-16BE 3=UTF-8） */
function decodeText(buf, enc) {
  if (!buf || !buf.length) return ''
  if (enc === 0) return buf.toString('latin1').replace(/\u0000+$/, '').trim()
  if (enc === 3) return buf.toString('utf8').replace(/\u0000+$/, '').trim()
  let b = buf
  let be = enc === 2
  if (enc === 1) {
    if (b[0] === 0xff && b[1] === 0xfe) {
      be = false
      b = b.subarray(2)
    } else if (b[0] === 0xfe && b[1] === 0xff) {
      be = true
      b = b.subarray(2)
    }
  }
  let out = ''
  for (let i = 0; i + 1 < b.length; i += 2) {
    const code = be ? (b[i] << 8) | b[i + 1] : (b[i + 1] << 8) | b[i]
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out.trim()
}

/** 解析 MP3 的 ID3v2 标签（只读取标签区，不读整个文件；失败返回 null） */
function readId3(filePath) {
  try {
    const st = statSync(filePath)
    const cached = id3Cache.get(filePath)
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.data

    const fd = openSync(filePath, 'r')
    let header
    try {
      header = Buffer.alloc(10)
      if (readSync(fd, header, 0, 10, 0) < 10 || header.toString('latin1', 0, 3) !== 'ID3') {
        id3Cache.set(filePath, { mtimeMs: st.mtimeMs, data: null })
        return null
      }
      const ver = header[3]
      const tagSize = synchsafe(header.subarray(6, 10))
      if (tagSize <= 0 || tagSize > 32 * 1024 * 1024) {
        id3Cache.set(filePath, { mtimeMs: st.mtimeMs, data: null })
        return null
      }
      const tag = Buffer.alloc(tagSize)
      readSync(fd, tag, 0, tagSize, 10)
      const result = { title: '', artist: '', album: '', picture: null, lyrics: '' }
      let off = 0
      while (off + 10 <= tag.length) {
        const fid = tag.toString('latin1', off, off + 4)
        if (!/^[A-Z0-9]{4}$/.test(fid)) break
        const size = ver >= 4 ? synchsafe(tag.subarray(off + 4, off + 8)) : tag.readUInt32BE(off + 4)
        if (size <= 0 || off + 10 + size > tag.length) break
        const data = tag.subarray(off + 10, off + 10 + size)
        off += 10 + size

        if (fid === 'TIT2') result.title = decodeText(data.subarray(1), data[0])
        else if (fid === 'TPE1') result.artist = decodeText(data.subarray(1), data[0])
        else if (fid === 'TALB') result.album = decodeText(data.subarray(1), data[0])
        else if (fid === 'APIC') {
          const enc = data[0]
          let p = 1
          const mimeEnd = data.indexOf(0, p)
          if (mimeEnd < 0) continue
          const mime = data.toString('latin1', p, mimeEnd) || 'image/jpeg'
          p = mimeEnd + 1
          p += 1 // picture type
          if (enc === 1 || enc === 2) {
            while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2
            p += 2
          } else {
            const descEnd = data.indexOf(0, p)
            if (descEnd < 0) continue
            p = descEnd + 1
          }
          if (p < data.length) result.picture = { mime, data: Buffer.from(data.subarray(p)) }
        } else if (fid === 'USLT') {
          const enc = data[0]
          let p = 4 // encoding(1) + language(3)
          if (enc === 1 || enc === 2) {
            while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2
            p += 2
          } else {
            const descEnd = data.indexOf(0, p)
            if (descEnd < 0) continue
            p = descEnd + 1
          }
          result.lyrics = decodeText(data.subarray(p), enc)
        }
      }
      id3Cache.set(filePath, { mtimeMs: st.mtimeMs, data: result })
      return result
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }
}

/** 合并元信息：侧车 JSON 优先，其次 ID3，最后用文件名兜底 */
function resolveMeta(id, filePath, id3Pre) {
  const sidecar = readMetaSidecar(id) ?? {}
  const id3 = id3Pre !== undefined
    ? id3Pre
    : extname(filePath).toLowerCase() === '.mp3'
      ? readId3(filePath)
      : null
  return {
    title: sidecar.title || id3?.title || id,
    artist: sidecar.artist || id3?.artist || '',
    album: sidecar.album || id3?.album || '',
    addedAt: sidecar.addedAt ?? statSync(filePath).mtimeMs,
  }
}

/** 读取封面 Buffer（侧车图片优先，其次 ID3 APIC） */
function readCover(id, filePath) {
  const sidecar = findCoverFile(id)
  if (sidecar) {
    return { mime: MIME[extname(sidecar).toLowerCase()] ?? 'image/jpeg', data: readFileSync(sidecar) }
  }
  if (extname(filePath).toLowerCase() === '.mp3') {
    const id3 = readId3(filePath)
    if (id3?.picture) return id3.picture
  }
  return null
}

/** 读取歌词文本（侧车 .lrc 优先，其次 ID3 USLT） */
function readLyrics(id, filePath) {
  const p = lyricsPath(id)
  if (existsSync(p)) return readFileSync(p, 'utf-8')
  if (extname(filePath).toLowerCase() === '.mp3') {
    const id3 = readId3(filePath)
    if (id3?.lyrics) return id3.lyrics
  }
  return null
}

/* ==================== 列表 ==================== */

function listMedia() {
  let names = []
  try {
    names = readdirSync(MEDIA_DIR)
  } catch {
    return []
  }
  const items = []
  for (const name of names) {
    const ext = extname(name).toLowerCase()
    if (!MEDIA_EXT.has(ext)) continue
    const id = basename(name, extname(name))
    const filePath = join(MEDIA_DIR, name)
    let st
    try {
      st = statSync(filePath)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const id3 = ext === '.mp3' ? readId3(filePath) : null
    const meta = resolveMeta(id, filePath, id3)
    items.push({
      id,
      type: AUDIO_EXT.has(ext) ? 'audio' : 'video',
      ext: ext.slice(1),
      size: st.size,
      mtime: st.mtimeMs,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      addedAt: meta.addedAt,
      hasCover: findCoverFile(id) != null || Boolean(id3?.picture),
      hasLyrics: existsSync(lyricsPath(id)) || Boolean(id3?.lyrics),
      url: `/api/media/file/${encodeURIComponent(id)}`,
      coverUrl: `/api/media/cover/${encodeURIComponent(id)}`,
      lyricsUrl: `/api/media/lyrics/${encodeURIComponent(id)}`,
    })
  }
  // 新增的在前
  items.sort((a, b) => b.mtime - a.mtime)
  return items
}

/* ==================== 流式播放（Range） ==================== */

async function serveFile(req, res, id) {
  const filePath = findMediaFile(id)
  if (!filePath) {
    sendJson(res, 404, { error: '媒体不存在' })
    return
  }
  const st = await stat(filePath)
  const total = st.size
  const ext = extname(filePath).toLowerCase()
  const type = MIME[ext] ?? 'application/octet-stream'
  const range = req.headers.range
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (m) {
      let start = m[1] ? Number.parseInt(m[1], 10) : 0
      let end = m[2] ? Number.parseInt(m[2], 10) : total - 1
      if (!Number.isFinite(start) || start < 0) start = 0
      if (!Number.isFinite(end) || end >= total) end = total - 1
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` })
        res.end()
        return
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'public, max-age=3600',
      })
      createReadStream(filePath, { start, end }).pipe(res)
      return
    }
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
  })
  createReadStream(filePath).pipe(res)
}

/* ==================== 上传 / 修改 / 删除 ==================== */

/** 把请求体按字节流写入目标文件（不整块进内存，上传大文件安全） */
async function saveBodyToFile(req, destPath, maxBytes) {
  let written = 0
  const ws = createWriteStream(destPath)
  try {
    await pipeline(
      req,
      async function* (source) {
        for await (const chunk of source) {
          written += chunk.length
          if (written > maxBytes) throw new Error('文件过大')
          yield chunk
        }
      },
      ws,
    )
  } catch (e) {
    try {
      unlinkSync(destPath)
    } catch {
      /* ignore */
    }
    throw e
  }
  return written
}

/** 读取小体积文本请求体（歌词/元信息用） */
function readSmallBody(req, maxBytes = MAX_TEXT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > maxBytes) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(Buffer.from(c))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function requireAuth(req, res) {
  const user = resolveTokenUser(bearerToken(req))
  if (!user) {
    sendJson(res, 401, { error: '需要登录（上传/管理媒体）' })
    return null
  }
  return user
}

/** 判断文本是否像加密/二进制歌词（QQ 音乐客户端下载的 .qrc 为加密格式，无法解析） */
function looksEncryptedText(text) {
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
  return bad / n > 0.02 || replaced / n > 0.02
}

/** 媒体 API 总入口。返回 true 表示已处理该请求。 */
export async function handleMediaAPI(req, res, url) {
  const path = url.pathname
  if (!path.startsWith('/api/media/')) return false
  const method = req.method ?? 'GET'

  // ===== 列表 =====
  if (method === 'GET' && path === '/api/media/list') {
    sendJson(res, 200, { items: listMedia() })
    return true
  }

  // ===== 媒体流 =====
  const mFile = /^\/api\/media\/file\/(.+)$/.exec(path)
  if (mFile && (method === 'GET' || method === 'HEAD')) {
    await serveFile(req, res, safeId(decodeURIComponent(mFile[1])))
    return true
  }

  // ===== 封面 =====
  const mCover = /^\/api\/media\/cover\/(.+)$/.exec(path)
  if (mCover && method === 'GET') {
    const id = safeId(decodeURIComponent(mCover[1]))
    const filePath = findMediaFile(id)
    if (!filePath) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    const cover = readCover(id, filePath)
    if (!cover) {
      sendJson(res, 404, { error: '无封面' })
      return true
    }
    res.writeHead(200, { 'Content-Type': cover.mime, 'Content-Length': cover.data.length, 'Cache-Control': 'public, max-age=86400' })
    res.end(cover.data)
    return true
  }

  // ===== 歌词（读） =====
  const mLyrics = /^\/api\/media\/lyrics\/(.+)$/.exec(path)
  if (mLyrics && method === 'GET') {
    const id = safeId(decodeURIComponent(mLyrics[1]))
    const filePath = findMediaFile(id)
    if (!filePath) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    const text = readLyrics(id, filePath)
    if (text == null) {
      sendJson(res, 404, { error: '无歌词' })
      return true
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(text)
    return true
  }

  // ===== 上传媒体 =====
  if (method === 'POST' && path === '/api/media/upload') {
    if (!requireAuth(req, res)) return true
    const rawName = url.searchParams.get('name') ?? `media-${Date.now()}`
    const ext = extname(rawName).toLowerCase()
    if (!MEDIA_EXT.has(ext)) {
      sendJson(res, 400, { error: `不支持的媒体格式：${ext || '(无扩展名)'}` })
      return true
    }
    const id = uniqueId(safeId(basename(rawName, extname(rawName))))
    const dest = join(MEDIA_DIR, id + ext)
    const tmp = `${dest}.${randomBytes(4).toString('hex')}.part`
    try {
      const size = await saveBodyToFile(req, tmp, MAX_MEDIA_BYTES)
      await rename(tmp, dest)
      // 元信息：优先用查询参数，其次 ID3（下次读取时自动解析），最后文件名
      const title = url.searchParams.get('title')?.trim() || ''
      const artist = url.searchParams.get('artist')?.trim() || ''
      const album = url.searchParams.get('album')?.trim() || ''
      const id3 = ext === '.mp3' ? readId3(dest) : null
      writeMetaSidecar(id, {
        title: title || id3?.title || id,
        artist: artist || id3?.artist || '',
        album: album || id3?.album || '',
        addedAt: Date.now(),
      })
      sendJson(res, 200, { ok: true, id, size, item: listMedia().find((x) => x.id === id) ?? null })
    } catch (e) {
      sendJson(res, 500, { error: `上传失败：${e.message}` })
    }
    return true
  }

  // ===== 上传封面 =====
  if (method === 'POST' && mCover) {
    if (!requireAuth(req, res)) return true
    const id = safeId(decodeURIComponent(mCover[1]))
    if (!findMediaFile(id)) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    const rawName = url.searchParams.get('name') ?? 'cover.jpg'
    const ext = IMAGE_EXT.has(extname(rawName).toLowerCase()) ? extname(rawName).toLowerCase() : '.jpg'
    const dest = join(MEDIA_DIR, `${id}.cover${ext}`)
    try {
      await saveBodyToFile(req, dest, MAX_COVER_BYTES)
      sendJson(res, 200, { ok: true, id, coverUrl: `/api/media/cover/${encodeURIComponent(id)}` })
    } catch (e) {
      sendJson(res, 500, { error: `封面上传失败：${e.message}` })
    }
    return true
  }

  // ===== 保存歌词 =====
  if (method === 'PUT' && mLyrics) {
    if (!requireAuth(req, res)) return true
    const id = safeId(decodeURIComponent(mLyrics[1]))
    if (!findMediaFile(id)) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    try {
      const text = await readSmallBody(req)
      if (text.trim() && looksEncryptedText(text)) {
        sendJson(res, 400, {
          error: '检测到加密歌词（QQ 音乐客户端下载的 .qrc 为加密格式），无法保存；请提供未加密的 QRC / LRC 文本',
        })
        return true
      }
      if (!text.trim()) {
        if (existsSync(lyricsPath(id))) unlinkSync(lyricsPath(id))
        sendJson(res, 200, { ok: true, cleared: true })
        return true
      }
      writeFileSync(lyricsPath(id), text, 'utf-8')
      sendJson(res, 200, { ok: true })
    } catch (e) {
      sendJson(res, 400, { error: `歌词保存失败：${e.message}` })
    }
    return true
  }

  // ===== 修改元信息 =====
  const mMeta = /^\/api\/media\/meta\/(.+)$/.exec(path)
  if (method === 'PATCH' && mMeta) {
    if (!requireAuth(req, res)) return true
    const id = safeId(decodeURIComponent(mMeta[1]))
    const filePath = findMediaFile(id)
    if (!filePath) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    try {
      const body = JSON.parse((await readSmallBody(req)) || '{}')
      const current = readMetaSidecar(id) ?? {
        title: readId3(filePath)?.title || id,
        artist: readId3(filePath)?.artist || '',
        album: readId3(filePath)?.album || '',
        addedAt: Date.now(),
      }
      const next = {
        title: typeof body.title === 'string' ? body.title.trim() || current.title : current.title,
        artist: typeof body.artist === 'string' ? body.artist.trim() : current.artist ?? '',
        album: typeof body.album === 'string' ? body.album.trim() : current.album ?? '',
        addedAt: current.addedAt ?? Date.now(),
      }
      writeMetaSidecar(id, next)
      sendJson(res, 200, { ok: true, item: listMedia().find((x) => x.id === id) ?? null })
    } catch (e) {
      sendJson(res, 400, { error: `元信息保存失败：${e.message}` })
    }
    return true
  }

  // ===== 删除媒体 =====
  const mItem = /^\/api\/media\/item\/(.+)$/.exec(path)
  if (method === 'DELETE' && mItem) {
    if (!requireAuth(req, res)) return true
    const id = safeId(decodeURIComponent(mItem[1]))
    const filePath = findMediaFile(id)
    if (!filePath) {
      sendJson(res, 404, { error: '媒体不存在' })
      return true
    }
    const removed = []
    const targets = [filePath, join(MEDIA_DIR, `${id}.meta.json`), lyricsPath(id), findCoverFile(id)].filter(Boolean)
    for (const t of targets) {
      try {
        unlinkSync(t)
        removed.push(basename(t))
      } catch {
        /* ignore */
      }
    }
    id3Cache.delete(filePath)
    sendJson(res, 200, { ok: true, removed })
    return true
  }

  sendJson(res, 404, { error: '未知媒体接口' })
  return true
}

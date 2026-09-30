/**
 * 媒体库 API 客户端（隐藏页 /fishplayer 使用）
 *
 * 只读接口公开；上传/管理接口需要登录（复用站点账号 token）。
 */

const API_BASE = '/api/media'

export interface MediaItem {
  id: string
  type: 'audio' | 'video'
  ext: string
  size: number
  mtime: number
  title: string
  artist: string
  album: string
  addedAt: number
  hasCover: boolean
  hasLyrics: boolean
  url: string
  coverUrl: string
  lyricsUrl: string
}

/** 取当前登录 token（与 account.ts 使用同一份登录态） */
export function authToken(): string {
  try {
    const raw = localStorage.getItem('quiz-platform:auth')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { token?: string }
    return parsed?.token ?? ''
  } catch {
    return ''
  }
}

export function isLoggedIn(): boolean {
  return Boolean(authToken())
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = authToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: string }
    return d.error ?? fallback
  } catch {
    return fallback
  }
}

/** 媒体列表 */
export async function fetchMediaList(): Promise<MediaItem[]> {
  const res = await fetch(`${API_BASE}/list`)
  if (!res.ok) throw new Error(await readError(res, `列表加载失败（${res.status}）`))
  const data = (await res.json()) as { items?: MediaItem[] }
  return data.items ?? []
}

/** 上传媒体（原始字节流，带进度回调） */
export function uploadMedia(
  file: File,
  opts: { title?: string; artist?: string; album?: string } = {},
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; id: string }> {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ name: file.name })
    if (opts.title) q.set('title', opts.title)
    if (opts.artist) q.set('artist', opts.artist)
    if (opts.album) q.set('album', opts.album)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/upload?${q.toString()}`)
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText) as { ok?: boolean; id?: string; error?: string }
        if (xhr.status >= 200 && xhr.status < 300 && d.ok) resolve({ ok: true, id: d.id ?? '' })
        else reject(new Error(d.error ?? `上传失败（${xhr.status}）`))
      } catch {
        reject(new Error(`上传失败（${xhr.status}）`))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误，上传中断'))
    xhr.send(file)
  })
}

/** 保存歌词（LRC 或纯文本；传空字符串表示删除歌词） */
export async function saveLyrics(id: string, text: string): Promise<void> {
  const res = await fetch(`${API_BASE}/lyrics/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    body: text,
  })
  if (!res.ok) throw new Error(await readError(res, `歌词保存失败（${res.status}）`))
}

/** 读取歌词文本（无歌词返回空串） */
export async function fetchLyrics(id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/lyrics/${encodeURIComponent(id)}`)
  if (res.status === 404) return ''
  if (!res.ok) throw new Error(await readError(res, `歌词加载失败（${res.status}）`))
  return await res.text()
}

/** 上传封面 */
export async function uploadCover(id: string, file: File): Promise<void> {
  const res = await fetch(`${API_BASE}/cover/${encodeURIComponent(id)}?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
    body: file,
  })
  if (!res.ok) throw new Error(await readError(res, `封面上传失败（${res.status}）`))
}

/** 修改元信息 */
export async function saveMeta(
  id: string,
  patch: { title?: string; artist?: string; album?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/meta/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await readError(res, `元信息保存失败（${res.status}）`))
}

/** 删除媒体 */
export async function deleteMedia(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/item/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readError(res, `删除失败（${res.status}）`))
}

/** 人类可读体积 */
export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

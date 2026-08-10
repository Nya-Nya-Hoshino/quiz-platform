/**
 * 账号与云端数据同步（对接 server.mjs 后端 API）
 */

const API_BASE = '/api'

export interface SyncPayload {
  /** 数据包版本 */
  version: number
  /** 本地导出时间戳 */
  exportedAt: number
  wrongBook: unknown[]
  favorites: unknown[]
  history: unknown[]
  /** 练习/考试进度：{ key: ProgressData } */
  progress: Record<string, unknown>
  /** 每日统计 */
  daily: unknown
}

export async function register(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json()) as { ok?: boolean; token?: string; username?: string; error?: string }
  if (!res.ok || !data.token) {
    throw new Error(data.error ?? `注册失败（${res.status}）`)
  }
  return { token: data.token, username: data.username ?? username }
}

export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = (await res.json()) as { ok?: boolean; token?: string; username?: string; error?: string }
  if (!res.ok || !data.token) {
    throw new Error(data.error ?? `登录失败（${res.status}）`)
  }
  return { token: data.token, username: data.username ?? username }
}

export async function fetchRemoteData(token: string): Promise<{ savedAt?: number; payload?: SyncPayload; empty?: boolean }> {
  const res = await fetch(`${API_BASE}/data`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(d.error ?? `拉取数据失败（${res.status}）`)
  }
  return (await res.json()) as { savedAt?: number; payload?: SyncPayload; empty?: boolean }
}

export async function pushRemoteData(token: string, payload: SyncPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ savedAt: Date.now(), payload }),
  })
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(d.error ?? `上传数据失败（${res.status}）`)
  }
}

/** 下载全站备份文件（触发浏览器下载） */
export async function downloadBackup(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/backup`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(d.error ?? `备份下载失败（${res.status}）`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quiz-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 触发后端备份快照 */
export async function triggerBackup(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/backup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; file?: string; error?: string }
  if (!res.ok || !d.ok) {
    throw new Error(d.error ?? '后端备份失败')
  }
  return d.file ?? ''
}

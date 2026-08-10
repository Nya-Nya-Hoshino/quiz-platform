/**
 * 账号与数据同步后端（单机 JSON 文件存储，无外部依赖）
 *
 * - POST /api/register {username, password}      注册（首个用户即管理员）
 * - POST /api/login {username, password}         → { token, username }
 * - GET  /api/data                               拉取同步数据包（Bearer token）
 * - PUT  /api/data { payload, savedAt }          上传同步数据包
 * - GET  /api/backup                             下载全站备份（含用户表）
 * - POST /api/backup                             触发后端备份快照
 *
 * 密码：crypto.scrypt 加盐哈希（不存明文）
 * Token：crypto.randomBytes 生成，持久化到 tokens.json（重启不失效）
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SELF_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(SELF_DIR, 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const TOKENS_FILE = join(DATA_DIR, 'tokens.json')
const USERS_DIR = join(DATA_DIR, 'users')
const BACKUPS_DIR = join(DATA_DIR, 'backups')

function ensureDirs() {
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(USERS_DIR, { recursive: true })
  mkdirSync(BACKUPS_DIR, { recursive: true })
}
ensureDirs()

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}
function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 1), 'utf-8')
}

function loadUsers() {
  return readJson(USERS_FILE, {}) ?? {}
}
function saveUsers(users) {
  writeJson(USERS_FILE, users)
}
function loadTokens() {
  return readJson(TOKENS_FILE, {}) ?? {}
}
function saveTokens(tokens) {
  writeJson(TOKENS_FILE, tokens)
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}
function verifyPassword(password, salt, hash) {
  const h = Buffer.from(hash, 'hex')
  const t = scryptSync(password, salt, 64)
  return h.length === t.length && timingSafeEqual(h, t)
}

function issueToken(username) {
  const tokens = loadTokens()
  // 多设备共存：每设备一个 token，登录不踢掉其他设备
  // 但限制每用户最多 10 个活跃 token，超出时按 FIFO 淘汰最旧的
  const userTokens = Object.entries(tokens).filter(([, u]) => u === username)
  if (userTokens.length >= 10) {
    delete tokens[userTokens[0][0]]
  }
  const token = randomBytes(32).toString('hex')
  tokens[token] = username
  saveTokens(tokens)
  return token
}
function resolveToken(token) {
  if (!token) return null
  const tokens = loadTokens()
  return tokens[token] ?? null
}

/** 读取请求体 JSON */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** 收集全站数据（备份用） */
function collectAll() {
  const users = loadUsers()
  const payloads = {}
  for (const name of Object.keys(users)) {
    const f = join(USERS_DIR, `${sanitizeName(name)}.json`)
    payloads[name] = readJson(f, null)
  }
  return {
    exportedAt: Date.now(),
    version: 1,
    users,
    payloads,
  }
}

function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_')
}

/**
 * 账号 API 入口。返回 true 表示已处理。
 */
export async function handleAccountAPI(req, res, url) {
  const path = url.pathname
  if (!path.startsWith('/api/')) return false
  const method = req.method ?? 'GET'

  // ===== 注册 =====
  if (method === 'POST' && path === '/api/register') {
    const body = await readBody(req)
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    if (username.length < 2 || username.length > 32) {
      sendJson(res, 400, { error: '用户名需为 2-32 个字符' })
      return true
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: '密码至少 6 位' })
      return true
    }
    const users = loadUsers()
    if (users[username]) {
      sendJson(res, 409, { error: '用户名已存在' })
      return true
    }
    const salt = randomBytes(16).toString('hex')
    users[username] = { salt, hash: hashPassword(password, salt), createdAt: Date.now() }
    saveUsers(users)
    const token = issueToken(username)
    sendJson(res, 201, { ok: true, token, username })
    return true
  }

  // ===== 登录 =====
  if (method === 'POST' && path === '/api/login') {
    const body = await readBody(req)
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    const users = loadUsers()
    const rec = users[username]
    if (!rec || !verifyPassword(password, rec.salt, rec.hash)) {
      sendJson(res, 401, { error: '用户名或密码错误' })
      return true
    }
    const token = issueToken(username)
    sendJson(res, 200, { ok: true, token, username })
    return true
  }

  // ===== 需要认证的接口 =====
  const authHeader = String(req.headers.authorization ?? '')
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const username = resolveToken(token)
  if (path.startsWith('/api/') && !username) {
    sendJson(res, 401, { error: '未登录或登录已过期' })
    return true
  }

  // ===== 退出登录（作废当前 token，不影响其他设备） =====
  if (method === 'POST' && path === '/api/logout') {
    const tokens = loadTokens()
    delete tokens[token]
    saveTokens(tokens)
    sendJson(res, 200, { ok: true })
    return true
  }

  // ===== 拉取数据 =====
  if (method === 'GET' && path === '/api/data') {
    const f = join(USERS_DIR, `${sanitizeName(username)}.json`)
    const data = readJson(f, null)
    if (data && data.payload != null) {
      sendJson(res, 200, { savedAt: data.savedAt ?? 0, payload: data.payload })
    } else {
      sendJson(res, 200, { empty: true })
    }
    return true
  }

  // ===== 上传数据 =====
  if (method === 'PUT' && path === '/api/data') {
    const body = await readBody(req)
    const payload = body.payload
    if (payload == null || typeof payload !== 'object') {
      sendJson(res, 400, { error: 'payload 不能为空' })
      return true
    }
    const savedAt = typeof body.savedAt === 'number' ? body.savedAt : Date.now()
    writeJson(join(USERS_DIR, `${sanitizeName(username)}.json`), { savedAt, payload })
    sendJson(res, 200, { ok: true, savedAt })
    return true
  }

  // ===== 下载全站备份 =====
  if (method === 'GET' && path === '/api/backup') {
    const all = collectAll()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const body = JSON.stringify(all, null, 1)
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="quiz-backup-${stamp}.json"`,
      'Cache-Control': 'no-store',
    })
    res.end(body)
    return true
  }

  // ===== 触发后端备份快照 =====
  if (method === 'POST' && path === '/api/backup') {
    const all = collectAll()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    writeJson(join(BACKUPS_DIR, `backup-${stamp}.json`), all)
    sendJson(res, 200, { ok: true, file: `backup-${stamp}.json` })
    return true
  }

  return false
}

/**
 * 生产静态服务器（SPA 路由回退，Windows 兼容）
 * 托管 dist/ 目录，未匹配路径回退 index.html
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('./dist/', import.meta.url))
const PORT = process.env.PORT || 8080

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// ===== AI 代理配置（从 .env.local 读取，密钥不暴露给浏览器） =====
function loadEnvFile() {
  const env = {}
  try {
    const text = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* 无 .env.local 时用默认 */ }
  return env
}
const env = loadEnvFile()
const AI_ENDPOINT = env.VITE_AI_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions'
const AI_KEY = env.VITE_AI_API_KEY || ''
const AI_MODEL = env.VITE_AI_MODEL || 'deepseek-v4-flash'

import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

/** AI 代理：POST /api/ai/chat → DeepSeek */
async function handleAIProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end('Method Not Allowed'); return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    res.writeHead(400); res.end('Bad Request'); return
  }
  if (!AI_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'AI 服务端未配置密钥（.env.local 缺少 VITE_AI_API_KEY）' }))
    return
  }
  const upstream = {
    model: payload.model || AI_MODEL,
    messages: payload.messages || [],
    temperature: payload.temperature ?? 0.3,
  }
  try {
    const upstreamRes = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify(upstream),
    })
    const data = await upstreamRes.json()
    res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'AI 上游请求失败: ' + e.message }))
  }
}

/** gzip 压缩缓存（按文件路径） */
const gzipCache = new Map()

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    // AI 代理路由
    if (url.pathname === '/api/ai/chat') {
      await handleAIProxy(req, res)
      return
    }
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/index.html'

    // 拼接并防穿越：join(ROOT, '.' + pathname) 避免绝对路径吞掉 ROOT
    let filePath = normalize(join(ROOT, '.' + pathname))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return
    }

    let content
    try {
      const st = await stat(filePath)
      if (st.isDirectory()) filePath = join(filePath, 'index.html')
      content = await readFile(filePath)
    } catch {
      // SPA 回退：静态资源 404，其他回退 index.html
      if (/\.(js|css|png|jpg|jpeg|webp|svg|json|ico|woff2?|mp3|wav)$/.test(pathname)) {
        res.writeHead(404); res.end('Not Found'); return
      }
      content = await readFile(join(ROOT, 'index.html'))
      filePath = join(ROOT, 'index.html')
    }

    const ext = extname(filePath).toLowerCase()
    // Cache-Control：带 hash 的构建产物可长期缓存；HTML 不缓存；其余 1 天
    const isHashedAsset = /[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8}\.(js|css)$/.test(filePath)
    const cacheControl = ext === '.html' || !isHashedAsset
      ? (ext === '.html' ? 'no-cache' : 'public, max-age=86400')
      : 'public, max-age=31536000, immutable'
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl,
    }
    // gzip 压缩（文本类资源；图片本身已压缩不重复压缩；按路径缓存结果避免重复计算）
    let out = content
    const acceptGzip = (req.headers['accept-encoding'] ?? '').includes('gzip')
    if (acceptGzip && content.length > 1024 && !/\.(png|jpg|jpeg|webp|gif|ico)$/.test(filePath)) {
      let gz = gzipCache.get(filePath)
      if (!gz) {
        gz = gzipSync(content)
        gzipCache.set(filePath, gz)
      }
      headers['Content-Encoding'] = 'gzip'
      out = gz
    }
    res.writeHead(200, headers)
    res.end(out)
  } catch (e) {
    res.writeHead(500); res.end('Server Error: ' + e.message)
  }
})

server.listen(PORT, () => {
  console.log(`生产服务器运行在 http://localhost:${PORT} (根目录: ${ROOT})`)
})

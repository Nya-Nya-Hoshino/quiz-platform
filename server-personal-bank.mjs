/** 私人练习：服务器定向投递，按精确账号隔离存储。 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_PATH = '/api/personal-bank'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CHOICE_TYPES = new Set(['reading', 'vocab', 'grammar', 'single_choice', 'reading_comp'])
const TYPES = new Set([...CHOICE_TYPES, 'multiple_choice', 'judge', 'fill_blank', 'short_answer', 'sorting'])

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

/** 校验现有 parser.ts 的原始练习结构，不猜测字段别名或转换答案。 */
export function validatePersonalExam(raw) {
  requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), '练习必须是 JSON 对象')
  requireValue(typeof raw.title === 'string' && raw.title.trim().length > 0 && raw.title.length <= 200, 'title 需为 1-200 字的练习标题')
  requireValue(Array.isArray(raw.questions) && raw.questions.length > 0 && raw.questions.length <= 2000, 'questions 需包含 1-2000 道题目')
  const passages = raw.readingPassages ?? []
  requireValue(Array.isArray(passages), 'readingPassages 必须是数组')
  const passageIds = new Set()
  const renderedPassageIds = new Set()
  for (const p of passages) {
    requireValue(p && ((typeof p.id === 'string' && p.id.length > 0) || Number.isSafeInteger(p.id)) && typeof p.passage === 'string' && p.passage.trim(), '阅读文章需提供 id 和 passage')
    requireValue(!renderedPassageIds.has(String(p.id)), '阅读文章 id 重复')
    renderedPassageIds.add(String(p.id))
    passageIds.add(p.id)
  }
  const ids = new Set()
  const sections = new Map()
  let totalScore = 0
  for (const [index, q] of raw.questions.entries()) {
    const label = `第 ${index + 1} 题`
    requireValue(q && typeof q === 'object', `${label}必须是对象`)
    requireValue((typeof q.id === 'string' && q.id.length > 0) || Number.isSafeInteger(q.id), `${label}缺少有效 id`)
    // parser.ts 使用 String(id) 组成全局题号，避免 1 和 "1" 生成相同题号。
    const id = String(q.id)
    requireValue(!ids.has(id), `${label}的 id 重复`)
    ids.add(id)
    requireValue(TYPES.has(q.type), `${label}的 type 不受支持`)
    requireValue(typeof q.question === 'string' && q.question.trim(), `${label}缺少 question`)
    for (const field of ['section', 'prompt', 'difficulty', 'explanation', 'analysis']) {
      requireValue(q[field] === undefined || typeof q[field] === 'string', `${label}的 ${field} 必须是字符串`)
    }
    const score = q.score ?? 2
    requireValue(typeof score === 'number' && Number.isFinite(score) && score > 0, `${label}的 score 必须为正数`)
    totalScore += score
    const section = q.section ?? ''
    sections.set(section, (sections.get(section) ?? 0) + 1)
    if (CHOICE_TYPES.has(q.type) || q.type === 'multiple_choice' || q.type === 'sorting') {
      requireValue(Array.isArray(q.options) && q.options.length >= 2 && q.options.every(o => typeof o === 'string' && o.trim()), `${label}的 options 至少包含两个非空字符串`)
      const isIndex = v => Number.isInteger(v) && v >= 0 && v < q.options.length
      if (q.type === 'sorting') {
        const order = q.sortedAnswer ?? q.answer
        requireValue(Array.isArray(order) && order.length === q.options.length && order.every(isIndex) && new Set(order).size === order.length, `${label}的排序答案必须包含所有选项索引且不重复`)
      } else if (q.type === 'multiple_choice') {
        requireValue(Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every(isIndex) && new Set(q.answer).size === q.answer.length, `${label}的多选答案必须为有效索引数组`)
      } else {
        requireValue(isIndex(q.answer), `${label}的 answer 必须为从 0 起的有效选项索引`)
      }
    } else if (q.type === 'judge') {
      requireValue(typeof q.answer === 'boolean', `${label}的判断答案必须为布尔值`)
    } else if (q.type === 'fill_blank') {
      requireValue(Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every(a => typeof a === 'string'), `${label}的填空答案必须为字符串数组`)
      const blankCount = Math.max(q.question.match(/（\s*）/g)?.length ?? 1, 1)
      requireValue(q.answer.length === blankCount, `${label}的填空答案数量必须与题干全角空白括号数量一致；没有占位时为一空`)
    } else {
      requireValue(typeof q.answer === 'string', `${label}的简答答案必须为字符串`)
    }
    if (q.type === 'reading_comp') requireValue(passageIds.has(q.passageId), `${label}的 passageId 必须精确对应阅读文章 id`)
  }
  requireValue(Number.isFinite(totalScore), '总分超出有效范围')
  const timeLimit = raw.timeLimit ?? 120
  const passScore = raw.passScore ?? 0
  requireValue(typeof timeLimit === 'number' && Number.isFinite(timeLimit) && timeLimit > 0, 'timeLimit 必须为正数')
  requireValue(typeof passScore === 'number' && Number.isFinite(passScore) && passScore >= 0 && passScore <= totalScore, 'passScore 必须在 0 与总分之间')
  requireValue(raw.subject === undefined || (typeof raw.subject === 'string' && raw.subject.trim()), 'subject 必须为非空字符串')
  return {
    ...raw, timeLimit, passScore, totalScore, totalQuestions: raw.questions.length,
    sections: [...sections].map(([name, count]) => ({ name, count })),
  }
}

export function createPersonalBank(dataDir) {
  const directory = username => join(dataDir, 'personal-bank', createHash('sha256').update(username, 'utf8').digest('hex'))
  function accountExists(username) {
    try {
      const users = JSON.parse(readFileSync(join(dataDir, 'users.json'), 'utf8'))
      return typeof username === 'string' && Object.hasOwn(users, username)
    } catch (error) { if (error.code === 'ENOENT') return false; throw error }
  }
  function get(username, id) {
    if (!UUID.test(id)) return null
    try {
      const record = JSON.parse(readFileSync(join(directory(username), `${id}.json`), 'utf8'))
      return record.username === username && record.practice.id === id ? record : null
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  function list(username) {
    let entries
    try { entries = readdirSync(directory(username), { withFileTypes: true }) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json') && UUID.test(entry.name.slice(0, -5)))
      .map(entry => get(username, entry.name.slice(0, -5)))
      .filter(Boolean)
      .map(record => record.practice)
      .sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id))
  }
  function deliver(username, raw) {
    requireValue(accountExists(username), '账号不存在：请使用已经注册的完整账号名，区分大小写')
    const validated = validatePersonalExam(raw)
    const id = randomUUID()
    const exam = { ...validated, id: `personal:${id}`, testId: `personal:${id}` }
    const practice = {
      id, title: exam.title, receivedAt: Date.now(), totalQuestions: exam.totalQuestions,
      totalScore: exam.totalScore, sections: exam.sections,
    }
    const record = { version: 1, username, practice, exam }
    const ownerDir = directory(username)
    mkdirSync(ownerDir, { recursive: true, mode: 0o700 })
    const temporary = join(ownerDir, `${id}.tmp`)
    try {
      writeFileSync(temporary, JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      renameSync(temporary, join(ownerDir, `${id}.json`))
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* 文件未创建时无须清理 */ }
      throw error
    }
    return practice
  }
  return { deliver, list, get, accountExists }
}

export const personalBank = createPersonalBank(fileURLToPath(new URL('./data/', import.meta.url)))

export function parsePersonalBankAdmins(value, bank = personalBank) {
  if (value === undefined || value === '') return new Set()
  let usernames
  try { usernames = JSON.parse(value) } catch { throw new Error('PERSONAL_BANK_ADMIN_USERS 必须为 JSON 数组') }
  requireValue(Array.isArray(usernames) && usernames.every(name => typeof name === 'string' && bank.accountExists(name)), 'PERSONAL_BANK_ADMIN_USERS 必须仅包含已注册账号的精确名称')
  return new Set(usernames)
}

/** 白名单独立读取，明确支持 UTF-8 配置文件中的 LF 与 CRLF。 */
export function loadPersonalBankAdmins({ file = join(process.cwd(), '.env.local'), bank = personalBank, value } = {}) {
  if (value !== undefined) return parsePersonalBankAdmins(value, bank)
  let text
  try { text = readFileSync(file, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return new Set(); throw error }
  const key = 'PERSONAL_BANK_ADMIN_USERS='
  const lines = text.split(/\r?\n/).filter(line => line.startsWith(key))
  requireValue(lines.length <= 1, 'PERSONAL_BANK_ADMIN_USERS 配置重复，请只保留一行')
  return parsePersonalBankAdmins(lines[0]?.slice(key.length), bank)
}

function readDelivery(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const chunks = []
    let tooLarge = false
    req.on('data', chunk => {
      bytes += chunk.length
      if (bytes > 2 * 1024 * 1024) { tooLarge = true; chunks.length = 0 }
      if (!tooLarge) chunks.push(Buffer.from(chunk))
    })
    req.on('end', () => {
      if (tooLarge) { reject(Object.assign(new Error('投递请求不能超过 2 MiB'), { status: 413 })); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('请求体必须是有效 JSON')) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export async function handlePersonalBankAPI(req, res, url, resolveUser, bank = personalBank, adminUsers = new Set()) {
  if (url.pathname !== API_PATH && !url.pathname.startsWith(`${API_PATH}/`)) return false
  const header = String(req.headers.authorization ?? '')
  const username = resolveUser(header.startsWith('Bearer ') ? header.slice(7).trim() : '')
  if (typeof username !== 'string' || !username) { sendJson(res, 401, { error: '请先登录，或重新登录已过期的账号' }); return true }
  const canManage = adminUsers.has(username) && bank.accountExists(username)
  if (url.pathname === `${API_PATH}/deliver`) {
    if (!canManage) { sendJson(res, 403, { error: '当前账号没有投递练习的权限' }); return true }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(res, 405, { error: '投递接口仅接受 POST' }); return true }
    try {
      const body = await readDelivery(req)
      requireValue(body && typeof body.username === 'string', '请填写接收账号的完整名称')
      const practice = bank.deliver(body.username, body.exam)
      sendJson(res, 201, { username: body.username, practice })
    } catch (error) {
      sendJson(res, error.status === 413 ? 413 : 400, { error: error.message })
    }
    return true
  }
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); sendJson(res, 405, { error: '个人题库仅支持读取，投递请使用服务器命令行' }); return true }
  try {
    if (url.pathname === API_PATH) {
      sendJson(res, 200, { practices: bank.list(username), canManage })
    } else {
      const id = url.pathname.slice(API_PATH.length + 1)
      if (!UUID.test(id)) { sendJson(res, 400, { error: '练习 ID 格式无效' }); return true }
      const record = bank.get(username, id)
      if (!record) { sendJson(res, 404, { error: '练习不存在或未投递给当前账号' }); return true }
      sendJson(res, 200, { practice: record.practice, exam: record.exam })
    }
  } catch {
    sendJson(res, 500, { error: '个人题库读取失败，请联系站长检查服务器数据' })
  }
  return true
}

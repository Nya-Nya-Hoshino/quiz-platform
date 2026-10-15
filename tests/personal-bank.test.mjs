import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { createPersonalBank, handlePersonalBankAPI, parsePersonalBankAdmins, loadPersonalBankAdmins } from '../server-personal-bank.mjs'

const practice = () => ({
  testId: 'original-id', title: '定向练习',
  questions: [{ id: 1, type: 'single_choice', section: '词汇', question: '请选择正确答案', options: ['甲', '乙'], answer: 1, explanation: '答案是乙', score: 2 }],
})

test('管理员配置默认不授权，拒绝无效 JSON、未知账号及大小写替换', (t) => {
  const { bank } = fixture(t)
  assert.equal(parsePersonalBankAdmins(undefined, bank).size, 0)
  assert.equal(parsePersonalBankAdmins('[]', bank).size, 0)
  assert.deepEqual([...parsePersonalBankAdmins('["Alice"]', bank)], ['Alice'])
  for (const value of ['Alice', '{}', '["alice"]', '["missing"]', '[5]']) assert.throws(() => parsePersonalBankAdmins(value, bank))
})

test('白名单配置支持 Windows/Unix 换行，环境变量优先，重复配置拒绝启动', (t) => {
  const { root, bank } = fixture(t)
  const file = join(root, '.env.local')
  for (const newline of ['\n', '\r\n']) {
    writeFileSync(file, `VITE_AI_MODEL=example${newline}PERSONAL_BANK_ADMIN_USERS=["Alice"]${newline}`)
    assert.deepEqual([...loadPersonalBankAdmins({ file, bank, value: undefined })], ['Alice'])
    assert.equal(loadPersonalBankAdmins({ file, bank, value: '[]' }).size, 0)
  }
  writeFileSync(file, 'PERSONAL_BANK_ADMIN_USERS=[]\nPERSONAL_BANK_ADMIN_USERS=["Alice"]\n')
  assert.throws(() => loadPersonalBankAdmins({ file, bank, value: undefined }), /重复/)
})

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'quiz-personal-bank-test-'))
  writeFileSync(join(root, 'users.json'), JSON.stringify({ Alice: {}, Bob: {}, 'a/b': {}, a_b: {} }))
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('quiz-personal-bank-test-'))
    rmSync(root, { recursive: true, force: true })
  })
  return { root, bank: createPersonalBank(root) }
}

test('投递到精确账号，每个接收账号只读取自己的练习', (t) => {
  const { bank } = fixture(t)
  const first = bank.deliver('Alice', practice())
  assert.equal(first.title, '定向练习')
  assert.equal(first.totalQuestions, 1)
  assert.equal(first.totalScore, 2)
  assert.deepEqual(first.sections, [{ name: '词汇', count: 1 }])
  assert.equal(bank.list('Alice').length, 1)
  assert.deepEqual(bank.list('Bob'), [])
  assert.equal(bank.get('Bob', first.id), null)
  assert.equal(bank.get('Alice', first.id).exam.testId, `personal:${first.id}`)
  assert.equal(bank.get('Alice', first.id).exam.questions[0].answer, 1)
  assert.ok(!('questions' in bank.list('Alice')[0]))
})

test('账号不存在、大小写不一致及原型属性均拒绝投递；路径字符不会造成账号目录碰撞', (t) => {
  const { bank } = fixture(t)
  for (const username of ['alice', ' Alice ', 'missing', 'toString', '__proto__']) {
    assert.throws(() => bank.deliver(username, practice()), /账号不存在/)
  }
  const sent = bank.deliver('a/b', practice())
  assert.equal(bank.get('a_b', sent.id), null)
  assert.equal(bank.list('a/b').length, 1)
  assert.deepEqual(bank.list('a_b'), [])
})

test('重复投递生成独立 ID，不覆盖原有题目', (t) => {
  const { bank } = fixture(t)
  const first = bank.deliver('Alice', practice())
  const second = bank.deliver('Alice', { ...practice(), title: '另一份练习' })
  assert.notEqual(first.id, second.id)
  assert.equal(bank.list('Alice').length, 2)
  assert.equal(bank.get('Alice', first.id).practice.title, '定向练习')
  assert.equal(bank.get('Alice', second.id).practice.title, '另一份练习')
})

test('错误题型、无效答案、重复题号和不存在的阅读文章均拒绝且不留下投递记录', (t) => {
  const { bank } = fixture(t)
  const q = practice().questions[0]
  const invalid = [
    { ...practice(), title: '' },
    { ...practice(), questions: [] },
    { ...practice(), questions: [{ ...q, type: 'Single_Choice' }] },
    { ...practice(), questions: [{ ...q, answer: 'B' }] },
    { ...practice(), questions: [{ ...q, answer: 5 }] },
    { ...practice(), questions: [{ ...q, score: -1 }] },
    { ...practice(), questions: [q, { ...q, id: '1' }] },
    { ...practice(), questions: [{ ...q, type: 'reading_comp', passageId: 1 }], readingPassages: [{ id: '1', passage: '文章' }] },
    { ...practice(), questions: [{ ...q, type: 'sorting', answer: [0, 0] }] },
  ]
  for (const raw of invalid) assert.throws(() => bank.deliver('Alice', raw))
  assert.deepEqual(bank.list('Alice'), [])
})

test('兼容现有完整练习卷与阅读文章结构', (t) => {
  const { bank } = fixture(t)
  const source = JSON.parse(readFileSync(new URL('../src/data/jlpt-user/n3-user-1.json', import.meta.url), 'utf8'))
  const sent = bank.deliver('Alice', source)
  const received = bank.get('Alice', sent.id)
  assert.equal(sent.totalQuestions, source.questions.length)
  assert.deepEqual(received.exam.readingPassages, source.readingPassages)
  assert.deepEqual(received.exam.questions, source.questions)
})

test('填空答案数量必须与现有输入框数量一致', (t) => {
  const { bank } = fixture(t)
  const exam = (question, answer) => ({ title: '填空校验', questions: [{ id: 1, type: 'fill_blank', question, answer }] })
  assert.throws(() => bank.deliver('Alice', exam('翻译两个词', ['甲', '乙'])), /数量/)
  assert.throws(() => bank.deliver('Alice', exam('（　）和（　）', ['甲'])), /数量/)
  assert.equal(bank.deliver('Alice', exam('（　）和（　）', ['甲', '乙'])).totalQuestions, 1)
  assert.equal(bank.deliver('Alice', exam('翻译一个词', ['甲'])).totalQuestions, 1)
})

test('API 拒绝未认证读取、其他账号读取、路径穿越和网页写入', async (t) => {
  const { bank } = fixture(t)
  const sent = bank.deliver('Alice', practice())
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (!await handlePersonalBankAPI(req, res, url, (token) => ({ alice: 'Alice', bob: 'Bob' })[token] ?? null, bank)) {
      res.writeHead(404); res.end()
    }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((done) => server.close(done))
  })
  const base = `http://127.0.0.1:${server.address().port}/api/personal-bank`
  const request = (path = '', token, method = 'GET') => fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })
  assert.equal((await request()).status, 401)
  assert.equal((await request('', 'expired')).status, 401)
  assert.equal((await request('', 'toString')).status, 401)
  assert.equal((await request('', 'alice', 'POST')).status, 405)
  assert.equal((await request(`/${sent.id}`, 'bob')).status, 404)
  assert.equal((await request('/invalid-id', 'alice')).status, 400)
  assert.equal((await request('/%2e%2e%2fusers.json', 'alice')).status, 400)
  const list = await request('', 'alice')
  assert.equal(list.headers.get('Cache-Control'), 'no-store')
  assert.equal((await list.json()).practices[0].id, sent.id)
  const detail = await request(`/${sent.id}`, 'alice')
  assert.equal((await detail.json()).exam.testId, `personal:${sent.id}`)
})

test('服务器命令行支持含空格的文件路径并拒绝不存在的账号', (t) => {
  const { root, bank } = fixture(t)
  const input = join(root, '练习 文件.json')
  writeFileSync(input, JSON.stringify(practice()))
  const script = fileURLToPath(new URL('../scripts/send-personal-practice.mjs', import.meta.url))
  const run = (username) => spawnSync(process.execPath, [script, '--username', username, '--file', input, '--data-dir', root], { encoding: 'utf8', windowsHide: true })
  const result = run('Alice')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(bank.list('Alice').length, 1)
  assert.notEqual(run('alice').status, 0)
  assert.equal(bank.list('Alice').length, 1)
})

test('管理员网页投递仅允许服务器白名单中的精确账号，并验证请求内容与体积', { timeout: 10000 }, async (t) => {
  const { bank } = fixture(t)
  const server = createServer(async (req, res) => {
    await handlePersonalBankAPI(req, res, new URL(req.url, 'http://localhost'), (token) => ({ alice: 'Alice', bob: 'Bob' })[token] ?? null, bank, new Set(['Alice']))
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)) })
  const base = `http://127.0.0.1:${server.address().port}/api/personal-bank`
  const send = (token, body) => fetch(base + '/deliver', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body })
  const list = async token => (await fetch(base, { headers: { Authorization: `Bearer ${token}` } })).json()
  assert.equal((await list('alice')).canManage, true)
  assert.equal((await list('bob')).canManage, false)
  assert.equal((await send('bob', JSON.stringify({ username: 'Alice', exam: practice() }))).status, 403)
  assert.equal((await send('alice', '{')).status, 400)
  assert.equal((await send('alice', JSON.stringify({ username: 'bob', exam: practice() }))).status, 400)
  assert.equal((await send('alice', ' '.repeat(2 * 1024 * 1024 + 1))).status, 413)
  const delivered = await send('alice', JSON.stringify({ username: 'Bob', exam: practice() }))
  assert.equal(delivered.status, 201)
  const receipt = await delivered.json()
  assert.equal(receipt.username, 'Bob')
  assert.equal(bank.list('Bob')[0].id, receipt.practice.id)
  assert.deepEqual(bank.list('Alice'), [])
})

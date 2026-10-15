import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const compiler = await createServer({ configFile: false, server: { middlewareMode: true }, logLevel: 'silent' })
const { loadPersonalProgress, savePersonalProgress } = await compiler.ssrLoadModule('/src/utils/personalProgress.ts')
const { parsePersonalExam } = await compiler.ssrLoadModule('/src/utils/personalExam.ts')
const { isCorrect } = await compiler.ssrLoadModule('/src/utils/judge.ts')
const { findQuestion, buildQuestionRefs } = await compiler.ssrLoadModule('/src/utils/parser.ts')
after(() => compiler.close())

test('私人题干保留下划线，其他 HTML 与实体按文本显示', () => {
  const exam = parsePersonalExam({ testId: 'personal:markup', title: '导入校验', questions: [
    { id: 1, type: 'single_choice', question: '<u>词语</u><img src=x onerror=alert(1)>&lt;script&gt;', options: ['甲', '乙'], answer: 0 },
    { id: 2, type: 'reading_comp', passageId: 1, question: '<svg onload=alert(1)>', options: ['甲', '乙'], answer: 0 },
  ], readingPassages: [{ id: 1, passage: '文章' }] })
  assert.equal(exam.questions[0].question, '<u>词语</u>&lt;img src=x onerror=alert(1)&gt;&amp;lt;script&amp;gt;')
  assert.equal(findQuestion(exam, buildQuestionRefs(exam)[1].id).question, '&lt;svg onload=alert(1)&gt;')
})

test('个人练习保留填空与简答的字母原答案，并沿用多选和排序判分', () => {
  const exam = parsePersonalExam({ testId: 'personal:unit', title: '题型验证', questions: [
    { id: 1, type: 'fill_blank', question: '填写（　）', answer: ['A'] },
    { id: 2, type: 'short_answer', question: '填写字母', answer: 'B' },
    { id: 3, type: 'multiple_choice', question: '选择两项', options: ['甲', '乙', '丙'], answer: [0, 2] },
    { id: 4, type: 'sorting', question: '排列顺序', options: ['甲', '乙'], answer: [1, 0] },
  ] })
  assert.equal(isCorrect(exam.questions[0], ['A']), true)
  assert.equal(isCorrect(exam.questions[1], 'B'), true)
  assert.equal(isCorrect(exam.questions[2], [2, 0]), true)
  assert.equal(isCorrect(exam.questions[3], [1, 0]), true)
  assert.equal(isCorrect(exam.questions[3], [0, 1]), false)
})

test('个人进度按精确账号与练习隔离，存储内容不包含原题且不进入公共同步前缀', () => {
  const entries = new Map()
  globalThis.localStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
  const state = { currentIndex: 1, answers: { 'personal:id-1': 0 }, submitted: ['personal:id-1'], completed: false, question: '不应缓存的原题' }
  savePersonalProgress('Alice', 'id', state)
  savePersonalProgress('a/b', 'id', { ...state, currentIndex: 2 })
  assert.equal(loadPersonalProgress('Alice', 'id').currentIndex, 1)
  assert.equal(loadPersonalProgress('a/b', 'id').currentIndex, 2)
  for (const [username, id] of [['alice', 'id'], ['Bob', 'id'], ['Alice', 'another'], ['a_b', 'id']]) assert.equal(loadPersonalProgress(username, id), null)
  assert.ok([...entries.keys()].every(key => !key.startsWith('quiz-platform:progress')))
  assert.ok([...entries.values()].every(value => !value.includes('不应缓存的原题')))
})

test('损坏的进度和不可用的浏览器存储不会破坏练习加载', () => {
  for (const raw of ['{', JSON.stringify({ version: 1, currentIndex: -1, answers: {}, submitted: [], completed: false, updatedAt: 1 }), JSON.stringify({ version: 1, currentIndex: 0, answers: {}, submitted: [5], completed: false, updatedAt: 1 })]) {
    globalThis.localStorage = { getItem: () => raw }
    assert.equal(loadPersonalProgress('Alice', 'id'), null)
  }
  globalThis.localStorage = { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('disabled') } }
  assert.equal(loadPersonalProgress('Alice', 'id'), null)
  assert.doesNotThrow(() => savePersonalProgress('Alice', 'id', { currentIndex: 0, answers: {}, submitted: [], completed: false }))
})

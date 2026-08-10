/**
 * AI 学习助手服务（扩展：批量解析生成 / AI 智能赋分）
 *
 * OpenAI Compatible API。
 * 支持三种调用方式（按优先级）：
 * 1. 远程代理：POST {API_BASE}/ai/chat（推荐生产方式，密钥留在服务端）
 * 2. 直连 OpenAI Compatible：VITE_AI_ENDPOINT + VITE_AI_API_KEY（浏览器直连，需允许 CORS）
 * 3. Mock 模式：未配置时返回本地模拟教学解析（保证前端功能可演示）
 */
import { getSystemPrompt } from '../prompts'

export interface AIRequest {
  /** 用户问题（如「解释这道题」） */
  question: string
  /** 题目上下文（题干/选项/用户答案等） */
  context: string
  /** 学科标识，用于切换 System Prompt */
  subject: string
  /** 可选：覆盖默认 System Prompt */
  systemPrompt?: string
}

export interface AIResponse {
  /** AI 回复正文 */
  content: string
  /** 使用的模型（若可知） */
  model?: string
  /** 是否来自 Mock 模式 */
  mock: boolean
}

export interface AISettings {
  /** 直连端点（OpenAI Compatible），如 https://api.openai.com/v1/chat/completions */
  endpoint: string
  /** API Key（仅存 localStorage，仅用于直连模式） */
  apiKey: string
  /** 模型名 */
  model: string
}

const STORAGE_KEY = 'quiz-platform:ai-settings'

/** 读取 AI 设置（localStorage 持久化；为空时回退到 .env 默认配置） */
export function loadAISettings(): AISettings {
  // 注意：API Key 仅从 localStorage 读取（用户手动填写）。
  // env 中的 VITE_AI_API_KEY 仅供开发服务器代理（vite.config.ts）在服务端使用，
  // 不会通过 import.meta.env 注入前端 bundle，避免生产构建泄露密钥。
  const envEndpoint = (import.meta.env.VITE_AI_ENDPOINT as string | undefined) ?? ''
  const envModel = (import.meta.env.VITE_AI_MODEL as string | undefined) ?? 'gpt-4o-mini'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AISettings>
      return {
        endpoint: parsed.endpoint ?? envEndpoint,
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? envModel,
      }
    }
  } catch {
    /* ignore */
  }
  return { endpoint: envEndpoint, apiKey: '', model: envModel }
}

/** 保存 AI 设置 */
export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/**
 * 检查是否配置了可用 API。
 * - dev 模式：Vite 代理（/api/ai/chat）由服务端持钥 → 有 endpoint 即可视为已配置
 * - 生产模式：无代理时必须 endpoint + apiKey 齐全才能直连
 */
export function isAIConfigured(): boolean {
  const s = loadAISettings()
  const isDev = import.meta.env.DEV
  if (isDev) {
    // dev 代理无需前端 Key
    return Boolean(s.endpoint)
  }
  // 生产：同源代理（/api/ai/chat，由 server.mjs 提供）总是可用；
  // 或配置了后端代理 / 直连 key
  const proxyBase = import.meta.env.VITE_API_BASE as string | undefined
  if (proxyBase || s.endpoint) return true
  // 无 endpoint 配置时，尝试同源代理（server.mjs 存在则可用）
  return true
}

/** 组装 System Prompt + 用户消息 */
function buildMessages(req: AIRequest): { role: 'system' | 'user'; content: string }[] {
  const system = req.systemPrompt ?? getSystemPrompt(req.subject)
  const userContent = `【题目上下文】\n${req.context}\n\n【学生问题】\n${req.question}`
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ]
}

/** 本地 Mock 教学解析（未配置 API 时使用，保证功能可演示） */
function mockAnswer(req: AIRequest): AIResponse {
  const subject = req.subject === 'programming' ? '编程' : '日语'
  const hint =
    req.subject === 'programming'
      ? '建议先明确题目考察的数据结构与算法，再逐步推导。'
      : '建议从题干关键词与选项对比入手，注意 JLPT 常见陷阱（读音混淆、近义语法、助词搭配）。'
  return {
    content:
      `【模拟 AI 助教 · ${subject}】\n\n` +
      `当前未配置 AI API（设置页可填写 OpenAI Compatible 端点与 Key）。\n\n` +
      `题目上下文：\n${req.context.slice(0, 400)}${req.context.length > 400 ? '…' : ''}\n\n` +
      `教学提示：${hint}\n\n` +
      `配置完成后，本助手将按学科 Prompt 提供：知识点讲解 → 选项分析 → 易错陷阱 → 记忆方法。`,
    mock: true,
  }
}

/** 发送一条 OpenAI 兼容对话，返回内容（代理优先，直连兜底） */
async function chatCompletion(
  messages: { role: string; content: string }[],
  model: string,
): Promise<string> {
  const settings = loadAISettings()

  // 1. 同源代理模式：POST /api/ai/chat
  //    dev 环境由 Vite 代理转发到 AI 服务端（密钥不暴露给浏览器）
  //    生产环境需由真实后端实现该端点；未实现（404）时回退直连
  const proxyBase = import.meta.env.VITE_API_BASE as string | undefined
  // 绝对 URL（浏览器用 location.origin；SSR/测试环境回退 localhost）
  const origin = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : 'http://localhost:5173'
  const proxyUrl = proxyBase ? `${proxyBase}/ai/chat` : `${origin}/api/ai/chat`
  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.3 }),
    })
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = data.choices?.[0]?.message?.content
      if (content) return content
    } else if (res.status !== 404) {
      throw new Error(`AI 代理错误 ${res.status}`)
    }
  } catch (e) {
    const err = e as Error
    if (!/404|Failed to fetch/i.test(err.message)) throw e
  }

  // 2. 直连 OpenAI Compatible
  if (settings.endpoint && settings.apiKey) {
    const res = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({ model: settings.model, messages, temperature: 0.3 }),
    })
    if (!res.ok) {
      throw new Error(`AI 请求失败 ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('AI 返回内容为空')
    return content
  }

  throw new Error('未配置 AI API（请在设置页填写端点与 Key）')
}

/**
 * 调用 AI（单题教学）
 * 1. 优先远程代理 /ai/chat（无需暴露 Key）
 * 2. 其次直连 OpenAI Compatible
 * 3. 未配置则 Mock
 */
export async function askAI(req: AIRequest): Promise<AIResponse> {
  if (!isAIConfigured()) {
    return mockAnswer(req)
  }
  try {
    const settings = loadAISettings()
    const content = await chatCompletion(buildMessages(req), settings.model)
    return { content, model: settings.model, mock: false }
  } catch (e) {
    const err = e as Error
    // 直连失败时给出明确错误
    throw new Error(err.message)
  }
}

/* ==================== 组卷扩展：批量解析生成 & AI 智能赋分 ==================== */

/** 待生成解析的题目描述 */
export interface ExplainItem {
  id: string
  section: string
  type: string
  question: string
  prompt?: string
  options?: string[]
  answer: unknown
}

/** 批量生成结果 */
export interface ExplainResult {
  /** 题目 id → 解析文本 */
  explanations: Record<string, string>
  /** 未生成数量 */
  failed: number
  /** 是否 mock */
  mock: boolean
  /** AI 调用错误信息（余额不足/网络失败等；mock 降级时仍可提示） */
  error?: string
}

/**
 * 单题解析生成（做题时逐题预生成，避免批量等待）。
 *
 * 与批量版不同：直接要求纯文本解析（不强制 JSON），响应更快更稳定。
 * 失败时抛出错误，由调用方降级。
 */
export async function generateQuestionExplanation(
  item: ExplainItem,
): Promise<string> {
  if (!isAIConfigured()) {
    return mockExplanation(item)
  }
  const settings = loadAISettings()
  const systemPrompt =
    `你是专业日语教师。为这道题写一段简洁的中文解析（80-150字）：` +
    `说明考察知识点、正确答案为什么正确、其他选项错在哪里，并给出记忆/易错提示。` +
    `直接输出解析文本，不要使用 JSON、不要输出题目原文。`
  const userContent = JSON.stringify(
    {
      section: item.section,
      type: item.type,
      question: item.question,
      prompt: item.prompt,
      options: item.options,
      answer: item.answer,
    },
    null,
    1,
  )
  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    settings.model,
  )
  const trimmed = content.trim()
  if (!trimmed) throw new Error('AI 返回解析为空')
  return trimmed
}

/**
 * 批量生成题目解析（组卷后对缺解析的题目调用）。
 *
 * 为避免一次请求过大，分批调用（每批 BATCH 题），每批要求 AI 返回 JSON 数组。
 * 未配置 AI 时返回 mock 占位解析。
 */
export async function batchGenerateExplanations(
  items: ExplainItem[],
  opts?: { onProgress?: (done: number, total: number) => void },
): Promise<ExplainResult> {
  const explanations: Record<string, string> = {}
  if (items.length === 0) return { explanations, failed: 0, mock: false }
  if (!isAIConfigured()) {
    // Mock：生成占位解析
    for (const it of items) {
      explanations[it.id] = mockExplanation(it)
    }
    return { explanations, failed: 0, mock: true }
  }

  const settings = loadAISettings()
  const BATCH = 10
  let failed = 0
  let lastError = ''

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const systemPrompt =
      `你是专业日语教师。为下面每道题写一段简洁的中文解析（80-150字）：` +
      `说明考察知识点、正确答案为什么正确、其他选项错在哪里。` +
      `严格输出 JSON 数组，每项为 {"id":"<题目id>","explanation":"<解析>"}，不要输出其他内容。`
    const userContent = JSON.stringify(
      batch.map((it) => ({
        id: it.id,
        section: it.section,
        type: it.type,
        question: it.question,
        prompt: it.prompt,
        options: it.options,
        answer: it.answer,
      })),
      null,
      1,
    )
    try {
      const content = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        settings.model,
      )
      const parsed = extractJsonArray(content)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && typeof item.explanation === 'string') {
            explanations[item.id] = item.explanation
          }
        }
      }
      // 批次内未返回的题补默认解析
      for (const it of batch) {
        if (!explanations[it.id]) {
          explanations[it.id] = mockExplanation(it)
        }
      }
    } catch (e) {
      failed += batch.length
      lastError = (e as Error).message
      for (const it of batch) {
        explanations[it.id] = mockExplanation(it)
      }
    }
    opts?.onProgress?.(Math.min(i + BATCH, items.length), items.length)
  }

  return { explanations, failed, mock: false, error: failed > 0 ? lastError : undefined }
}

/** 从 AI 回复中提取 JSON 数组（兼容代码块包裹） */
function extractJsonArray(text: string): unknown {
  const trimmed = text.trim()
  // 尝试直接解析
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* fall through */
  }
  // 提取 ```json ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim())
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* ignore */
    }
  }
  // 提取 [...] 子串
  const arrMatch = trimmed.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0])
    } catch {
      /* ignore */
    }
  }
  return null
}

/** 默认占位解析 */
function mockExplanation(it: ExplainItem): string {
  const ansText = Array.isArray(it.answer)
    ? (it.answer as unknown[]).map((a) => String(a)).join('、')
    : String(it.answer)
  return `本题考察${it.section}相关知识（${it.type}）。正确答案是 ${ansText}。建议结合教材与例句复习该知识点，掌握常见搭配与易错用法。`
}

/** AI 智能赋分输入 */
export interface ScoreItem {
  id: string
  type: string
  difficulty?: string
  question: string
  options?: string[]
}

/** AI 智能赋分结果 */
export interface ScoreResult {
  /** 题目 id → 分值 */
  scores: Record<string, number>
  /** 是否 mock */
  mock: boolean
  /** AI 调用错误信息 */
  error?: string
}

/**
 * AI 智能赋分：让大模型根据题型与难度评估每题分值。
 * 约束：总分在 [minTotal, maxTotal] 之间，分值取整数。
 * 未配置 AI 时按规则赋分（单选/判断 2 分，排序/阅读 3 分）。
 */
export async function aiSuggestScores(
  items: ScoreItem[],
  opts?: { minTotal?: number; maxTotal?: number; onProgress?: (done: number, total: number) => void },
): Promise<ScoreResult> {
  const minTotal = opts?.minTotal ?? 150
  const maxTotal = opts?.maxTotal ?? 200
  const scores: Record<string, number> = {}

  if (!isAIConfigured()) {
    // 规则赋分
    for (const it of items) {
      scores[it.id] = it.type === 'sorting' || it.type === 'reading_comp' ? 3 : 2
    }
    return { scores, mock: true }
  }

  const settings = loadAISettings()
  const BATCH = 20
  let failed = 0
  let lastError = ''

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const systemPrompt =
      `你是出题专家。为下面每道日语 N3 题目分配分值（整数）。` +
      `规则：总分应在 ${minTotal}-${maxTotal} 之间；题型难度越高分越高；` +
      `排序题/阅读题可高于单选；选择题最低 1 分最高 5 分。` +
      `严格输出 JSON 数组，每项为 {"id":"<题目id>","score":<整数分值>}，不要输出其他内容。`
    const userContent = JSON.stringify(
      batch.map((it) => ({
        id: it.id,
        type: it.type,
        difficulty: it.difficulty,
        question: it.question.slice(0, 100),
      })),
      null,
      1,
    )
    try {
      const content = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        settings.model,
      )
      const parsed = extractJsonArray(content)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && typeof item.score === 'number') {
            scores[item.id] = Math.max(1, Math.min(5, Math.round(item.score)))
          }
        }
      }
      for (const it of batch) {
        if (!scores[it.id]) {
          scores[it.id] = it.type === 'sorting' || it.type === 'reading_comp' ? 3 : 2
        }
      }
    } catch (e) {
      failed += batch.length
      lastError = (e as Error).message
      for (const it of batch) {
        scores[it.id] = it.type === 'sorting' || it.type === 'reading_comp' ? 3 : 2
      }
    }
    opts?.onProgress?.(Math.min(i + BATCH, items.length), items.length)
  }

  // 归一化到总分区间（等比缩放，取整）
  const sum = Object.values(scores).reduce((s, v) => s + v, 0)
  if (sum > 0 && sum < minTotal) {
    const scale = minTotal / sum
    for (const k of Object.keys(scores)) {
      scores[k] = Math.max(1, Math.round(scores[k] * scale))
    }
  } else if (sum > maxTotal) {
    const scale = maxTotal / sum
    for (const k of Object.keys(scores)) {
      scores[k] = Math.max(1, Math.round(scores[k] * scale))
    }
  }

  return { scores, mock: false, error: failed > 0 ? lastError : undefined }
}

/* ==================== 错题本：错题总结（知识点记背手册） ==================== */

/** 错题总结输入项 */
export interface WrongSummaryItem {
  section: string
  type: string
  question: string
  prompt?: string
  options?: string[]
  answer: unknown
  explanation?: string
  /** 错误次数（回顾答错不增加，仅记录进入错题本的次数） */
  wrongCount: number
}

/**
 * 错题总结：对一段时间内的错题做知识点分析，生成《错题知识点记背手册》。
 *
 * - 按知识点聚类，识别高频/反复错误点与难点
 * - 总结薄弱知识块
 * - 输出适合背诵的手册：用法/搭配/惯用语、句型句式+例句、词句解构、核心语法块、
 *   易混词汇语法辨析、熟词生义
 *
 * 未配置 AI 时返回 mock 示例，便于功能演示。
 */
export async function summarizeWrongQuestions(
  items: WrongSummaryItem[],
  periodText: string,
): Promise<string> {
  if (items.length === 0) {
    throw new Error('该时间段内没有错题')
  }
  if (!isAIConfigured()) {
    return mockWrongSummary(items, periodText)
  }
  const settings = loadAISettings()
  const systemPrompt =
    `你是资深日语 JLPT 教师与学习诊断专家。用户提供一段时间内的错题，请完成：\n` +
    `1. 按知识点聚类，识别高频错误点、反复出错的点与难点\n` +
    `2. 总结用户薄弱的知识块（如：动词活用不熟、助词混淆、N3 句型记忆模糊等）\n` +
    `3. 输出一份适合背诵记忆的《错题知识点记背手册》，要求：\n` +
    `   - 每个知识点：用法 / 搭配 / 惯用语、句型句式 + 例句（日语原句 + 中文）\n` +
    `   - 对易错的词句进行解构剖析（词源/构成/读音易错点）\n` +
    `   - 提炼核心语法块（接续、含义、使用场景）\n` +
    `   - 容易混淆的词汇或语法（列表/表格对比辨析）\n` +
    `   - 简单熟词却考了较生僻意思的（熟词生义）单独列出\n` +
    `4. 用中文讲解为主，日语原句保留\n` +
    `5. 使用 Markdown：### 分节、表格对比易混项、要点用 - 列表\n` +
    `6. 若题量少（≤5），则逐题精讲，不强行归纳`
  const userContent = JSON.stringify(
    { 错题时间段: periodText, 错题列表: items },
    null,
    1,
  )
  const content = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    settings.model,
  )
  const trimmed = content.trim()
  if (!trimmed) throw new Error('AI 返回总结为空')
  return trimmed
}

/** 未配置 AI 时的演示用 mock 总结 */
function mockWrongSummary(items: WrongSummaryItem[], periodText: string): string {
  const n = items.length
  const lines = items
    .slice(0, 5)
    .map(
      (it, i) =>
        `${i + 1}. ${it.question.replace(/<u>|<\/u>/g, '')}` +
        (it.explanation ? `\n   → ${it.explanation.replace(/\n/g, ' ').slice(0, 80)}` : ''),
    )
    .join('\n')
  return (
    `## 错题知识点记背手册（演示）\n\n` +
    `**时间段**：${periodText} · **题量**：${n} 道\n\n` +
    `> ⚠ 未配置 AI API（设置页填写端点与 Key 后自动启用真实总结）\n\n` +
    `### 涉及错题\n\n${lines}\n\n` +
    `### 薄弱知识块（示例）\n\n` +
    `- 词汇读音中的浊音 / 清音辨析\n` +
    `- 语法句型的接续与使用场景\n\n` +
    `### 记忆建议（示例）\n\n` +
    `- 先按知识点分类整理，再逐条背诵\n` +
    `- 混淆项用对比表格强化区分`
  )
}

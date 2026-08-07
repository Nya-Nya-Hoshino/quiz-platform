/**
 * AI 解析预生成 store
 *
 * 设计目标：做题过程中后台逐题预生成解析，避免用户等待。
 *
 * - 队列 + 并发限制（MAX_CONCURRENT=2），快速切题也不会打爆 API
 * - 同一题只请求一次（内存缓存，随会话存在）
 * - 题目自带 explanation 时直接使用，不发请求
 * - 未配置 AI 或请求失败 → 状态标记 error，UI 显示占位
 * - 同一 store 被 考试/练习/结果 页共享，交卷后结果页直接读取缓存
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Question } from '../types/question'
import { generateQuestionExplanation, isAIConfigured } from '../services/ai'

/** 单题解析状态 */
export interface ExplainState {
  /** idle 未开始 / loading 生成中 / done 完成 / error 失败 */
  status: 'idle' | 'loading' | 'done' | 'error'
  /** 解析文本（done 时可用） */
  text: string
}

/** 待生成题目快照（避免持有响应式 Question 引用） */
interface PendingItem {
  id: string
  section: string
  type: string
  question: string
  prompt?: string
  options?: string[]
  answer: unknown
}

const MAX_CONCURRENT = 2

export const useAIExplainStore = defineStore('aiExplain', () => {
  /** 题目 id → 解析状态 */
  const cache = ref<Record<string, ExplainState>>({})
  /** 是否有 AI 能力（用于 UI 判断是否显示生成中提示） */
  const available = ref(isAIConfigured())

  /** 已入队（在飞或等待）的题目 id */
  const queued = new Set<string>()
  /** 等待队列（先进先出） */
  const pendingQueue: string[] = []
  /** 题目快照表 */
  const items = new Map<string, PendingItem>()
  /** 当前并发请求数 */
  let activeCount = 0

  /** 取题快照 */
  function toItem(q: Question): PendingItem {
    return {
      id: q.id,
      section: q.section,
      type: q.type,
      question: q.question,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
    }
  }

  /** 从队列取下一个并执行（维护并发上限） */
  function pump(): void {
    while (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
      const id = pendingQueue.shift()!
      activeCount++
      void runItem(id)
    }
  }

  /** 执行单个题目请求 */
  async function runItem(id: string): Promise<void> {
    const item = items.get(id)
    try {
      const text = item ? await generateQuestionExplanation(item) : ''
      cache.value[id] = { status: 'done', text }
    } catch {
      cache.value[id] = { status: 'error', text: '' }
    } finally {
      queued.delete(id)
      items.delete(id)
      activeCount--
      pump()
    }
  }

  /**
   * 预生成某题解析（幂等：已完成/生成中/已在队列则跳过）。
   * 题目自带 explanation 时直接标记 done，不消耗 API。
   */
  function ensure(question: Question): void {
    const id = question.id
    const cur = cache.value[id]
    if (cur && (cur.status === 'done' || cur.status === 'loading')) return
    if (queued.has(id)) return
    // 题目自带解析：直接使用
    if (question.explanation) {
      cache.value[id] = { status: 'done', text: question.explanation }
      return
    }
    // 未配置 AI：标记 error（UI 显示占位，不发请求）
    if (!available.value) {
      cache.value[id] = { status: 'error', text: '' }
      return
    }
    cache.value[id] = { status: 'loading', text: '' }
    queued.add(id)
    items.set(id, toItem(question))
    pendingQueue.push(id)
    pump()
  }

  /** 批量预生成一组题（页面初始化时预热） */
  function ensureAll(questions: Question[]): void {
    for (const q of questions) ensure(q)
  }

  /** 读取解析：优先题目自带，其次缓存；未生成返回 undefined */
  function explanationOf(question: Question): string | undefined {
    if (question.explanation) return question.explanation
    const st = cache.value[question.id]
    return st?.status === 'done' ? st.text : undefined
  }

  /** 读取状态（UI 展示加载/失败） */
  function stateOf(questionId: string): ExplainState | undefined {
    return cache.value[questionId]
  }

  return {
    cache,
    available,
    ensure,
    ensureAll,
    explanationOf,
    stateOf,
  }
})

/**
 * 题目模糊检索服务（Fuzzy Question Search）
 *
 * 索引范围：站内全部可检索题目
 * 1. N3 自主练习卷（src/data/jlpt-user/*.json，经 parser 归一化）
 * 2. JLPT 真题 N2（src/data/jlpt/N2/*.json 整卷题组）
 *
 * 匹配策略（模糊检索）：
 * - 全文子串匹配（整句）：权重最高
 * - 分词命中：题干/提示/选项/解析/译文 各自加权
 * - 中日文子序列匹配：查询字按顺序出现在文本中即命中（如「並で」→「並んで」）
 * - 字符覆盖兜底：查询字多数出现在文本中
 *
 * 检索范围覆盖：题干、提示语、选项、解析、译文、阅读文章。
 */
import { fetchExam, fetchExamList, fetchJLPTExams, type JLPTExam } from './api'
import type { Exam } from '../types/exam'
import type { Question } from '../types/question'

export interface SearchHit {
  /** 题目 ID（自主练习卷为 questionId，JLPT 为 groupId） */
  id: string
  /** 来源类型 */
  kind: 'user-exam' | 'jlpt'
  /** 试卷 ID（自主练习卷）或 examTitle（JLPT） */
  examId: string
  /** 试卷标题 */
  examTitle: string
  /** JLPT 等级（N2/N3） */
  level?: string
  /** 板块/大题标题 */
  section: string
  /** 题型 */
  type?: string
  /** 题干原文 */
  question: string
  /** 提示语 */
  prompt?: string
  /** 选项原文 */
  options?: string[]
  /** 解析 */
  explanation?: string
  /** 阅读文章 */
  passage?: string
  /** JLPT 参考译文 */
  translation?: string
  /** 匹配得分 */
  score: number
  /** 命中的字段（展示用） */
  matchedFields: string[]
}

interface IndexItem {
  hit: Omit<SearchHit, 'score' | 'matchedFields'>
  /** 归一化全文（题干+提示+选项+解析+译文+文章） */
  blob: string
  /** 归一化题干 */
  question: string
  /** 归一化提示 */
  prompt: string
  /** 归一化选项 */
  options: string[]
  /** 归一化解析 */
  explanation: string
}

/** 归一化：去 HTML/加粗标记、小写、压缩空白 */
export function norm(s: string | undefined | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

let indexPromise: Promise<IndexItem[]> | null = null

/** 把一道归一化题目加入索引 */
function pushQuestion(
  items: IndexItem[],
  q: Question,
  opts: {
    kind: 'user-exam' | 'jlpt'
    examId: string
    examTitle: string
    level?: string
    section: string
    passage?: string
    translation?: string
  },
): void {
  const question = norm(q.question)
  const prompt = norm(q.prompt)
  const options = (q.options ?? []).map(norm)
  const explanation = norm(q.explanation)
  const passage = norm(opts.passage)
  const translation = norm(opts.translation)
  const blob = [question, prompt, ...options, explanation, passage, translation].join(' ')
  if (!blob) return
  items.push({
    hit: {
      id: q.id,
      kind: opts.kind,
      examId: opts.examId,
      examTitle: opts.examTitle,
      level: opts.level,
      section: opts.section,
      type: q.type,
      question: q.question,
      prompt: q.prompt,
      options: q.options,
      explanation: q.explanation,
      passage: opts.passage,
      translation: opts.translation,
    },
    blob,
    question,
    prompt,
    options,
    explanation,
  })
}

/** 构建全站题目索引（懒加载 + 缓存；首次搜索时一次性加载全部试卷） */
export async function buildSearchIndex(): Promise<IndexItem[]> {
  if (indexPromise) return indexPromise
  indexPromise = (async () => {
    const items: IndexItem[] = []

    // 1. N3 自主练习卷（含阅读文章）
    try {
      const list = await fetchExamList()
      for (const meta of list) {
        try {
          const exam: Exam = await fetchExam(meta.id)
          for (const q of exam.questions) {
            pushQuestion(items, q, {
              kind: 'user-exam',
              examId: exam.id,
              examTitle: exam.title,
              section: q.section || '综合',
            })
          }
          for (const g of exam.readingGroups) {
            for (const c of g.children) {
              pushQuestion(items, c, {
                kind: 'user-exam',
                examId: exam.id,
                examTitle: exam.title,
                section: c.section || '読解',
                passage: g.content,
              })
            }
          }
        } catch {
          /* 单卷失败不影响整体索引 */
        }
      }
    } catch {
      /* ignore */
    }

    // 2. JLPT 真题（N2 整卷题组）
    try {
      const jlpt = await fetchJLPTExams('N2')
      for (const e of jlpt) {
        pushJLPTExam(items, e)
      }
    } catch {
      /* ignore */
    }

    return items
  })()
  return indexPromise
}

/** JLPT 整卷 → 索引条目（题组 + 大题文章/图片说明作为题干上下文） */
function pushJLPTExam(items: IndexItem[], e: JLPTExam): void {
  for (const sec of e.sections) {
    const article = (sec as { article?: string }).article ?? ''
    for (const g of sec.groups) {
      const question = g.content
      const hitQuestion = article && !question.includes(article.slice(0, 20))
        ? `${question}\n\n【文章】${article}`
        : question
      items.push({
        hit: {
          id: g.id,
          kind: 'jlpt',
          examId: e.examTitle,
          examTitle: `${e.examTitle} JLPT ${e.level}`,
          level: e.level,
          section: sec.title,
          type: sec.kind,
          question: hitQuestion,
          options: g.options,
          explanation: g.explanation,
          translation: g.translation,
        },
        blob: [norm(question), norm(g.translation), ...g.options.map(norm), norm(g.explanation), norm(article)].join(' '),
        question: norm(question),
        prompt: '',
        options: g.options.map(norm),
        explanation: norm(g.explanation),
      })
    }
  }
}

/** 查询分词：空白 + 中日文标点切分（CJK 连续串保持为一个词） */
function tokenize(q: string): string[] {
  const n = norm(q)
  if (!n) return []
  return n
    .split(/[\s,，。、！？!?；;：:·•—–\-—()（）「」『』【】"'“”‘’~～]+/)
    .filter(Boolean)
}

/** 子序列匹配：needle 的字符按顺序出现在 haystack 中（模糊检索核心） */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  const nn = needle.length
  if (nn === 0) return true
  for (const c of haystack) {
    if (c === needle[i]) {
      i++
      if (i === nn) return true
    }
  }
  return i === nn
}

/** 对单个索引条目打分 */
function scoreItem(item: IndexItem, query: string, tokens: string[]): { score: number; fields: string[] } {
  const blob = item.blob
  if (!query || !blob) return { score: 0, fields: [] }
  let score = 0
  const fields = new Set<string>()

  // 整句精确子串（最高权重）
  if (blob.includes(query)) {
    score += 20
    if (item.question.includes(query)) fields.add('题干')
    else if (item.options.some((o) => o.includes(query))) fields.add('选项')
    else if (item.prompt.includes(query)) fields.add('提示')
    else if (item.explanation.includes(query)) fields.add('解析')
    else fields.add('全文')
  }

  for (const t of tokens) {
    if (!t) continue
    if (blob.includes(t)) {
      score += 10
      if (item.question.includes(t)) {
        score += 6
        fields.add('题干')
      }
      if (item.options.some((o) => o.includes(t))) {
        score += 3
        fields.add('选项')
      }
      if (item.prompt.includes(t)) {
        score += 2
        fields.add('提示')
      }
      if (item.explanation.includes(t)) {
        score += 1
        fields.add('解析')
      }
    } else if (t.length >= 2) {
      // 模糊：子序列匹配（如「並で」→「並んで」）
      if (isSubsequence(t, blob)) {
        score += 6
        fields.add('模糊命中')
      }
      // 模糊：字符覆盖（多数查询字符分散出现在文本中）
      const chars = [...t]
      const present = chars.filter((c) => blob.includes(c)).length
      if (present >= Math.min(3, chars.length) && present / chars.length >= 0.6) {
        score += 3
        fields.add('模糊命中')
      }
    }
  }
  return { score, fields: [...fields] }
}

/** 模糊检索：返回按相关度排序的题目 */
export async function searchQuestions(rawQuery: string, limit = 50): Promise<SearchHit[]> {
  const query = norm(rawQuery)
  if (!query) return []
  const tokens = tokenize(rawQuery)
  if (!tokens.length) return []
  const items = await buildSearchIndex()
  const results: SearchHit[] = []
  for (const item of items) {
    const { score, fields } = scoreItem(item, query, tokens)
    if (score <= 0) continue
    results.push({
      ...item.hit,
      score,
      matchedFields: fields,
    })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

/** 清空缓存（数据热更新后调用） */
export function resetSearchIndex(): void {
  indexPromise = null
}

/* ===== 高亮 ===== */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 高亮命中词（返回带 <mark> 的安全 HTML；同时保留原文 <u> 下划线语义） */
export function highlightText(text: string | undefined | null, query: string, tokens: string[]): string {
  const raw = (text ?? '').replace(/\*\*/g, '')
  let t = escapeHtml(raw)
  const patterns = [query, ...tokens]
    .filter((p) => p && p.length >= 1)
    .sort((a, b) => b.length - a.length)
  if (!patterns.length) return t
  const re = new RegExp(`(${patterns.map((p) => escapeRegExp(escapeHtml(p))).join('|')})`, 'gi')
  return t.replace(re, '<mark>$1</mark>')
}

/** 题干摘要（去掉标记，供列表展示） */
export function snippet(text: string | undefined | null, max = 90): string {
  const s = (text ?? '').replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

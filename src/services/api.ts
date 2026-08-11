/**
 * 数据访问层（API 抽象层）
 *
 * 当前模式：LOCAL —— 从本地内置题库文件加载（public/src 打包进前端）
 * 切换到真实后端时：修改 API_MODE 为 'remote'，并配置 API_BASE，
 * 无需改动上层业务代码（stores/views 只依赖本模块导出的函数签名）。
 */
import type { Exam } from '../types/exam'
import { parseExamRaw } from '../utils/parser'

/** 数据源模式 */
export type ApiMode = 'local' | 'remote'

/** 运行时可切换的数据源配置 */
export const apiConfig: { mode: ApiMode; base: string } = {
  mode: (import.meta.env.VITE_API_MODE as ApiMode | undefined) ?? 'local',
  base: import.meta.env.VITE_API_BASE ?? '/api',
}

// 练习卷：仅 eager 加载轻量清单（manifest），卷数据按需动态 import（避免首屏加载全部卷）
interface ExamMetaEntry {
  id: string
  file: string
  title: string
  timeLimit: number
  passScore: number
  totalScore: number
  totalQuestions: number
  sections: { name: string; count: number }[]
}
const examManifest = (import.meta.glob('../data/jlpt-user/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, { exams: ExamMetaEntry[] }>)[
  '../data/jlpt-user/manifest.json'
] ?? { exams: [] as ExamMetaEntry[] }
const examLoaders = import.meta.glob('../data/jlpt-user/*.json', {
  import: 'default',
}) as Record<string, () => Promise<Record<string, unknown>>>


/** JLPT 真题类型 */
export interface JLPTExam {
  level: 'N2' | 'N3'
  examTitle: string
  examId: string
  sections: JLPTExamSection[]
}

export interface JLPTExamSection {
  title: string
  kind: 'vocab' | 'grammar' | 'reading' | 'comprehension'
  groups: JLPTQuestionGroup[]
}

export interface JLPTQuestionGroup {
  id: string
  content: string
  options: string[]
  answer: number | null
  explanation: string
  translation: string
}

// JLPT 真题文件（N2/N3，按整卷呈现）—— 懒加载：进入真题库页才按 level 加载
const localJLPTCache: { n2: JLPTExam[]; n3: JLPTExam[] } = { n2: [], n3: [] }
const jlptImporters = {
  n2: import.meta.glob('../data/jlpt/N2/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>,
  n3: import.meta.glob('../data/jlpt/N3/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>,
}

/** 获取 JLPT 真题卷列表（整卷，不拆散） */
export async function fetchJLPTExams(level: 'N2' | 'N3'): Promise<JLPTExam[]> {
  if (apiConfig.mode === 'local') {
    const key = level === 'N2' ? 'n2' : 'n3'
    if (localJLPTCache[key].length === 0) {
      const loaded = await Promise.all(
        Object.values(jlptImporters[key]).map((loader) => loader()),
      )
      localJLPTCache[key] = loaded.map((raw) => raw as JLPTExam)
      // 按考试时间排序（2018年7月 → 2026年7月）
      localJLPTCache[key].sort((a, b) => {
        const ta = a.examTitle.match(/(\d{4})年(\d+)月/)
        const tb = b.examTitle.match(/(\d{4})年(\d+)月/)
        if (!ta || !tb) return 0
        return (Number(ta[1]) * 12 + Number(ta[2])) - (Number(tb[1]) * 12 + Number(tb[2]))
      })
    }
    return localJLPTCache[key]
  }
  return request(`/jlpt/${level}`)
}

/** 统一请求封装（远程模式）；本地模式直接解析 */
async function request<T>(path: string): Promise<T> {
  if (apiConfig.mode === 'local') {
    throw new Error(`本地模式不支持远程请求: ${path}`)
  }
  const res = await fetch(`${apiConfig.base}${path}`)
  if (!res.ok) {
    throw new Error(`请求失败 ${res.status}: ${path}`)
  }
  return (await res.json()) as T
}

/** 获取试卷列表（仅元信息） */
export async function fetchExamList(): Promise<{ id: string; title: string; timeLimit: number; passScore: number; totalScore: number; totalQuestions: number; sections: Exam['sections'] }[]> {
  if (apiConfig.mode === 'local') {
    // 直接读轻量清单（2.9KB），无需解析全部卷数据
    const list = examManifest.exams.map((e) => ({
      id: e.id,
      title: e.title,
      timeLimit: e.timeLimit,
      passScore: e.passScore,
      totalScore: e.totalScore,
      totalQuestions: e.totalQuestions,
      sections: e.sections,
    }))
    return list.sort((a, b) => Number(a.id) - Number(b.id))
  }
  return request('/exams')
}

/** 获取完整试卷 */
export async function fetchExam(examId: string): Promise<Exam> {
  if (apiConfig.mode === 'local') {
    // 兼容数字别名：/practice/1 → user-1（早期第1-4套 id 为 user-N）
    const aliasMap: Record<string, string> = { '1': 'user-1', '2': 'user-2', '3': 'user-3', '4': 'user-4' }
    const lookupId = aliasMap[String(examId)] ?? String(examId)
    const meta = examManifest.exams.find((e) => String(e.id) === lookupId)
    if (!meta) {
      throw new Error(`未找到试卷: ${examId}`)
    }
    // 按需加载该卷 JSON（独立 chunk）
    const loader = examLoaders[`../data/jlpt-user/${meta.file}`]
    if (!loader) {
      throw new Error(`试卷数据加载器不存在: ${examId}`)
    }
    const raw = await loader()
    // 注入真实 exam id（数据文件可能没有 testId 字段，parseExamRaw 会退回 'exam'，
    // 导致进度存档 key 用 route id（practice:user-1）而恢复时查 practice:exam 永远失败）
    return parseExamRaw({ ...raw, id: lookupId })
  }
  const raw = await request<Record<string, unknown>>(`/exam/${examId}`)
  return parseExamRaw(raw)
}

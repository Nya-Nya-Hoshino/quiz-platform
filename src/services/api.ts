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

// 本地练习卷清单（用户整理的 N3 练习，4 份）
const localExamModules = import.meta.glob('../data/jlpt-user/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, unknown>>


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

// JLPT 真题文件（N2/N3，按整卷呈现）
const localJLPTCache: { n2: JLPTExam[]; n3: JLPTExam[] } = { n2: [], n3: [] }
const jlptImporters = {
  n2: import.meta.glob('../data/jlpt/N2/*.json', { eager: true, import: 'default' }),
  n3: import.meta.glob('../data/jlpt/N3/*.json', { eager: true, import: 'default' }),
}

/** 获取 JLPT 真题卷列表（整卷，不拆散） */
export async function fetchJLPTExams(level: 'N2' | 'N3'): Promise<JLPTExam[]> {
  if (apiConfig.mode === 'local') {
    const key = level === 'N2' ? 'n2' : 'n3'
    if (localJLPTCache[key].length === 0) {
      localJLPTCache[key] = Object.values(jlptImporters[key]).map((raw) =>
        raw as unknown as JLPTExam,
      )
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
    const list = Object.values(localExamModules).map((raw) => {
      const exam = parseExamRaw(raw)
      return {
        id: exam.id,
        title: exam.title,
        timeLimit: exam.timeLimit,
        passScore: exam.passScore,
        totalScore: exam.totalScore,
        totalQuestions: exam.totalQuestions,
        sections: exam.sections,
      }
    })
    // 按 testId 数字排序
    return list.sort((a, b) => Number(a.id) - Number(b.id))
  }
  return request('/exams')
}

/** 获取完整试卷 */
export async function fetchExam(examId: string): Promise<Exam> {
  if (apiConfig.mode === 'local') {
    const raw = Object.entries(localExamModules).find(
      ([, v]) => String(v.testId ?? v.id) === String(examId),
    )?.[1]
    if (!raw) {
      throw new Error(`未找到试卷: ${examId}`)
    }
    return parseExamRaw(raw)
  }
  const raw = await request<Record<string, unknown>>(`/exam/${examId}`)
  return parseExamRaw(raw)
}

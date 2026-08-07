/**
 * 通用题型定义（Question Schema）
 *
 * 设计目标：
 * - 前端不依赖后端具体 JSON 结构，所有原始数据经 parser 归一化为本 Schema
 * - 支持题型：单选题、多选题、判断题、填空题、简答题、排序题、阅读理解综合题
 */

/** 标准题型枚举 */
export type QuestionType =
  | 'single_choice' // 单选题
  | 'multiple_choice' // 多选题
  | 'judge' // 判断题
  | 'fill_blank' // 填空题
  | 'short_answer' // 简答题
  | 'sorting' // 排序题
  | 'reading' // 阅读理解综合题（包含 children）

/** 用户答案的统一表示 */
export type UserAnswer =
  | number // single_choice：选项索引（0-based）
  | number[] // multiple_choice / sorting：选项索引数组
  | boolean // judge：true/false
  | string[] // fill_blank：每空一个字符串
  | string // short_answer：文本

/** 标准答案的统一表示（与 UserAnswer 同构） */
export type StandardAnswer = UserAnswer

/** 题目基础字段 */
export interface Question {
  /** 全局唯一 ID，格式 `{testId}-{questionId}`（子题则为 `{testId}-{parentId}-{childId}`） */
  id: string
  /** 题型 */
  type: QuestionType
  /** 所属板块，如「文字・語彙」「文法」「読解」 */
  section: string
  /** 难度标注，如 N5 / N4 */
  difficulty?: string
  /** 分值 */
  score: number
  /** 题干（含下划线标记 <u>…</u> 或填空标记） */
  question: string
  /** 附加提示，如「下線部の読み方はどれですか。」 */
  prompt?: string
  /** 选项（选择题/排序题；阅读理解子题可无） */
  options?: string[]
  /** 标准答案 */
  answer: StandardAnswer
  /** 解析内容 */
  explanation?: string
  /** 是否为阅读理解子题（共享文章） */
  isReadingChild?: boolean
  /** 所属文章 ID（阅读理解子题使用） */
  passageId?: string
  /** 排序题：题干模板中（★）对应的选项索引 */
  starIndex?: number
}

/** 阅读理解综合题（文章 + 若干子题） */
export interface ReadingGroup {
  id: string
  /** 文章标题（可选） */
  title?: string
  /** 文章正文 */
  content: string
  /** 子题 */
  children: Question[]
  /** 整组分值（各子题分值之和） */
  score: number
}

/** 判断题选项常量 */
export const JUDGE_OPTIONS = ['正确', '错误'] as const

/** 题型展示名 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  judge: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
  sorting: '排序题',
  reading: '阅读理解',
}

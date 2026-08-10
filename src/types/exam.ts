/**
 * 试卷模型定义
 */
import type { Question, ReadingGroup } from './question'

/** 试卷板块定义 */
export interface ExamSection {
  /** 板块名，如「文字・語彙」 */
  name: string
  /** 板块题目数量 */
  count: number
}

/**
 * 标准化试卷。
 * 由原始 JSON（后端接口 / 本地题库文件）经 parser 转换而来。
 */
export interface Exam {
  /** 试卷 ID（原题组中为 testId） */
  id: string
  /** 试卷标题 */
  title: string
  /** 限时（分钟） */
  timeLimit: number
  /** 及格分 */
  passScore: number
  /** 总分 */
  totalScore: number
  /** 题目总数 */
  totalQuestions: number
  /** 板块列表 */
  sections: ExamSection[]
  /** 学科标识（用于 AI Prompt 切换），默认 japanese */
  subject: string
  /** 独立题目（不含阅读理解子题） */
  questions: Question[]
  /** 阅读理解文章组（按文章分组） */
  readingGroups: ReadingGroup[]
  /** 原文元数据（保留原始 JSON 便于调试/扩展） */
  raw?: unknown
}

/** 题目索引条目：用于在试卷内定位题目（含阅读子题） */
export interface QuestionRef {
  /** 题目 ID */
  id: string
  /** 是阅读子题时，所属 ReadingGroup id；否则为空 */
  groupId?: string
}

/** 考试进行中的单题作答状态 */
export interface AnswerRecord {
  /** 题目 ID */
  questionId: string
  /** 用户答案 */
  userAnswer: UserAnswerValue
  /** 是否已作答 */
  answered: boolean
  /** 作答耗时（秒） */
  duration: number
}

/** 宽松的用户答案值类型（序列化友好） */
export type UserAnswerValue =
  | number
  | number[]
  | boolean
  | string[]
  | string
  | null

/** 考试结果单题详情 */
export interface ResultItem {
  questionId: string
  question: Question
  userAnswer: UserAnswerValue
  correctAnswer: StandardAnswerValue
  isCorrect: boolean
  score: number
  groupId?: string
}

/** 宽松标准答案值类型 */
export type StandardAnswerValue =
  | number
  | number[]
  | boolean
  | string[]
  | string

/** 考试/练习完整结果 */
export interface ExamResult {
  /** 试卷 ID */
  examId: string
  /** 试卷标题 */
  examTitle: string
  /** 模式：exam 考试 / practice 练习 */
  mode: 'exam' | 'practice'
  /** 总分 */
  totalScore: number
  /** 得分 */
  earnedScore: number
  /** 题目总数 */
  totalQuestions: number
  /** 正确题数 */
  correctCount: number
  /** 错误题数 */
  wrongCount: number
  /** 正确率（0-1） */
  accuracy: number
  /** 总耗时（秒） */
  duration: number
  /** 是否通过（考试模式） */
  passed?: boolean
  /** 完成时间戳 */
  finishedAt: number
  /** 各题详情 */
  items: ResultItem[]
}

/** 历史记录条目（持久化到 localStorage） */
export interface HistoryRecord {
  id: string
  examId: string
  examTitle: string
  mode: 'exam' | 'practice'
  earnedScore: number
  totalScore: number
  accuracy: number
  duration: number
  passed?: boolean
  finishedAt: number
}

/** 错题题目快照（自包含，单题练习/回顾无需重新加载试卷） */
export interface WrongQuestionSnapshot {
  /** 板块，如 文字・語彙 */
  section: string
  /** 题型（single_choice / sorting / reading_comp 等原始题型） */
  type: string
  /** JLPT 等级（N3 / N4 / N5） */
  difficulty?: string
  /** 题干 */
  question: string
  /** 附加提示 */
  prompt?: string
  /** 选项 */
  options?: string[]
  /** 标准答案 */
  answer: unknown
  /** 解析 */
  explanation?: string
  /** 阅读文章内容（阅读子题） */
  passage?: string
  /** 分值 */
  score: number
  /** ★ 排序题：★ 所在横线位置（1-4） */
  starIndex?: number
}

/** 错题记录条目（持久化到 localStorage） */
export interface WrongRecord {
  /** 题目唯一 ID */
  questionId: string
  /** 题目快照 */
  snapshot: WrongQuestionSnapshot
  /** 错误次数（进入错题本的次数，回顾答错不增加） */
  wrongCount: number
  /** 最后错误时间戳 */
  lastWrongAt: number
  /** 错题产生时间戳（艾宾浩斯周期基准日） */
  createdAt: number
  /** 最近一次用户答案 */
  lastAnswer?: UserAnswerValue
  /** 已完成的回顾次数（0-5） */
  reviewCount: number
  /** 当前待完成周期下标（0-4，对应间隔 1/2/4/7/15 天） */
  currentCycle: number
  /** 当前周期到期时间戳 */
  nextDueAt: number
  /** 是否已熟练（完成全部 5 个周期） */
  completed: boolean
  /** 上次回顾时间 */
  lastReviewedAt?: number
  /** 上次回顾结果 */
  lastReviewResult?: 'correct' | 'wrong'
}

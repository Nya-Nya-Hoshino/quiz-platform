/**
 * 练习模式状态管理（Practice Mode）
 *
 * 特点：提交后立即判分、显示标准答案与解析，累计积分与统计。
 */
import { defineStore } from 'pinia'
import { clearProgress, hasProgress, loadProgress, saveProgress } from '../utils/progress'
import { computed, ref } from 'vue'
import type { Exam, QuestionRef, UserAnswerValue } from '../types/exam'
import { fetchExam } from '../services/api'
import { buildQuestionRefs, findQuestion } from '../utils/parser'
import { isAnswered, isCorrect } from '../utils/judge'
import { useHistoryStore } from './history'
import { useWrongBookStore } from './wrongBook'

interface PracticeItemState {
  questionId: string
  userAnswer: UserAnswerValue | null
  submitted: boolean
  isCorrect: boolean
  correctAnswer: UserAnswerValue
}

/** 当日统计（持久化） */
interface DailyStat {
  date: string
  done: number
  correct: number
  wrong: number
  points: number
}

const DAILY_KEY = 'quiz-platform:daily-stat'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadDaily(): DailyStat {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DailyStat
      if (parsed.date === todayStr()) return parsed
    }
  } catch { /* ignore */ }
  return { date: todayStr(), done: 0, correct: 0, wrong: 0, points: 0 }
}

export const usePracticeStore = defineStore('practice', () => {
  const exam = ref<Exam | null>(null)
  const refs = ref<QuestionRef[]>([])
  const currentIndex = ref(0)
  /** 打乱后的题序（练习默认顺序，可随机） */
  const order = ref<number[]>([])
  const states = ref<Record<string, PracticeItemState>>({})
  const loading = ref(false)
  const error = ref('')
  /** 累计积分 */
  const points = ref(0)
  const daily = ref<DailyStat>(loadDaily())

  const total = computed(() => order.value.length)
  const currentId = computed(() => {
    const idx = order.value[currentIndex.value]
    if (idx === undefined) return ''
    return refs.value[idx]?.id ?? ''
  })
  const progress = computed(() => (total.value ? Math.round((currentIndex.value / total.value) * 100) : 0))
  const correctCount = computed(() => refs.value.filter((r) => states.value[r.id]?.submitted && states.value[r.id].isCorrect).length)

  /** 开始练习：examId + 可选随机顺序 */
  async function startPractice(examId: string, shuffle = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const e = await fetchExam(examId)
      exam.value = e
      refs.value = buildQuestionRefs(e)
      order.value = refs.value.map((_, i) => i)
      if (shuffle) {
        for (let i = order.value.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order.value[i], order.value[j]] = [order.value[j], order.value[i]]
        }
      }
      states.value = {}
      currentIndex.value = 0
      // 尝试恢复上次进度（有存档且题序一致时）
      restoreFromSaved(e.id)
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 使用已组卷的原始数据直接开始练习 */
  async function startPracticeWithRaw(raw: Record<string, unknown>, shuffle = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const { parseExamRaw } = await import('../utils/parser')
      const rawWithId = { ...raw, testId: raw.testId ?? 'auto' }
      const e = parseExamRaw(rawWithId)
      exam.value = e
      refs.value = buildQuestionRefs(e)
      order.value = refs.value.map((_, i) => i)
      if (shuffle) {
        for (let i = order.value.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order.value[i], order.value[j]] = [order.value[j], order.value[i]]
        }
      }
      states.value = {}
      currentIndex.value = 0
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  /* ===== 进度持久化 ===== */

  /** 保存当前进度 */
  function saveProgressNow(): void {
    if (!exam.value) return
    saveProgress('practice', exam.value.id, {
      order: order.value,
      currentIndex: currentIndex.value,
      states: states.value,
      points: points.value,
    })
  }

  /** 是否存在存档 */
  function hasSavedProgress(): boolean {
    return exam.value ? hasProgress('practice', exam.value.id) : false
  }

  /** 尝试恢复存档，返回是否恢复成功 */
  function restoreFromSaved(examId: string): boolean {
    const saved = loadProgress<{
      order: number[]
      currentIndex: number
      states: Record<string, PracticeItemState>
      points: number
    }>('practice', examId)
    if (!saved) return false
    const savedOrder = saved.payload.order ?? []
    // 题序一致性检查：存档题序长度与当前题数一致才恢复
    if (savedOrder.length !== order.value.length) return false
    // 序号必须在合法范围
    if (saved.payload.currentIndex < 0 || saved.payload.currentIndex >= order.value.length) {
      saved.payload.currentIndex = 0
    }
    order.value = savedOrder
    states.value = saved.payload.states ?? {}
    currentIndex.value = saved.payload.currentIndex
    points.value = saved.payload.points ?? 0
    return true
  }

  /** 放弃存档（重新开始/完成时调用） */
  function discardProgress(): void {
    if (exam.value) clearProgress('practice', exam.value.id)
  }

  /** 设置当前答案（未提交前可改） */
  function setAnswer(questionId: string, value: UserAnswerValue): void {
    const s = states.value[questionId]
    if (s?.submitted) return
    states.value[questionId] = { ...s, questionId, userAnswer: value, submitted: false } as PracticeItemState
    saveProgressNow()
  }

  /** 当前题是否已作答 */
  function hasAnswer(): boolean {
    const id = currentId.value
    return Boolean(states.value[id] && isAnswered(states.value[id].userAnswer as never))
  }

  /** 提交当前题：立即判分 + 累计积分 + 错题入库 + 更新统计 */
  function submitCurrent(): { isCorrect: boolean; correctAnswer: UserAnswerValue } {
    const id = currentId.value
    const q = findQuestion(exam.value!, id)
    if (!q) throw new Error('题目不存在')
    const s = states.value[id]
    if (!s || !isAnswered(s.userAnswer as never)) {
      throw new Error('请先作答')
    }
    const correct = isCorrect(q, s.userAnswer as never)
    const updated: PracticeItemState = {
      questionId: id,
      userAnswer: s.userAnswer,
      submitted: true,
      isCorrect: correct,
      correctAnswer: q.answer as UserAnswerValue,
    }
    states.value[id] = updated

    if (correct) {
      points.value += q.score
      daily.value.correct += 1
    } else {
      daily.value.wrong += 1
      // 错题入库（快照式）
      const wrongBook = useWrongBookStore()
      const group = exam.value?.readingGroups.find((g) =>
        g.children.some((c) => c.id === id),
      )
      wrongBook.recordWrong(q, {
        passage: group?.content,
        lastAnswer: s.userAnswer as never,
      })
    }
    daily.value.done += 1
    daily.value.points = points.value
    persistDaily()
    saveProgressNow()
    return { isCorrect: correct, correctAnswer: q.answer as UserAnswerValue }
  }

  function persistDaily(): void {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily.value))
  }

  function next(): void {
    if (currentIndex.value < total.value - 1) {
      currentIndex.value++
      saveProgressNow()
    }
  }
  function prev(): void {
    if (currentIndex.value > 0) {
      currentIndex.value--
      saveProgressNow()
    }
  }

  /** 完成练习 → 生成并保存历史记录（可选） */
  function finishPractice(): void {
    if (!exam.value) return
    discardProgress()
    const history = useHistoryStore()
    history.addRecord({
      examId: exam.value.id,
      examTitle: exam.value.title,
      mode: 'practice',
      earnedScore: points.value,
      totalScore: exam.value.totalScore,
      accuracy: total.value ? correctCount.value / total.value : 0,
      duration: 0,
      finishedAt: Date.now(),
    })
  }

  function reset(): void {
    discardProgress()
    exam.value = null
    refs.value = []
    order.value = []
    states.value = {}
    currentIndex.value = 0
    points.value = 0
  }

  return {
    exam, refs, currentIndex, states, loading, error, points, daily,
    total, currentId, progress, correctCount,
    startPractice, startPracticeWithRaw, setAnswer, hasAnswer, submitCurrent, next, prev, finishPractice, reset,
    hasSavedProgress, restoreFromSaved, discardProgress,
  }
})

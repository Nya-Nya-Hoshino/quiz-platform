/**
 * 考试模式状态管理（Exam Mode）
 *
 * 流程：加载试卷 → 逐题作答 → 提交 → 生成结果
 * 特点：作答过程中不显示答案，全部完成后进入 Result 页。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AnswerRecord, Exam, ExamResult, QuestionRef, ResultItem, UserAnswerValue } from '../types/exam'
import { fetchExam } from '../services/api'
import { buildQuestionRefs, findQuestion } from '../utils/parser'
import { isAnswered, isCorrect } from '../utils/judge'

export const useExamStore = defineStore('exam', () => {
  const exam = ref<Exam | null>(null)
  const refs = ref<QuestionRef[]>([])
  const currentIndex = ref(0)
  const answers = ref<Record<string, AnswerRecord>>({})
  const loading = ref(false)
  const error = ref('')
  const startTime = ref(0)
  const finished = ref(false)
  const result = ref<ExamResult | null>(null)

  /** 当前题目 ID */
  const currentId = computed(() => refs.value[currentIndex.value]?.id ?? '')
  const total = computed(() => refs.value.length)
  const progress = computed(() => (total.value ? Math.round((currentIndex.value / total.value) * 100) : 0))
  /** 已完成作答数 */
  const answeredCount = computed(() => refs.value.filter((r) => answers.value[r.id]?.answered).length)

  /** 加载试卷并开始考试 */
  async function startExam(examId: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const e = await fetchExam(examId)
      exam.value = e
      refs.value = buildQuestionRefs(e)
      answers.value = {}
      currentIndex.value = 0
      startTime.value = Date.now()
      finished.value = false
      result.value = null
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 使用已组卷的原始数据直接开始考试（无需远程加载） */
  async function startExamWithRaw(raw: Record<string, unknown>): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const { parseExamRaw } = await import('../utils/parser')
      const rawWithId = { ...raw, testId: 'auto' }
      const e = parseExamRaw(rawWithId)
      exam.value = e
      refs.value = buildQuestionRefs(e)
      answers.value = {}
      currentIndex.value = 0
      startTime.value = Date.now()
      finished.value = false
      result.value = null
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 记录某题答案 */
  function setAnswer(questionId: string, value: UserAnswerValue): void {
    const prev = answers.value[questionId]
    answers.value[questionId] = {
      questionId,
      userAnswer: value,
      answered: isAnswered(value as never),
      duration: prev?.duration ?? 0,
    }
  }

  /** 累计某题作答时长 */
  function addDuration(questionId: string, seconds: number): void {
    if (answers.value[questionId]) {
      answers.value[questionId].duration += seconds
    }
  }

  function next(): void {
    if (currentIndex.value < total.value - 1) currentIndex.value++
  }
  function prev(): void {
    if (currentIndex.value > 0) currentIndex.value--
  }
  function goTo(index: number): void {
    if (index >= 0 && index < total.value) currentIndex.value = index
  }

  /** 计算耗时（秒） */
  function elapsedSeconds(): number {
    if (!startTime.value) return 0
    return Math.floor((Date.now() - startTime.value) / 1000)
  }

  /** 提交并生成结果 */
  function submit(): ExamResult {
    if (!exam.value) throw new Error('试卷未加载')
    const duration = elapsedSeconds()
    const items: ResultItem[] = refs.value.map((ref) => {
      const question = findQuestion(exam.value!, ref.id)!
      const record = answers.value[ref.id]
      const userAnswer = record?.userAnswer ?? null
      const correct = isAnswered(record?.userAnswer as never) && isCorrect(question, record?.userAnswer as never)
      return {
        questionId: ref.id,
        question,
        userAnswer,
        correctAnswer: question.answer as never,
        isCorrect: correct,
        score: correct ? question.score : 0,
        groupId: ref.groupId,
      }
    })

    const earnedScore = items.reduce((s, i) => s + i.score, 0)
    const correctCount = items.filter((i) => i.isCorrect).length
    const res: ExamResult = {
      examId: exam.value.id,
      examTitle: exam.value.title,
      mode: 'exam',
      totalScore: exam.value.totalScore,
      earnedScore,
      totalQuestions: total.value,
      correctCount,
      wrongCount: total.value - correctCount,
      accuracy: total.value ? correctCount / total.value : 0,
      duration,
      passed: earnedScore >= exam.value.passScore,
      finishedAt: Date.now(),
      items,
    }
    result.value = res
    finished.value = true
    return res
  }

  /** 重置（重新考试） */
  function reset(): void {
    answers.value = {}
    currentIndex.value = 0
    startTime.value = 0
    finished.value = false
    result.value = null
  }

  return {
    exam, refs, currentIndex, answers, loading, error, startTime, finished, result,
    currentId, total, progress, answeredCount,
    startExam, startExamWithRaw, setAnswer, addDuration, next, prev, goTo, submit, reset, elapsedSeconds,
  }
})

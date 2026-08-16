<script setup lang="ts">
/**
 * 考试模式页面
 * 流程：加载试卷 → 逐题作答 → 全部完成交卷 → 跳转 Result 页
 * 特点：作答过程中不显示答案
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExamStore } from '../stores/exam'
import { findQuestion, findReadingGroup } from '../utils/parser'
import { hasProgress as hasSavedProgress } from '../utils/progress'
import ExamProgress from '../components/ExamProgress.vue'
import QuestionCard from '../components/QuestionCard.vue'
import AnswerPanel from '../components/AnswerPanel.vue'
import AIHelper from '../components/AIHelper.vue'
import { useHistoryStore } from '../stores/history'
import { useWrongBookStore } from '../stores/wrongBook'

const route = useRoute()
const router = useRouter()
const examStore = useExamStore()
const historyStore = useHistoryStore()
const wrongBook = useWrongBookStore()

const aiShow = ref(false)
/** 每题的 AI 上下文缓存 */
const aiContext = ref('')

/** 是否有可恢复的考试存档 */
const restored = ref(false)
const restarting = ref(false)

onMounted(async () => {
  const id = route.params.id as string
  if (!examStore.exam || examStore.exam.id !== id) {
    const hadSaved = hasSavedProgress('exam', id) // start 前检测（直接读 localStorage）
    try {
      await examStore.startExam(id)
      // 搜索深链：?q=questionId → 直接跳到该题
      const q = route.query.q as string | undefined
      if (q) {
        const idx = examStore.refs.findIndex((r) => r.id === q)
        if (idx >= 0) examStore.currentIndex = idx
      }
      if (hadSaved && !route.query.q) {
      restored.value = true
      // 提示仅显示 1.2s 后自动隐藏
      window.setTimeout(() => (restored.value = false), 1200)
    }
    } catch {
      router.replace('/')
    }
  }
})

/** 重新开始：丢弃存档并重新加载 */
async function restartExam(): Promise<void> {
  restarting.value = true
  examStore.discardProgress()
  try {
    const id = route.params.id as string
    await examStore.startExam(id)
    restored.value = false
  } finally {
    restarting.value = false
  }
}

const currentQuestion = computed(() => {
  if (!examStore.exam || !examStore.currentId) return null
  return findQuestion(examStore.exam, examStore.currentId)
})

const currentPassage = computed(() => {
  if (!examStore.exam || !examStore.currentId) return undefined
  return findReadingGroup(examStore.exam, examStore.currentId)?.content
})

/** 当前题作答记录 */
const currentRecord = computed(() => examStore.answers[examStore.currentId])

/** 已作答题号集合（答题卡用） */
const answeredSet = computed(() => {
  const set = new Set<number>()
  examStore.refs.forEach((ref, idx) => {
    if (examStore.answers[ref.id]?.answered) set.add(idx)
  })
  return set
})

/** 当前用户答案（v-model 绑定） */
const currentAnswer = computed<unknown>({
  get: () => examStore.answers[examStore.currentId]?.userAnswer ?? null,
  set: (v) => {
    if (examStore.currentId) examStore.setAnswer(examStore.currentId, v as never)
  },
})

/** 组装 AI 上下文 */
function buildAIContext(): string {
  const q = currentQuestion.value
  if (!q) return ''
  const passage = currentPassage.value
  const parts = [
    `【试卷】${examStore.exam?.title}`,
    `【题型】${q.type}${q.section ? `（${q.section}）` : ''}`,
    passage ? `【阅读文章】\n${passage}` : '',
    `【题目】\n${q.question}`,
    q.prompt ? `【提示】${q.prompt}` : '',
    q.options?.length ? `【选项】\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
    `【用户答案】${currentAnswer.value === null || currentAnswer.value === undefined ? '未作答' : JSON.stringify(currentAnswer.value)}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

function openAI(): void {
  aiContext.value = buildAIContext()
  aiShow.value = true
}

/** 交卷 */
async function doSubmit(): Promise<void> {
  const result = examStore.submit()
  // 错题入库（快照式：只记题目内容/题型/等级，不记来源）
  for (const item of result.items) {
    if (!item.isCorrect) {
      const group = examStore.exam?.readingGroups.find((g) =>
        g.children.some((c) => c.id === item.questionId),
      )
      wrongBook.recordWrong(item.question, {
        passage: group?.content,
        lastAnswer: item.userAnswer as never,
      })
    }
  }
  historyStore.addFromResult(result)
  router.push({ path: '/result', query: { from: 'exam' } })
}

/** 交卷确认对话框 */
const showConfirm = ref(false)

function submitClicked(): void {
  showConfirm.value = true
}


</script>

<template>
  <div v-if="examStore.loading" class="loading-block"><span class="loading-spinner loading-lg" />试卷加载中…</div>

  <div v-else-if="examStore.exam" class="mx-auto max-w-3xl">
    <!-- 顶部信息条 -->
    <div class="mb-4">
      <h1 class="text-lg font-semibold text-gray-900">{{ examStore.exam.title }}</h1>
      <p class="text-xs text-gray-400">考试模式 · 交卷前不显示答案</p>
    </div>

    <!-- 恢复进度提示 -->
    <div
      v-if="restored && !restarting"
      class="mb-4 flex items-center justify-between rounded-sm border border-amber-200 bg-amber-50 px-4 py-2.5"
    >
      <p class="text-sm text-amber-800">
        <b>已恢复上次考试进度</b>
        · 上次做到第 {{ examStore.currentIndex + 1 }} / {{ examStore.total }} 题（已答 {{ examStore.answeredCount }} 题）
      </p>
      <button
        type="button"
        class="flex-shrink-0 rounded-sm border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
        @click="restartExam"
      >
        重新开始
      </button>
    </div>
    <div v-else-if="restarting" class="mb-4 text-xs text-gray-400">正在重新加载…</div>

    <!-- 进度 -->
    <div class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
      <ExamProgress
        :current="examStore.currentIndex"
        :total="examStore.total"
        :answered="examStore.answeredCount"
        :timer="true"
        :time-limit="examStore.exam.timeLimit"
      />
    </div>

    <!-- 题目卡片 -->
    <div class="rounded-sm border border-gray-200 bg-white p-6">
      <QuestionCard
        v-if="currentQuestion"
        :question="currentQuestion"
        v-model="currentAnswer"
        :passage="currentPassage"
      />

      <!-- AI 按钮 -->
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          @click="openAI"
        >AI 解析</button>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="mt-4 rounded-sm border border-gray-200 bg-white p-4">
      <AnswerPanel
        mode="exam"
        :current="examStore.currentIndex"
        :total="examStore.total"
        :answered="Boolean(currentRecord?.answered)"
        :answered-set="answeredSet"
        @prev="examStore.prev()"
        @next="examStore.next()"
        @jump="examStore.goTo($event)"
      />
    </div>

    <!-- 交卷按钮 -->
    <div class="mt-4 flex justify-end">
      <button
        type="button"
        class="rounded-sm bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        @click="submitClicked"
      >交卷</button>
    </div>
  </div>

  <div v-else class="py-16 text-center text-sm text-gray-400">试卷不存在</div>

  <!-- AI 侧边栏 -->
  <AIHelper
    v-model:show="aiShow"
    :question-context="aiContext"
    subject="japanese"
    :user-answer="currentAnswer"
  />

  <!-- 交卷确认 -->
  <div v-if="showConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" @click.self="showConfirm = false">
    <div class="w-full max-w-sm rounded-sm border border-gray-200 bg-white p-6 shadow-lg">
      <h3 class="text-base font-semibold text-gray-900">确认交卷？</h3>
      <p class="mt-2 text-sm text-gray-500">
        已作答 {{ examStore.answeredCount }}/{{ examStore.total }} 题，交卷后将无法修改答案。
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="showConfirm = false"
        >继续答题</button>
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          @click="showConfirm = false; doSubmit()"
        >确认交卷</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 练习模式页面
 * 流程：逐题作答 → 提交立即判分 → 显示标准答案与解析 → 累计积分
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePracticeStore } from '../stores/practice'
import { useAIExplainStore } from '../stores/aiExplain'
import { findQuestion, findReadingGroup } from '../utils/parser'
import { hasProgress as hasSavedProgress } from '../utils/progress'
import ExamProgress from '../components/ExamProgress.vue'
import QuestionCard from '../components/QuestionCard.vue'
import AnswerPanel from '../components/AnswerPanel.vue'
import ExplanationPanel from '../components/ExplanationPanel.vue'
import AIHelper from '../components/AIHelper.vue'

const route = useRoute()
const router = useRouter()
const practice = usePracticeStore()
const aiExplain = useAIExplainStore()

const aiShow = ref(false)
const aiContext = ref('')
const aiIsWrong = ref(false)
const lastFeedback = ref<{ isCorrect: boolean } | null>(null)

/** 是否有可恢复的存档（进入时检测，提示用户） */
const restored = ref(false)
const restarting = ref(false)

onMounted(async () => {
  const id = route.params.id as string
  if (!practice.exam || practice.exam.id !== id) {
    const hadSaved = hasSavedProgress('practice', id) // start 前检测（直接读 localStorage）
    try {
      await practice.startPractice(id, false)
      if (hadSaved) {
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
async function restartPractice(): Promise<void> {
  restarting.value = true
  practice.discardProgress()
  try {
    const id = route.params.id as string
    if (id === 'favorites') {
      // 收藏练习：用最近一次「组成练习」的数据重新加载
      const favStore = (await import('../stores/favorites')).useFavoriteStore()
      if (favStore.lastRaw) {
        await practice.startPracticeWithRaw(favStore.lastRaw, false)
      } else {
        router.replace('/favorites')
        return
      }
    } else {
      await practice.startPractice(id, false)
    }
    restored.value = false
  } finally {
    restarting.value = false
  }
}

const currentQuestion = computed(() => {
  if (!practice.exam || !practice.currentId) return null
  return findQuestion(practice.exam, practice.currentId)
})

const currentPassage = computed(() => {
  if (!practice.exam || !practice.currentId) return undefined
  return findReadingGroup(practice.exam, practice.currentId)?.content
})

const currentState = computed(() => practice.states[practice.currentId])
const submitted = computed(() => Boolean(currentState.value?.submitted))

/** 提交后展示的解析：题目自带 > AI 缓存 > 生成中提示 */
const currentAnalysis = computed(() => {
  const q = currentQuestion.value
  if (!q) return ''
  if (q.explanation) return q.explanation
  const st = aiExplain.stateOf(q.id)
  if (st?.status === 'done' && st.text) return st.text
  return st?.status === 'loading' ? 'AI 解析生成中…' : '暂无解析内容。'
})

const currentAnswer = computed<unknown>({
  get: () => currentState.value?.userAnswer ?? null,
  set: (v) => {
    if (practice.currentId) practice.setAnswer(practice.currentId, v as never)
  },
})

const answeredSet = computed(() => {
  const set = new Set<number>()
  practice.refs.forEach((ref, idx) => {
    if (practice.states[ref.id]?.submitted) set.add(idx)
  })
  return set
})

/** 提交当前题 */
let autoJumpTimer: number | undefined
function doSubmit(): void {
  if (!practice.hasAnswer()) return
  try {
    const fb = practice.submitCurrent()
    lastFeedback.value = fb
    aiIsWrong.value = !fb.isCorrect
    // 仅错题触发 AI 解析（答对不消耗 token）
    if (!fb.isCorrect) {
      const q = currentQuestion.value
      if (q) aiExplain.ensure(q)
    }
    // 答对自动跳转下一题（短暂停留展示正确反馈）；答错停留查看解析
    if (fb.isCorrect && practice.currentIndex < practice.total - 1) {
      window.clearTimeout(autoJumpTimer)
      autoJumpTimer = window.setTimeout(() => goNext(), 250)
    }
  } catch (e) {
    /* 未作答提示由按钮 disabled 保证 */
  }
}

/** 下一题时重置反馈 */
function goNext(): void {
  window.clearTimeout(autoJumpTimer)
  lastFeedback.value = null
  practice.next()
}
function goPrev(): void {
  lastFeedback.value = null
  practice.prev()
}

function openAI(): void {
  const q = currentQuestion.value
  if (!q) return
  const passage = currentPassage.value
  const parts = [
    `【试卷】${practice.exam?.title}`,
    `【题型】${q.type}`,
    passage ? `【阅读文章】\n${passage}` : '',
    `【题目】\n${q.question}`,
    q.prompt ? `【提示】${q.prompt}` : '',
    q.options?.length ? `【选项】\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
    `【用户答案】${currentAnswer.value === null || currentAnswer.value === undefined ? '未作答' : JSON.stringify(currentAnswer.value)}`,
    submitted.value && lastFeedback.value ? `【判定】${lastFeedback.value.isCorrect ? '正确' : '错误'}` : '',
  ]
  aiContext.value = parts.filter(Boolean).join('\n\n')
  aiShow.value = true
}

/** 完成练习 → 保存历史并返回首页 */
function finishPractice(): void {
  practice.finishPractice()
  router.push('/')
}
</script>

<template>
  <div v-if="practice.loading" class="loading-block"><span class="loading-spinner loading-lg" />试卷加载中…</div>

  <div v-else-if="practice.exam" class="mx-auto max-w-3xl">
    <!-- 顶部信息条 + 统计 -->
    <div class="mb-4">
      <h1 class="text-lg font-semibold text-gray-900">{{ practice.exam.title }}</h1>
      <p class="text-xs text-gray-400">练习模式 · 提交后立即判分并显示解析</p>
      <div class="mt-2 flex items-center gap-4 rounded-sm border border-gray-200 bg-white px-4 py-2 text-sm">
        <span class="text-gray-500">积分</span>
        <span class="font-semibold text-blue-600">{{ practice.points }}</span>
        <span class="ml-2 text-gray-500">今日</span>
        <span class="text-gray-700">{{ practice.daily.done }} 题</span>
        <span class="text-green-600">{{ practice.daily.correct }} 对</span>
        <span class="text-red-500">{{ practice.daily.wrong }} 错</span>
        <span class="text-gray-500">
          正确率
          {{ practice.daily.done ? Math.round((practice.daily.correct / practice.daily.done) * 100) : 0 }}%
        </span>
      </div>
    </div>

    <!-- 恢复进度提示 -->
    <div
      v-if="restored && !restarting"
      class="mb-4 flex items-center justify-between rounded-sm border border-amber-200 bg-amber-50 px-4 py-2.5"
    >
      <p class="text-sm text-amber-800">
        <b>已恢复上次进度</b>
        · 上次做到第 {{ practice.currentIndex + 1 }} / {{ practice.total }} 题
      </p>
      <button
        type="button"
        class="flex-shrink-0 rounded-sm border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
        @click="restartPractice"
      >
        重新开始
      </button>
    </div>
    <div v-else-if="restarting" class="mb-4 text-xs text-gray-400">正在重新加载…</div>

    <!-- 进度 -->
    <div class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
      <ExamProgress
        :current="practice.currentIndex"
        :total="practice.total"
        :answered="answeredSet.size"
      />
    </div>

    <!-- 题目卡片 -->
    <div class="rounded-sm border border-gray-200 bg-white p-6">
      <QuestionCard
        v-if="currentQuestion"
        :question="currentQuestion"
        v-model="currentAnswer"
        :passage="currentPassage"
        :readonly="submitted"
        :show-analysis="submitted"
        :is-correct="submitted ? currentState?.isCorrect : undefined"
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

    <!-- 结果面板（提交后） -->
    <div v-if="submitted && currentQuestion" class="mt-4">
      <ExplanationPanel
        :question="currentQuestion"
        :user-answer="currentState?.userAnswer"
        :is-correct="currentState?.isCorrect"
        :show="true"
        :analysis-text="currentAnalysis"
      />
    </div>

    <!-- 底部操作 -->
    <div class="mt-4 rounded-sm border border-gray-200 bg-white p-4">
      <AnswerPanel
        mode="practice"
        :current="practice.currentIndex"
        :total="practice.total"
        :answered="practice.hasAnswer()"
        :submitted="submitted"
        :answered-set="answeredSet"
        @prev="goPrev"
        @next="goNext"
        @submit="doSubmit"
        @jump="lastFeedback = null; practice.currentIndex = $event"
        @finish="finishPractice"
      />
    </div>
  </div>

  <div v-else class="py-16 text-center text-sm text-gray-400">试卷不存在</div>

  <!-- AI 侧边栏 -->
  <AIHelper
    v-model:show="aiShow"
    :question-context="aiContext"
    subject="japanese"
    :user-answer="currentAnswer"
    :is-wrong="aiIsWrong"
  />
</template>

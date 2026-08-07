<script setup lang="ts">
/**
 * 错题单题练习页
 *
 * 点击错题本中任意一条错题进入：
 * - 显示单题（含阅读文章）
 * - 作答 → 提交 → 判分 → 显示解析
 * - 答对：推进艾宾浩斯周期；答错：顺延 1 天（不新增错题）
 * - 完成后自动跳转下一道待回顾错题（若有），否则返回错题本
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWrongBookStore, snapshotToQuestion } from '../stores/wrongBook'
import { useAIExplainStore } from '../stores/aiExplain'
import { cycleLabel, dueLabel } from '../utils/review'
import QuestionCard from '../components/QuestionCard.vue'
import ExplanationPanel from '../components/ExplanationPanel.vue'
import AIHelper from '../components/AIHelper.vue'

const route = useRoute()
const router = useRouter()
const wrongBook = useWrongBookStore()
const aiExplain = useAIExplainStore()

const questionId = computed(() => route.params.id as string)
const record = computed(() => wrongBook.findRecord(questionId.value))

/** 从快照还原 Question */
const question = computed(() => {
  const r = record.value
  if (!r) return null
  return snapshotToQuestion(r.snapshot, r.questionId)
})

const passage = computed(() => record.value?.snapshot.passage)

/** 作答状态 */
const userAnswer = ref<unknown>(null)
const submitted = ref(false)
const feedback = ref<{ isCorrect: boolean } | null>(null)

const aiShow = ref(false)
const aiContext = ref('')

/** 题目加载时后台预生成解析（含切换题时） */
watch(
  question,
  (q) => {
    if (q) aiExplain.ensure(q)
  },
  { immediate: true },
)

/** 提交判分 */
function doSubmit(): void {
  const q = question.value
  if (!q || userAnswer.value === null || userAnswer.value === undefined) return
  const isCorrect = compareAnswer(q.type, userAnswer.value, q.answer)
  submitted.value = true
  feedback.value = { isCorrect }
  // 推进/顺延艾宾浩斯周期
  wrongBook.submitReview(q.id, isCorrect)
}

/** 答案比较（简单判等，排序/多选按集合） */
function compareAnswer(type: string, user: unknown, std: unknown): boolean {
  if (Array.isArray(user) && Array.isArray(std)) {
    if (type === 'sorting') return JSON.stringify(user) === JSON.stringify(std)
    const a = [...(user as number[])].sort().join(',')
    const b = [...(std as number[])].sort().join(',')
    return a === b
  }
  if (Array.isArray(user)) return (user as unknown[]).length > 0 && JSON.stringify(user) === JSON.stringify(std)
  if (typeof user === 'boolean') return user === std
  return String(user) === String(std)
}

/** 进入下一道待回顾错题（尚未熟练且非本题） */
function goNext(): void {
  const next = wrongBook.dueReviews.find((r) => r.questionId !== questionId.value)
  if (next) {
    // 重置状态
    userAnswer.value = null
    submitted.value = false
    feedback.value = null
    router.replace(`/wrong/${next.questionId}`)
  } else {
    router.push('/wrong-book')
  }
}

/** 返回错题本 */
function back(): void {
  router.push('/wrong-book')
}

/** AI 上下文 */
function buildAIContext(): string {
  const q = question.value
  if (!q) return ''
  const parts = [
    `【错题回顾】${wrongBook.findRecord(q.id)?.snapshot.difficulty ?? ''} ${q.type}`,
    passage.value ? `【阅读文章】\n${passage.value}` : '',
    `【题目】\n${q.question}`,
    q.prompt ? `【提示】${q.prompt}` : '',
    q.options?.length ? `【选项】\n${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
    `【我的答案】${userAnswer.value === null || userAnswer.value === undefined ? '未作答' : JSON.stringify(userAnswer.value)}`,
    `【正确答案】${JSON.stringify(q.answer)}`,
    feedback.value ? `【判定】${feedback.value.isCorrect ? '正确' : '错误'}` : '',
    `【回顾进度】${cycleLabel(record.value!)} 周期`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

function openAI(): void {
  aiContext.value = buildAIContext()
  aiShow.value = true
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- 顶部：错题回顾进度 -->
    <div v-if="record" class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-base font-semibold text-gray-900">错题回顾</h1>
          <p class="mt-0.5 text-xs text-gray-400">
            <span class="rounded-sm bg-gray-100 px-1.5 py-0.5">{{ record.snapshot.difficulty || '—' }}</span>
            <span class="ml-1 rounded-sm bg-gray-100 px-1.5 py-0.5">{{ record.snapshot.type }}</span>
            <span class="ml-2">艾宾浩斯回顾 {{ cycleLabel(record) }} 周期</span>
            <span class="ml-2" :class="record.completed ? 'text-green-600' : 'text-gray-500'">
              {{ record.completed ? '✓ 已熟练' : dueLabel(record) }}
            </span>
          </p>
        </div>
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          @click="back"
        >返回错题本</button>
      </div>
    </div>

    <!-- 题目卡片 -->
    <div v-if="question" class="rounded-sm border border-gray-200 bg-white p-6">
      <QuestionCard
        :question="question"
        v-model="userAnswer"
        :passage="passage"
        :readonly="submitted"
        :is-correct="submitted ? feedback?.isCorrect : undefined"
      />

      <div class="mt-4 flex items-center justify-between">
        <div>
          <template v-if="submitted && feedback">
            <span
              class="rounded-sm px-2 py-1 text-sm font-medium"
              :class="feedback.isCorrect ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'"
            >
              {{ feedback.isCorrect ? '✓ 回答正确' : '✗ 回答错误' }}
            </span>
            <span v-if="!feedback.isCorrect" class="ml-2 text-xs text-gray-400">
              已顺延 1 天，明天继续回顾
            </span>
            <span v-else-if="record?.completed" class="ml-2 text-xs text-green-600">
              已完成全部回顾，标记为「已熟练」
            </span>
          </template>
          <span v-else class="text-xs text-gray-400">作答后提交，答对推进回顾周期</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            @click="openAI"
          >AI 解析</button>
          <button
            v-if="!submitted"
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="userAnswer === null || userAnswer === undefined"
            @click="doSubmit"
          >提交答案</button>
          <button
            v-else
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700"
            @click="goNext"
          >下一题</button>
        </div>
      </div>
    </div>

    <!-- 解析面板（提交后） -->
    <div v-if="submitted && question" class="mt-4">
      <ExplanationPanel
        :question="question"
        :user-answer="userAnswer"
        :is-correct="feedback?.isCorrect"
        :show="true"
        :analysis-text="aiExplain.explanationOf(question)"
      />
    </div>

    <!-- 不存在 -->
    <div v-else class="py-16 text-center text-sm text-gray-400">
      错题不存在或已删除
      <div class="mt-3">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          @click="back"
        >返回错题本</button>
      </div>
    </div>

    <!-- AI 侧边栏 -->
    <AIHelper
      v-model:show="aiShow"
      :question-context="aiContext"
      subject="japanese"
      :user-answer="userAnswer"
      :is-wrong="submitted ? !feedback?.isCorrect : undefined"
    />
  </div>
</template>

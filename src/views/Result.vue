<script setup lang="ts">
/**
 * 考试结果页
 * 展示：总分 / 正确率 / 耗时 + 每道题（题目、用户答案、正确答案、解析）
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExamStore } from '../stores/exam'
import { usePracticeStore } from '../stores/practice'
import { useAIExplainStore } from '../stores/aiExplain'
import QuestionCard from '../components/QuestionCard.vue'
import ExplanationPanel from '../components/ExplanationPanel.vue'

const route = useRoute()
const router = useRouter()
const examStore = useExamStore()
const practice = usePracticeStore()
const aiExplain = useAIExplainStore()

const from = computed(() => (route.query.from as string) ?? 'exam')

/** 结果数据：考试模式从 exam store 取，练习模式从 practice 汇总 */
const result = computed(() => {
  if (from.value === 'practice') {
    const e = practice.exam
    if (!e) return null
    const items = practice.refs.map((ref) => {
      const q = e.questions.find((x) => x.id === ref.id) ?? e.readingGroups.flatMap((g) => g.children).find((x) => x.id === ref.id)
      const s = practice.states[ref.id]
      return {
        questionId: ref.id,
        question: q!,
        userAnswer: s?.userAnswer ?? null,
        correctAnswer: q?.answer as never,
        isCorrect: s?.submitted ? s.isCorrect : false,
        score: s?.submitted && s.isCorrect ? (q?.score ?? 0) : 0,
        groupId: ref.groupId,
      }
    })
    items.reduce((s, i) => s + i.score, 0)
    const correct = items.filter((i) => i.isCorrect).length
    return {
      examId: e.id,
      examTitle: e.title,
      mode: 'practice' as const,
      totalScore: e.totalScore,
      earnedScore: practice.points,
      totalQuestions: practice.total,
      correctCount: correct,
      wrongCount: practice.total - correct,
      accuracy: practice.total ? correct / practice.total : 0,
      duration: 0,
      finishedAt: Date.now(),
      items,
    }
  }
  return examStore.result
})

const showAll = ref(false)
const items = computed(() => result.value?.items ?? [])

const filteredItems = computed(() => {
  if (showAll.value) return items.value
  // 默认只看错题
  return items.value.filter((i) => !i.isCorrect)
})

/** 取解析：题目自带 > AI 缓存（done）> loading/error 提示 */
function explanationOf(item: { question: { explanation?: string; id: string } }): string {
  if (item.question.explanation) return item.question.explanation
  const st = aiExplain.stateOf(item.question.id)
  if (st?.status === 'done' && st.text) return st.text
  if (st?.status === 'error') return 'AI 解析生成失败，可在设置页检查 API 配置后重新打开本页重试。'
  return 'AI 解析生成中…（完成后将自动显示）'
}

// 结果页加载：仅对错题触发 AI 解析（答对的题不消耗 token）
onMounted(() => {
  if (!result.value) return
  const wrong = items.value
    .filter((i) => !i.isCorrect)
    .map((i) => i.question)
    .filter((q) => !q.explanation)
  aiExplain.ensureAll(wrong)
})

function passageOf(item: { questionId: string }): string | undefined {
  if (from.value === 'practice') {
    const g = practice.exam?.readingGroups.find((gr) => gr.children.some((c) => c.id === item.questionId))
    return g?.content
  }
  const g = examStore.exam?.readingGroups.find((gr) => gr.children.some((c) => c.id === item.questionId))
  return g?.content
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${String(s).padStart(2, '0')}秒`
}
</script>

<template>
  <div v-if="!result" class="py-16 text-center text-sm text-gray-400">暂无结果数据</div>

  <div v-else class="mx-auto max-w-3xl">
    <!-- 成绩总览 -->
    <div class="rounded-sm border border-gray-200 bg-white p-6">
      <h1 class="text-lg font-semibold text-gray-900">{{ result.examTitle }}</h1>
      <p class="mt-0.5 text-xs text-gray-400">
        {{ result.mode === 'exam' ? '考试结果' : '练习汇总' }}
        · {{ new Date(result.finishedAt).toLocaleString() }}
      </p>

      <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
          <p class="text-xs text-gray-500">得分</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">
            {{ result.earnedScore }}<span class="text-sm font-normal text-gray-400">/{{ result.totalScore }}</span>
          </p>
          <p v-if="result.mode === 'exam'" class="mt-1 text-xs" :class="result.passed ? 'text-green-600' : 'text-red-500'">
            {{ result.passed ? '✓ 已通过' : '✗ 未通过' }}
          </p>
        </div>
        <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
          <p class="text-xs text-gray-500">正确率</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ Math.round(result.accuracy * 100) }}%</p>
          <p class="mt-1 text-xs text-gray-400">{{ result.correctCount }}/{{ result.totalQuestions }}</p>
        </div>
        <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
          <p class="text-xs text-gray-500">错误</p>
          <p class="mt-1 text-2xl font-bold text-red-500">{{ result.wrongCount }}</p>
          <p class="mt-1 text-xs text-gray-400">题</p>
        </div>
        <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
          <p class="text-xs text-gray-500">耗时</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ fmtDuration(result.duration) }}</p>
          <p class="mt-1 text-xs text-gray-400">&nbsp;</p>
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="router.push('/')"
        >返回首页</button>
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="router.push(`/exam/${result.examId}`)"
          v-if="result.mode === 'exam'"
        >重新考试</button>
      </div>
    </div>

    <!-- 题目明细 -->
    <div class="mt-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold text-gray-900">
          题目解析
          <span class="ml-1 text-sm font-normal text-gray-400">（{{ filteredItems.length }} 题）</span>
        </h2>
        <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input v-model="showAll" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
          显示全部题目
        </label>
      </div>

      <div class="space-y-3">
        <div
          v-for="(item, idx) in filteredItems"
          :key="item.questionId"
          class="rounded-sm border border-gray-200 bg-white p-5"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs text-gray-400">题目 {{ idx + 1 }}</span>
            <span
              class="rounded-sm px-2 py-0.5 text-xs font-medium"
              :class="item.isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'"
            >{{ item.isCorrect ? '正确' : '错误' }}</span>
          </div>

          <QuestionCard
            :question="item.question"
            :model-value="item.userAnswer"
            :readonly="true"
            :is-correct="item.isCorrect"
            :passage="passageOf(item)"
          />
          <div class="mt-3">
            <ExplanationPanel
              :question="item.question"
              :user-answer="item.userAnswer"
              :is-correct="item.isCorrect"
              :show="true"
              :analysis-text="explanationOf(item)"
            />
          </div>
        </div>

        <div v-if="filteredItems.length === 0" class="py-10 text-center text-sm text-gray-400">
          {{ showAll ? '暂无题目' : '太棒了，没有错题！🎉' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * JLPT 真题练习模式（整卷呈现，无听力）
 * 特点：逐题作答 → 提交立即判分 → 显示答案/解析/译文 → 错题自动入库
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchJLPTExams } from '../services/api'
import { useAIExplainStore } from '../stores/aiExplain'
import { useWrongBookStore } from '../stores/wrongBook'
import ExamProgress from '../components/ExamProgress.vue'
import AIHelper from '../components/AIHelper.vue'

const route = useRoute()
const aiExplain = useAIExplainStore()
const wrongBook = useWrongBookStore()

interface FlatItem {
  groupId: string
  sectionTitle: string
  sectionKind: string
  content: string
  options: string[]
  answer: number | null
  explanation: string
  translation: string
  article: string
  images: string[]
  userAnswer: number | null
  submitted: boolean
  isCorrect: boolean
}

const items = ref<FlatItem[]>([])
const currentIndex = ref(0)
const loading = ref(false)
const error = ref('')
const points = ref(0)

const aiShow = ref(false)
const aiContext = ref('')

onMounted(async () => {
  const level = (route.params.level as string) || 'N2'
  const examTitle = decodeURIComponent((route.params.examTitle as string) || '')
  loading.value = true
  try {
    const exams = await fetchJLPTExams(level === 'N3' ? 'N3' : 'N2')
    const found = exams.find((e) => e.examTitle === examTitle) ?? exams[0]
    items.value = found.sections.flatMap((sec) =>
      sec.groups.map((g) => ({
        groupId: g.id,
        sectionTitle: sec.title,
        sectionKind: sec.kind,
        content: g.content.trim(),
        options: g.options,
        answer: g.answer,
        explanation: g.explanation || '',
        translation: g.translation || '',
        article: (sec as { article?: string }).article ?? '',
        images: (sec as { images?: string[] }).images ?? [],
        userAnswer: null,
        submitted: false,
        isCorrect: false,
      })),
    )
    currentIndex.value = 0
    points.value = 0
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

const current = computed(() => items.value[currentIndex.value])
const total = computed(() => items.value.length)
const answeredCount = computed(() => items.value.filter((i) => i.submitted).length)
const currentAnswer = computed<number | null>({
  get: () => current.value?.userAnswer ?? null,
  set: (v) => {
    if (current.value && !current.value.submitted) current.value.userAnswer = v
  },
})

/** 提交判分 */
function submit(): void {
  const c = current.value
  if (!c || c.submitted || c.userAnswer === null) return
  const correct = c.answer !== null && c.answer === c.userAnswer
  c.submitted = true
  c.isCorrect = correct
  // 仅错题触发 AI 解析（答对不消耗 token）
  if (!correct && c.answer !== null) {
    aiExplain.ensure({
      id: c.groupId,
      type: 'single_choice',
      section: c.sectionTitle,
      difficulty: 'N3',
      score: 2,
      question: c.content,
      options: c.options,
      answer: c.answer as never,
      explanation: c.explanation,
    })
  }
  if (correct) {
    points.value += 2
  } else if (c.answer !== null) {
    // 错题入库
    wrongBook.recordWrong({
      id: c.groupId,
      type: 'single_choice',
      section: c.sectionTitle,
      difficulty: 'N3',
      score: 2,
      question: c.content,
      options: c.options,
      answer: c.answer as never,
      explanation: c.explanation,
    }, { lastAnswer: c.userAnswer })
  }
}

function next(): void {
  if (currentIndex.value < total.value - 1) currentIndex.value++
}
function prev(): void {
  if (currentIndex.value > 0) currentIndex.value--
}
function goTo(idx: number): void {
  if (idx >= 0 && idx < total.value) currentIndex.value = idx
}

/** AI 上下文 */
function buildAIContext(): string {
  const c = current.value
  if (!c) return ''
  const parts = [
    `【JLPT 真题】${route.params.examTitle}`,
    `【部分】${c.sectionKind}（${c.sectionTitle.slice(0, 30)}）`,
    `【题目】\n${c.content}`,
    c.options.length ? `【选项】\n${c.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
    c.translation ? `【参考译文】\n${c.translation.slice(0, 300)}` : '',
    `【我的答案】${c.userAnswer === null ? '未作答' : String.fromCharCode(65 + c.userAnswer)}`,
    c.submitted ? `【判定】${c.isCorrect ? '正确' : '错误'}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

function openAI(): void {
  aiContext.value = buildAIContext()
  aiShow.value = true
}

/** AI 解析文案 */
const currentAnalysis = computed(() => {
  const c = current.value
  if (!c) return ''
  if (c.explanation) return c.explanation
  const st = aiExplain.stateOf(c.groupId)
  if (st?.status === 'done' && st.text) return st.text
  return st?.status === 'loading' ? 'AI 解析生成中…' : '暂无解析'
})
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div v-if="loading" class="py-16 text-center text-sm text-gray-500">加载中…</div>
    <div v-else-if="error" class="py-16 text-center text-sm text-red-500">{{ error }}</div>

    <div v-else-if="current" class="space-y-4">
      <!-- 顶部 -->
      <div class="rounded-sm border border-gray-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h1 class="text-base font-semibold text-gray-900">{{ route.params.examTitle }} 练习</h1>
          <div class="text-sm text-gray-500">
            得分 <span class="font-semibold text-blue-600">{{ points }}</span>
          </div>
        </div>
        <div class="mt-3">
          <ExamProgress
            :current="currentIndex"
            :total="total"
            :answered="answeredCount"
          />
        </div>
      </div>

      <!-- 题目区 -->
      <div class="rounded-sm border border-gray-200 bg-white p-6">
        <div class="mb-4 rounded-sm bg-gray-50 px-3 py-2">
          <p class="text-xs font-medium text-gray-600">{{ current.sectionTitle }}</p>
        </div>

        <div v-if="current.article" class="mb-4 rounded-sm bg-gray-50 p-4">
          <p class="text-sm leading-7 text-gray-800 whitespace-pre-wrap">{{ current.article }}</p>
        </div>
        <div v-if="current.images.length" class="mb-4 space-y-3">
          <div v-for="img in current.images" :key="img" class="rounded-sm border border-gray-200 p-2">
            <img :src="'/jlpt-images/' + img" :alt="img" class="max-w-full" />
          </div>
        </div>

        <p class="mb-4 text-base leading-7 text-gray-900">{{ current.content }}</p>

        <div class="space-y-1.5">
          <button
            v-for="(opt, idx) in current.options"
            :key="idx"
            type="button"
            class="w-full rounded-sm border px-3 py-2 text-left text-sm transition-colors"
            :class="[
              current.submitted && current.answer === idx ? 'border-green-500 bg-green-50 text-green-700' : '',
              current.submitted && current.userAnswer === idx && current.userAnswer !== current.answer ? 'border-red-400 bg-red-50 text-red-600' : '',
              !current.submitted && current.userAnswer === idx ? 'border-blue-500 bg-blue-50 text-blue-700' : '',
              !current.submitted && current.userAnswer !== idx ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-400' : '',
              current.submitted ? 'cursor-default' : 'cursor-pointer',
            ]"
            :disabled="current.submitted"
            @click="currentAnswer = idx"
          >
            <span class="mr-2 inline-block w-5 text-gray-400">{{ String.fromCharCode(65 + idx) }}</span>{{ opt }}
            <span v-if="current.submitted && current.answer === idx" class="ml-auto text-xs">✓</span>
            <span v-else-if="current.submitted && current.userAnswer === idx && current.userAnswer !== current.answer" class="ml-auto text-xs">✗</span>
          </button>
        </div>

        <p v-if="current.answer === null" class="mt-3 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-600">
          ⚠️ 本题答案待补全，无法判分
        </p>

        <!-- 操作 -->
        <div class="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            :disabled="currentIndex === 0"
            @click="prev"
          >上一题</button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              @click="openAI"
            >AI 解析</button>
            <button
              v-if="!current.submitted"
              type="button"
              class="rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="current.userAnswer === null"
              @click="submit"
            >提交答案</button>
            <button
              v-else
              type="button"
              class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              :disabled="currentIndex >= total - 1"
              @click="next"
            >下一题</button>
          </div>
        </div>
      </div>

      <!-- 解析面板（提交后） -->
      <div v-if="current.submitted" class="rounded-sm border border-gray-200 bg-white p-5">
        <div class="mb-2 flex items-center gap-2">
          <span
            class="rounded-sm px-2 py-0.5 text-sm font-medium"
            :class="current.isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'"
          >{{ current.isCorrect ? '✓ 回答正确' : '✗ 回答错误' }}</span>
          <span v-if="current.answer !== null" class="text-sm text-gray-600">
            正确答案：{{ String.fromCharCode(65 + current.answer) }}
          </span>
        </div>
        <p class="text-sm leading-6 text-gray-700">{{ currentAnalysis }}</p>
        <p v-if="current.translation" class="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">
          <span class="font-medium text-gray-600">译文：</span>{{ current.translation }}
        </p>
      </div>

      <!-- 答题卡 -->
      <div class="rounded-sm border border-gray-200 bg-white p-4">
        <details>
          <summary class="cursor-pointer select-none text-sm text-gray-600">
            答题卡（{{ answeredCount }}/{{ total }}）
          </summary>
          <div class="mt-3 grid grid-cols-10 gap-1.5">
            <button
              v-for="(item, idx) in items"
              :key="item.groupId"
              type="button"
              class="h-7 rounded-sm border text-xs transition-colors"
              :class="[
                idx === currentIndex ? 'border-blue-500 bg-blue-500 text-white' : '',
                idx !== currentIndex && item.submitted && item.isCorrect ? 'border-green-200 bg-green-50 text-green-700' : '',
                idx !== currentIndex && item.submitted && !item.isCorrect ? 'border-red-200 bg-red-50 text-red-600' : '',
                idx !== currentIndex && !item.submitted ? 'border-gray-200 bg-white text-gray-500 hover:border-gray-400' : '',
              ]"
              @click="goTo(idx)"
            >{{ idx + 1 }}</button>
          </div>
        </details>
      </div>
    </div>

    <!-- AI 侧边栏 -->
    <AIHelper
      v-model:show="aiShow"
      :question-context="aiContext"
      subject="japanese"
      :user-answer="current?.userAnswer"
      :is-wrong="current?.submitted ? !current.isCorrect : undefined"
    />
  </div>
</template>

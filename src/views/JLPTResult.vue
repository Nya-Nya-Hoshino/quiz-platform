<script setup lang="ts">
/**
 * JLPT 真题结果页（120 分制）
 * 展示：总分 / 言语知识分 / 读解分 / 正确率 + 逐题对照 + AI 错题详解
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert } from 'naive-ui'
import { fetchJLPTExams } from '../services/api'
import {
  calcJLPTResult,
  JLPT_TOTAL,
  JLPT_SCORES,
} from '../utils/jlptScore'
import { useAIExplainStore } from '../stores/aiExplain'
import { useWrongBookStore } from '../stores/wrongBook'

const route = useRoute()
const router = useRouter()
const aiExplain = useAIExplainStore()
const wrongBook = useWrongBookStore()

const level = computed(() => (route.query.level as string) || 'N2')
const examTitle = computed(() => decodeURIComponent((route.query.examTitle as string) || ''))
/** 答案与耗时通过 sessionStorage 传递（刷新不丢失） */
const answers = computed<Record<string, number | null>>(() => {
  try {
    const raw = sessionStorage.getItem('jlpt-result-answers')
    return raw ? (JSON.parse(raw) as Record<string, number | null>) : {}
  } catch {
    return {}
  }
})
const duration = computed(() => Number(sessionStorage.getItem('jlpt-result-duration') ?? 0))

const exam = ref<{ sections: { title: string; kind: string; groups: { id: string; content: string; options: string[]; answer: number | null; explanation: string; translation: string }[] }[] } | null>(null)
const result = ref<ReturnType<typeof calcJLPTResult> | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    const exams = await fetchJLPTExams(level.value === 'N3' ? 'N3' : 'N2')
    const found = exams.find((e) => e.examTitle === examTitle.value)
    if (!found) {
      error.value = '试卷不存在'
      return
    }
    exam.value = found as never
    result.value = calcJLPTResult(found as never, answers.value)
    // 错题入库（计入错题系统）
    for (const sec of found.sections) {
      for (const g of sec.groups) {
        const userAns = answers.value[g.id]
        const correct = g.answer !== null && userAns !== null && userAns === g.answer
        if (g.answer !== null && userAns !== null && !correct) {
          wrongBook.recordWrong({
            id: g.id,
            type: 'single_choice',
            section: sec.title,
            difficulty: level.value,
            score: 2,
            question: g.content.trim() || g.translation.slice(0, 50),
            options: g.options,
            answer: g.answer as never,
            explanation: g.explanation || '',
          }, { lastAnswer: userAns })
        }
      }
    }
    // 预生成错题解析
    const wrongItems = found.sections.flatMap((sec) =>
      sec.groups
        .filter((g) => g.answer !== null && answers.value[g.id] !== null && answers.value[g.id] !== g.answer)
        .map((g) => ({
          id: g.id,
          type: 'single_choice' as const,
          section: sec.title,
          difficulty: level.value,
          score: 2,
          question: g.content.trim(),
          options: g.options,
          answer: g.answer as never,
          explanation: g.explanation || '',
        })),
    )
    aiExplain.ensureAll(wrongItems as never)
  } catch (e) {
    error.value = (e as Error).message
  }
})

/** 逐题详情（带解析） */
const detailItems = computed(() => {
  if (!result.value || !exam.value) return []
  const items: {
    groupId: string
    sectionTitle: string
    kind: string
    content: string
    options: string[]
    answer: number | null
    userAnswer: number | null
    correct: boolean
    explanation: string
    translation: string
    article?: string
    images?: string[]
  }[] = []
  for (const sec of exam.value.sections) {
    for (const g of sec.groups) {
      const userAns = answers.value[g.id] ?? null
      const correct = g.answer !== null && userAns !== null && userAns === g.answer
      items.push({
        groupId: g.id,
        sectionTitle: sec.title,
        kind: sec.kind,
        content: g.content.trim(),
        options: g.options,
        answer: g.answer,
        userAnswer: userAns,
        correct,
        explanation: g.explanation || '',
        translation: g.translation || '',
        article: (sec as { article?: string }).article,
        images: (sec as { images?: string[] }).images,
      })
    }
  }
  return items
})

const wrongItems = computed(() => detailItems.value.filter((i) => !i.correct && i.answer !== null))
const showAll = ref(false)
const displayedItems = computed(() => (showAll.value ? detailItems.value : wrongItems.value))

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${String(s).padStart(2, '0')}秒`
}

/** AI 解析文案（预生成或生成中） */
function explanationOf(item: { groupId: string; explanation: string }): string {
  if (item.explanation) return item.explanation
  const st = aiExplain.stateOf(item.groupId)
  if (st?.status === 'done' && st.text) return st.text
  return st?.status === 'loading' ? 'AI 解析生成中…' : '暂无解析'
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div v-if="error" class="py-16">
      <n-alert type="error" :show-icon="false">{{ error }}</n-alert>
    </div>

    <div v-else-if="result && exam" class="space-y-5">
      <!-- 成绩总览 -->
      <div class="rounded-sm border border-gray-200 bg-white p-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold text-gray-900">{{ examTitle }} · JLPT {{ level }}</h1>
            <p class="mt-0.5 text-xs text-gray-400">真题考试结果 · 耗时 {{ fmtDuration(duration) }}</p>
          </div>
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            @click="router.push('/jlpt')"
          >返回真题库</button>
        </div>

        <div class="mt-6 grid grid-cols-3 gap-4">
          <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
            <p class="text-xs text-gray-500">总分</p>
            <p class="mt-1 text-2xl font-bold text-gray-900">
              {{ Math.round(result.totalScore) }}<span class="text-sm font-normal text-gray-400">/{{ JLPT_TOTAL }}</span>
            </p>
          </div>
          <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
            <p class="text-xs text-gray-500">文字词汇·语法</p>
            <p class="mt-1 text-2xl font-bold text-blue-600">
              {{ Math.round(result.languageKnowledgeScore) }}<span class="text-sm font-normal text-gray-400">/{{ JLPT_SCORES.languageKnowledge }}</span>
            </p>
          </div>
          <div class="rounded-sm border border-gray-100 bg-gray-50 p-4 text-center">
            <p class="text-xs text-gray-500">读解</p>
            <p class="mt-1 text-2xl font-bold text-green-600">
              {{ Math.round(result.readingScore) }}<span class="text-sm font-normal text-gray-400">/{{ JLPT_SCORES.reading }}</span>
            </p>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between rounded-sm bg-gray-50 px-4 py-2 text-sm">
          <span class="text-gray-600">
            正确 {{ result.correctCount }}/{{ result.totalCount }} · 正确率 {{ Math.round((result.correctCount / Math.max(result.totalCount, 1)) * 100) }}%
          </span>
          <span v-if="result.missingAnswerCount > 0" class="text-amber-600">
            共 {{ result.missingAnswerCount }} 题答案待补全（未计分）
          </span>
        </div>
      </div>

      <!-- 题目详解 -->
      <div class="rounded-sm border border-gray-200 bg-white p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">
            {{ showAll ? '全部题目' : '错题详解' }}
            <span class="ml-1 text-sm font-normal text-gray-400">（{{ displayedItems.length }} 题）</span>
          </h2>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input v-model="showAll" type="checkbox" class="h-4 w-4" />
            显示全部
          </label>
        </div>

        <div class="space-y-3">
          <div
            v-for="item in displayedItems"
            :key="item.groupId"
            class="rounded-sm border border-gray-200 p-4"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs text-gray-400">{{ item.sectionTitle.slice(0, 30) }}</span>
              <span
                class="rounded-sm px-2 py-0.5 text-xs font-medium"
                :class="item.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'"
              >{{ item.correct ? '正确' : '错误' }}</span>
            </div>

            <div v-if="item.article" class="mb-2 rounded-sm bg-gray-50 p-3">
              <p class="text-sm leading-6 text-gray-700 whitespace-pre-wrap">{{ item.article }}</p>
            </div>
            <div v-if="item.images?.length" class="mb-2 space-y-2">
              <img
                v-for="img in item.images"
                :key="img"
                :src="'/jlpt-images/' + img"
                :alt="img"
                class="max-w-full rounded-sm border border-gray-200"
              />
            </div>

            <p class="text-sm leading-6 text-gray-900">{{ item.content }}</p>

            <!-- 选项 -->
            <div class="mt-2 space-y-1">
              <div
                v-for="(opt, oi) in item.options"
                :key="oi"
                class="flex items-center gap-2 rounded-sm px-2 py-1 text-sm"
                :class="[
                  item.answer === oi ? 'bg-green-50 text-green-700' : '',
                  item.userAnswer === oi && item.userAnswer !== item.answer ? 'bg-red-50 text-red-600' : '',
                  item.userAnswer !== oi && item.answer !== oi ? 'text-gray-600' : '',
                ]"
              >
                <span class="w-5 text-gray-400">{{ String.fromCharCode(65 + oi) }}</span>{{ opt }}
                <span v-if="item.answer === oi" class="ml-auto text-xs">✓ 正确答案</span>
                <span v-else-if="item.userAnswer === oi" class="ml-auto text-xs">✗ 你的答案</span>
              </div>
            </div>

            <!-- 解析 -->
            <div v-if="item.explanation || item.translation" class="mt-3 rounded-sm bg-gray-50 p-3">
              <p v-if="explanationOf(item)" class="text-sm leading-6 text-gray-700">
                {{ explanationOf(item) }}
              </p>
              <p v-if="item.translation" class="mt-2 text-xs leading-5 text-gray-500">
                <span class="font-medium text-gray-600">译文：</span>{{ item.translation }}
              </p>
            </div>
          </div>

          <div v-if="displayedItems.length === 0" class="py-8 text-center text-sm text-gray-400">
            {{ showAll ? '暂无题目' : '太棒了，没有错题！🎉' }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="py-16 text-center text-sm text-gray-400">加载中…</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 解析面板：提交/结果后展示标准答案与解析
 */
import { computed } from 'vue'
import type { Question } from '../types/question'

const props = defineProps<{
  question: Question
  /** 用户答案（可空） */
  userAnswer?: unknown
  /** 是否正确 */
  isCorrect?: boolean
  /** 是否已提交/展示 */
  show?: boolean
  /** 解析文本覆盖（AI 缓存/占位，优先于 question.explanation） */
  analysisText?: string
}>()

/** 标准答案展示文本 */
const answerText = computed(() => {
  const q = props.question
  const a = q.answer
  const opts = q.options ?? []
  switch (q.type) {
    case 'single_choice':
      return typeof a === 'number'
        ? `${String.fromCharCode(65 + a)}. ${opts[a] ?? ''}`
        : String(a)
    case 'multiple_choice':
      return Array.isArray(a)
        ? (a as number[]).map((i) => `${String.fromCharCode(65 + i)}. ${opts[i] ?? ''}`).join('、')
        : String(a)
    case 'judge':
      return a ? '正确' : '错误'
    case 'sorting':
      return Array.isArray(a)
        ? (a as number[]).map((i, idx) => `${idx + 1}. ${opts[i] ?? ''}`).join(' → ')
        : String(a)
    case 'fill_blank':
      return Array.isArray(a) ? (a as string[]).join(' / ') : String(a)
    case 'short_answer':
      return String(a)
    default:
      return String(a)
  }
})

/** 用户答案展示文本 */
const userAnswerText = computed(() => {
  const ua = props.userAnswer
  const opts = props.question.options ?? []
  if (ua === undefined || ua === null || ua === '') return '未作答'
  if (Array.isArray(ua)) {
    if (ua.length === 0) return '未作答'
    if (ua.every((x) => typeof x === 'number')) {
      return (ua as number[]).map((i) => `${String.fromCharCode(65 + i)}. ${opts[i] ?? ''}`).join('、')
    }
    return (ua as string[]).join(' / ')
  }
  if (typeof ua === 'boolean') return ua ? '正确' : '错误'
  return String(ua)
})
</script>

<template>
  <div v-if="show" class="rounded-sm border border-gray-200">
    <!-- 结果标识 -->
    <div
      class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5"
      :class="isCorrect === true ? 'bg-green-50' : isCorrect === false ? 'bg-red-50' : 'bg-gray-50'"
    >
      <span
        class="text-sm font-medium"
        :class="isCorrect === true ? 'text-green-700' : isCorrect === false ? 'text-red-600' : 'text-gray-600'"
      >
        {{ isCorrect === true ? '✓ 回答正确' : isCorrect === false ? '✗ 回答错误' : '查看答案' }}
      </span>
      <span v-if="userAnswerText !== '未作答'" class="text-xs text-gray-500">
        你的答案：{{ userAnswerText }}
      </span>
    </div>

    <div class="space-y-3 px-4 py-3">
      <!-- 标准答案 -->
      <div>
        <p class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">正确答案</p>
        <p class="text-sm font-medium text-gray-900">{{ answerText }}</p>
      </div>

      <!-- 解析 -->
      <div>
        <p class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">解析</p>
        <p class="text-sm leading-6 text-gray-700">
          {{ analysisText ?? question.explanation ?? '暂无解析内容。' }}
        </p>
      </div>
    </div>
  </div>
</template>

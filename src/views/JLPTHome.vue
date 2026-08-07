<script setup lang="ts">
/**
 * JLPT 真题库首页
 * 选择等级（N2/N3）→ 试卷列表（整卷）→ 考试模式 / 练习模式
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchJLPTExams, type JLPTExam } from '../services/api'

const router = useRouter()
const exams = ref<JLPTExam[]>([])
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    exams.value = await fetchJLPTExams('N2')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function examQuestionCount(e: JLPTExam): number {
  return e.sections.reduce((s, sec) => s + sec.groups.length, 0)
}

function startExam(e: JLPTExam): void {
  router.push(`/jlpt/exam/N2/${encodeURIComponent(e.examTitle)}`)
}

function startPractice(e: JLPTExam): void {
  router.push(`/jlpt/practice/N2/${encodeURIComponent(e.examTitle)}`)
}

const stats = computed(() => {
  const groups = exams.value.flatMap((e) => e.sections.flatMap((s) => s.groups))
  const answered = groups.filter((g) => g.answer !== null).length
  return { total: groups.length, answered, missing: groups.length - answered }
})
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-5">
      <h1 class="text-lg font-semibold text-gray-900">JLPT 真题库</h1>
      <p class="text-xs text-gray-400">
        N2 历年真题整卷呈现（2018-2026）· 文字词汇·语法 + 读解 · 满分 120 分
      </p>
    </div>

    <div v-if="loading" class="py-16 text-center text-sm text-gray-500">加载中…</div>
    <div v-else-if="error" class="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">{{ error }}</div>

    <div v-else>
      <!-- 题库统计 -->
      <div class="mb-4 rounded-sm border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        N2 共 {{ exams.length }} 套 · {{ stats.total }} 题组（{{ stats.answered }} 有答案 / {{ stats.missing }} 待补全）
      </div>

      <!-- 试卷列表 -->
      <div class="space-y-2">
        <div
          v-for="e in exams"
          :key="e.examTitle"
          class="flex items-center justify-between rounded-sm border border-gray-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm"
        >
          <div class="min-w-0">
            <h2 class="text-base font-medium text-gray-900">{{ e.examTitle }} JLPT {{ e.level }}</h2>
            <p class="mt-0.5 text-xs text-gray-400">
              {{ e.sections.length }} 大题 · {{ examQuestionCount(e) }} 题组
              <span class="ml-1 rounded-sm bg-gray-100 px-1 py-0.5">
                {{ e.sections.filter((s) => s.kind === 'vocab' || s.kind === 'grammar').length }} 文字词汇·语法
                / {{ e.sections.filter((s) => s.kind === 'reading' || s.kind === 'comprehension').length }} 读解
              </span>
            </p>
          </div>
          <div class="flex flex-shrink-0 gap-2">
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              @click="startPractice(e)"
            >练习</button>
            <button
              type="button"
              class="rounded-sm bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              @click="startExam(e)"
            >考试</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

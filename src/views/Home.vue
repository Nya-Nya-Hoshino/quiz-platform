<script setup lang="ts">
/**
 * 首页：试卷列表（本地题库 / 远程 API 统一入口）
 */
import { onMounted, ref } from 'vue'
import { fetchExamList } from '../services/api'
import { useRouter } from 'vue-router'
import NoticeBar from '../components/NoticeBar.vue'

interface ExamMeta {
  id: string
  title: string
  timeLimit: number
  passScore: number
  totalScore: number
  totalQuestions: number
  sections: { name: string; count: number }[]
}

const router = useRouter()
const exams = ref<ExamMeta[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    exams.value = await fetchExamList()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

function startExam(id: string) {
  router.push(`/exam/${id}`)
}

function startPractice(id: string) {
  router.push(`/practice/${id}`)
}
</script>

<template>
  <div>
    <!-- 公告栏 -->
    <div class="mb-4"><NoticeBar /></div>

    <!-- 顶部欢迎区 -->
    <div class="mb-6 rounded-sm border border-gray-200 bg-white p-6">
      <h1 class="text-xl font-semibold text-gray-900">选择试卷开始学习</h1>
      <p class="mt-1 text-sm text-gray-500">
        支持考试模式（限时、交卷后评分）与练习模式（逐题即时判分、查看解析）。
      </p>
    </div>

    <!-- 加载/错误状态 -->
    <div v-if="loading" class="loading-block"><span class="loading-spinner loading-lg" />正在加载题库…</div>
    <div v-else-if="error" class="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      题库加载失败：{{ error }}
    </div>

    <!-- JLPT 真题入口（主内容） -->
    <div class="mb-6 rounded-sm border border-gray-200 bg-white p-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">JLPT 真题</h2>
          <p class="mt-1 text-sm text-gray-500">
            N2 历年真题（2018-2026）整卷呈现，考试/练习双模式，满分 120 分
          </p>
        </div>
        <router-link
          to="/jlpt"
          class="flex-shrink-0 rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >进入真题库</router-link>
      </div>
    </div>

    <!-- 通用试卷（仅当存在时显示） -->
    <div v-if="exams.length" class="space-y-3">
      <h3 class="text-sm font-semibold text-gray-700">N3 自主练习</h3>
      <div
        v-for="exam in exams"
        :key="exam.id"
        class="rounded-sm border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h4 class="text-base font-medium text-gray-900">{{ exam.title }}</h4>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="s in exam.sections"
                :key="s.name"
                class="rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              >{{ s.name }} {{ s.count }}题</span>
            </div>
            <p class="mt-2 text-xs text-gray-400">
              {{ exam.totalQuestions }} 题 · 满分 {{ exam.totalScore }} · 及格 {{ exam.passScore }} · 限时 {{ exam.timeLimit }} 分钟
            </p>
          </div>

          <div class="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              @click="startPractice(exam.id)"
            >练习</button>
            <button
              type="button"
              class="rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              @click="startExam(exam.id)"
            >考试</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

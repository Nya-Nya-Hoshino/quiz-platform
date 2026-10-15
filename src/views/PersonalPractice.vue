<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import type { Exam, UserAnswerValue } from '../types/exam'
import { buildQuestionRefs, findQuestion, findReadingGroup } from '../utils/parser'
import { parsePersonalExam } from '../utils/personalExam'
import { isAnswered, isCorrect } from '../utils/judge'
import { loadPersonalProgress, savePersonalProgress } from '../utils/personalProgress'
import { fetchPersonalPractice, PersonalBankError } from '../services/personalBank'
import QuestionCard from '../components/QuestionCard.vue'
import AnswerPanel from '../components/AnswerPanel.vue'
import ExamProgress from '../components/ExamProgress.vue'
import ExplanationPanel from '../components/ExplanationPanel.vue'

const route = useRoute()
const auth = useAuthStore()
const id = computed(() => String(route.params.id))
const exam = ref<Exam | null>(null)
const loading = ref(false)
const error = ref('')
const needsLogin = ref(false)
const currentIndex = ref(0)
const answers = ref<Record<string, UserAnswerValue>>({})
const submitted = ref<Set<string>>(new Set())
const completed = ref(false)
const owner = ref('')
const questionArea = ref<HTMLElement | null>(null)
let loadedToken = ''
let controller: AbortController | undefined

const refs = computed(() => exam.value ? buildQuestionRefs(exam.value) : [])
const current = computed(() => exam.value ? findQuestion(exam.value, refs.value[currentIndex.value]?.id ?? '') : undefined)
const passage = computed(() => exam.value && current.value ? findReadingGroup(exam.value, current.value.id)?.content : undefined)
const currentSubmitted = computed(() => Boolean(current.value && submitted.value.has(current.value.id)))
const answeredSet = computed(() => new Set(refs.value.flatMap((ref, index) => submitted.value.has(ref.id) ? [index] : [])))
const correctCount = computed(() => refs.value.filter(ref => {
  const q = exam.value && findQuestion(exam.value, ref.id)
  return q && submitted.value.has(ref.id) && isCorrect(q, answers.value[ref.id] as never)
}).length)
const points = computed(() => refs.value.reduce((score, ref) => {
  const q = exam.value && findQuestion(exam.value, ref.id)
  return score + (q && submitted.value.has(ref.id) && isCorrect(q, answers.value[ref.id] as never) ? q.score : 0)
}, 0))

function persist(): void {
  if (!exam.value || owner.value !== auth.username || loadedToken !== auth.token) return
  savePersonalProgress(owner.value, id.value, { currentIndex: currentIndex.value, answers: answers.value, submitted: [...submitted.value], completed: completed.value })
}

const answer = computed<unknown>({
  get: () => current.value ? answers.value[current.value.id] ?? null : null,
  set: value => {
    if (!current.value || currentSubmitted.value) return
    answers.value[current.value.id] = value as UserAnswerValue
    persist()
  },
})

async function load(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  exam.value = null
  answers.value = {}
  submitted.value = new Set()
  currentIndex.value = 0
  completed.value = false
  owner.value = ''
  loadedToken = ''
  error.value = ''
  needsLogin.value = false
  loading.value = false
  if (!auth.token) return
  const token = auth.token
  const username = auth.username
  loading.value = true
  try {
    const result = await fetchPersonalPractice(id.value, token, request.signal)
    if (controller !== request || token !== auth.token) return
    exam.value = parsePersonalExam(result.exam)
    owner.value = username
    loadedToken = token
    const saved = loadPersonalProgress(username, id.value)
    if (saved) {
      const validIds = new Set(refs.value.map(ref => ref.id))
      answers.value = Object.fromEntries(Object.entries(saved.answers).filter(([key]) => validIds.has(key)))
      submitted.value = new Set(saved.submitted.filter(key => validIds.has(key) && isAnswered(answers.value[key] as never)))
      currentIndex.value = Math.min(saved.currentIndex, Math.max(refs.value.length - 1, 0))
      completed.value = saved.completed
    }
    window.scrollTo({ top: 0 })
  } catch (cause) {
    if (request.signal.aborted) return
    error.value = cause instanceof Error ? cause.message : '练习加载失败'
    needsLogin.value = cause instanceof PersonalBankError && cause.status === 401
  } finally {
    if (controller === request) loading.value = false
  }
}

function jump(index: number): void {
  if (index < 0 || index >= refs.value.length) return
  currentIndex.value = index
  persist()
  void nextTick(() => questionArea.value?.scrollIntoView({ block: 'start' }))
}
function submit(): void {
  if (!current.value || currentSubmitted.value || !isAnswered(answer.value as never)) return
  submitted.value.add(current.value.id)
  persist()
}
function finish(): void { completed.value = true; persist() }
function restart(): void {
  answers.value = {}; submitted.value = new Set(); currentIndex.value = 0; completed.value = false; persist()
}

watch(() => [auth.token, id.value], () => { void load() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <router-link to="/personal-bank" class="mb-4 inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">← 返回个人题库</router-link>
    <div v-if="!auth.isLoggedIn || needsLogin" class="rounded-sm border border-blue-200 bg-blue-50 p-5">
      <p class="text-sm text-gray-700">请登录接收该练习的账号后再作答。</p>
      <router-link to="/account" class="mt-3 inline-flex min-h-11 items-center rounded-sm bg-blue-600 px-4 py-2 text-sm text-white">前往账号中心</router-link>
    </div>
    <div v-else-if="loading" class="loading-block"><span class="loading-spinner" />正在加载个人练习…</div>
    <div v-else-if="error" role="alert" class="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">{{ error }}</div>
    <template v-else-if="exam">
      <div class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
        <h1 class="text-lg font-semibold text-gray-900">{{ exam.title }}</h1>
        <p class="mt-1 text-xs leading-5 text-gray-500">个人练习 · {{ owner }} · 进度仅保存在当前浏览器，切换设备需重新作答</p>
        <div class="mt-3"><ExamProgress :current="currentIndex" :total="refs.length" :answered="submitted.size" /></div>
      </div>
      <div v-if="completed" class="rounded-sm border border-blue-200 bg-blue-50 p-5">
        <h2 class="text-base font-semibold text-gray-900">本次练习已结束</h2>
        <p class="mt-3 text-sm leading-7 text-gray-700">已答 {{ submitted.size }}/{{ refs.length }} 题 · 正确 {{ correctCount }} 题 · 得分 {{ points }}/{{ exam.totalScore }}</p>
        <div class="mt-4 flex flex-wrap gap-3">
          <button type="button" class="rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" @click="restart">重新练习</button>
          <router-link to="/personal-bank" class="inline-flex min-h-11 items-center rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">返回个人题库</router-link>
        </div>
      </div>
      <template v-else-if="current">
        <div ref="questionArea" class="scroll-mt-44 rounded-sm border border-gray-200 bg-white p-4 sm:p-6 lg:scroll-mt-20">
          <QuestionCard :question="current" v-model="answer" :passage="passage" :readonly="currentSubmitted" :show-tools="false" />
        </div>
        <ExplanationPanel class="mt-4" :question="current" :user-answer="answer" :show="currentSubmitted" :is-correct="currentSubmitted ? isCorrect(current, answer as never) : undefined" />
        <div class="mt-4 rounded-sm border border-gray-200 bg-white p-4">
          <AnswerPanel mode="practice" :current="currentIndex" :total="refs.length" :answered="isAnswered(answer as never)" :submitted="currentSubmitted" :answered-set="answeredSet" @prev="jump(currentIndex - 1)" @next="jump(currentIndex + 1)" @jump="jump" @submit="submit" @finish="finish" />
        </div>
      </template>
    </template>
  </div>
</template>

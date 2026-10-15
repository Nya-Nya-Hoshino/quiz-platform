<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { fetchPersonalPractices, sendPersonalPractice, type PersonalPracticeMeta } from '../services/personalBank'

const auth = useAuthStore()
const checking = ref(false)
const canManage = ref(false)
const recipient = ref('')
const selectedExam = ref<Record<string, unknown> | null>(null)
const filename = ref('')
const title = ref('')
const questionCount = ref(0)
const sending = ref(false)
const error = ref('')
const receipt = ref<{ username: string; practice: PersonalPracticeMeta } | null>(null)
let controller: AbortController | undefined

async function checkPermission(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  canManage.value = false
  recipient.value = ''
  selectedExam.value = null
  filename.value = ''
  title.value = ''
  questionCount.value = 0
  receipt.value = null
  error.value = ''
  checking.value = false
  sending.value = false
  if (!auth.token) return
  const token = auth.token
  checking.value = true
  try {
    const result = await fetchPersonalPractices(token, request.signal)
    if (controller === request && token === auth.token) canManage.value = result.canManage
  } catch (cause) {
    if (!request.signal.aborted) error.value = cause instanceof Error ? cause.message : '权限检查失败'
  } finally {
    if (controller === request) checking.value = false
  }
}

async function chooseFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const token = auth.token
  selectedExam.value = null
  filename.value = ''
  receipt.value = null
  error.value = ''
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('网页投递的 JSON 文件不能超过 2 MiB')
    const raw: unknown = JSON.parse(await file.text())
    if (token !== auth.token || !canManage.value || input.files?.[0] !== file) return
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('练习必须是 JSON 对象')
    const exam = raw as Record<string, unknown>
    if (typeof exam.title !== 'string' || !exam.title.trim() || !Array.isArray(exam.questions) || !exam.questions.length) throw new Error('练习需提供非空 title 和 questions 数组')
    selectedExam.value = exam
    filename.value = file.name
    title.value = exam.title
    questionCount.value = exam.questions.length
  } catch (cause) {
    if (token === auth.token) error.value = cause instanceof Error ? cause.message : '文件读取失败'
  }
}

async function send(): Promise<void> {
  if (!canManage.value || !selectedExam.value || !recipient.value || sending.value) return
  const token = auth.token
  const request = controller
  sending.value = true
  error.value = ''
  receipt.value = null
  try {
    const result = await sendPersonalPractice(recipient.value, selectedExam.value, token, request?.signal)
    if (token === auth.token && request === controller) receipt.value = result
  } catch (cause) {
    if (!request?.signal.aborted && token === auth.token) error.value = cause instanceof Error ? cause.message : '投递失败'
  } finally {
    if (token === auth.token && request === controller) sending.value = false
  }
}

watch(() => auth.token, () => { void checkPermission() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <router-link to="/personal-bank" class="mb-4 inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">← 返回个人题库</router-link>
    <h1 class="mb-2 text-lg font-semibold text-gray-900">投递个人练习</h1>
    <p class="mb-5 text-sm leading-6 text-gray-500">上传练习 JSON，并指定一个已注册账号接收。每次发送都会创建独立练习。</p>
    <div v-if="!auth.isLoggedIn" class="rounded-sm border border-blue-200 bg-blue-50 p-5">
      <p class="text-sm text-gray-700">请先登录具有投递权限的账号。</p>
      <router-link to="/account" class="mt-3 inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline">前往账号中心</router-link>
    </div>
    <div v-else-if="checking" class="loading-block"><span class="loading-spinner" />正在检查投递权限…</div>
    <div v-else-if="!canManage" class="rounded-sm border border-gray-200 bg-white p-5 text-sm leading-6 text-gray-600">{{ error || '当前账号没有投递权限，请联系服务器管理员配置授权账号。' }}</div>
    <form v-else class="space-y-4 rounded-sm border border-gray-200 bg-white p-4 sm:p-6" @submit.prevent="send">
      <div>
        <label for="personal-recipient" class="mb-2 block text-sm font-medium text-gray-700">接收账号</label>
        <input id="personal-recipient" v-model="recipient" type="text" required autocomplete="off" :disabled="sending" placeholder="填写完整账号名，区分大小写" class="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      </div>
      <div>
        <label for="personal-exam-file" class="mb-2 block text-sm font-medium text-gray-700">练习 JSON 文件</label>
        <input id="personal-exam-file" type="file" accept=".json,application/json" required :disabled="sending" class="block w-full max-w-full rounded-sm border border-gray-300 p-2 text-sm text-gray-600" @change="chooseFile" />
        <p class="mt-2 text-xs text-gray-500">沿用网站现有练习 JSON 结构，网页请求上限为 2 MiB。</p>
      </div>
      <div v-if="selectedExam" class="rounded-sm bg-gray-50 p-3 text-sm leading-6 text-gray-700">
        <p class="font-medium">{{ title }}</p>
        <p class="break-all text-xs text-gray-500">{{ filename }} · {{ questionCount }} 题</p>
        <p v-if="recipient" class="mt-2">接收账号：<strong>{{ recipient }}</strong></p>
      </div>
      <p v-if="error" role="alert" class="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-600">{{ error }}</p>
      <div v-if="receipt" role="status" class="rounded-sm border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-800">已发送“{{ receipt.practice.title }}”给 {{ receipt.username }}，对方刷新个人题库即可查看。</div>
      <button type="submit" class="rounded-sm bg-blue-600 px-5 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" :disabled="!selectedExam || !recipient || sending">{{ sending ? '正在发送…' : '发送练习' }}</button>
    </form>
  </div>
</template>

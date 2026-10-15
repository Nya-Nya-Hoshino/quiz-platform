<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { fetchPersonalPractices, PersonalBankError, type PersonalPracticeMeta } from '../services/personalBank'
import { loadPersonalProgress } from '../utils/personalProgress'

const auth = useAuthStore()
const practices = ref<PersonalPracticeMeta[]>([])
const loading = ref(false)
const error = ref('')
const needsLogin = ref(false)
const canManage = ref(false)
let controller: AbortController | undefined

async function load(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  practices.value = []
  canManage.value = false
  error.value = ''
  needsLogin.value = false
  loading.value = false
  if (!auth.token) return
  const token = auth.token
  loading.value = true
  try {
    const result = await fetchPersonalPractices(token, request.signal)
    if (controller === request && auth.token === token) {
      practices.value = result.practices
      canManage.value = result.canManage
    }
  } catch (cause) {
    if (request.signal.aborted) return
    error.value = cause instanceof Error ? cause.message : '个人题库加载失败'
    needsLogin.value = cause instanceof PersonalBankError && cause.status === 401
  } finally {
    if (controller === request) loading.value = false
  }
}

function progressLabel(id: string): string {
  const progress = loadPersonalProgress(auth.username, id)
  if (progress?.completed) return '本机已完成'
  return progress?.submitted.length ? `本机已答 ${progress.submitted.length} 题` : '尚未练习'
}

watch(() => auth.token, () => { void load() }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">个人题库</h1>
        <p class="mt-1 text-sm text-gray-500">接收站长为你的账号投递的专属练习</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <router-link v-if="canManage" to="/personal-bank/manage" class="inline-flex min-h-11 items-center rounded-sm border border-blue-300 bg-white px-4 py-2 text-sm text-blue-600 hover:bg-blue-50">投递练习</router-link>
        <button v-if="auth.isLoggedIn" type="button" class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50" :disabled="loading" @click="load">刷新题库</button>
      </div>
    </div>

    <div v-if="!auth.isLoggedIn || needsLogin" class="rounded-sm border border-blue-200 bg-blue-50 p-5">
      <h2 class="text-base font-medium text-gray-900">{{ needsLogin ? '请重新登录' : '登录后查看个人题库' }}</h2>
      <p class="mt-2 text-sm leading-6 text-gray-600">个人练习仅向接收账号开放，请登录站长指定的账号。</p>
      <router-link to="/account" class="mt-4 inline-flex min-h-11 items-center rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">前往账号中心</router-link>
    </div>
    <div v-else-if="loading" class="loading-block"><span class="loading-spinner" />正在加载个人题库…</div>
    <div v-else-if="error" role="alert" class="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">{{ error }}</div>
    <template v-else>
      <p class="mb-4 text-xs text-gray-500">{{ auth.username }} · 共 {{ practices.length }} 份练习 · 作答进度按账号保存在当前浏览器</p>
      <div v-if="!practices.length" class="rounded-sm border border-dashed border-gray-300 bg-white px-4 py-14 text-center">
        <h2 class="text-base font-medium text-gray-700">暂未收到练习</h2>
        <p class="mt-2 text-sm leading-6 text-gray-500">站长投递后，点击“刷新题库”即可查看。</p>
      </div>
      <div v-else class="space-y-3">
        <article v-for="practice in practices" :key="practice.id" class="rounded-sm border border-gray-200 bg-white p-4 sm:p-5">
          <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div class="min-w-0">
              <h2 class="break-words text-base font-medium text-gray-900">{{ practice.title }}</h2>
              <p class="mt-2 text-xs text-gray-500">{{ practice.totalQuestions }} 题 · 满分 {{ practice.totalScore }} · {{ progressLabel(practice.id) }}</p>
              <p class="mt-1 text-xs text-gray-400">收到于 {{ new Date(practice.receivedAt).toLocaleString() }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <span v-for="section in practice.sections" :key="section.name" class="rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{{ section.name || '综合' }} {{ section.count }} 题</span>
              </div>
            </div>
            <router-link :to="`/personal-bank/${practice.id}/practice`" class="inline-flex min-h-11 shrink-0 items-center rounded-sm bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">进入练习</router-link>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

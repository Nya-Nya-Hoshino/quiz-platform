<script setup lang="ts">
/**
 * 账号中心：注册 / 登录 / 云端数据同步 / 备份
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useWrongBookStore } from '../stores/wrongBook'
import { useFavoriteStore } from '../stores/favorites'
import { useHistoryStore } from '../stores/history'

const auth = useAuthStore()
const wrongBook = useWrongBookStore()
const favorites = useFavoriteStore()
const history = useHistoryStore()

const mode = ref<'login' | 'register'>('login')
const usernameInput = ref('')
const passwordInput = ref('')
const msg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)
const busyText = ref('')

async function submit(): Promise<void> {
  msg.value = null
  if (usernameInput.value.trim().length < 2) {
    msg.value = { type: 'err', text: '用户名至少 2 个字符' }
    return
  }
  if (passwordInput.value.length < 6) {
    msg.value = { type: 'err', text: '密码至少 6 位' }
    return
  }
  busyText.value = mode.value === 'login' ? '登录并同步中…' : '注册并首次上传中…'
  try {
    if (mode.value === 'login') {
      await auth.login(usernameInput.value.trim(), passwordInput.value)
    } else {
      await auth.register(usernameInput.value.trim(), passwordInput.value)
    }
    msg.value = { type: 'ok', text: mode.value === 'login' ? '登录成功，已同步云端数据' : '注册成功，本地数据已上传云端' }
  } catch (e) {
    msg.value = { type: 'err', text: (e as Error).message || '操作失败' }
  } finally {
    busyText.value = ''
  }
}

async function pushLocal(): Promise<void> {
  msg.value = null
  busyText.value = '上传中…'
  try {
    await auth.pushLocal()
    msg.value = { type: 'ok', text: '已上传本地数据到云端' }
  } catch (e) {
    msg.value = { type: 'err', text: (e as Error).message }
  } finally {
    busyText.value = ''
  }
}

async function pullCloud(): Promise<void> {
  msg.value = null
  busyText.value = '拉取中…'
  try {
    await auth.pullCloud()
    msg.value = { type: 'ok', text: '已从云端拉取数据（覆盖本地）' }
  } catch (e) {
    msg.value = { type: 'err', text: (e as Error).message }
  } finally {
    busyText.value = ''
  }
}

async function doBackup(): Promise<void> {
  msg.value = null
  busyText.value = '备份中…'
  try {
    const file = await auth.backup()
    msg.value = { type: 'ok', text: `后端备份完成：${file}` }
  } catch (e) {
    msg.value = { type: 'err', text: (e as Error).message }
  } finally {
    busyText.value = ''
  }
}

async function doDownload(): Promise<void> {
  msg.value = null
  busyText.value = '准备下载…'
  try {
    await auth.downloadBackupFile()
    msg.value = { type: 'ok', text: '备份文件已开始下载' }
  } catch (e) {
    msg.value = { type: 'err', text: (e as Error).message }
  } finally {
    busyText.value = ''
  }
}

const localStats = computed(() => ({
  wrong: wrongBook.total,
  fav: favorites.total,
  hist: history.total,
}))
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <!-- ===== 已登录 ===== -->
    <div v-if="auth.isLoggedIn" class="rounded-sm border border-gray-200 bg-white p-6">
      <h1 class="text-lg font-semibold text-gray-900">账号中心</h1>
      <p class="mt-1 text-sm text-gray-400">
        已登录：<b class="text-gray-700">{{ auth.username }}</b>
        <span class="ml-2 text-xs text-gray-400">最近同步 {{ auth.lastSyncAt ? new Date(auth.lastSyncAt).toLocaleString() : '—' }}</span>
      </p>

      <!-- 本地数据统计 -->
      <div class="mt-4 grid grid-cols-3 gap-3">
        <div class="rounded-sm bg-gray-50 p-3 text-center">
          <p class="text-2xl font-semibold text-gray-800">{{ localStats.wrong }}</p>
          <p class="text-xs text-gray-400">错题</p>
        </div>
        <div class="rounded-sm bg-gray-50 p-3 text-center">
          <p class="text-2xl font-semibold text-gray-800">{{ localStats.fav }}</p>
          <p class="text-xs text-gray-400">收藏</p>
        </div>
        <div class="rounded-sm bg-gray-50 p-3 text-center">
          <p class="text-2xl font-semibold text-gray-800">{{ localStats.hist }}</p>
          <p class="text-xs text-gray-400">历史记录</p>
        </div>
      </div>

      <!-- 操作 -->
      <div class="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="auth.busy"
          @click="pushLocal"
        >
          上传本地到云端
        </button>
        <button
          type="button"
          class="rounded-sm border border-blue-300 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          :disabled="auth.busy"
          @click="pullCloud"
        >
          从云端拉取（覆盖本地）
        </button>
        <button
          type="button"
          class="rounded-sm border border-violet-300 px-4 py-2 text-sm text-violet-600 hover:bg-violet-50 disabled:opacity-50"
          :disabled="auth.busy"
          @click="doBackup"
        >
          后端备份快照
        </button>
        <button
          type="button"
          class="rounded-sm border border-violet-300 px-4 py-2 text-sm text-violet-600 hover:bg-violet-50 disabled:opacity-50"
          :disabled="auth.busy"
          @click="doDownload"
        >
          下载全站备份
        </button>
        <button
          type="button"
          class="rounded-sm border border-red-200 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
          @click="auth.logout()"
        >
          退出登录
        </button>
      </div>

      <p v-if="busyText" class="mt-4 text-sm text-gray-400">{{ busyText }}…</p>
      <p v-if="msg" class="mt-3 text-sm" :class="msg.type === 'ok' ? 'text-green-600' : 'text-red-500'">
        {{ msg.text }}
      </p>

      <p class="mt-6 rounded-sm bg-blue-50 p-3 text-xs leading-5 text-blue-700">
        同步说明：登录后**实时自动同步**——错题本 / 收藏 / 历史记录 / 做题进度的任何变化都会在数秒内自动上传云端；
        页面刷新后自动恢复同步。「上传本地到云端」以本地为准，「从云端拉取」以云端为准（会覆盖本地），
        换设备后登录同一账号即可恢复全部数据。
      </p>
    </div>

    <!-- ===== 未登录：登录 / 注册 ===== -->
    <div v-else class="rounded-sm border border-gray-200 bg-white p-6">
      <h1 class="text-lg font-semibold text-gray-900">账号登录</h1>
      <p class="mt-1 text-sm text-gray-400">登录后错题本 / 收藏 / 历史记录可在多设备间同步</p>

      <!-- 切换 -->
      <div class="mt-4 inline-flex rounded-sm border border-gray-200 p-0.5">
        <button
          type="button"
          class="rounded-sm px-4 py-1.5 text-sm"
          :class="mode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'"
          @click="mode = 'login'"
        >
          登录
        </button>
        <button
          type="button"
          class="rounded-sm px-4 py-1.5 text-sm"
          :class="mode === 'register' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'"
          @click="mode = 'register'"
        >
          注册
        </button>
      </div>

      <div class="mt-4 space-y-3">
        <label class="block text-sm text-gray-500">
          用户名
          <input
            v-model="usernameInput"
            type="text"
            class="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
            placeholder="2-32 个字符"
            autocomplete="username"
          />
        </label>
        <label class="block text-sm text-gray-500">
          密码
          <input
            v-model="passwordInput"
            type="password"
            class="mt-1 w-full rounded-sm border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
            placeholder="至少 6 位"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </label>
        <button
          type="button"
          class="w-full rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="auth.busy"
          @click="submit"
        >
          {{ mode === 'login' ? (busyText || '登录') : (busyText || '注册并上传本地数据') }}
        </button>
        <p v-if="msg" class="text-sm" :class="msg.type === 'ok' ? 'text-green-600' : 'text-red-500'">{{ msg.text }}</p>
      </div>

      <p class="mt-5 rounded-sm bg-gray-50 p-3 text-xs leading-5 text-gray-400">
        首次使用：注册后，当前浏览器中的错题本 / 收藏 / 历史记录 / 做题进度会自动上传到云端，
        之后在任何设备登录同一账号即可同步。
      </p>
    </div>
  </div>
</template>

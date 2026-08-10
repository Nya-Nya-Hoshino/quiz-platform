/**
 * 账号状态与数据同步（Auth Store）
 *
 * 登录态持久化到 localStorage（quiz-platform:auth）。
 * 数据包 = 错题本 + 收藏本 + 历史记录 + 练习/考试进度 + 每日统计。
 *
 * 同步策略：
 * - 登录成功后自动拉取云端数据；云端为空 → 自动上传本地（首次兼容浏览器旧缓存）
 * - 云端有数据 → 覆盖本地（云端为准）
 * - **实时自动同步**：登录后数据变化（错题/收藏/历史/进度）自动上传云端（watch 深度监听 + 定时 hash 兜底）
 * - 手动：上传本地 / 拉取云端 / 备份
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  register as apiRegister,
  login as apiLogin,
  fetchRemoteData,
  pushRemoteData,
  downloadBackup,
  triggerBackup,
  logoutRemote,
  type SyncPayload,
} from '../services/account'
import { useWrongBookStore } from './wrongBook'
import { useFavoriteStore } from './favorites'
import { useHistoryStore } from './history'
import { usePracticeStore } from './practice'

const AUTH_KEY = 'quiz-platform:auth'
const PROGRESS_PREFIX = 'quiz-platform:progress'

interface AuthState {
  token: string
  username: string
  savedAt: number
}

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AuthState
      if (parsed.token && parsed.username) return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function persistAuth(state: AuthState | null): void {
  if (state) localStorage.setItem(AUTH_KEY, JSON.stringify(state))
  else localStorage.removeItem(AUTH_KEY)
}

/** 收集本地全部数据 → 数据包 */
function collectPayload(): SyncPayload {
  const wrongBook = useWrongBookStore()
  const favorites = useFavoriteStore()
  const history = useHistoryStore()
  const progress: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PROGRESS_PREFIX)) {
      try {
        progress[key] = JSON.parse(localStorage.getItem(key) ?? 'null')
      } catch {
        /* ignore */
      }
    }
  }
  let daily: unknown = null
  try {
    daily = JSON.parse(localStorage.getItem('quiz-platform:daily-stat') ?? 'null')
  } catch {
    /* ignore */
  }
  return {
    version: 1,
    exportedAt: Date.now(),
    wrongBook: wrongBook.records,
    favorites: favorites.records,
    history: history.records,
    progress,
    daily,
  }
}

/** 把云端数据包写入本地（覆盖） */
function applyPayload(payload: SyncPayload): void {
  const wrongBook = useWrongBookStore()
  const favorites = useFavoriteStore()
  const history = useHistoryStore()
  wrongBook.hydrate(Array.isArray(payload.wrongBook) ? (payload.wrongBook as never[]) : [])
  favorites.hydrate(Array.isArray(payload.favorites) ? (payload.favorites as never[]) : [])
  history.hydrate(Array.isArray(payload.history) ? (payload.history as never[]) : [])
  // 进度：先清空旧的再写入云端值
  if (payload.progress && typeof payload.progress === 'object') {
    for (const key of Object.keys(payload.progress)) {
      try {
        localStorage.setItem(key, JSON.stringify(payload.progress[key]))
      } catch {
        /* ignore */
      }
    }
  }
  if (payload.daily != null) {
    try {
      localStorage.setItem('quiz-platform:daily-stat', JSON.stringify(payload.daily))
    } catch {
      /* ignore */
    }
  }
}

export const useAuthStore = defineStore('auth', () => {
  const state = ref<AuthState | null>(loadAuth())
  const busy = ref(false)
  const lastSyncAt = ref(state.value?.savedAt ?? 0)

  const isLoggedIn = computed(() => Boolean(state.value?.token))
  const username = computed(() => state.value?.username ?? '')

  async function register(usernameInput: string, password: string): Promise<void> {
    busy.value = true
    try {
      const r = await apiRegister(usernameInput, password)
      state.value = { token: r.token, username: r.username, savedAt: 0 }
      persistAuth(state.value)
      // 首次注册：云端为空 → 上传本地缓存（兼容旧浏览器数据）
      await pushRemoteData(r.token, collectPayload())
      startAutoSync()
    } finally {
      busy.value = false
    }
  }

  async function login(usernameInput: string, password: string): Promise<void> {
    busy.value = true
    try {
      const r = await apiLogin(usernameInput, password)
      state.value = { token: r.token, username: r.username, savedAt: 0 }
      persistAuth(state.value)
      await syncFromCloud()
      startAutoSync()
    } finally {
      busy.value = false
    }
  }

  function logout(): void {
    stopAutoSync()
    // 通知后端作废本设备 token（不影响其他设备登录态）
    if (state.value) void logoutRemote(state.value.token)
    state.value = null
    persistAuth(null)
    lastSyncAt.value = 0
  }

  /* ===== 实时自动同步 ===== */
  let autoSyncOn = false
  let syncTimer: number | undefined
  let watchRegistered = false
  let lastHash = ''
  let debounceTimer: number | undefined

  /** 本地数据快照 hash（用于定时兜底比对） */
  function dataHash(): string {
    try {
      return JSON.stringify(collectPayload())
    } catch {
      return ''
    }
  }

  /** 防抖后的自动上传（仅登录态） */
  async function syncSoon(): Promise<void> {
    if (!state.value || !autoSyncOn) return
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(async () => {
      if (!state.value || !autoSyncOn || busy.value) return
      try {
        await pushRemoteData(state.value.token, collectPayload())
        lastSyncAt.value = Date.now()
        lastHash = dataHash()
      } catch {
        /* 网络失败忽略，下轮重试 */
      }
    }, 3000)
  }

  /** 登录后开启：数据变化实时上传（watch 深度监听）+ 定时 hash 兜底 */
  function startAutoSync(): void {
    autoSyncOn = true
    lastHash = dataHash()
    // watch 只注册一次（store 为单例）
    if (!watchRegistered) {
      watchRegistered = true
      const practice = usePracticeStore()
      watch(
        () => [
          useWrongBookStore().records,
          useFavoriteStore().records,
          useHistoryStore().records,
          practice.states,
          practice.daily,
        ],
        () => {
          if (autoSyncOn && state.value) void syncSoon()
        },
        { deep: true },
      )
    }
    // 定时兜底：直接写入 localStorage 的数据（如进度存档）也能同步
    if (!syncTimer) {
      syncTimer = window.setInterval(() => {
        if (!autoSyncOn || !state.value) return
        if (dataHash() !== lastHash) void syncSoon()
      }, 15000)
    }
  }

  function stopAutoSync(): void {
    autoSyncOn = false
    if (syncTimer) {
      window.clearInterval(syncTimer)
      syncTimer = undefined
    }
  }

  /** 从云端拉取并写入本地；云端为空则上传本地 */
  async function syncFromCloud(): Promise<void> {
    if (!state.value) return
    busy.value = true
    try {
      const res = await fetchRemoteData(state.value.token)
      if (res.empty || !res.payload) {
        // 云端无数据 → 首次上传本地
        const payload = collectPayload()
        await pushRemoteData(state.value.token, payload)
        lastSyncAt.value = Date.now()
      } else {
        applyPayload(res.payload)
        state.value.savedAt = res.savedAt ?? 0
        persistAuth(state.value)
        lastSyncAt.value = state.value.savedAt
      }
    } finally {
      busy.value = false
    }
  }

  /** 手动上传本地数据到云端 */
  async function pushLocal(): Promise<void> {
    if (!state.value) return
    busy.value = true
    try {
      const payload = collectPayload()
      await pushRemoteData(state.value.token, payload)
      lastSyncAt.value = Date.now()
    } finally {
      busy.value = false
    }
  }

  /** 手动从云端拉取（覆盖本地） */
  async function pullCloud(): Promise<void> {
    if (!state.value) return
    await syncFromCloud()
  }

  async function backup(): Promise<string> {
    if (!state.value) throw new Error('请先登录')
    return triggerBackup(state.value.token)
  }

  async function downloadBackupFile(): Promise<void> {
    if (!state.value) throw new Error('请先登录')
    await downloadBackup(state.value.token)
  }

  return {
    isLoggedIn,
    username,
    busy,
    lastSyncAt,
    register,
    login,
    logout,
    syncFromCloud,
    pushLocal,
    pullCloud,
    backup,
    downloadBackupFile,
    startAutoSync,
    stopAutoSync,
  }
})

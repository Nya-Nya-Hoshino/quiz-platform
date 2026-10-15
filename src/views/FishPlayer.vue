<script setup lang="ts">
/**
 * 网页媒体播放器（隐藏页 /fishplayer）
 *
 * 播放服务器端媒体库（音乐/视频）：
 * - 音乐：专辑封面 + 播放控制 + 同步歌词（LRC / QRC，可点击歌词跳转）
 * - 视频：原生播放器
 * - 列表：音乐/视频筛选 + 关键词搜索
 *
 * 防中断设计（分段缓存）：
 * - 播放直连服务器（服务端对同一媒体「冻结长度」，文件边补全边播也不会因长度跳变中断）
 * - 后台把媒体按 1 MiB 分段缓存到 Cache Storage；完整缓存后再次播放即完全本地、零网络依赖
 * - 源文件仍在补全时：到达当前可用末尾会自动按最新长度重新取源并保留进度续播（不是中断停止）
 *
 * 上传与管理见隐藏页 /fishplayer/upload。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchLyrics, fetchMediaList, formatSize, type MediaItem } from '../services/media'
import {
  cacheStats,
  clearMediaCache,
  ensureCached,
  isCacheable,
  type CacheProgress,
} from '../services/mediaCache'
import { activeLyricIndex, formatTime, looksEncrypted, parseLyrics, type LyricDoc } from '../utils/lrc'

/* ===== 列表 ===== */
const items = ref<MediaItem[]>([])
const loading = ref(true)
const error = ref('')

const filter = ref<'all' | 'audio' | 'video'>('all')
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return items.value.filter((m) => {
    if (filter.value !== 'all' && m.type !== filter.value) return false
    if (!kw) return true
    return `${m.title} ${m.artist} ${m.album} ${m.id}`.toLowerCase().includes(kw)
  })
})

const audioCount = computed(() => items.value.filter((m) => m.type === 'audio').length)
const videoCount = computed(() => items.value.filter((m) => m.type === 'video').length)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    items.value = await fetchMediaList()
    if (!current.value && items.value.length) selectItem(items.value[0])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

/* ===== 当前播放 ===== */
const current = ref<MediaItem | null>(null)
const audioEl = ref<HTMLAudioElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.9)
const muted = ref(false)
const coverFailed = ref(false)

const coverUrl = computed(() => (current.value && !coverFailed.value ? current.value.coverUrl : ''))
const isVideo = computed(() => current.value?.type === 'video')

/* ===== 分段缓存状态 ===== */
interface CacheInfo {
  status: 'idle' | 'caching' | 'cached' | 'direct'
  bytes: number
  total: number
}
const cacheState = ref<Record<string, CacheInfo>>({})
const cacheStatsInfo = ref({ items: 0, bytes: 0 })
/** 已完整缓存媒体的本地 Blob 地址：id → objectURL */
const blobUrls = new Map<string, string>()
/** 当前正在进行的缓存任务（切换曲目时中止，避免旧任务继续占用带宽） */
let cacheAbort: AbortController | null = null
/** 续播用的一次性地址（带 ?fresh=1，让服务端按最新长度重新冻结） */
const srcOverride = ref('')
/**
 * 本次播放实际使用的地址快照。
 * 只在「选中曲目」时决定（已完整缓存 → 本地 Blob；否则直连服务器）。
 * 刻意不在缓存完成时替换 —— 中途换 src 会让浏览器重新加载、打断当前播放。
 */
const activeSrc = ref('')

/** 播放地址：续播覆盖 > 选中时确定的地址 */
const playSrc = computed(() => srcOverride.value || activeSrc.value)

function cacheInfoOf(item: MediaItem): CacheInfo {
  return cacheState.value[item.id] ?? { status: 'idle', bytes: 0, total: item.size }
}

async function refreshCacheStats(): Promise<void> {
  try {
    cacheStatsInfo.value = await cacheStats()
  } catch {
    /* ignore */
  }
}

/**
 * 后台分段缓存。
 *
 * 策略（避免抢带宽导致播放卡顿）：
 * - 播放期间**不缓存**（此前并发全速下载会与正在播放的流抢带宽，公网隧道下尤其明显）
 * - 暂停 / 播放结束 / 手动点击「缓存本曲」时才缓存
 * - 串行单段 + 段间隔，切换曲目时立即中止旧任务
 */
async function startCache(item: MediaItem, opts: { force?: boolean } = {}): Promise<void> {
  if (blobUrls.has(item.id)) {
    cacheState.value = { ...cacheState.value, [item.id]: { status: 'cached', bytes: item.size, total: item.size } }
    return
  }
  if (!isCacheable(item.size)) {
    cacheState.value = { ...cacheState.value, [item.id]: { status: 'direct', bytes: 0, total: item.size } }
    return
  }
  const prev = cacheState.value[item.id]
  if (prev?.status === 'caching') return
  // 播放中且非强制 → 不占用带宽，标为等待（暂停时会自动开始）
  if (!opts.force && playing.value && !isFullyBuffered()) {
    cacheState.value = { ...cacheState.value, [item.id]: { status: 'idle', bytes: prev?.bytes ?? 0, total: item.size } }
    return
  }
  cancelCache()
  const ac = new AbortController()
  cacheAbort = ac
  const forId = item.id
  cacheState.value = { ...cacheState.value, [item.id]: { status: 'caching', bytes: prev?.bytes ?? 0, total: item.size } }
  try {
    const res = await ensureCached(item.url, item.size, {
      signal: ac.signal,
      concurrency: 1,
      gapMs: 250,
      // 强制缓存时也允许被暂停（用户点开又在听时让路）
      shouldPause: () => playing.value && !opts.force,
      onProgress: (p: CacheProgress) => {
        cacheState.value = {
          ...cacheState.value,
          [forId]: { status: 'caching', bytes: p.bytes, total: p.total },
        }
      },
    })
    if (res.aborted || ac.signal.aborted) return
    if (!res.cached) {
      cacheState.value = { ...cacheState.value, [forId]: { status: 'direct', bytes: 0, total: item.size } }
      return
    }
    if (res.complete) {
      const old = blobUrls.get(forId)
      if (old) URL.revokeObjectURL(old)
      blobUrls.set(forId, URL.createObjectURL(res.blob))
      cacheState.value = { ...cacheState.value, [forId]: { status: 'cached', bytes: res.bytes, total: item.size } }
      await refreshCacheStats()
    } else {
      // 源文件仍在补全 / 部分段暂不可用 → 保留已缓存进度，稍后重试
      cacheState.value = { ...cacheState.value, [forId]: { status: 'idle', bytes: res.bytes, total: item.size } }
    }
  } catch {
    cacheState.value = { ...cacheState.value, [forId]: { status: 'idle', bytes: 0, total: item.size } }
  } finally {
    if (cacheAbort === ac) cacheAbort = null
  }
}

function cancelCache(): void {
  cacheAbort?.abort()
  cacheAbort = null
}

/** 当前媒体是否已被浏览器完整缓冲（此时再下载缓存不影响播放） */
function isFullyBuffered(): boolean {
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (!el || !Number.isFinite(el.duration) || !el.duration) return false
  if (el.buffered.length === 0) return false
  return el.buffered.end(el.buffered.length - 1) >= el.duration - 1
}

/** 清空本地缓存 */
async function doClearCache(): Promise<void> {
  if (!window.confirm('清空本地媒体缓存？已缓存的音乐下次会重新从服务器下载。')) return
  cancelCache()
  for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  blobUrls.clear()
  cacheState.value = {}
  await clearMediaCache()
  await refreshCacheStats()
  if (current.value) void startCache(current.value)
}

/** 手动缓存当前曲目（用户明确要求，不等暂停） */
function manualCache(): void {
  if (current.value) void startCache(current.value, { force: true })
}

/** 是否显示「缓存本曲」按钮（可缓存且尚未开始/已回退直连） */
const canManualCache = computed(() => {
  const item = current.value
  if (!item || !isCacheable(item.size)) return false
  const st = cacheInfoOf(item).status
  return st === 'idle' || st === 'direct'
})

/* ===== 源文件补全时的自动续播 ===== */
let pollTimer: number | undefined
let continuing = false

function stopPoll(): void {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function schedulePoll(): void {
  if (pollTimer) return
  pollTimer = window.setInterval(() => void pollOnce(), 4000)
}

/** 轮询：文件体积增长则补缓存；补全完成后停止轮询 */
async function pollOnce(): Promise<void> {
  const item = current.value
  if (!item) return stopPoll()
  try {
    const list = await fetchMediaList()
    items.value = list
    const fresh = list.find((m) => m.id === item.id)
    if (!fresh) return stopPoll()
    const grew = fresh.size !== item.size
    current.value = fresh
    if (grew) void startCache(fresh)
    if (fresh.ready) {
      stopPoll()
      if (grew) void startCache(fresh)
    }
  } catch {
    /* 网络失败：下一轮再试 */
  }
}

/**
 * 到达当前可用末尾时按最新长度重新取源、保留进度继续播放。
 * 返回 true 表示已续播（调用方不要再切歌）。
 */
async function continueAfterGrowth(): Promise<boolean> {
  const item = current.value
  if (!item || continuing) return false
  continuing = true
  try {
    const list = await fetchMediaList()
    items.value = list
    const fresh = list.find((m) => m.id === item.id)
    if (!fresh || fresh.size <= item.size) return false
    current.value = fresh
    const el = isVideo.value ? videoEl.value : audioEl.value
    const pos = Math.max(0, (el?.currentTime ?? 0) - 0.3)
    // 显式要求服务端按最新长度重新冻结（否则同一次会话内长度保持不变，无法读到新增数据）
    srcOverride.value = `${fresh.url}?fresh=${Date.now()}`
    await nextTick()
    await new Promise((r) => window.setTimeout(r, 40))
    const el2 = isVideo.value ? videoEl.value : audioEl.value
    if (!el2) return false
    el2.currentTime = pos
    await el2.play().catch(() => {
      playing.value = false
    })
    playing.value = true
    void startCache(fresh)
    return true
  } catch {
    return false
  } finally {
    continuing = false
  }
}

function selectItem(item: MediaItem): void {
  current.value = item
  coverFailed.value = false
  currentTime.value = 0
  duration.value = 0
  srcOverride.value = ''
  // 选中时决定播放源：已完整缓存 → 本地 Blob（零网络、不受补全影响），否则直连
  activeSrc.value = blobUrls.get(item.id) ?? item.url
  lyricsDoc.value = null
  lyricsLoading.value = false
  lyricsMissing.value = false
  lyricsEncrypted.value = false
  // 切换曲目：中止上一首的后台缓存任务
  cancelCache()
  void loadLyrics(item)
  // 播放由用户手势或列表点击触发：切换后自动开始
  void startPlayback().then(() => {
    // 播放没起来（自动播放被拦截等）→ 此刻不占用播放带宽，可以后台缓存
    if (!playing.value) void startCache(item)
  })
  // 补全中轮询（只读列表，不下载）
  if (item.partial) schedulePoll()
  else stopPoll()
}

watch(
  () => current.value?.id,
  () => {
    if (!current.value) return
    const el = isVideo.value ? videoEl.value : audioEl.value
    if (el) {
      el.currentTime = 0
    }
  },
)

async function startPlayback(): Promise<void> {
  // 等 DOM 更新后再操作对应的媒体元素
  await new Promise((r) => window.setTimeout(r, 0))
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (!el) return
  try {
    await el.play()
    playing.value = true
  } catch {
    playing.value = false
  }
}

function togglePlay(): void {
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (!el) return
  if (el.paused) void el.play().catch(() => (playing.value = false))
  else el.pause()
}

function step(delta: number): void {
  const list = filtered.value
  if (!list.length) return
  const idx = list.findIndex((m) => m.id === current.value?.id)
  const next = idx < 0 ? 0 : (idx + delta + list.length) % list.length
  selectItem(list[next])
}

function seek(sec: number): void {
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (!el || !Number.isFinite(sec)) return
  el.currentTime = Math.min(Math.max(0, sec), duration.value || sec)
  currentTime.value = el.currentTime
}

function onTimeUpdate(): void {
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (!el) return
  currentTime.value = el.currentTime
  if (Number.isFinite(el.duration)) duration.value = el.duration
}

function onLoadedMetadata(): void {
  const el = isVideo.value ? videoEl.value : audioEl.value
  if (el && Number.isFinite(el.duration)) duration.value = el.duration
}

function onEnded(): void {
  playing.value = false
  const finished = current.value
  // 播放已结束：此刻不占用播放带宽，可以后台缓存这首（下次播放即本地）
  if (finished) void startCache(finished)
  // 源文件仍在补全：优先按最新长度续播，而不是停止/切歌
  void (async () => {
    if (finished?.partial) {
      const resumed = await continueAfterGrowth()
      if (resumed) return
    }
    step(1)
  })()
}

/** 暂停：不占用播放带宽，开始/继续后台分段缓存 */
function onPause(): void {
  playing.value = false
  if (current.value) void startCache(current.value)
}

function onProgressInput(e: Event): void {
  seek(Number((e.target as HTMLInputElement).value))
}

function onVolumeInput(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  volume.value = v
  muted.value = v === 0
  applyVolume()
}

function applyVolume(): void {
  for (const el of [audioEl.value, videoEl.value]) {
    if (el) {
      el.volume = volume.value
      el.muted = muted.value
    }
  }
}

function toggleMute(): void {
  muted.value = !muted.value
  applyVolume()
}

/* ===== 歌词 ===== */
const lyricsDoc = ref<LyricDoc | null>(null)
const lyricsLoading = ref(false)
const lyricsMissing = ref(false)
/** 歌词为加密格式（QQ 音乐 .qrc）无法解析 */
const lyricsEncrypted = ref(false)
const lyricsBox = ref<HTMLElement | null>(null)
const lyricsCache = new Map<string, LyricDoc | null>()

const activeLine = computed(() => {
  const doc = lyricsDoc.value
  if (!doc || !doc.synced) return -1
  return activeLyricIndex(doc.lines, currentTime.value)
})

/** 当前唱到的逐字下标（QRC / 增强 LRC 才有；无逐字时间轴返回 -1） */
const activeWordIdx = computed(() => {
  const doc = lyricsDoc.value
  const li = activeLine.value
  if (!doc || li < 0) return -1
  const words = doc.lines[li].words
  if (!words?.length) return -1
  let idx = -1
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= currentTime.value + 0.02) idx = i
    else break
  }
  return idx
})

/**
 * 逐字配色（当前字与其他字形成鲜明差别）：
 * - 正在唱的字：鲜明蓝色 + 加粗
 * - 本行已唱过：深灰
 * - 本行还没唱到：浅灰
 * - 非当前行：统一中灰
 */
function wordClass(lineIdx: number, wordIdx: number): string {
  if (lineIdx !== activeLine.value) return 'text-gray-400'
  if (wordIdx === activeWordIdx.value) return 'font-semibold text-blue-600'
  if (activeWordIdx.value >= 0 && wordIdx < activeWordIdx.value) return 'text-gray-600'
  return 'text-gray-300'
}

/* ===== 歌词排版：靠左 / 居中（本地记忆） ===== */
const LYRICS_ALIGN_KEY = 'quiz-platform:fishplayer-lyrics-align'
const lyricsAlign = ref<'left' | 'center'>('left')
try {
  const v = localStorage.getItem(LYRICS_ALIGN_KEY)
  if (v === 'center' || v === 'left') lyricsAlign.value = v
} catch {
  /* ignore */
}
function setLyricsAlign(v: 'left' | 'center'): void {
  lyricsAlign.value = v
  try {
    localStorage.setItem(LYRICS_ALIGN_KEY, v)
  } catch {
    /* ignore */
  }
}

/** 歌词格式提示（QRC 逐字 / LRC 同步 / 纯文本） */
const lyricsLabel = computed(() => {
  const doc = lyricsDoc.value
  if (!doc) return ''
  if (doc.format === 'qrc') return 'QRC 逐字歌词 · 点击行可跳转'
  if (doc.synced) {
    return doc.lines.some((l) => l.words?.length)
      ? '增强 LRC 逐字歌词 · 点击行可跳转'
      : 'LRC 同步歌词 · 点击歌词可跳转'
  }
  return '纯文本歌词（无时间轴）'
})

async function loadLyrics(item: MediaItem): Promise<void> {
  if (lyricsCache.has(item.id)) {
    const cached = lyricsCache.get(item.id) ?? null
    lyricsDoc.value = cached
    lyricsMissing.value = cached == null
    return
  }
  lyricsLoading.value = true
  lyricsEncrypted.value = false
  try {
    const text = await fetchLyrics(item.id)
    if (!text.trim()) {
      lyricsCache.set(item.id, null)
      lyricsDoc.value = null
      lyricsMissing.value = true
      return
    }
    // 加密歌词（QQ 音乐客户端 .qrc）无法解析，给出明确提示而不是显示乱码
    if (looksEncrypted(text)) {
      lyricsCache.set(item.id, null)
      if (current.value?.id === item.id) {
        lyricsDoc.value = null
        lyricsMissing.value = false
        lyricsEncrypted.value = true
      }
      return
    }
    const doc = parseLyrics(text)
    lyricsCache.set(item.id, doc)
    if (current.value?.id === item.id) {
      lyricsDoc.value = doc
      lyricsMissing.value = false
      lyricsEncrypted.value = false
    }
  } catch {
    lyricsMissing.value = true
  } finally {
    lyricsLoading.value = false
  }
}

/** 当前歌词行自动滚动到可视区中部 */
watch(activeLine, (idx) => {
  if (idx < 0 || !lyricsBox.value) return
  const el = lyricsBox.value.querySelector<HTMLElement>(`[data-line="${idx}"]`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

/* ===== 键盘快捷键（空格播放/暂停，左右切歌）===== */
function onKeydown(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.code === 'ArrowRight' && e.altKey) {
    step(1)
  } else if (e.code === 'ArrowLeft' && e.altKey) {
    step(-1)
  }
}

onMounted(async () => {
  applyVolume()
  window.addEventListener('keydown', onKeydown)
  void refreshCacheStats()
  await load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stopPoll()
  cancelCache()
  for (const url of blobUrls.values()) URL.revokeObjectURL(url)
  blobUrls.clear()
})

/** 缓存状态文案（控制条徽标） */
const cacheLabel = computed(() => {
  const item = current.value
  if (!item) return ''
  const info = cacheInfoOf(item)
  if (info.status === 'cached') return '已缓存'
  if (info.status === 'caching') {
    const pct = info.total ? Math.min(99, Math.round((info.bytes / info.total) * 100)) : 0
    return `缓存 ${pct}%`
  }
  if (info.status === 'direct') return '直连'
  return ''
})

const typeLabel = (t: string): string => (t === 'audio' ? '音乐' : '视频')
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <!-- 头部 -->
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">网页媒体播放器</h1>
        <p class="mt-1 text-xs text-gray-400">
          服务器媒体库 · 共 {{ items.length }} 项（{{ audioCount }} 音乐 / {{ videoCount }} 视频）
          <span class="ml-1 text-gray-300">· 隐藏页，未在导航中公开</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="cacheStatsInfo.items" class="text-xs text-gray-400">
          本地缓存 {{ cacheStatsInfo.items }} 项 · {{ formatSize(cacheStatsInfo.bytes) }}
        </span>
        <button
          v-if="cacheStatsInfo.items"
          type="button"
          class="rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          @click="doClearCache"
        >清缓存</button>
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          @click="load"
        >刷新</button>
        <router-link
          to="/fishplayer/upload"
          class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >上传管理</router-link>
      </div>
    </div>

    <div v-if="loading" class="loading-block"><span class="loading-spinner loading-lg" />媒体库加载中…</div>
    <div v-else-if="error" class="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      {{ error }}
    </div>

    <div v-else-if="!items.length" class="rounded-sm border border-dashed border-gray-200 bg-white py-16 text-center">
      <p class="text-3xl text-gray-200">♪</p>
      <p class="mt-2 text-sm text-gray-400">媒体库还是空的</p>
      <p class="mt-1 text-xs text-gray-300">
        去
        <router-link to="/fishplayer/upload" class="text-blue-500 hover:underline">上传管理</router-link>
        添加音乐或视频，也可以直接把文件放进服务器的 data/media/ 目录
      </p>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <!-- ===== 播放区 ===== -->
      <div class="min-w-0">
        <div v-if="!current" class="rounded-sm border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          从右侧列表选择一项开始播放
        </div>

        <template v-else>
          <!-- 视频 -->
          <div v-if="isVideo" class="rounded-sm border border-gray-200 bg-white p-3">
            <video
              ref="videoEl"
              :src="playSrc"
              class="w-full rounded-sm bg-black"
              controls
              preload="metadata"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onLoadedMetadata"
              @play="playing = true"
              @pause="onPause"
              @ended="onEnded"
            />
            <div class="mt-3 min-w-0">
              <p class="truncate text-sm font-medium text-gray-900">{{ current.title }}</p>
              <p class="mt-0.5 truncate text-xs text-gray-400">
                {{ current.artist || '未知艺术家' }}<span v-if="current.album"> · {{ current.album }}</span>
                · {{ formatSize(current.size) }}
              </p>
            </div>
          </div>

          <!-- 音乐 -->
          <div v-else class="rounded-sm border border-gray-200 bg-white p-4">
            <div class="flex flex-col gap-4 sm:flex-row">
              <!-- 专辑封面 -->
              <div class="relative h-32 w-32 self-center flex-shrink-0 sm:self-auto overflow-hidden rounded-sm border border-gray-200 bg-gray-50">
                <img
                  v-if="coverUrl"
                  :src="coverUrl"
                  :alt="current.title"
                  class="h-full w-full object-cover"
                  @error="coverFailed = true"
                />
                <div v-else class="flex h-full w-full items-center justify-center text-3xl text-gray-300">♪</div>
              </div>
              <!-- 信息 -->
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-medium text-gray-900">{{ current.title }}</p>
                <p class="mt-1 truncate text-sm text-gray-500">{{ current.artist || '未知艺术家' }}</p>
                <p class="mt-0.5 truncate text-xs text-gray-400">
                  <span v-if="current.album">{{ current.album }} · </span>{{ current.ext.toUpperCase() }} · {{ formatSize(current.size) }}
                </p>
                <!-- 补全中提示（服务端文件仍在写入） -->
                <p v-if="current.partial" class="mt-1 text-[11px] text-amber-600">
                  源文件仍在补全中：可播放已就绪部分，补全后会自动接着播
                </p>

                <!-- 进度条 -->
                <div class="mt-4 flex items-center gap-2">
                  <span class="w-9 text-right text-[11px] tabular-nums text-gray-400">{{ formatTime(currentTime) }}</span>
                  <input
                    type="range"
                    class="h-1 min-w-0 flex-1 cursor-pointer accent-blue-600"
                    min="0"
                    :max="duration || 0"
                    step="0.1"
                    :value="currentTime"
                    @input="onProgressInput"
                  />
                  <span class="w-9 text-[11px] tabular-nums text-gray-400">{{ formatTime(duration) }}</span>
                </div>

                <!-- 播放控制 -->
                <div class="mt-2 flex flex-wrap items-center gap-y-2">
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                      title="上一首（Alt + ←）"
                      @click="step(-1)"
                    >
                      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M6 6h2v12H6zM20 6v12l-8.5-6z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700"
                      :title="playing ? '暂停（空格）' : '播放（空格）'"
                      @click="togglePlay"
                    >
                      <svg v-if="!playing" viewBox="0 0 24 24" class="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                      title="下一首（Alt + →）"
                      @click="step(1)"
                    >
                      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M16 6h2v12h-2zM4 6l8.5 6L4 18z" />
                      </svg>
                    </button>
                  </div>

                  <!-- 缓存状态（暂停/结束后自动缓存；完整缓存后本地播放） -->
                  <span
                    v-if="cacheLabel"
                    class="ml-2 rounded-sm px-1.5 py-0.5 text-[11px]"
                    :class="cacheInfoOf(current).status === 'cached'
                      ? 'bg-blue-50 text-blue-600'
                      : cacheInfoOf(current).status === 'caching'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-gray-50 text-gray-400'"
                  >{{ cacheLabel }}</span>
                  <button
                    v-if="canManualCache"
                    type="button"
                    class="ml-1 rounded-sm border border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50"
                    title="立即把本曲分段缓存到本地（播放中会稍占带宽，暂停时缓存不影响播放）"
                    @click="manualCache"
                  >缓存本曲</button>

                  <!-- 音量 -->
                  <div class="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      class="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      :title="muted ? '取消静音' : '静音'"
                      @click="toggleMute"
                    >
                      <svg v-if="muted" viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                    </button>
                    <input
                      type="range"
                      class="h-1 w-20 cursor-pointer accent-blue-600"
                      min="0"
                      max="1"
                      step="0.01"
                      :value="muted ? 0 : volume"
                      @input="onVolumeInput"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 歌词 -->
            <div class="mt-4 border-t border-gray-100 pt-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <p class="text-xs font-medium text-gray-500">歌词</p>
                <div class="flex items-center gap-2">
                  <span v-if="lyricsDoc" class="hidden text-xs text-gray-300 sm:inline">{{ lyricsLabel }}</span>
                  <!-- 排版：靠左 / 居中 -->
                  <div class="flex overflow-hidden rounded-sm border border-gray-200">
                    <button
                      type="button"
                      class="px-2 py-0.5 text-[11px] transition-colors"
                      :class="lyricsAlign === 'left' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'"
                      title="歌词靠左"
                      @click="setLyricsAlign('left')"
                    >靠左</button>
                    <button
                      type="button"
                      class="border-l border-gray-200 px-2 py-0.5 text-[11px] transition-colors"
                      :class="lyricsAlign === 'center' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'"
                      title="歌词居中"
                      @click="setLyricsAlign('center')"
                    >居中</button>
                  </div>
                </div>
              </div>
              <div v-if="lyricsLoading" class="py-4 text-center text-xs text-gray-300">歌词加载中…</div>
              <div
                v-else-if="lyricsEncrypted"
                class="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700"
              >
                这首歌的歌词是<b>加密格式</b>（QQ 音乐客户端下载的 .qrc），无法解析显示。<br />
                请在 QQ 音乐中复制歌词文本，或改用未加密的 QRC / LRC，在上传管理页重新保存。
              </div>
              <div
                v-else-if="!lyricsDoc"
                class="py-4 text-center text-xs text-gray-300"
              >暂无歌词{{ lyricsMissing ? '（可在上传管理页添加 LRC / QRC 歌词）' : '' }}</div>
              <div
                v-else
                ref="lyricsBox"
                class="font-mincho max-h-64 overflow-y-auto pr-1 text-[15px] leading-8"
                :class="lyricsAlign === 'center' ? 'text-center' : 'text-left'"
              >
                <p
                  v-for="(l, i) in lyricsDoc.lines"
                  :key="i"
                  :data-line="i"
                  class="rounded-sm px-2 transition-colors"
                  :class="[
                    i === activeLine ? 'bg-blue-50/70' : '',
                    l.time != null ? 'cursor-pointer hover:bg-gray-50' : '',
                  ]"
                  @click="l.time != null && seek(l.time)"
                >
                  <!-- QRC / 增强 LRC：逐字跟随高亮（当前字与其余字颜色鲜明区分） -->
                  <template v-if="l.words?.length">
                    <span
                      v-for="(w, wi) in l.words"
                      :key="wi"
                      :class="wordClass(i, wi)"
                    >{{ w.text }}</span>
                  </template>
                  <template v-else>
                    <span :class="i === activeLine ? 'text-gray-900' : 'text-gray-400'">{{ l.text || '♪' }}</span>
                  </template>
                </p>
              </div>
            </div>

            <!-- 隐藏的音频元素 -->
            <audio
              ref="audioEl"
              :src="playSrc"
              preload="metadata"
              class="hidden"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onLoadedMetadata"
              @play="playing = true"
              @pause="onPause"
              @ended="onEnded"
            />
          </div>
        </template>
      </div>

      <!-- ===== 列表 ===== -->
      <aside class="min-w-0">
        <div class="rounded-sm border border-gray-200 bg-white">
          <div class="border-b border-gray-100 p-2.5">
            <input
              v-model="keyword"
              type="text"
              placeholder="搜索标题 / 艺术家 / 专辑"
              class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
            />
            <div class="mt-2 flex gap-1">
              <button
                v-for="f in (['all', 'audio', 'video'] as const)"
                :key="f"
                type="button"
                class="flex-1 rounded-sm px-2 py-1 text-xs transition-colors"
                :class="filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
                @click="filter = f"
              >{{ f === 'all' ? '全部' : f === 'audio' ? '音乐' : '视频' }}</button>
            </div>
          </div>

          <div class="max-h-[520px] overflow-y-auto p-1.5">
            <p v-if="!filtered.length" class="py-8 text-center text-xs text-gray-300">没有匹配的媒体</p>
            <button
              v-for="m in filtered"
              :key="m.id"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors"
              :class="m.id === current?.id ? 'bg-blue-50' : 'hover:bg-gray-50'"
              @click="selectItem(m)"
            >
              <span
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border text-xs"
                :class="m.id === current?.id ? 'border-blue-200 bg-white text-blue-600' : 'border-gray-200 bg-gray-50 text-gray-400'"
              >{{ m.type === 'audio' ? '♪' : '▶' }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs" :class="m.id === current?.id ? 'font-medium text-blue-700' : 'text-gray-800'">{{ m.title }}</span>
                <span class="mt-0.5 block truncate text-xs text-gray-400">
                  {{ m.artist || typeLabel(m.type) }}<span v-if="m.hasLyrics"> · 词</span><span v-if="m.hasCover"> · 图</span>
                </span>
              </span>
              <!-- 分段缓存状态 -->
              <span
                v-if="cacheInfoOf(m).status === 'cached'"
                class="flex-shrink-0 rounded-sm bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600"
                title="已完整缓存到本地，播放不依赖网络"
              >缓存</span>
              <span
                v-else-if="cacheInfoOf(m).status === 'caching'"
                class="flex-shrink-0 rounded-sm bg-gray-100 px-1 py-0.5 text-[10px] text-gray-400"
                title="正在后台分段缓存"
              >{{ cacheInfoOf(m).total ? Math.min(99, Math.round((cacheInfoOf(m).bytes / cacheInfoOf(m).total) * 100)) + '%' : '…' }}</span>
              <span
                v-else-if="m.partial"
                class="flex-shrink-0 rounded-sm bg-amber-50 px-1 py-0.5 text-[10px] text-amber-600"
                title="服务器文件仍在补全中"
              >补全中</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

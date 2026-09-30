<script setup lang="ts">
/**
 * 鱼播放器（隐藏页 /fishplayer）
 *
 * 播放服务器端媒体库（音乐/视频）：
 * - 音乐：专辑封面 + 播放控制 + 同步歌词（LRC，可点击歌词跳转）
 * - 视频：原生播放器
 * - 列表：音乐/视频筛选 + 关键词搜索
 *
 * 上传与管理见隐藏页 /fishplayer/upload。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fetchLyrics, fetchMediaList, formatSize, type MediaItem } from '../services/media'
import { activeLyricIndex, formatTime, parseLyrics, type LyricDoc } from '../utils/lrc'

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

function selectItem(item: MediaItem): void {
  current.value = item
  coverFailed.value = false
  currentTime.value = 0
  duration.value = 0
  lyricsDoc.value = null
  lyricsLoading.value = false
  lyricsMissing.value = false
  void loadLyrics(item)
  // 播放由用户手势或列表点击触发：切换后自动开始
  void startPlayback()
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
  step(1)
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
const lyricsBox = ref<HTMLElement | null>(null)
const lyricsCache = new Map<string, LyricDoc | null>()

const activeLine = computed(() => {
  const doc = lyricsDoc.value
  if (!doc || !doc.synced) return -1
  return activeLyricIndex(doc.lines, currentTime.value)
})

async function loadLyrics(item: MediaItem): Promise<void> {
  if (lyricsCache.has(item.id)) {
    const cached = lyricsCache.get(item.id) ?? null
    lyricsDoc.value = cached
    lyricsMissing.value = cached == null
    return
  }
  lyricsLoading.value = true
  try {
    const text = await fetchLyrics(item.id)
    if (!text.trim()) {
      lyricsCache.set(item.id, null)
      lyricsDoc.value = null
      lyricsMissing.value = true
      return
    }
    const doc = parseLyrics(text)
    lyricsCache.set(item.id, doc)
    if (current.value?.id === item.id) {
      lyricsDoc.value = doc
      lyricsMissing.value = false
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
  await load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const typeLabel = (t: string): string => (t === 'audio' ? '音乐' : '视频')
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <!-- 头部 -->
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <span class="text-base">🐟</span> 鱼播放器
        </h1>
        <p class="mt-1 text-xs text-gray-400">
          服务器媒体库 · 共 {{ items.length }} 项（{{ audioCount }} 音乐 / {{ videoCount }} 视频）
          <span class="ml-1 text-gray-300">· 隐藏页，未在导航中公开</span>
        </p>
      </div>
      <div class="flex flex-shrink-0 items-center gap-2">
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
              :src="current.url"
              class="w-full rounded-sm bg-black"
              controls
              preload="metadata"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onLoadedMetadata"
              @play="playing = true"
              @pause="playing = false"
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
            <div class="flex gap-4">
              <!-- 专辑封面 -->
              <div class="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-sm border border-gray-200 bg-gray-50">
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

                <!-- 控制条 -->
                <div class="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
                    title="上一首（Alt + ←）"
                    @click="step(-1)"
                  >⏮</button>
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-sm bg-blue-600 text-white hover:bg-blue-700"
                    :title="playing ? '暂停（空格）' : '播放（空格）'"
                    @click="togglePlay"
                  >{{ playing ? '❚❚' : '▶' }}</button>
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
                    title="下一首（Alt + →）"
                    @click="step(1)"
                  >⏭</button>

                  <div class="ml-1 flex flex-1 items-center gap-2">
                    <span class="w-9 text-right text-xs tabular-nums text-gray-400">{{ formatTime(currentTime) }}</span>
                    <input
                      type="range"
                      class="h-1 flex-1 cursor-pointer accent-blue-600"
                      min="0"
                      :max="duration || 0"
                      step="0.1"
                      :value="currentTime"
                      @input="onProgressInput"
                    />
                    <span class="w-9 text-xs tabular-nums text-gray-400">{{ formatTime(duration) }}</span>
                  </div>

                  <button
                    type="button"
                    class="text-sm text-gray-400 hover:text-gray-600"
                    :title="muted ? '取消静音' : '静音'"
                    @click="toggleMute"
                  >{{ muted ? '🔇' : '🔉' }}</button>
                  <input
                    type="range"
                    class="h-1 w-16 cursor-pointer accent-blue-600"
                    min="0"
                    max="1"
                    step="0.01"
                    :value="muted ? 0 : volume"
                    @input="onVolumeInput"
                  />
                </div>
              </div>
            </div>

            <!-- 歌词 -->
            <div class="mt-4 border-t border-gray-100 pt-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs font-medium text-gray-500">歌词</p>
                <span v-if="lyricsDoc?.synced" class="text-xs text-gray-300">点击歌词可跳转</span>
                <span v-else-if="lyricsDoc" class="text-xs text-gray-300">纯文本歌词（无时间轴）</span>
              </div>
              <div v-if="lyricsLoading" class="py-4 text-center text-xs text-gray-300">歌词加载中…</div>
              <div
                v-else-if="!lyricsDoc"
                class="py-4 text-center text-xs text-gray-300"
              >暂无歌词{{ lyricsMissing ? '（可在上传管理页添加 .lrc）' : '' }}</div>
              <div
                v-else
                ref="lyricsBox"
                class="max-h-64 overflow-y-auto pr-1 text-sm leading-7"
              >
                <p
                  v-for="(l, i) in lyricsDoc.lines"
                  :key="i"
                  :data-line="i"
                  class="rounded-sm px-2 transition-colors"
                  :class="[
                    i === activeLine ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-500',
                    l.time != null ? 'cursor-pointer hover:bg-gray-50' : '',
                  ]"
                  @click="l.time != null && seek(l.time)"
                >{{ l.text || '♪' }}</p>
              </div>
            </div>

            <!-- 隐藏的音频元素 -->
            <audio
              ref="audioEl"
              :src="current.url"
              preload="metadata"
              class="hidden"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onLoadedMetadata"
              @play="playing = true"
              @pause="playing = false"
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
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

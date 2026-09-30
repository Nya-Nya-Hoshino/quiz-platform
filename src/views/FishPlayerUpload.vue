<script setup lang="ts">
/**
 * 鱼播放器 · 上传管理（隐藏页 /fishplayer/upload）
 *
 * - 上传音乐/视频到服务器（支持拖拽、多选、逐文件进度）
 * - 管理媒体库：编辑标题/艺术家/专辑、上传专辑封面、编辑歌词（LRC）、删除
 *
 * 上传与写操作需要登录（复用站点账号系统）。
 */
import { computed, onMounted, ref } from 'vue'
import {
  deleteMedia,
  fetchLyrics,
  fetchMediaList,
  formatSize,
  isLoggedIn,
  saveLyrics,
  saveMeta,
  uploadCover,
  uploadMedia,
  type MediaItem,
} from '../services/media'

const items = ref<MediaItem[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const loggedIn = ref(isLoggedIn())

/* ===== 上传队列 ===== */
interface QueueRow {
  id: number
  file: File
  title: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  percent: number
  error?: string
}
const queue = ref<QueueRow[]>([])
const dragging = ref(false)
const uploading = ref(false)
const batchArtist = ref('')
const batchAlbum = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let queueSeq = 0

const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|aiff)$/i
const VIDEO_RE = /\.(mp4|webm|mkv|mov|m4v|avi|ts|ogv)$/i

function addFiles(files: FileList | File[]): void {
  notice.value = ''
  for (const file of Array.from(files)) {
    if (!AUDIO_RE.test(file.name) && !VIDEO_RE.test(file.name)) {
      notice.value = `已跳过不支持的文件：${file.name}`
      continue
    }
    queue.value.push({
      id: ++queueSeq,
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      status: 'pending',
      percent: 0,
    })
  }
}

function onDrop(e: DragEvent): void {
  dragging.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

function removeRow(row: QueueRow): void {
  queue.value = queue.value.filter((r) => r.id !== row.id)
}

/** 依次上传队列中的文件（带逐文件进度） */
async function startUpload(): Promise<void> {
  if (uploading.value) return
  uploading.value = true
  notice.value = ''
  try {
    for (const row of queue.value) {
      if (row.status === 'done') continue
      row.status = 'uploading'
      row.percent = 0
      try {
        await uploadMedia(
          row.file,
          { title: row.title, artist: batchArtist.value, album: batchAlbum.value },
          (p) => (row.percent = p),
        )
        row.status = 'done'
        row.percent = 100
      } catch (e) {
        row.status = 'error'
        row.error = (e as Error).message
      }
    }
    const failed = queue.value.filter((r) => r.status === 'error').length
    const okCount = queue.value.filter((r) => r.status === 'done').length
    notice.value = failed ? `上传完成：成功 ${okCount} 个，失败 ${failed} 个` : `上传完成：${okCount} 个文件`
    await loadList()
    // 成功的条目从队列移除，保留失败的重试
    queue.value = queue.value.filter((r) => r.status !== 'done')
  } finally {
    uploading.value = false
  }
}

/* ===== 列表与管理 ===== */
const selected = ref<MediaItem | null>(null)
const editTitle = ref('')
const editArtist = ref('')
const editAlbum = ref('')
const editLyrics = ref('')
const editBusy = ref(false)
const editMsg = ref('')
const coverInput = ref<HTMLInputElement | null>(null)

async function loadList(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    items.value = await fetchMediaList()
    if (selected.value) {
      selected.value = items.value.find((m) => m.id === selected.value?.id) ?? null
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function openEditor(item: MediaItem): Promise<void> {
  selected.value = item
  editTitle.value = item.title
  editArtist.value = item.artist
  editAlbum.value = item.album
  editMsg.value = ''
  editLyrics.value = ''
  if (item.hasLyrics) {
    try {
      editLyrics.value = await fetchLyrics(item.id)
    } catch {
      /* ignore */
    }
  }
}

async function saveEdits(): Promise<void> {
  const item = selected.value
  if (!item || editBusy.value) return
  editBusy.value = true
  editMsg.value = ''
  try {
    await saveMeta(item.id, { title: editTitle.value, artist: editArtist.value, album: editAlbum.value })
    await saveLyrics(item.id, editLyrics.value)
    editMsg.value = '已保存'
    await loadList()
    const fresh = items.value.find((m) => m.id === item.id)
    if (fresh) selected.value = fresh
  } catch (e) {
    editMsg.value = (e as Error).message
  } finally {
    editBusy.value = false
  }
}

function pickCover(): void {
  coverInput.value?.click()
}

async function onCoverPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const item = selected.value
  if (!file || !item) return
  editBusy.value = true
  editMsg.value = ''
  try {
    await uploadCover(item.id, file)
    editMsg.value = '封面已更新'
    await loadList()
    const fresh = items.value.find((m) => m.id === item.id)
    if (fresh) selected.value = fresh
  } catch (err) {
    editMsg.value = (err as Error).message
  } finally {
    editBusy.value = false
  }
}

async function removeItem(item: MediaItem): Promise<void> {
  if (!window.confirm(`确定删除「${item.title}」吗？封面与歌词也会一并删除。`)) return
  try {
    await deleteMedia(item.id)
    if (selected.value?.id === item.id) selected.value = null
    await loadList()
  } catch (e) {
    window.alert((e as Error).message)
  }
}

onMounted(loadList)

const audioCount = computed(() => items.value.filter((m) => m.type === 'audio').length)
const videoCount = computed(() => items.value.filter((m) => m.type === 'video').length)
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <!-- 头部 -->
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">上传管理</h1>
        <p class="mt-1 text-xs text-gray-400">
          媒体库现有 {{ items.length }} 项（{{ audioCount }} 音乐 / {{ videoCount }} 视频）· 保存在服务器 data/media/
        </p>
      </div>
      <router-link
        to="/fishplayer"
        class="flex-shrink-0 rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >返回播放器</router-link>
    </div>

    <div v-if="!loggedIn" class="mb-4 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
      上传与管理需要登录：
      <router-link to="/account" class="text-blue-600 underline">前往账号中心登录</router-link>
      后刷新本页。
    </div>
    <div v-if="notice" class="mb-4 rounded-sm border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">{{ notice }}</div>

    <!-- ===== 上传区 ===== -->
    <div class="rounded-sm border border-gray-200 bg-white p-4">
      <h2 class="mb-3 text-sm font-medium text-gray-800">上传媒体</h2>

      <div
        class="rounded-sm border border-dashed p-6 text-center transition-colors"
        :class="dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <p class="text-2xl text-gray-300">↑</p>
        <p class="mt-1 text-sm text-gray-600">把音乐/视频拖到这里，或点击选择文件</p>
        <p class="mt-1 text-xs text-gray-400">支持 mp3 / m4a / flac / wav / ogg / mp4 / webm / mkv 等；可多选</p>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="audio/*,video/*"
          class="hidden"
          @change="onPick"
        />
      </div>

      <!-- 批量元信息（可选，留空则读取文件内嵌标签） -->
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <label class="text-xs text-gray-500">
          艺术家（批量，可选）
          <input
            v-model="batchArtist"
            type="text"
            class="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
            placeholder="留空则读取 ID3 / 文件名"
          />
        </label>
        <label class="text-xs text-gray-500">
          专辑（批量，可选）
          <input
            v-model="batchAlbum"
            type="text"
            class="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
            placeholder="留空则读取 ID3"
          />
        </label>
      </div>

      <!-- 待上传队列 -->
      <div v-if="queue.length" class="mt-3 space-y-1.5">
        <div
          v-for="row in queue"
          :key="row.id"
          class="flex items-center gap-3 rounded-sm border border-gray-200 px-2.5 py-2"
        >
          <span class="w-40 flex-shrink-0 truncate text-xs text-gray-500" :title="row.file.name">{{ row.file.name }}</span>
          <input
            v-model="row.title"
            type="text"
            class="min-w-0 flex-1 rounded-sm border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            placeholder="标题"
          />
          <span class="w-28 flex-shrink-0 text-right text-xs text-gray-400">
            <template v-if="row.status === 'uploading'">{{ row.percent }}%</template>
            <template v-else-if="row.status === 'done'">完成</template>
            <template v-else-if="row.status === 'error'"><span class="text-red-500">失败</span></template>
            <template v-else>{{ formatSize(row.file.size) }}</template>
          </span>
          <button
            type="button"
            class="flex-shrink-0 text-xs text-gray-300 hover:text-red-500"
            :disabled="row.status === 'uploading'"
            @click="removeRow(row)"
          >移除</button>
        </div>
        <div class="flex justify-end pt-1">
          <button
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
            :disabled="uploading"
            @click="startUpload"
          >{{ uploading ? '上传中…' : `开始上传（${queue.filter((r) => r.status !== 'done').length}）` }}</button>
        </div>
      </div>
    </div>

    <!-- ===== 媒体库管理 ===== -->
    <div class="mt-4 rounded-sm border border-gray-200 bg-white p-4">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-medium text-gray-800">媒体库</h2>
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          @click="loadList"
        >刷新</button>
      </div>

      <div v-if="loading" class="loading-block"><span class="loading-spinner" />加载中…</div>
      <div v-else-if="error" class="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-600">{{ error }}</div>
      <p v-else-if="!items.length" class="py-8 text-center text-xs text-gray-300">还没有媒体文件</p>

      <div v-else class="space-y-1.5">
        <div
          v-for="m in items"
          :key="m.id"
          class="flex items-center gap-3 rounded-sm border px-2.5 py-2 transition-colors"
          :class="selected?.id === m.id ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'"
        >
          <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-gray-50 text-xs text-gray-400">
            {{ m.type === 'audio' ? '♪' : '▶' }}
          </span>
          <button type="button" class="min-w-0 flex-1 text-left" @click="openEditor(m)">
            <span class="block truncate text-xs font-medium text-gray-800">{{ m.title }}</span>
            <span class="mt-0.5 block truncate text-xs text-gray-400">
              {{ m.artist || '未知艺术家' }}<span v-if="m.album"> · {{ m.album }}</span>
              · {{ m.ext.toUpperCase() }} · {{ formatSize(m.size) }}
              <span v-if="m.hasCover"> · 有封面</span><span v-if="m.hasLyrics"> · 有歌词</span>
            </span>
          </button>
          <button
            type="button"
            class="flex-shrink-0 rounded-sm border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            @click="openEditor(m)"
          >编辑</button>
          <button
            type="button"
            class="flex-shrink-0 rounded-sm border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            @click="removeItem(m)"
          >删除</button>
        </div>
      </div>

      <!-- 编辑面板 -->
      <div v-if="selected" class="mt-4 rounded-sm border border-gray-200 bg-gray-50 p-4">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-medium text-gray-800">编辑：{{ selected.id }}</p>
          <button type="button" class="text-xs text-gray-400 hover:text-gray-600" @click="selected = null">关闭</button>
        </div>

        <div class="grid gap-2 sm:grid-cols-3">
          <label class="text-xs text-gray-500">
            标题
            <input v-model="editTitle" type="text" class="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
          </label>
          <label class="text-xs text-gray-500">
            艺术家
            <input v-model="editArtist" type="text" class="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
          </label>
          <label class="text-xs text-gray-500">
            专辑
            <input v-model="editAlbum" type="text" class="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
          </label>
        </div>

        <label class="mt-3 block text-xs text-gray-500">
          歌词（LRC 或纯文本，留空则删除歌词）
          <textarea
            v-model="editLyrics"
            rows="6"
            class="mt-1 w-full resize-y rounded-sm border border-gray-300 px-2.5 py-2 font-mono text-xs outline-none focus:border-blue-500"
            placeholder="[00:12.34] 第一句歌词&#10;[00:16.78] 第二句歌词"
          />
        </label>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
            :disabled="editBusy"
            @click="saveEdits"
          >{{ editBusy ? '保存中…' : '保存' }}</button>
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-white"
            :disabled="editBusy"
            @click="pickCover"
          >上传封面</button>
          <input ref="coverInput" type="file" accept="image/*" class="hidden" @change="onCoverPicked" />
          <img
            v-if="selected.hasCover"
            :src="`${selected.coverUrl}?t=${selected.mtime}`"
            alt="封面"
            class="ml-auto h-12 w-12 rounded-sm border border-gray-200 object-cover"
          />
          <span v-if="editMsg" class="text-xs text-gray-500">{{ editMsg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 笔记页（/notes）
 *
 * 两个视图（标签切换）：
 * 1. 笔记表 —— 每一行笔记（原词/译文/备注/时间），可编辑、删除、添加
 * 2. Markdown 文档 —— 根据笔记表自动生成的格式化 Markdown（所见即所得渲染 + 源码）
 *
 * 笔记表每添加/修改一行记录，Markdown 文档即时自动更新（同一 store 的 computed 派生）。
 */
import { computed, onMounted, ref } from 'vue'
import { useNotesStore, type NoteRecord } from '../stores/notes'
import { useAuthStore } from '../stores/auth'
import { renderMarkdown } from '../utils/markdown'
import NoteEditor from '../components/NoteEditor.vue'

const notes = useNotesStore()

/** 跨设备实时同步：登录状态下拉取云端最新（其他设备添加的笔记同步到本机） */
onMounted(async () => {
  const auth = useAuthStore()
  if (auth.isLoggedIn) {
    try {
      await auth.syncFromCloud()
    } catch {
      /* 拉取失败忽略 */
    }
  }
})

type TabKey = 'table' | 'md'
const activeTab = ref<TabKey>('table')

/* ===== 笔记编辑器状态 ===== */
const editorShow = ref(false)
const editingNote = ref<NoteRecord | null>(null)
const suggestedWord = ref('')

function openAdd(): void {
  editingNote.value = null
  suggestedWord.value = ''
  editorShow.value = true
}
function openEdit(r: NoteRecord): void {
  editingNote.value = r
  suggestedWord.value = ''
  editorShow.value = true
}

/* ===== 格式化 ===== */
const fmtTime = (ts: number): string => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Markdown 表格单元格转义（| 与换行） */
function mdCell(s: string | undefined, fallback = '—'): string {
  if (!s || !String(s).trim()) return fallback
  return String(s).trim().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** 根据笔记表自动生成格式化 Markdown 文档（每次数据变化即时重算） */
const markdownSource = computed(() => {
  const list = notes.records
  const lines: string[] = []
  lines.push('# 📒 我的日语笔记')
  lines.push('')
  lines.push(
    `> 共 **${list.length}** 条 · 由做题时添加的笔记自动生成 · 最后更新：${list.length ? fmtTime(list[0].updatedAt) : '—'}`,
  )
  lines.push('')
  lines.push('## 笔记列表')
  lines.push('')
  lines.push('| # | 原词 | 译文 | 备注 | 更新时间 |')
  lines.push('| --- | --- | --- | --- | --- |')
  list.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${mdCell(r.word)} | ${mdCell(r.translation)} | ${mdCell(r.remark)} | ${fmtTime(r.updatedAt)} |`,
    )
  })
  if (!list.length) lines.push('| - | （暂无笔记） | - | - | - |')
  lines.push('')
  lines.push('## 详细')
  lines.push('')
  if (!list.length) {
    lines.push('> 做题时点击题目旁的「添加笔记」，或点击右上角「添加笔记」按钮开始记录。')
  }
  list.forEach((r, i) => {
    lines.push(`### ${i + 1}. ${mdCell(r.word)}`)
    lines.push('')
    lines.push(`- **原词**：${mdCell(r.word)}`)
    lines.push(`- **译文**：${mdCell(r.translation)}`)
    lines.push(`- **备注**：${mdCell(r.remark)}`)
    lines.push(
      `- **来源**：${r.questionSnippet ? mdCell(r.questionSnippet) : '手动添加'}`,
    )
    lines.push(`- **添加时间**：${fmtTime(r.createdAt)}`)
    lines.push(`- **更新时间**：${fmtTime(r.updatedAt)}`)
    lines.push('')
  })
  return lines.join('\n')
})

const showRaw = ref(false)
const copied = ref(false)

async function copyMarkdown(): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdownSource.value)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}

function doClear(): void {
  if (window.confirm(`确定清空全部 ${notes.total} 条笔记吗？此操作不可恢复。`)) {
    notes.clear()
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <!-- 头部 -->
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">笔记</h1>
        <p class="mt-1 text-sm text-gray-400">
          共 {{ notes.total }} 条 · 原词 + 译文必填，备注可选 · 随账号云端同步
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="notes.total"
          type="button"
          class="rounded-sm border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
          @click="doClear"
        >清空</button>
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          @click="openAdd"
        >＋ 添加笔记</button>
      </div>
    </div>

    <!-- 标签切换 -->
    <div class="mb-4 flex gap-1 rounded-sm border border-gray-200 bg-white p-1">
      <button
        type="button"
        class="flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors"
        :class="activeTab === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
        @click="activeTab = 'table'"
      >笔记表（{{ notes.total }}）</button>
      <button
        type="button"
        class="flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors"
        :class="activeTab === 'md' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
        @click="activeTab = 'md'"
      >Markdown 文档</button>
    </div>

    <!-- ===== 笔记表 ===== -->
    <div v-if="activeTab === 'table'">
      <div
        v-if="!notes.total"
        class="rounded-sm border border-dashed border-gray-200 bg-white py-16 text-center"
      >
        <p class="text-3xl text-gray-200">📝</p>
        <p class="mt-2 text-sm text-gray-400">还没有笔记</p>
        <p class="mt-1 text-xs text-gray-300">做题时点击题目旁的「添加笔记」，或点击上方「＋ 添加笔记」</p>
      </div>

      <div v-else class="overflow-hidden rounded-sm border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th class="px-3 py-2.5 font-medium">#</th>
              <th class="px-3 py-2.5 font-medium">原词</th>
              <th class="px-3 py-2.5 font-medium">译文</th>
              <th class="px-3 py-2.5 font-medium">备注</th>
              <th class="px-3 py-2.5 font-medium">更新时间</th>
              <th class="px-3 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in notes.records"
              :key="r.id"
              class="border-b border-gray-100 last:border-b-0 hover:bg-blue-50/40"
            >
              <td class="px-3 py-2.5 text-xs text-gray-400">{{ i + 1 }}</td>
              <td class="px-3 py-2.5 font-medium text-gray-900">{{ r.word }}</td>
              <td class="px-3 py-2.5 text-gray-700">{{ r.translation }}</td>
              <td class="max-w-[220px] truncate px-3 py-2.5 text-gray-500">{{ r.remark || '—' }}</td>
              <td class="px-3 py-2.5 text-xs text-gray-400">{{ fmtTime(r.updatedAt) }}</td>
              <td class="px-3 py-2.5 text-right">
                <button
                  type="button"
                  class="rounded-sm border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  @click="openEdit(r)"
                >编辑</button>
                <button
                  type="button"
                  class="ml-1.5 rounded-sm border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  @click="notes.remove(r.id)"
                >删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== Markdown 文档（自动更新） ===== -->
    <div v-else class="rounded-sm border border-gray-200 bg-white">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <p class="text-sm text-gray-600">
          笔记 Markdown 文档
          <span class="ml-1 text-xs text-gray-400">· 每添加/修改一行笔记自动更新</span>
        </p>
        <div class="flex items-center gap-2">
          <label class="flex cursor-pointer items-center gap-1 text-xs text-gray-500">
            <input v-model="showRaw" type="checkbox" class="h-3.5 w-3.5 accent-blue-600" />
            查看源码
          </label>
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
            @click="copyMarkdown"
          >{{ copied ? '已复制 ✓' : '复制 Markdown' }}</button>
        </div>
      </div>

      <!-- 渲染视图 -->
      <div
        v-if="!showRaw"
        class="md-body px-5 py-4 text-sm text-gray-800"
        v-html="renderMarkdown(markdownSource)"
      />
      <!-- 源码视图 -->
      <pre
        v-else
        class="max-h-[520px] overflow-auto bg-gray-900 px-5 py-4 text-xs leading-6 text-gray-200"
      >{{ markdownSource }}</pre>
    </div>

    <!-- 笔记编辑器 -->
    <NoteEditor
      v-model:show="editorShow"
      :editing="editingNote"
      :suggested-word="suggestedWord"
    />
  </div>
</template>

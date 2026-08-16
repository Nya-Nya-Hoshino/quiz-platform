<script setup lang="ts">
/**
 * 题目搜索页（/search）
 * 模糊检索全站题目：可按题干 / 选项 / 提示 / 解析 / 译文中的词、字、句检索。
 * 结果可直接跳转到对应试卷的该题位置（练习 / 考试模式）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  searchQuestions,
  highlightText,
  snippet,
  norm,
  type SearchHit,
} from '../services/search'

const route = useRoute()
const router = useRouter()

const keyword = ref('')
const results = ref<SearchHit[]>([])
const loading = ref(false)
const searched = ref(false)
const error = ref('')

const hasKeyword = computed(() => Boolean(norm(keyword.value)))

/** 打开页面时自动执行 URL 中的 ?q= 搜索 */
onMounted(() => {
  const q = route.query.q as string | undefined
  if (q) {
    keyword.value = q
    void doSearch(q)
  }
})

/** 地址栏 ?q= 变化（如顶部搜索框跳转）时自动搜索 */
watch(
  () => route.query.q,
  (q) => {
    if (typeof q === 'string' && q && q !== keyword.value) {
      keyword.value = q
      void doSearch(q)
    }
  },
)

async function doSearch(q?: string): Promise<void> {
  const query = (q ?? keyword.value).trim()
  if (!query) return
  loading.value = true
  error.value = ''
  try {
    const hits = await searchQuestions(query)
    results.value = hits
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    searched.value = true
    loading.value = false
  }
}

/** 提交搜索（同步地址栏，便于分享/刷新保留） */
function submit(): void {
  const q = keyword.value.trim()
  if (!q) return
  router.replace({ path: '/search', query: q ? { q } : {} })
  void doSearch(q)
}

/** 跳转到试卷对应题目（深链） */
function goPractice(h: SearchHit): void {
  if (h.kind === 'jlpt') {
    router.push(`/jlpt/practice/N2/${encodeURIComponent(h.examId)}?q=${encodeURIComponent(h.id)}`)
  } else {
    router.push(`/practice/${h.examId}?q=${encodeURIComponent(h.id)}`)
  }
}
function goExam(h: SearchHit): void {
  if (h.kind === 'jlpt') {
    router.push(`/jlpt/exam/N2/${encodeURIComponent(h.examId)}?q=${encodeURIComponent(h.id)}`)
  } else {
    router.push(`/exam/${h.examId}?q=${encodeURIComponent(h.id)}`)
  }
}

const typeLabel = (t?: string): string => {
  const map: Record<string, string> = {
    single_choice: '单选',
    multiple_choice: '多选',
    judge: '判断',
    fill_blank: '填空',
    sorting: '排序',
    short_answer: '简答',
    vocab: '词汇',
    grammar: '语法',
    reading: '读解',
    comprehension: '读解',
  }
  return t ? map[t] ?? t : '题目'
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- 搜索框 -->
    <div class="rounded-sm border border-gray-200 bg-white p-5">
      <h1 class="text-lg font-semibold text-gray-900">题目搜索</h1>
      <p class="mt-1 text-sm text-gray-400">
        模糊检索题干、选项、提示、解析、译文中出现的词、字、句
      </p>
      <form class="mt-3 flex gap-2" @submit.prevent="submit">
        <input
          v-model="keyword"
          type="text"
          class="flex-1 rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          placeholder="输入要检索的词或句子，如：並んで / 物価 / に伴って…"
        />
        <button
          type="submit"
          class="rounded-sm bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          :disabled="!hasKeyword || loading"
        >{{ loading ? '检索中…' : '搜索' }}</button>
      </form>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="mt-6 loading-block"><span class="loading-spinner loading-lg" />正在建立题目索引并检索…</div>

    <!-- 错误 -->
    <div v-else-if="error" class="mt-6 rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-600">
      检索失败：{{ error }}
    </div>

    <!-- 结果 -->
    <div v-else-if="searched" class="mt-6">
      <p class="mb-3 text-sm text-gray-500">
        找到 <b class="text-gray-800">{{ results.length }}</b> 道相关题目
        <span v-if="!results.length" class="ml-1 text-xs text-gray-400">换个词试试，支持模糊检索（如「並で」可命中「並んで」）</span>
      </p>

      <div v-if="!results.length" class="rounded-sm border border-dashed border-gray-200 bg-white py-14 text-center">
        <p class="text-3xl text-gray-200">🔍</p>
        <p class="mt-2 text-sm text-gray-400">没有找到相关题目</p>
        <p class="mt-1 text-xs text-gray-300">可尝试更短的关键词，或只输入一个汉字/假名</p>
      </div>

      <!-- 结果列表 -->
      <div v-else class="space-y-3">
        <div
          v-for="h in results"
          :key="h.kind + '-' + h.id"
          class="rounded-sm border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
        >
          <!-- 题目头部 -->
          <div class="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span class="rounded-sm bg-blue-50 px-1.5 py-0.5 text-blue-700">{{ h.examTitle }}</span>
            <span v-if="h.level" class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">{{ h.level }}</span>
            <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">{{ typeLabel(h.type) }}</span>
            <span class="ml-auto rounded-sm bg-amber-50 px-1.5 py-0.5 text-amber-700">
              命中：{{ h.matchedFields.join(' / ') }}
            </span>
          </div>

          <!-- 题干（高亮） -->
          <p
            class="text-sm leading-6 text-gray-900"
            v-html="highlightText(snippet(h.question, 160), keyword, [keyword])"
          />

          <!-- 选项（高亮命中选项） -->
          <div v-if="h.options?.length" class="mt-2 space-y-1">
            <p
              v-for="(o, i) in h.options.slice(0, 4)"
              :key="i"
              class="truncate text-xs text-gray-500"
              v-html="`${String.fromCharCode(65 + i)}. ` + highlightText(o, keyword, [keyword])"
            />
          </div>

          <!-- 译文/解析命中提示 -->
          <p v-if="h.translation && norm(h.translation).includes(norm(keyword))" class="mt-2 text-xs text-gray-400">
            译文命中：{{ snippet(h.translation, 60) }}
          </p>

          <!-- 操作 -->
          <div class="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              @click="goPractice(h)"
            >练习本题</button>
            <button
              type="button"
              class="rounded-sm bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
              @click="goExam(h)"
            >考试本题</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 初始提示 -->
    <div v-else class="mt-6 rounded-sm border border-dashed border-gray-200 bg-white py-14 text-center">
      <p class="text-3xl text-gray-200">🔎</p>
      <p class="mt-2 text-sm text-gray-400">输入关键词开始检索全站题目</p>
      <p class="mt-1 text-xs text-gray-300">支持词、字、句的模糊匹配（含题干 / 选项 / 提示 / 解析 / 译文）</p>
    </div>
  </div>
</template>

<style scoped>
:deep(mark) {
  background: #fef08a;
  color: #92400e;
  padding: 0 1px;
  border-radius: 2px;
}
</style>

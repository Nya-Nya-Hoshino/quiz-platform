<script setup lang="ts">
/**
 * JLPT 真题考试模式（整卷呈现，无听力）
 *
 * 流程：选择试卷 → 逐题作答（题组导航）→ 交卷 → 结果页（JLPT 120 分制赋分）
 * 特点：保持原卷顺序，不拆散题目；交卷前不显示答案。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton } from 'naive-ui'
import { fetchJLPTExams, type JLPTExam } from '../services/api'
import { JLPT_TOTAL } from '../utils/jlptScore'
import ExamProgress from '../components/ExamProgress.vue'
import AIHelper from '../components/AIHelper.vue'
import NoteEditor from '../components/NoteEditor.vue'

const route = useRoute()
const router = useRouter()

/* ===== 添加笔记（做题界面侧边栏入口） ===== */
const noteShow = ref(false)
const noteSuggested = ref('')

/** 平铺后的题组列表（保持原卷顺序） */
interface FlatGroup {
  groupId: string
  sectionTitle: string
  sectionKind: string
  group: { id: string; content: string; options: string[]; answer: number | null; explanation: string; translation: string }
  article: string
  images: string[]
  seq: number
}

const exam = ref<JLPTExam | null>(null)
const flatGroups = ref<FlatGroup[]>([])
const currentIndex = ref(0)
const answers = ref<Record<string, number | null>>({})
const loading = ref(false)
const error = ref('')
const startTime = ref(0)
const finished = ref(false)

const aiShow = ref(false)
const aiContext = ref('')

onMounted(async () => {
  const level = (route.params.level as string) || 'N2'
  const examTitle = decodeURIComponent((route.params.examTitle as string) || '')
  loading.value = true
  try {
    const exams = await fetchJLPTExams(level === 'N3' ? 'N3' : 'N2')
    const found = exams.find((e) => e.examTitle === examTitle) ?? exams[0]
    exam.value = found
    // 平铺题组（保持原卷顺序），携带 section 级文章/图片
    let seq = 0
    flatGroups.value = []
    for (const sec of found.sections) {
      for (const g of sec.groups) {
        flatGroups.value.push({
          groupId: g.id,
          sectionTitle: sec.title,
          sectionKind: sec.kind,
          group: g,
          article: (sec as { article?: string }).article ?? '',
          images: (sec as { images?: string[] }).images ?? [],
          seq: seq++,
        })
      }
    }
    answers.value = {}
    currentIndex.value = 0
    startTime.value = Date.now()
    finished.value = false
    // 搜索深链：?q=groupId → 直接跳到该题组
    const q = route.query.q as string | undefined
    if (q) {
      const idx = flatGroups.value.findIndex((g) => g.groupId === q)
      if (idx >= 0) currentIndex.value = idx
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

const currentGroup = computed(() => flatGroups.value[currentIndex.value])
const total = computed(() => flatGroups.value.length)
const answeredCount = computed(() =>
  flatGroups.value.filter((g) => answers.value[g.groupId] !== undefined && answers.value[g.groupId] !== null).length,
)

const currentAnswer = computed<number | null>({
  get: () => answers.value[currentGroup.value?.groupId ?? ''] ?? null,
  set: (v) => {
    if (currentGroup.value) answers.value[currentGroup.value.groupId] = v
  },
})

/** 题组导航（答题卡） */
function goTo(idx: number): void {
  if (idx >= 0 && idx < total.value) currentIndex.value = idx
}
function next(): void {
  if (currentIndex.value < total.value - 1) currentIndex.value++
}
function prev(): void {
  if (currentIndex.value > 0) currentIndex.value--
}


function buildAIContext(): string {
  const g = currentGroup.value
  if (!g) return ''
  const parts = [
    `【JLPT ${exam.value?.level} 真题】${exam.value?.examTitle}`,
    `【部分】${g.sectionKind}（${g.sectionTitle.slice(0, 30)}）`,
    `【题目】\n${g.group.content.trim()}`,
    g.group.options.length ? `【选项】\n${g.group.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
    g.group.translation ? `【参考译文】\n${g.group.translation.slice(0, 300)}` : '',
    `【我的答案】${currentAnswer.value === null ? '未作答' : String.fromCharCode(65 + currentAnswer.value)}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

function openAI(): void {
  aiContext.value = buildAIContext()
  aiShow.value = true
}

/** 打开笔记编辑器：优先提取题干中的加粗词作为建议原词 */
function openNote(): void {
  const g = currentGroup.value
  if (!g) return
  const b = g.group.content.match(/\*\*(.+?)\*\*/)
  noteSuggested.value = b && b[1] ? b[1] : ''
  noteShow.value = true
}

/** 当前题组来源摘要（用于笔记来源展示） */
function noteSourceSnippet(): string {
  const g = currentGroup.value
  if (!g) return ''
  const s = g.group.content.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

/** 交卷 → 结果页（答案经 sessionStorage 传递） */
function submit(): void {
  finished.value = true
  sessionStorage.setItem('jlpt-result-answers', JSON.stringify(answers.value))
  sessionStorage.setItem('jlpt-result-duration', String(Math.floor((Date.now() - startTime.value) / 1000)))
  router.push({
    path: '/jlpt-result',
    query: {
      level: exam.value?.level,
      examTitle: encodeURIComponent(exam.value?.examTitle ?? ''),
    },
  })
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div v-if="loading" class="py-16 text-center text-sm text-gray-500">试卷加载中…</div>

    <div v-else-if="error" class="py-16">
      <n-alert type="error" :show-icon="false">{{ error }}</n-alert>
      <div class="mt-4 text-center">
        <n-button @click="router.push('/jlpt')">返回 JLPT 真题库</n-button>
      </div>
    </div>

    <div v-else-if="exam" class="space-y-4">
      <!-- 顶部信息 -->
      <div class="rounded-sm border border-gray-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-base font-semibold text-gray-900">{{ exam.examTitle }} JLPT {{ exam.level }} 真题</h1>
            <p class="mt-0.5 text-xs text-gray-400">
              文字词汇·语法 + 读解 · 满分 {{ JLPT_TOTAL }} 分 · 整卷顺序
            </p>
          </div>
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            @click="router.push('/jlpt')"
          >退出</button>
        </div>
        <div class="mt-3">
          <ExamProgress
            :current="currentIndex"
            :total="total"
            :answered="answeredCount"
            :timer="true"
            :time-limit="100"
          />
        </div>
      </div>

      <!-- 题目区 -->
      <div v-if="currentGroup" class="rounded-sm border border-gray-200 bg-white p-6">
        <!-- 大题标题 -->
        <div class="mb-4 rounded-sm bg-gray-50 px-3 py-2">
          <p class="text-xs font-medium text-gray-600">{{ currentGroup.sectionTitle }}</p>
        </div>

        <!-- 读解文章 / 图片 -->
        <div v-if="currentGroup.article" class="mb-4 rounded-sm bg-gray-50 p-4">
          <p class="text-sm leading-7 text-gray-800 whitespace-pre-wrap">{{ currentGroup.article }}</p>
        </div>
        <div v-if="currentGroup.images.length" class="mb-4 space-y-3">
          <div v-for="img in currentGroup.images" :key="img" class="rounded-sm border border-gray-200 p-2">
            <img :src="'/jlpt-images/' + img" :alt="img" class="max-w-full" />
          </div>
        </div>

        <!-- 题干 -->
        <div class="mb-4">
          <p class="text-base leading-7 text-gray-900">{{ currentGroup.group.content.trim() }}</p>
        </div>

        <!-- 选项 -->
        <div class="space-y-1.5">
          <button
            v-for="(opt, idx) in currentGroup.group.options"
            :key="idx"
            type="button"
            class="w-full rounded-sm border px-3 py-2 text-left text-sm transition-colors"
            :class="currentAnswer === idx
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'"
            @click="currentAnswer = idx"
          >
            <span class="mr-2 inline-block w-5 text-gray-400">{{ String.fromCharCode(65 + idx) }}</span>{{ opt }}
          </button>
        </div>

        <!-- 答案缺失提示 -->
        <p v-if="currentGroup.group.answer === null" class="mt-3 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-600">
          ⚠️ 本题答案待补全，交卷后不参与计分
        </p>

        <!-- 操作栏 -->
        <div class="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            :disabled="currentIndex === 0"
            @click="prev"
          >上一题</button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              @click="openNote"
            >📝 笔记</button>
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              @click="openAI"
            >AI 解析</button>
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              :disabled="currentIndex >= total - 1"
              @click="next"
            >下一题</button>
          </div>
        </div>
      </div>

      <!-- 答题卡 -->
      <div class="rounded-sm border border-gray-200 bg-white p-4">
        <details>
          <summary class="cursor-pointer select-none text-sm text-gray-600">
            答题卡（{{ answeredCount }}/{{ total }}）
          </summary>
          <div class="mt-3 grid grid-cols-10 gap-1.5">
            <button
              v-for="(g, idx) in flatGroups"
              :key="g.groupId"
              type="button"
              class="h-7 rounded-sm border text-xs transition-colors"
              :class="[
                idx === currentIndex
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : answers[g.groupId] !== undefined && answers[g.groupId] !== null
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400',
              ]"
              @click="goTo(idx)"
            >{{ idx + 1 }}</button>
          </div>
        </details>
      </div>

      <!-- 交卷 -->
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          @click="submit"
        >交卷</button>
      </div>
    </div>

    <!-- AI 侧边栏 -->
    <AIHelper
      v-model:show="aiShow"
      :question-context="aiContext"
      subject="japanese"
      :user-answer="currentAnswer"
    />

    <!-- 笔记编辑器（侧边抽屉） -->
    <NoteEditor
      v-model:show="noteShow"
      :suggested-word="noteSuggested"
      :source="{ questionId: currentGroup?.groupId, questionSnippet: noteSourceSnippet() }"
    />
  </div>
</template>

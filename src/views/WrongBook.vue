<script setup lang="ts">
/**
 * 错题本
 *
 * 每条错题只显示：具体题目 / 题型 / JLPT 等级 / 回顾次数 / 熟练状态。
 * 点击任意错题 → 进入单题练习页（/wrong/:id）。
 * 支持：删除单条 / 清空 / 自由手动添加错题。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWrongBookStore } from '../stores/wrongBook'
import { cycleLabel, dueLabel } from '../utils/review'
import { QUESTION_TYPE_LABELS } from '../types/question'

const router = useRouter()
const wrongBook = useWrongBookStore()

/** 列表：未熟练在前，按到期时间排序 */
const records = computed(() =>
  [...wrongBook.records].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return a.nextDueAt - b.nextDueAt
  }),
)

const dueCount = computed(() => wrongBook.dueReviews.length)
const masteredCount = computed(() => wrongBook.masteredCount)

/** 题型展示名 */
function typeLabel(t: string): string {
  return QUESTION_TYPE_LABELS[t as keyof typeof QUESTION_TYPE_LABELS] ?? t
}

/** 题干摘要（去掉 <u> 标记、截断） */
function summary(q: string): string {
  return q.replace(/<u>|<\/u>/g, '').slice(0, 60)
}

function openReview(questionId: string): void {
  router.push(`/wrong/${questionId}`)
}

function startDueReview(): void {
  const first = wrongBook.dueReviews[0]
  if (first) router.push(`/wrong/${first.questionId}`)
}

/** 删除单条（阻止冒泡，避免触发打开） */
function removeRecord(questionId: string): void {
  wrongBook.remove(questionId)
}

/** 清空全部（带确认） */
function clearAll(): void {
  if (records.value.length === 0) return
  if (window.confirm(`确定清空错题本（共 ${records.value.length} 道）吗？`)) {
    wrongBook.clear()
  }
}

/** 按北京时间（UTC+8）格式化日期，避免受运行环境时区影响 */
function fmtTime(ts: number): string {
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const iso = d.toISOString()
  const m = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  return `${m}月${day}日`
}

/* ===== 自由添加弹窗 ===== */
const showAdd = ref(false)
const addForm = reactive({
  type: 'single_choice' as 'single_choice' | 'multiple_choice' | 'judge',
  difficulty: 'N3',
  section: '自定义',
  question: '',
  prompt: '',
  options: ['', '', '', ''],
  answer: 0,
  explanation: '',
})
const addError = ref('')

const typeOptions = [
  { label: '单选题', value: 'single_choice' },
  { label: '多选题', value: 'multiple_choice' },
  { label: '判断题', value: 'judge' },
] as const

function openAdd(): void {
  addForm.question = ''
  addForm.prompt = ''
  addForm.options = ['', '', '', '']
  addForm.answer = 0
  addForm.explanation = ''
  addError.value = ''
  showAdd.value = true
}

function submitAdd(): void {
  if (!addForm.question.trim()) {
    addError.value = '请输入题干'
    return
  }
  const opts = addForm.options.map((o) => o.trim()).filter(Boolean)
  if (opts.length < 2) {
    addError.value = '至少填写 2 个选项'
    return
  }
  if (addForm.answer < 0 || addForm.answer >= opts.length) {
    addError.value = '正确答案索引无效'
    return
  }
  wrongBook.addCustom({
    section: addForm.section.trim() || '自定义',
    difficulty: addForm.difficulty.trim() || 'N3',
    question: addForm.question.trim(),
    prompt: addForm.prompt.trim() || undefined,
    options: opts,
    answer: addForm.answer,
    explanation: addForm.explanation.trim() || undefined,
  })
  showAdd.value = false
}
</script>

<template>
  <div>
    <!-- 顶部统计 + 操作 -->
    <div class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold text-gray-900">错题本</h1>
          <p class="mt-0.5 text-xs text-gray-400">
            共 {{ wrongBook.total }} 道 · 今日待回顾 {{ dueCount }} 道 · 已熟练 {{ masteredCount }} 道
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600"
            @click="openAdd"
          >
            ＋ 添加错题
          </button>
          <button
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            :disabled="dueCount === 0"
            @click="startDueReview"
          >
            今日回顾{{ dueCount > 0 ? `（${dueCount}）` : '' }}
          </button>
          <button
            v-if="records.length"
            type="button"
            class="rounded-sm border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
            @click="clearAll"
          >
            清空
          </button>
        </div>
      </div>
    </div>

    <!-- 错题列表 -->
    <div v-if="records.length" class="space-y-2">
      <div
        v-for="r in records"
        :key="r.questionId"
        class="flex items-stretch overflow-hidden rounded-sm border border-gray-200 bg-white transition-colors hover:border-blue-300"
      >
        <!-- 主体：点击进入回顾 -->
        <button
          type="button"
          class="min-w-0 flex-1 px-4 py-3 text-left hover:bg-blue-50/40"
          @click="openReview(r.questionId)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-gray-800">{{ summary(r.snapshot.question) }}</p>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
                  {{ r.snapshot.difficulty || '—' }}
                </span>
                <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
                  {{ typeLabel(r.snapshot.type) }}
                </span>
                <span class="ml-1">回顾 {{ cycleLabel(r) }}</span>
                <span v-if="r.lastWrongAt" class="ml-1">· 错于 {{ fmtTime(r.lastWrongAt) }}</span>
              </p>
            </div>
            <div class="flex flex-shrink-0 flex-col items-end gap-1">
              <span
                class="rounded-sm px-2 py-0.5 text-xs font-medium"
                :class="r.completed
                  ? 'bg-green-50 text-green-600'
                  : dueLabel(r) === '今天需回顾'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-gray-100 text-gray-500'"
              >
                {{ r.completed ? '已熟练' : dueLabel(r) }}
              </span>
              <span v-if="!r.completed" class="text-xs text-gray-300">
                下次：{{ fmtTime(r.nextDueAt) }}
              </span>
            </div>
          </div>
        </button>
        <!-- 删除按钮 -->
        <button
          type="button"
          class="flex w-10 flex-shrink-0 items-center justify-center border-l border-gray-100 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
          :title="'删除：' + summary(r.snapshot.question)"
          @click="removeRecord(r.questionId)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="rounded-sm border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
      错题本为空，继续加油！
    </div>

    <!-- 自由添加弹窗 -->
    <div
      v-if="showAdd"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showAdd = false"
    >
      <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">添加错题</h2>
          <button class="text-gray-400 hover:text-gray-600" @click="showAdd = false">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div class="flex gap-3">
            <label class="flex-1">
              <span class="mb-1 block text-xs text-gray-500">题型</span>
              <select
                v-model="addForm.type"
                class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
              >
                <option v-for="t in typeOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </label>
            <label class="flex-1">
              <span class="mb-1 block text-xs text-gray-500">等级</span>
              <input
                v-model="addForm.difficulty"
                class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
                placeholder="如 N3"
              />
            </label>
            <label class="flex-1">
              <span class="mb-1 block text-xs text-gray-500">板块</span>
              <input
                v-model="addForm.section"
                class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
                placeholder="如 文法"
              />
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-xs text-gray-500">题干</span>
            <textarea
              v-model="addForm.question"
              rows="2"
              class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
              placeholder="请输入题目内容"
            />
          </label>

          <label class="block">
            <span class="mb-1 block text-xs text-gray-500">提示（可选）</span>
            <input
              v-model="addForm.prompt"
              class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
              placeholder="如：正しい読み方を選びなさい。"
            />
          </label>

          <div>
            <span class="mb-1 block text-xs text-gray-500">选项（至少 2 个）</span>
            <div class="space-y-1.5">
              <div
                v-for="idx in addForm.options.length"
                :key="idx"
                class="flex items-center gap-2"
              >
                <span class="w-4 text-right text-xs text-gray-400">{{ 'ABCD'[idx] }}</span>
                <input
                  v-model="addForm.options[idx]"
                  class="flex-1 rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
                  :placeholder="`选项 ${'ABCD'[idx]}`"
                />
              </div>
            </div>
          </div>

          <label class="block">
            <span class="mb-1 block text-xs text-gray-500">正确答案</span>
            <select
              v-model.number="addForm.answer"
              class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
            >
              <option v-for="(opt, idx) in addForm.options" :key="idx" :value="idx">
                {{ 'ABCD'[idx] }}（{{ opt || '未填写' }}）
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-xs text-gray-500">解析（可选）</span>
            <textarea
              v-model="addForm.explanation"
              rows="3"
              class="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 outline-none focus:border-blue-500"
              placeholder="解析内容（支持 Markdown）"
            />
          </label>

          <p v-if="addError" class="text-xs text-red-500">{{ addError }}</p>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-sm border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50"
              @click="showAdd = false"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-sm bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              @click="submitAdd"
            >
              添加到错题本
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

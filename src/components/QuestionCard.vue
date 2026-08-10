<script setup lang="ts">
/**
 * 题目渲染卡片
 * 按题型动态渲染：单选 / 多选 / 判断 / 填空 / 排序 / 简答 / 阅读子题
 */
import { computed } from 'vue'
import type { Question } from '../types/question'
import { JUDGE_OPTIONS } from '../types/question'
import { useFavoriteStore } from '../stores/favorites'

const favStore = useFavoriteStore()

const props = defineProps<{
  question: Question
  /** 用户当前答案 */
  modelValue: unknown
  /** 是否处于「已提交/结果」展示态（练习提交后 / 考试结果页） */
  readonly?: boolean
  /** 是否显示答案解析 */
  showAnalysis?: boolean
  /** 是否正确（结果态展示用） */
  isCorrect?: boolean
  /** 阅读子题的文章内容 */
  passage?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void
}>()

const isChoice = computed(() => props.question.type === 'single_choice')
const isMulti = computed(() => props.question.type === 'multiple_choice')
const isJudge = computed(() => props.question.type === 'judge')
const isFill = computed(() => props.question.type === 'fill_blank')
const isSort = computed(() => props.question.type === 'sorting')
const isShort = computed(() => props.question.type === 'short_answer')
/** ★ 排序题（4 个横线，★ 标在某一个横线，选应填入 ★ 处的选项） */
const isStarQuestion = computed(() => props.question.starIndex != null || props.question.question.includes('★'))

/** 渲染题干中的 <u> 下划线（v-html 需要） */
const questionHtml = computed(() => {
  return props.question.question.replace(
    /<u>(.*?)<\/u>/g,
    '<u style="text-decoration:underline;text-underline-offset:4px;">$1</u>',
  )
})

/** 单选当前选中索引 */
const singleValue = computed<number | null>({
  get: () => (typeof props.modelValue === 'number' ? (props.modelValue as number) : null),
  set: (v) => emit('update:modelValue', v),
})

/** 多选/排序当前选中集合 */
const multiValue = computed<number[]>({
  get: () => (Array.isArray(props.modelValue) ? (props.modelValue as number[]) : []),
  set: (v) => emit('update:modelValue', v),
})

/** 判断当前值 */
const judgeValue = computed<boolean | null>({
  get: () => (typeof props.modelValue === 'boolean' ? (props.modelValue as boolean) : null),
  set: (v) => emit('update:modelValue', v),
})

/** 填空值（每空字符串） */
const fillValue = computed<string[]>({
  get: () => (Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []),
  set: (v) => emit('update:modelValue', v),
})

/** 简答值 */
const shortValue = computed<string>({
  get: () => (typeof props.modelValue === 'string' ? (props.modelValue as string) : ''),
  set: (v) => emit('update:modelValue', v),
})

/** 填空空位数：由题目中 （　　） 占位决定，至少 1 */
const blankCount = computed(() => {
  const matches = props.question.question.match(/（\s*）/g)
  return Math.max(matches?.length ?? 1, 1)
})

/** 排序题：选项顺序展示 */
const sortOptions = computed(() => props.question.options ?? [])

/** 选项字母 */
function letter(i: number): string {
  return String.fromCharCode(65 + i)
}

/** 排序题标准答案（展示顺序） */
const sortAnswerOrder = computed(() => {
  const ans = props.question.answer
  return Array.isArray(ans) ? (ans as number[]) : []
})

/** 填空输入处理 */
function handleFillInput(i: number, e: Event): void {
  const arr = [...fillValue.value]
  arr[i - 1] = (e.target as HTMLInputElement).value
  fillValue.value = arr
}
</script>

<template>
  <div class="question-card font-mincho">
    <!-- 阅读文章：子题共享段落 -->
    <div v-if="passage" class="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
      <p class="text-sm leading-7 text-gray-700">{{ passage }}</p>
    </div>

    <!-- 题干 -->
    <div class="mb-1 flex items-start gap-2">
      <span class="mt-0.5 inline-flex h-5 flex-shrink-0 items-center rounded-sm bg-gray-100 px-1.5 text-xs font-medium text-gray-600">
        {{ question.type === 'single_choice' && question.isReadingChild ? '阅读' : question.type === 'single_choice' ? '单选' : question.type === 'multiple_choice' ? '多选' : question.type === 'judge' ? '判断' : question.type === 'fill_blank' ? '填空' : question.type === 'sorting' ? '排序' : '简答' }}
      </span>
      <h3 class="flex-1 text-base font-medium leading-7 text-gray-900" v-html="questionHtml" />
      <!-- 收藏按钮 -->
      <button
        type="button"
        class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border text-base leading-none transition-all"
        :class="favStore.isFavorite(question.id)
          ? 'border-amber-500 bg-amber-500 text-white shadow-sm hover:bg-amber-600'
          : 'border-amber-300 bg-amber-100 text-amber-500 hover:bg-amber-200 hover:text-amber-600'"
        :title="favStore.isFavorite(question.id) ? '取消收藏' : '收藏本题'"
        @click.stop="favStore.toggleFavorite(question)"
      >
        <span>{{ favStore.isFavorite(question.id) ? '★' : '☆' }}</span>
      </button>
    </div>

    <!-- 提示（如：下線部の読み方はどれですか。） -->
    <p v-if="question.prompt" class="mb-3 text-sm text-gray-500">{{ question.prompt }}</p>

    <!-- ★ 排序题提示：★ 所在横线位置 -->
    <div
      v-if="isStarQuestion && question.starIndex"
      class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      这是排序题：句中有 4 个横线，★ 位于第 <b>{{ question.starIndex }}</b> 个横线。
      请从选项中选择适合填入 ★ 处的词语。
    </div>

    <!-- 排序题：特殊渲染 -->
    <template v-if="isSort">
      <div class="mb-2 text-sm text-gray-500">
        ★ 处应填入的选项是：
        <span class="font-medium text-gray-800">
          {{ question.options?.[question.starIndex ?? 0] ?? '' }}
        </span>
      </div>
      <!-- 排序作答区 -->
      <div v-if="!readonly" class="space-y-1.5">
        <div
          v-for="(opt, idx) in sortOptions"
          :key="idx"
          class="flex items-center gap-3 rounded-sm border border-gray-200 px-3 py-2 text-sm"
        >
          <span class="w-5 text-gray-400">{{ idx + 1 }}</span>
          <span class="text-gray-800">{{ opt }}</span>
          <button
            type="button"
            class="ml-auto rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            :disabled="multiValue.includes(idx)"
            @click="multiValue = [...multiValue, idx]"
          >添加</button>
        </div>
        <!-- 已选顺序 -->
        <div class="mt-3 rounded-sm border border-dashed border-gray-300 bg-gray-50 p-3">
          <p class="mb-2 text-xs text-gray-500">当前顺序（按先后排列）：</p>
          <div v-if="multiValue.length" class="flex flex-wrap gap-2">
            <span
              v-for="(sel, i) in multiValue"
              :key="i"
              class="inline-flex items-center gap-1 rounded-sm bg-white border border-gray-300 px-2 py-1 text-xs text-gray-700"
            >
              {{ i + 1 }}. {{ sortOptions[sel] }}
              <button type="button" class="text-gray-400 hover:text-red-500" @click="multiValue = multiValue.filter((_, j) => j !== i)">×</button>
            </span>
          </div>
          <p v-else class="text-xs text-gray-400">请按顺序点击上方选项添加</p>
        </div>
      </div>
      <!-- 结果态：标准顺序 -->
      <div v-else class="flex flex-wrap gap-2">
        <span
          v-for="(sel, i) in sortAnswerOrder"
          :key="i"
          class="inline-flex items-center rounded-sm bg-blue-50 border border-blue-200 px-2 py-1 text-xs text-blue-700"
        >
          {{ i + 1 }}. {{ sortOptions[sel] }}
        </span>
      </div>
    </template>

    <!-- 单选 -->
    <div v-else-if="isChoice" class="space-y-1.5">
      <button
        v-for="(opt, idx) in question.options ?? []"
        :key="idx"
        type="button"
        class="w-full rounded-sm border px-3 py-2 text-left text-sm transition-colors"
        :class="[
          singleValue === idx
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
          readonly && question.answer === idx ? 'border-green-500 bg-green-50 text-green-700' : '',
          readonly && isCorrect === false && singleValue === idx ? 'border-red-400 bg-red-50 text-red-600' : '',
          readonly ? 'cursor-default' : 'cursor-pointer',
        ]"
        :disabled="readonly"
        @click="!readonly && (singleValue = idx)"
      >
        <span class="mr-2 inline-block w-5 text-gray-400">{{ letter(idx) }}</span>{{ opt }}
      </button>
    </div>

    <!-- 多选 -->
    <div v-else-if="isMulti" class="space-y-1.5">
      <button
        v-for="(opt, idx) in question.options ?? []"
        :key="idx"
        type="button"
        class="w-full rounded-sm border px-3 py-2 text-left text-sm transition-colors"
        :class="[
          multiValue.includes(idx) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
          readonly ? 'cursor-default' : 'cursor-pointer',
        ]"
        :disabled="readonly"
        @click="
          !readonly &&
            (multiValue = multiValue.includes(idx)
              ? multiValue.filter((x) => x !== idx)
              : [...multiValue, idx])
        "
      >
        <span class="mr-2 inline-block w-5 text-gray-400">{{ letter(idx) }}</span>{{ opt }}
        <span v-if="multiValue.includes(idx)" class="ml-2 text-xs text-blue-500">✓</span>
      </button>
    </div>

    <!-- 判断 -->
    <div v-else-if="isJudge" class="space-y-1.5">
      <button
        v-for="(opt, idx) in JUDGE_OPTIONS"
        :key="idx"
        type="button"
        class="w-full rounded-sm border px-3 py-2 text-left text-sm transition-colors"
        :class="[
          judgeValue === (idx === 0) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
          readonly ? 'cursor-default' : 'cursor-pointer',
        ]"
        :disabled="readonly"
        @click="!readonly && (judgeValue = idx === 0)"
      >
        {{ opt }}
      </button>
    </div>

    <!-- 填空 -->
    <div v-else-if="isFill" class="space-y-2">
      <div v-for="i in blankCount" :key="i" class="flex items-center gap-2">
        <span class="text-sm text-gray-500">第 {{ i }} 空</span>
        <input
          type="text"
          class="flex-1 rounded-sm border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
          :disabled="readonly"
          :value="fillValue[i - 1] ?? ''"
          placeholder="输入答案"
          @input="handleFillInput(i, $event)"
        />
      </div>
    </div>

    <!-- 简答 -->
    <div v-else-if="isShort" class="space-y-2">
      <textarea
        class="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        rows="4"
        placeholder="输入你的答案"
        :disabled="readonly"
        :value="shortValue"
        @input="shortValue = ($event.target as HTMLTextAreaElement).value"
      />
    </div>

    <!-- 解析区（结果态） -->
    <div v-if="showAnalysis" class="mt-4 rounded-sm border border-gray-200 bg-gray-50 p-4">
      <p class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">解析</p>
      <p class="text-sm leading-6 text-gray-800">
        {{ question.explanation || '暂无解析内容。' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.question-card {
  @apply w-full;
}
</style>

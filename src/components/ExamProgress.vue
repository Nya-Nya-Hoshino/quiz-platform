<script setup lang="ts">
/**
 * 考试进度条：当前题号 / 总题数 / 完成进度 + 计时器
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** 当前题号（0-based） */
  current: number
  /** 总题数 */
  total: number
  /** 已作答题数 */
  answered: number
  /** 是否显示计时（考试模式） */
  timer?: boolean
  /** 限时（分钟），超过自动提示 */
  timeLimit?: number
}>()

const elapsed = ref(0)
let timerId: number | undefined

onMounted(() => {
  if (props.timer) {
    timerId = window.setInterval(() => {
      elapsed.value += 1
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (timerId) window.clearInterval(timerId)
})

const percent = computed(() => (props.total ? Math.round((props.current / props.total) * 100) : 0))
const answeredPercent = computed(() => (props.total ? Math.round((props.answered / props.total) * 100) : 0))

/** 格式化 mm:ss */
const timeText = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = elapsed.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

/** 剩余时间（若限时） */
const remainText = computed(() => {
  if (!props.timeLimit) return ''
  const remain = props.timeLimit * 60 - elapsed.value
  if (remain <= 0) return '时间到'
  const m = Math.floor(remain / 60)
  const s = remain % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

/** 是否超时 */
const overTime = computed(() => props.timeLimit !== undefined && elapsed.value > props.timeLimit * 60)
</script>

<template>
  <div class="w-full">
    <div class="mb-1.5 flex items-center justify-between text-sm">
      <div class="flex items-center gap-3">
        <span class="font-medium text-gray-900">第 {{ current + 1 }} 题</span>
        <span class="text-gray-400">/ 共 {{ total }} 题</span>
        <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          已答 {{ answered }}/{{ total }}
        </span>
      </div>
      <div v-if="timer" class="flex items-center gap-2 text-sm tabular-nums">
        <span class="text-gray-400">已用</span>
        <span class="font-medium text-gray-800">{{ timeText }}</span>
        <span v-if="timeLimit" class="text-gray-400">/ 剩余</span>
        <span
          v-if="timeLimit"
          class="font-medium"
          :class="overTime ? 'text-red-600' : 'text-gray-800'"
        >{{ remainText }}</span>
      </div>
    </div>
    <!-- 进度条：双色（当前位置 + 已答覆盖） -->
    <div class="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        class="absolute inset-y-0 left-0 bg-blue-100 transition-all duration-300"
        :style="{ width: `${answeredPercent}%` }"
      />
      <div
        class="absolute inset-y-0 left-0 bg-blue-600 transition-all duration-300"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>

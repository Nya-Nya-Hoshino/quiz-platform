<script setup lang="ts">
/**
 * 答题操作面板
 * 包含：提交答案（练习）/ 上一题 / 下一题 / 答题卡
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 模式：exam 考试 / practice 练习 */
  mode: 'exam' | 'practice'
  /** 当前题号（0-based） */
  current: number
  /** 总题数 */
  total: number
  /** 是否已作答当前题 */
  answered: boolean
  /** 已提交（练习模式） */
  submitted?: boolean
  /** 答题卡：已作答题号集合 */
  answeredSet?: Set<number>
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'submit'): void
  (e: 'jump', index: number): void
  (e: 'finish'): void
}>()

const isFirst = computed(() => props.current === 0)
const isLast = computed(() => props.current >= props.total - 1)

/** 答题卡网格：展示题目状态（点击跳转） */
const gridItems = computed(() => {
  const items: { index: number; answered: boolean; current: boolean }[] = []
  for (let i = 0; i < props.total; i++) {
    items.push({
      index: i,
      answered: props.answeredSet?.has(i) ?? false,
      current: i === props.current,
    })
  }
  return items
})
</script>

<template>
  <div class="space-y-4">
    <!-- 导航按钮 -->
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="isFirst"
        @click="emit('prev')"
      >上一题</button>

      <div class="flex items-center gap-2">
        <template v-if="mode === 'practice'">
          <button
            type="button"
            class="rounded-sm border border-blue-600 bg-blue-600 px-5 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!answered || submitted"
            @click="emit('submit')"
          >
            {{ submitted ? '已提交' : '提交答案' }}
          </button>
          <button
            v-if="isLast"
            type="button"
            class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            @click="emit('finish')"
          >完成练习</button>
        </template>
      </div>

      <button
        type="button"
        class="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="isLast"
        @click="emit('next')"
      >下一题</button>
    </div>

    <!-- 答题卡（折叠面板） -->
    <details class="rounded-sm border border-gray-200">
      <summary class="cursor-pointer select-none px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
        答题卡（{{ answeredSet?.size ?? 0 }}/{{ total }}）
      </summary>
      <div class="grid grid-cols-10 gap-1.5 border-t border-gray-100 p-3">
        <button
          v-for="item in gridItems"
          :key="item.index"
          type="button"
          class="h-7 rounded-sm border text-xs transition-colors"
          :class="[
            item.current
              ? 'border-blue-500 bg-blue-500 text-white'
              : item.answered
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400',
          ]"
          @click="emit('jump', item.index)"
        >{{ item.index + 1 }}</button>
      </div>
    </details>
  </div>
</template>

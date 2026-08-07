<script setup lang="ts">
/**
 * 错题本
 *
 * 每条错题只显示：具体题目 / 题型 / JLPT 等级 / 回顾次数 / 熟练状态。
 * 点击任意错题 → 进入单题练习页（/wrong/:id）。
 * 顶部展示「今日回顾」入口：汇总今日到期的错题，一键进入逐个回顾。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWrongBookStore } from '../stores/wrongBook'
import { cycleLabel, dueLabel } from '../utils/review'

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

/** 按北京时间（UTC+8）格式化日期，避免受运行环境时区影响 */
function fmtTime(ts: number): string {
  const d = new Date(ts + 8 * 60 * 60 * 1000)
  const iso = d.toISOString()
  const m = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  return `${m}月${day}日`
}
</script>

<template>
  <div>
    <!-- 顶部统计 + 今日回顾入口 -->
    <div class="mb-4 rounded-sm border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-semibold text-gray-900">错题本</h1>
          <p class="mt-0.5 text-xs text-gray-400">
            共 {{ wrongBook.total }} 道 · 今日待回顾 {{ dueCount }} 道 · 已熟练 {{ masteredCount }} 道
          </p>
        </div>
        <button
          type="button"
          class="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          :disabled="dueCount === 0"
          @click="startDueReview"
        >
          今日回顾{{ dueCount > 0 ? `（${dueCount}）` : '' }}
        </button>
      </div>
    </div>

    <!-- 错题列表 -->
    <div v-if="records.length" class="space-y-2">
      <button
        v-for="r in records"
        :key="r.questionId"
        type="button"
        class="block w-full rounded-sm border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
        @click="openReview(r.questionId)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <!-- 题干摘要 -->
            <p class="truncate text-sm text-gray-800">{{ summary(r.snapshot.question) }}</p>
            <!-- 元信息：题型 + JLPT 等级 -->
            <p class="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
              <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
                {{ r.snapshot.difficulty || '—' }}
              </span>
              <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
                {{ r.snapshot.type }}
              </span>
              <span class="ml-1">回顾 {{ cycleLabel(r) }}</span>
              <span v-if="r.lastWrongAt" class="ml-1">· 错于 {{ fmtTime(r.lastWrongAt) }}</span>
            </p>
          </div>
          <!-- 状态 -->
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
    </div>

    <!-- 空状态 -->
    <div v-else class="rounded-sm border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
      错题本为空，继续加油！
    </div>
  </div>
</template>

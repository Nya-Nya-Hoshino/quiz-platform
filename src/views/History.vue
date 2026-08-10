<script setup lang="ts">
/**
 * 历史记录页
 */
import { computed, onMounted } from 'vue'
import { useHistoryStore } from '../stores/history'
import { useAuthStore } from '../stores/auth'

const history = useHistoryStore()

/** 跨设备实时同步：登录状态下拉取云端最新（其他设备的错题/收藏/历史同步到本机） */
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

const records = computed(() => history.records)

function fmtDuration(sec: number): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}分${String(s).padStart(2, '0')}秒`
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">历史记录</h1>
        <p class="text-xs text-gray-400">共 {{ history.total }} 条</p>
      </div>
      <button
        v-if="history.total"
        type="button"
        class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        @click="history.clear()"
      >清空</button>
    </div>

    <div v-if="records.length" class="space-y-2">
      <div
        v-for="r in records"
        :key="r.id"
        class="flex items-center justify-between rounded-sm border border-gray-200 bg-white px-4 py-3"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-gray-900">{{ r.examTitle }}</p>
          <p class="mt-0.5 text-xs text-gray-400">
            {{ fmtTime(r.finishedAt) }} · {{ r.mode === 'exam' ? '考试' : '练习' }}
            <span v-if="r.mode === 'exam'" :class="r.passed ? 'text-green-600' : 'text-red-500'">
              {{ r.passed ? '· 通过' : '· 未通过' }}
            </span>
          </p>
        </div>
        <div class="flex items-center gap-6 text-sm">
          <div class="text-right">
            <p class="font-semibold text-gray-900">
              {{ r.earnedScore }}<span class="text-xs text-gray-400">/{{ r.totalScore }}</span>
            </p>
            <p class="text-xs text-gray-400">得分</p>
          </div>
          <div class="w-14 text-right">
            <p class="font-semibold text-gray-900">{{ Math.round(r.accuracy * 100) }}%</p>
            <p class="text-xs text-gray-400">正确率</p>
          </div>
          <div class="w-16 text-right">
            <p class="font-semibold text-gray-900">{{ fmtDuration(r.duration) }}</p>
            <p class="text-xs text-gray-400">耗时</p>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="rounded-sm border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
      暂无历史记录，去完成一次考试或练习吧
    </div>
  </div>
</template>

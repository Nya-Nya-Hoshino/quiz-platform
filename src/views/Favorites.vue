<script setup lang="ts">
/**
 * 收藏本：查看收藏的题目，勾选后组成一份练习进行练习
 */
import { computed,  ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFavoriteStore } from '../stores/favorites'
import { useAuthStore } from '../stores/auth'
import { usePracticeStore } from '../stores/practice'

const fav = useFavoriteStore()

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
const practice = usePracticeStore()
const router = useRouter()

/** 勾选集合（questionId） */
const checked = ref<Set<string>>(new Set())

const typeLabel = (t?: string): string => {
  const map: Record<string, string> = {
    single_choice: '单选',
    multiple_choice: '多选',
    judge: '判断',
    fill_blank: '填空',
    sorting: '排序',
    short_answer: '简答',
    reading_comp: '阅读',
  }
  return t ? map[t] ?? t : '—'
}

const summary = (q?: string): string => {
  const s = (q ?? '').replace(/<u>/g, '').replace(/<\/u>/g, '').replace(/（\s*）/g, '（　）')
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

const fmtTime = (ts: number): string => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 全选/全不选 */
const allChecked = computed(() => fav.records.length > 0 && checked.value.size === fav.records.length)
function toggleAll(): void {
  if (allChecked.value) checked.value = new Set()
  else checked.value = new Set(fav.records.map((r) => r.questionId))
}

/** 是否可开始练习 */
const canStart = computed(() => checked.value.size > 0)

/** 勾选的收藏题目 → 组成一份练习并进入练习页 */
async function startFavoritePractice(): Promise<void> {
  if (!canStart.value) return
  const selected = fav.records.filter((r) => checked.value.has(r.questionId))
  // 阅读子题：相同文章共用 passageId
  const passageMap = new Map<string, number>()
  const readingPassages: { id: number; passage: string }[] = []
  const questions = selected.map((r) => {
    const s = r.snapshot
    const base = {
      id: r.questionId,
      type: s.type,
      section: s.section,
      difficulty: s.difficulty,
      question: s.question,
      prompt: s.prompt,
      options: s.options,
      answer: s.answer,
      explanation: s.explanation,
      score: s.score ?? 2,
      ...(s.type === 'sorting' ? { starIndex: s.starIndex } : {}),
    }
    if (s.passage) {
      let pid = passageMap.get(s.passage)
      if (pid == null) {
        pid = readingPassages.length + 1
        passageMap.set(s.passage, pid)
        readingPassages.push({ id: pid, passage: s.passage })
      }
      return { ...base, type: 'reading_comp', passageId: pid }
    }
    return base
  })

  const raw = {
    testId: 'favorites',
    title: `我的收藏练习（${selected.length} 题）`,
    totalQuestions: selected.length,
    sections: [{ name: '收藏题目', count: selected.length }],
    questions,
    readingPassages,
  }
  fav.lastRaw = raw
  try {
    await practice.startPracticeWithRaw(raw as unknown as Record<string, unknown>, false)
    router.push('/practice/favorites')
  } catch {
    /* 保持当前页 */
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">收藏本</h1>
        <p class="mt-1 text-sm text-gray-400">
          共 {{ fav.total }} 道收藏 · 勾选后可组成一份练习
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          :disabled="!fav.total"
          @click="toggleAll"
        >
          {{ allChecked ? '取消全选' : '全选' }}
        </button>
        <button
          type="button"
          class="rounded-sm bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          :disabled="!canStart"
          @click="startFavoritePractice"
        >
          组成练习（{{ checked.size }}）
        </button>
        <button
          v-if="fav.total"
          type="button"
          class="rounded-sm border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
          @click="fav.clear()"
        >
          清空
        </button>
      </div>
    </div>

    <!-- 空态 -->
    <div
      v-if="!fav.total"
      class="rounded-sm border border-dashed border-gray-200 bg-white py-16 text-center"
    >
      <p class="text-3xl text-gray-200">☆</p>
      <p class="mt-2 text-sm text-gray-400">还没有收藏题目</p>
      <p class="mt-1 text-xs text-gray-300">做题时点击题目右上角的 ☆ 即可收藏</p>
    </div>

    <!-- 收藏列表 -->
    <div v-else class="space-y-2">
      <div
        v-for="r in fav.records"
        :key="r.questionId"
        class="flex items-stretch overflow-hidden rounded-sm border border-gray-200 bg-white transition-colors hover:border-amber-300"
      >
        <!-- 勾选 -->
        <label class="flex w-10 flex-shrink-0 cursor-pointer items-center justify-center border-r border-gray-100">
          <input
            v-model="checked"
            type="checkbox"
            :value="r.questionId"
            class="h-4 w-4 accent-amber-500"
          />
        </label>
        <!-- 主体 -->
        <div class="min-w-0 flex-1 px-4 py-3">
          <p class="truncate text-sm text-gray-800">{{ summary(r.snapshot.question) }}</p>
          <p class="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
            <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
              {{ r.snapshot.difficulty || '—' }}
            </span>
            <span class="rounded-sm bg-gray-100 px-1.5 py-0.5 text-gray-600">
              {{ typeLabel(r.snapshot.type) }}
            </span>
            <span class="ml-1">收藏于 {{ fmtTime(r.addedAt) }}</span>
          </p>
        </div>
        <!-- 删除 -->
        <button
          type="button"
          class="flex-shrink-0 px-3 text-xs text-gray-300 hover:text-red-400"
          title="取消收藏"
          @click="fav.removeFavorite(r.questionId); checked.delete(r.questionId)"
        >
          删除
        </button>
      </div>
    </div>
  </div>
</template>

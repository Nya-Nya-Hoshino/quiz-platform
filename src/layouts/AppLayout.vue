<script setup lang="ts">
/**
 * 主布局：顶部导航 + 内容区
 */
import { useRoute, useRouter } from 'vue-router'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useWrongBookStore } from '../stores/wrongBook'
import { useNotesStore } from '../stores/notes'
import JLPTCountdown from '../components/JLPTCountdown.vue'
import SiteSticker from '../components/SiteSticker.vue'

const route = useRoute()
const router = useRouter()
const wrongBook = useWrongBookStore()
const notes = useNotesStore()

/** 顶部加载进度条：路由切换（含懒加载 chunk 与页面数据加载期）时显示 */
const progressVisible = ref(false)
const progressWidth = ref(0)
let progressTimer: number | undefined
const FINISH_DELAY = 350 // 完成动画停留时间

function startProgress(): void {
  progressVisible.value = true
  progressWidth.value = 12
  window.clearInterval(progressTimer)
  // 模拟推进：12% → 90%（真实完成由 afterEach 置 100%）
  progressTimer = window.setInterval(() => {
    progressWidth.value = Math.min(
      90,
      progressWidth.value + (90 - progressWidth.value) * 0.18,
    )
  }, 200)
}
function finishProgress(): void {
  window.clearInterval(progressTimer)
  progressWidth.value = 100
  window.setTimeout(() => {
    progressVisible.value = false
    progressWidth.value = 0
  }, FINISH_DELAY)
}
router.beforeEach(startProgress)
/** 路由切换完成后结束加载进度条 */
router.afterEach(finishProgress)

onBeforeUnmount(() => window.clearInterval(progressTimer))

const navItems = [
  { path: '/', label: '题库' },
  { path: '/jlpt', label: 'JLPT 真题' },
  { path: '/history', label: '历史记录' },
  { path: '/account', label: '账号' },
  { path: '/wrong-book', label: '错题本' },
  { path: '/favorites', label: '收藏本' },
  { path: '/notes', label: '笔记' },
  { path: '/settings', label: '设置' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const wrongCount = computed(() => wrongBook.total)
const noteCount = computed(() => notes.total)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- 路由加载进度条 -->
    <div v-if="progressVisible" class="top-progress" :style="{ width: progressWidth + '%' }" />

    <!-- 顶部导航 -->
    <header class="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div class="mx-auto flex max-w-5xl flex-col px-3 sm:px-4 lg:h-14 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex h-14 items-center justify-between lg:gap-3">
          <router-link to="/" class="flex h-14 shrink-0 items-center gap-2">
            <div class="flex h-7 w-7 items-center justify-center rounded-sm bg-blue-600 text-sm font-bold text-white">Q</div>
            <span class="text-base font-semibold text-gray-900">刷题平台</span>
          </router-link>
          <router-link
            to="/search"
            aria-label="搜索题目"
            title="搜索题目"
            class="flex h-11 w-11 items-center justify-center rounded-sm transition-colors"
            :class="isActive('/search') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="h-5 w-5">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path stroke-linecap="round" d="m16 16 4.5 4.5" />
            </svg>
          </router-link>
        </div>

        <nav aria-label="主导航" class="grid w-full min-w-0 grid-cols-4 items-center gap-1 pb-2 lg:flex lg:w-auto lg:pb-0">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="relative flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-sm px-0.5 py-1.5 text-sm transition-colors lg:min-h-0 lg:shrink-0 lg:justify-start lg:px-3"
            :class="isActive(item.path)
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'"
          >
            {{ item.label }}
            <span
              v-if="item.path === '/wrong-book' && wrongCount > 0"
              class="absolute right-0 top-0 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white lg:static lg:ml-1 lg:px-1.5 lg:py-0.5 lg:text-xs lg:leading-4"
            >{{ wrongCount }}</span>
            <span
              v-if="item.path === '/notes' && noteCount > 0"
              class="absolute right-0 top-0 rounded-full bg-blue-500 px-1 text-[10px] leading-4 text-white lg:static lg:ml-1 lg:px-1.5 lg:py-0.5 lg:text-xs lg:leading-4"
            >{{ noteCount }}</span>
          </router-link>
        </nav>
      </div>
    </header>

    <!-- 内容区 + 侧边栏 -->
    <div class="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-3 py-4 sm:px-4 sm:py-6">
      <main id="view-container" class="min-w-0 flex-1">
        <router-view v-slot="{ Component }">
          <transition name="page">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </main>
      <!-- JLPT 倒计时侧边栏（桌面端显示） -->
      <aside class="hidden w-56 flex-shrink-0 lg:block">
        <div class="sticky top-20">
          <JLPTCountdown />
          <div class="mt-3 rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-500">
            <p class="font-medium text-gray-700">考试日程</p>
            <p class="mt-1">7 月第一个周日</p>
            <p>12 月第一个周日</p>
            <p class="mt-1 text-gray-400">按北京时间计算</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- 页脚 -->
    <footer class="border-t border-gray-200 px-3 py-4 text-center text-xs leading-6 text-gray-400 sm:px-0 sm:leading-4">
      <p>刷题平台 · 考试模式 / 练习模式 / 错题本 / AI 辅助学习</p>
      <p class="mt-1">
        <span class="text-amber-500">⚠ 测试阶段个人网站</span>
        · 仅限于日语练习（听解尚未实现）· 未来可能有编程练习计划 · 问题反馈
        <a class="text-blue-500 hover:underline" href="https://github.com/Nya-Nya-Hoshino/" target="_blank" rel="noopener">站长邮箱</a>
        · 欢迎加入一起完善站点
      </p>
    </footer>

    <!-- 悬浮贴纸 -->
    <SiteSticker />
  </div>
</template>

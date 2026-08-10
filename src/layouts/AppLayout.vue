<script setup lang="ts">
/**
 * 主布局：顶部导航 + 内容区
 */
import { useRoute, useRouter } from 'vue-router'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useWrongBookStore } from '../stores/wrongBook'
import JLPTCountdown from '../components/JLPTCountdown.vue'
import SiteSticker from '../components/SiteSticker.vue'

const route = useRoute()
const router = useRouter()
const wrongBook = useWrongBookStore()

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
router.afterEach(finishProgress)
onBeforeUnmount(() => window.clearInterval(progressTimer))

const navItems = [
  { path: '/', label: '题库' },
  { path: '/jlpt', label: 'JLPT 真题' },
  { path: '/history', label: '历史记录' },
  { path: '/wrong-book', label: '错题本' },
  { path: '/favorites', label: '收藏本' },
  { path: '/settings', label: '设置' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const wrongCount = computed(() => wrongBook.total)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- 路由加载进度条 -->
    <div v-if="progressVisible" class="top-progress" :style="{ width: progressWidth + '%' }" />

    <!-- 顶部导航 -->
    <header class="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <router-link to="/" class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-sm bg-blue-600 text-sm font-bold text-white">Q</div>
          <span class="text-base font-semibold text-gray-900">刷题平台</span>
        </router-link>

        <nav class="flex items-center gap-1">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="rounded-sm px-3 py-1.5 text-sm transition-colors"
            :class="isActive(item.path)
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'"
          >
            {{ item.label }}
            <span
              v-if="item.path === '/wrong-book' && wrongCount > 0"
              class="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white"
            >{{ wrongCount }}</span>
          </router-link>
        </nav>
      </div>
    </header>

    <!-- 内容区 + 侧边栏 -->
    <div class="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">
      <main class="min-w-0 flex-1">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
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
    <footer class="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
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

<script setup lang="ts">
/**
 * 站点悬浮贴纸：错题反馈 QQ + 站长邮箱（固定右下角）
 */
import { ref } from 'vue'

const qq = '2992576898'
const email = '24200214113@usts.edu.cn'
const showTip = ref(true) // 默认展开，点击收起
const copied = ref(false)

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
    <!-- 展开提示 -->
    <div
      v-if="showTip"
      class="w-64 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg"
    >
      <p class="font-medium text-gray-800">错题反馈</p>
      <button
        class="mt-2 flex w-full items-center justify-between rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-blue-700 transition-colors hover:bg-blue-100"
        @click="copyText(qq)"
      >
        <span>QQ：{{ qq }}</span>
        <span class="text-xs text-blue-400">{{ copied ? '已复制' : '点击复制' }}</span>
      </button>
      <a
        :href="`mailto:${email}`"
        class="mt-2 flex w-full items-center justify-between rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        <span>站长邮箱</span>
        <span class="text-xs text-emerald-400">{{ email }}</span>
      </a>
      <p class="mt-2 text-xs text-gray-400">遇到题目错误 / 功能建议 / 网站问题，欢迎反馈</p>
    </div>

    <!-- 贴纸按钮 -->
    <button
      class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-lg text-white shadow-lg transition-transform hover:scale-105"
      title="错题反馈"
      @click="showTip = !showTip"
    >
      <svg v-if="!showTip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.88L3 20l1.3-3.85A7.95 7.95 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

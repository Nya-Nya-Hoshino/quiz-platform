<script setup lang="ts">
/**
 * 低调公告栏：图标 + 标题，点击进入图文公告页
 */
</script>

<template>
  <router-link
    to="/notice"
    class="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-amber-200 hover:bg-amber-50/40"
  >
    <div class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-amber-100 text-base">
      📢
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-gray-800 group-hover:text-amber-700">站点公告</p>
      <p class="truncate text-xs text-gray-400">测试阶段 · 使用说明 · 联系方式</p>
    </div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-4 w-4 flex-shrink-0 text-gray-300 group-hover:text-amber-500">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </router-link>
</template>

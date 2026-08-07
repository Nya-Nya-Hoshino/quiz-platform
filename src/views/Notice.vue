<script setup lang="ts">
/**
 * 图文公告页：测试阶段说明 + 联系方式
 */
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- 头部横幅 -->
    <div class="relative overflow-hidden rounded-lg bg-gradient-to-r from-amber-100 via-orange-50 to-yellow-100 px-6 py-8">
      <div class="absolute -right-4 -top-6 text-8xl opacity-15">📢</div>
      <div class="absolute -bottom-8 right-16 text-6xl opacity-10">📚</div>
      <p class="text-xs font-medium tracking-widest text-amber-600">SITE NOTICE</p>
      <h1 class="mt-1 text-2xl font-bold text-gray-900">站点公告</h1>
      <p class="mt-2 text-sm text-gray-600">刷题平台 · 测试阶段使用说明</p>
    </div>

    <!-- 公告正文 -->
    <div class="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700">
      <section>
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
          <span class="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs">⚠️</span>
          关于本站
        </h2>
        <p class="text-gray-600">
          该站点属于<b class="text-amber-600">测试阶段</b>的个人网站，问题可能很多，请谅解。
        </p>
      </section>

      <section>
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
          <span class="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs">🇯🇵</span>
          内容范围
        </h2>
        <p class="text-gray-600">
          本站目前<b>仅限于日语方面的练习</b>（<b class="text-blue-600">听解练习尚未实现</b>），未来可能有编程练习计划。
        </p>
      </section>

      <section>
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
          <span class="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs">📮</span>
          反馈与共建
        </h2>
        <p class="text-gray-600">
          可通过网站所提供的联系方式反馈问题，<b>或者欢迎加入一起完善站点</b>。
        </p>
        <div class="mt-3 space-y-2">
          <div class="flex items-center justify-between rounded-md border border-blue-100 bg-blue-50 px-4 py-2.5">
            <span class="text-blue-700">错题反馈 QQ</span>
            <span class="font-mono font-semibold text-blue-800">2992576898</span>
          </div>
          <a
            :href="'mailto:24200214113@usts.edu.cn'"
            class="flex items-center justify-between rounded-md border border-emerald-100 bg-emerald-50 px-4 py-2.5 transition-colors hover:bg-emerald-100"
          >
            <span class="text-emerald-700">站长邮箱</span>
            <span class="font-mono font-semibold text-emerald-800">24200214113@usts.edu.cn</span>
          </a>
        </div>
      </section>

      <section class="rounded-md bg-gray-50 p-4 text-xs text-gray-400">
        <p>发布：2026 年 8 月 · 后续功能与公告将在此更新</p>
      </section>
    </div>
  </div>
</template>

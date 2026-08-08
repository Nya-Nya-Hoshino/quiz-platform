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

      <section>
        <h2 class="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900">
          <span class="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-xs">✨</span>
          近期更新
        </h2>
        <ul class="list-disc space-y-1 pl-5 text-gray-600">
          <li><b>交互体验优化</b>：加载动画与路由过渡、答对自动跳转下一题、错题本升级（自由添加 / 单条删除 / 清空）、AI 反馈与路由返回体验改进</li>
          <li><b>错题订正</b>：N3 自主练习第 1-4 套答案与解析已全面核对订正（第 5/17/41/42/48/84/107/108/126/144/185/263/293/312/335/336/348/377/378/395/402/407/408/462/468/474/479/480/491/509/510/534/563/569/570/684/699/710 等题）</li>
          <li><b>性能优化</b>：首页加载速度大幅提升（数据按需加载 + gzip 压缩 + 浏览器缓存），打开试卷不再卡顿</li>
          <li>JLPT 真题库调整为 N2 历年真题（2018-2026），整卷考试/练习双模式</li>
          <li><b>热更新</b>：AI 解析/反馈支持 Markdown 可视化渲染（标题、加粗、表格、代码块、链接），阅读体验大幅提升</li>
          <li>新增 N3 自主练习 第 5-8 套（含读解文章组与 ★ 排序题）</li>
          <li>新增站点公告栏与错题反馈悬浮窗</li>
        </ul>
      </section>

      <section class="rounded-md bg-gray-50 p-4 text-xs text-gray-400">
        <p>发布：2026 年 8 月 · 后续功能与公告将在此更新</p>
      </section>
    </div>
  </div>
</template>

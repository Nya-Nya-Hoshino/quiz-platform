<script setup lang="ts">
/**
 * JLPT 倒计时小工具（ACG 风格侧边栏）
 *
 * 显示：距离下次 JLPT 考试的天/时/分/秒
 * - 考试日期：每年 7 月第一个周日、12 月第一个周日（北京时间）
 * - 当前日期之后最近的一场考试
 * - 北京时间（UTC+8）计算，与运行环境时区无关
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** 计算某年某月第一个周日（北京时间） */
function firstSunday(year: number, month: number): Date {
  // 北京当月 1 日 0:00 对应的 UTC 时间戳
  const beijingFirst = Date.UTC(year, month - 1, 1, 0, 0, 0) - 8 * 3600 * 1000
  // 北京时间星期几（+8h 后取 UTC 星期即北京星期）
  const weekday = new Date(beijingFirst + 8 * 3600 * 1000).getUTCDay()
  const add = weekday === 0 ? 0 : 7 - weekday
  // 返回北京时间当月第一个周日 0:00 的 UTC 时间戳
  return new Date(Date.UTC(year, month - 1, 1 + add, 0, 0, 0) - 8 * 3600 * 1000)
}

/** 下一场考试 */
function nextExamDate(now: number): Date {
  const nowBJ = new Date(now + 8 * 3600 * 1000)
  const year = nowBJ.getUTCFullYear()
  const candidates = [
    firstSunday(year, 7),
    firstSunday(year, 12),
    firstSunday(year + 1, 7),
  ]
  for (const c of candidates) {
    if (c.getTime() > now) return c
  }
  return firstSunday(year + 1, 7)
}

const now = ref(Date.now())
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const target = computed(() => nextExamDate(now.value))
const diff = computed(() => target.value.getTime() - now.value)

const days = computed(() => Math.floor(diff.value / (24 * 3600 * 1000)))
const hours = computed(() => Math.floor((diff.value % (24 * 3600 * 1000)) / (3600 * 1000)))
const minutes = computed(() => Math.floor((diff.value % (3600 * 1000)) / (60 * 1000)))
const seconds = computed(() => Math.floor((diff.value % (60 * 1000)) / 1000))

const targetText = computed(() => {
  const t = new Date(target.value.getTime() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}年${t.getUTCMonth() + 1}月${t.getUTCDate()}日`
})

const isJuly = computed(() => {
  const t = new Date(target.value.getTime() + 8 * 3600 * 1000)
  return t.getUTCMonth() === 6 // 7月
})

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
</script>

<template>
  <div class="jlpt-countdown">
    <div class="header">
      <span class="title">{{ isJuly ? '🍃 七月 JLPT' : '⛄ 十二月 JLPT' }}</span>
      <span class="subtitle">{{ targetText }}</span>
    </div>

    <div class="grid">
      <div class="cell">
        <span class="num">{{ pad(days) }}</span>
        <span class="label">天</span>
      </div>
      <div class="sep">:</div>
      <div class="cell">
        <span class="num">{{ pad(hours) }}</span>
        <span class="label">时</span>
      </div>
      <div class="sep">:</div>
      <div class="cell">
        <span class="num">{{ pad(minutes) }}</span>
        <span class="label">分</span>
      </div>
      <div class="sep">:</div>
      <div class="cell">
        <span class="num">{{ pad(seconds) }}</span>
        <span class="label">秒</span>
      </div>
    </div>

    <p class="footer">頑張ってください！(๑•̀ㅂ•́)و✧</p>
  </div>
</template>

<style scoped>
.jlpt-countdown {
  border: 1px solid #e5e7eb;
  background: linear-gradient(160deg, #ffffff 0%, #f5f9ff 100%);
  padding: 16px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
}
.subtitle {
  font-size: 12px;
  color: #9ca3af;
}
.grid {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f9fafb;
  padding: 6px 8px;
}
.num {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #2563eb;
}
.label {
  font-size: 10px;
  color: #9ca3af;
}
.sep {
  font-size: 14px;
  font-weight: 700;
  color: #d1d5db;
  padding-bottom: 16px;
}
.footer {
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
}
</style>

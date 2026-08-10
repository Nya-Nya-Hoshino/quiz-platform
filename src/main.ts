import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

/* ==================== 全局防白屏兜底（注册于入口，不依赖组件树） ==================== */

/** 记录诊断错误（sessionStorage，便于排查） */
function logDiag(kind: string, msg: string): void {
  try {
    const list = JSON.parse(sessionStorage.getItem('quiz-err-log') ?? '[]')
    list.push({ t: Date.now(), kind, msg: String(msg).slice(0, 300) })
    sessionStorage.setItem('quiz-err-log', JSON.stringify(list.slice(-20)))
  } catch {
    /* ignore */
  }
}

/** 静默刷新（每次会话至多一次，防死循环） */
function silentReload(reason: string): void {
  if (sessionStorage.getItem('quiz-blank-fix')) return
  sessionStorage.setItem('quiz-blank-fix', '1')
  logDiag('reload', reason)
  window.location.reload()
}

/** 内容区是否空白（#app 无子元素 或 视图容器无内容） */
function isBlank(): boolean {
  const app = document.getElementById('app')
  if (!app) return false
  if (app.children.length === 0 && !app.innerHTML.trim()) return true
  const view = document.getElementById('view-container')
  return view != null && view.children.length === 0 && !view.innerText?.trim()
}

// 1. 路由切换/返回完成后检测白屏
router.afterEach(() => {
  window.setTimeout(() => {
    if (isBlank()) silentReload('afterEach-blank')
  }, 500)
})

// 2. bfcache 恢复（浏览器后退/前进从缓存恢复）→ 静默刷新
window.addEventListener('pageshow', (e: PageTransitionEvent) => {
  if (e.persisted) silentReload('bfcache-restore')
})

// 3. 切回标签页/窗口时检测白屏
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  window.setTimeout(() => {
    const app = document.getElementById('app')
    if (app && app.children.length === 0) silentReload('visibility-blank')
  }, 300)
})

// 4. 全局未捕获错误（JS 崩溃）→ 记录 + 白屏刷新
window.addEventListener('error', (e) => {
  logDiag('window-error', `${e.message} @ ${e.filename}:${e.lineno}`)
  window.setTimeout(() => {
    if (isBlank()) silentReload('window-error')
  }, 200)
})
window.addEventListener('unhandledrejection', (e) => {
  logDiag('unhandled-rejection', String(e.reason?.message ?? e.reason))
})

// 5. Vue 组件渲染/生命周期错误 → 记录 + 白屏刷新
app.config.errorHandler = (err, _instance, info) => {
  logDiag(`vue-error:${String(info)}`, String((err as Error)?.message ?? err))
  window.setTimeout(() => {
    if (isBlank()) silentReload('vue-error')
  }, 200)
}

app.mount('#app')

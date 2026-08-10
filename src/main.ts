import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 全局错误兜底：组件渲染/生命周期异常导致白屏时，静默刷新一次（并记录错误便于诊断）
let errFixed = false
app.config.errorHandler = (err, _instance, info) => {
  try {
    const list = JSON.parse(sessionStorage.getItem('quiz-err-log') ?? '[]')
    list.push({ t: Date.now(), info: String(info), msg: String((err as Error)?.message ?? err) })
    sessionStorage.setItem('quiz-err-log', JSON.stringify(list.slice(-20)))
  } catch {
    /* ignore */
  }
  // 内容区异常导致空白 → 静默刷新（每次会话一次）
  if (!errFixed && !sessionStorage.getItem('quiz-err-fix')) {
    sessionStorage.setItem('quiz-err-fix', '1')
    errFixed = true
    window.setTimeout(() => {
      const view = document.getElementById('view-container')
      const blank = !view || (view.children.length === 0 && !view.innerText?.trim())
      if (blank) window.location.reload()
    }, 300)
  }
}

app.mount('#app')

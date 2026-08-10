// 端到端验证实时自动同步（Node SSR + mock 浏览器环境，真实请求后端 8080）
const store = {}
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
  key: (i) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length },
}
globalThis.window = {
  setTimeout, clearTimeout, setInterval, clearInterval,
  location: { reload() {} },
  addEventListener() {},
}
globalThis.document = {
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
  createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, remove() {}, classList: { add() {}, remove() {} } }),
  createElementNS: () => ({}),
  createTextNode: () => ({}),
  createComment: () => ({}),
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: { style: {} },
  body: { appendChild() {}, style: {} },
  head: { appendChild() {} },
}
globalThis.sessionStorage = {
  getItem: () => null, setItem() {}, removeItem() {},
}

import { createServer } from 'vite'
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useFavoriteStore } = await server.ssrLoadModule('/src/stores/favorites.ts')
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts')

  // 登录态（token 需真实有效）
  const loginRes = await fetch('http://localhost:8080/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2etest2', password: 'e2e123456' }),
  })
  const login = await loginRes.json()
  if (!login.token) { console.log('FAIL 登录失败:', login); process.exit(1) }
  localStorage.setItem('quiz-platform:auth', JSON.stringify({ token: login.token, username: 'e2etest2', savedAt: 0 }))

  const fav = useFavoriteStore()
  const auth = useAuthStore()
  console.log('登录态:', auth.isLoggedIn)
  auth.startAutoSync()
  console.log('自动同步已开启')

  // 模拟收藏一题（触发 watch）
  fav.toggleFavorite({ id: 't-1', type: 'single_choice', question: '自動同期テスト（　）', options: ['a','b','c','d'], answer: 0, score: 2 })
  console.log('已收藏，本地 favorites:', fav.total)
  console.log('等待 4s（debounce 3s + 请求）...')
  await new Promise((r) => setTimeout(r, 4000))

  // 检查云端
  const dataRes = await fetch('http://localhost:8080/api/data', { headers: { Authorization: `Bearer ${login.token}` } })
  const data = await dataRes.json()
  const p = data.payload ?? {}
  console.log('云端 favorites:', Array.isArray(p.favorites) ? p.favorites.length : typeof p.favorites)
  const ok = Array.isArray(p.favorites) && p.favorites.length === 1
  console.log(ok ? 'PASS 自动同步成功（本地收藏 1 → 云端 1）' : 'FAIL 云端未同步')
} finally {
  await server.close()
}

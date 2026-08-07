import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiEndpoint = env.VITE_AI_ENDPOINT || ''
  const aiKey = env.VITE_AI_API_KEY || ''
  // 从 OpenAI 兼容端点解析 host，例如 https://api.deepseek.com/v1/chat/completions → https://api.deepseek.com
  let aiHost = ''
  let aiPath = ''
  try {
    const url = new URL(aiEndpoint)
    aiHost = url.origin
    aiPath = url.pathname // /v1/chat/completions
  } catch {
    /* ignore */
  }

  const proxy: Record<string, ProxyOptions> = {}

  if (aiHost) {
    proxy['/api/ai'] = {
      target: aiHost,
      changeOrigin: true,
      // 重写为 AI 服务端点路径，如 /v1/chat/completions
      rewrite: () => aiPath,
      configure: (p) => {
        p.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('Authorization', `Bearer ${aiKey}`)
          proxyReq.setHeader('Content-Type', 'application/json')
        })
      },
    }
  }

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy,
    },
  }
})

<script setup lang="ts">
/**
 * 设置页：AI API 配置（OpenAI Compatible）
 */
import { onMounted, ref } from 'vue'
import { loadAISettings, saveAISettings, isAIConfigured } from '../services/ai'
import { NAlert, NInput, NButton } from 'naive-ui'

const endpoint = ref('')
const apiKey = ref('')
const model = ref('')
const saved = ref(false)
const configured = ref(false)

onMounted(() => {
  const s = loadAISettings()
  endpoint.value = s.endpoint
  apiKey.value = s.apiKey
  model.value = s.model
  configured.value = isAIConfigured()
})

function save(): void {
  saveAISettings({ endpoint: endpoint.value.trim(), apiKey: apiKey.value.trim(), model: model.value.trim() || 'gpt-4o-mini' })
  saved.value = true
  configured.value = isAIConfigured()
  setTimeout(() => (saved.value = false), 2000)
}

/** 演示配置快捷填充 */
function fillDemo(): void {
  endpoint.value = 'https://api.openai.com/v1/chat/completions'
  model.value = 'gpt-4o-mini'
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="mb-1 text-lg font-semibold text-gray-900">设置</h1>
    <p class="mb-6 text-xs text-gray-400">配置 AI 学习助手（OpenAI Compatible API）</p>

    <n-alert v-if="!configured" type="warning" :show-icon="false" class="mb-4">
      当前 AI 助手使用本地模拟模式。配置下方 API 后即可获得真实教学解析。
    </n-alert>
    <n-alert v-else type="success" :show-icon="false" class="mb-4">
      AI API 已配置。
    </n-alert>

    <div class="rounded-sm border border-gray-200 bg-white p-6">
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">API Endpoint（OpenAI Compatible）</label>
          <n-input
            v-model:value="endpoint"
            placeholder="https://api.openai.com/v1/chat/completions"
            class="w-full"
          />
          <p class="mt-1 text-xs text-gray-400">支持任意 OpenAI 兼容端点（OpenAI / DeepSeek / Moonshot / 本地 vLLM 等）</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">API Key</label>
          <n-input
            v-model:value="apiKey"
            type="password"
            show-password-on="click"
            placeholder="sk-..."
            class="w-full"
          />
          <p class="mt-1 text-xs text-gray-400">仅保存在本地浏览器 localStorage，不会上传到本平台服务器</p>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">模型</label>
          <n-input
            v-model:value="model"
            placeholder="gpt-4o-mini"
            class="w-full"
          />
        </div>

        <div class="flex items-center gap-2 pt-2">
          <n-button type="primary" @click="save">保存设置</n-button>
          <n-button @click="fillDemo">填充示例端点</n-button>
          <span v-if="saved" class="text-sm text-green-600">✓ 已保存</span>
        </div>
      </div>
    </div>

    <div class="mt-4 rounded-sm border border-gray-200 bg-white p-4 text-xs leading-6 text-gray-500">
      <p class="font-medium text-gray-700">学科 Prompt 说明</p>
      <p>AI 按题目学科自动切换 Prompt：日语题库使用「日语教师」Prompt（讲解知识点 → 选项分析 → JLPT 陷阱 → 记忆方法）；也可扩展编程、通用等学科。</p>
      <p>可在 <code class="rounded bg-gray-100 px-1">src/prompts/index.ts</code> 中添加其他学科（如编程、数学）的 Prompt。</p>
    </div>
  </div>
</template>

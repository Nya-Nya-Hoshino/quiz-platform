<script setup lang="ts">
/**
 * AI 学习助手（侧边栏）
 * 功能：解释答案 / 分析错误原因 / 总结知识点 / 生成类似题
 */
import { computed, ref } from 'vue'
import { NDrawer, NDrawerContent, NSkeleton, NAlert } from 'naive-ui'
import { askAI, isAIConfigured } from '../services/ai'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{
  /** 侧边栏开关 */
  show: boolean
  /** 题目上下文（题干/选项等） */
  questionContext: string
  /** 学科 */
  subject: string
  /** 用户答案（可选） */
  userAnswer?: unknown
  /** 是否答错（用于错误分析模式） */
  isWrong?: boolean
}>()

const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

/** 快捷操作按钮 */
type ActionType = 'explain' | 'analyze' | 'summary' | 'similar'

const actions: { type: ActionType; label: string }[] = [
  { type: 'explain', label: '解释这道题' },
  { type: 'analyze', label: '分析错误原因' },
  { type: 'summary', label: '总结知识点' },
  { type: 'similar', label: '生成类似题' },
]

const loading = ref(false)
const error = ref('')
const response = ref('')
const usedMock = ref(false)
const activeAction = ref<ActionType | 'custom'>('explain')
const customText = ref('')

/** 组装问题文本 */
function buildQuestion(action: ActionType): string {
  const ans = props.userAnswer === undefined || props.userAnswer === null
    ? '（未作答）'
    : JSON.stringify(props.userAnswer)
  switch (action) {
    case 'explain':
      return '请解释这道题：考察什么知识点？正确答案为什么正确？其他选项为什么错误？'
    case 'analyze':
      return `我选择了答案 ${ans}。请分析我的错误原因，并告诉我正确的思考方式。`
    case 'summary':
      return '请总结这道题相关的核心知识点、常见搭配和记忆方法。'
    case 'similar':
      return '请生成一道考察相同知识点的类似题目（含选项和答案），难度与本题相近。'
  }
}

/** 组装完整上下文 */
function buildContext(): string {
  return props.questionContext
}

async function runAction(action: ActionType | 'custom', text?: string): Promise<void> {
  loading.value = true
  error.value = ''
  response.value = ''
  usedMock.value = false
  activeAction.value = action
  try {
    const q = action === 'custom' ? (text ?? '请帮助我理解这道题') : buildQuestion(action)
    const res = await askAI({
      question: q,
      context: buildContext(),
      subject: props.subject,
    })
    response.value = res.content
    usedMock.value = res.mock
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const configured = computed(() => isAIConfigured())

/** 打开时默认自动解释 */
function handleShowChange(v: boolean): void {
  emit('update:show', v)
  if (v && !response.value && !loading.value) {
    void runAction('explain')
  }
}
</script>

<template>
  <n-drawer :show="show" :width="460" placement="right" @update:show="handleShowChange">
    <n-drawer-content title="AI 学习助手" closable>
      <div class="flex h-full flex-col">
        <!-- 未配置 API 提示 -->
        <n-alert v-if="!configured" type="warning" :show-icon="false" class="mb-3">
          未配置 AI API，当前为本地模拟解析。可在
          <router-link to="/settings" class="text-blue-600 underline">设置</router-link>
          中填写 OpenAI Compatible 端点与 Key。
        </n-alert>

        <!-- 快捷操作 -->
        <div class="mb-3 flex flex-wrap gap-1.5">
          <button
            v-for="a in actions"
            :key="a.type"
            type="button"
            class="rounded-sm border px-2.5 py-1 text-xs transition-colors"
            :class="activeAction === a.type
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-600 hover:border-gray-400'"
            :disabled="loading"
            @click="runAction(a.type)"
          >{{ a.label }}</button>
        </div>

        <!-- 自定义提问 -->
        <form class="mb-3 flex gap-2" @submit.prevent="runAction('custom', customText)">
          <input
            v-model="customText"
            type="text"
            class="flex-1 rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            placeholder="向 AI 提问…"
            :disabled="loading"
          />
          <button
            type="submit"
            class="rounded-sm bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="loading || !customText.trim()"
          >发送</button>
        </form>

        <!-- 内容区 -->
        <div class="flex-1 overflow-y-auto">
          <n-alert v-if="error" type="error" :show-icon="false" class="mb-3">
            {{ error }}
          </n-alert>
          <n-alert v-if="usedMock" type="info" :show-icon="false" class="mb-3 text-xs">
            当前为本地模拟模式。
          </n-alert>
          <div v-if="loading" class="space-y-2">
            <n-skeleton text :repeat="4" />
            <n-skeleton text :repeat="3" />
          </div>
          <div
            v-else-if="response"
            class="md-body text-sm text-gray-800"
            v-html="renderMarkdown(response)"
          />
          <p v-else class="text-sm text-gray-400">点击上方按钮或输入问题，AI 将根据学科 Prompt 提供教学解析。</p>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

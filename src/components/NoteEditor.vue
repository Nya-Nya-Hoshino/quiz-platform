<script setup lang="ts">
/**
 * 笔记编辑器（右侧抽屉）
 * 在做题界面点击「添加笔记」打开：填写 原词（必填）/ 译文（必填）/ 备注（可选）后保存。
 * 也支持编辑已有笔记（传入 initial）。
 */
import { computed, ref, watch } from 'vue'
import { NDrawer, NDrawerContent } from 'naive-ui'
import { useNotesStore, validateNote, type NoteRecord } from '../stores/notes'

const props = defineProps<{
  /** 抽屉开关 */
  show: boolean
  /** 编辑模式：传入已有笔记则进入编辑 */
  editing?: NoteRecord | null
  /** 建议的原词（做题界面自动提取下划线词/「」词） */
  suggestedWord?: string
  /** 来源题目信息（添加时自动附带） */
  source?: { questionId?: string; questionSnippet?: string }
}>()

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'saved', record: NoteRecord): void
}>()

const notes = useNotesStore()

const word = ref('')
const translation = ref('')
const remark = ref('')
const error = ref('')
const saving = ref(false)

/** 打开/切换题目时重置表单 */
watch(
  () => [props.show, props.editing, props.suggestedWord],
  () => {
    if (!props.show) return
    error.value = ''
    if (props.editing) {
      word.value = props.editing.word
      translation.value = props.editing.translation
      remark.value = props.editing.remark ?? ''
    } else {
      word.value = props.suggestedWord ?? ''
      translation.value = ''
      remark.value = ''
    }
  },
  { immediate: true },
)

const canSave = computed(() => Boolean(word.value.trim()) && Boolean(translation.value.trim()))

function save(): void {
  const input = {
    word: word.value,
    translation: translation.value,
    remark: remark.value,
    questionId: props.editing ? props.editing.questionId : props.source?.questionId,
    questionSnippet: props.editing ? props.editing.questionSnippet : props.source?.questionSnippet,
  }
  const check = validateNote(input)
  if (!check.ok) {
    error.value = check.error ?? '请填写原词与译文'
    return
  }
  saving.value = true
  try {
    const record = props.editing
      ? notes.update(props.editing.id, input)
      : notes.add(input)
    if (record) {
      emit('saved', record)
      emit('update:show', false)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

function close(): void {
  error.value = ''
  emit('update:show', false)
}
</script>

<template>
  <n-drawer :show="show" :width="420" placement="right" @update:show="close">
    <n-drawer-content :title="editing ? '编辑笔记' : '添加笔记'" closable>
      <div class="flex h-full flex-col gap-3">
        <p class="text-xs leading-5 text-gray-400">
          一行笔记至少需要填写 <b class="text-gray-600">原词</b> 和 <b class="text-gray-600">译文</b> 两个字段，
          备注可选。保存后可在顶部「笔记」页查看，Markdown 文档会自动更新。
        </p>

        <!-- 原词 -->
        <div>
          <label class="mb-1 block text-sm text-gray-700">
            原词 <span class="text-red-500">*</span>
          </label>
          <input
            v-model="word"
            type="text"
            class="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="如：並んで"
            @keyup.enter="save"
          />
        </div>

        <!-- 译文 -->
        <div>
          <label class="mb-1 block text-sm text-gray-700">
            译文 <span class="text-red-500">*</span>
          </label>
          <input
            v-model="translation"
            type="text"
            class="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="如：排队"
            @keyup.enter="save"
          />
        </div>

        <!-- 备注（可选） -->
        <div>
          <label class="mb-1 block text-sm text-gray-700">
            备注 <span class="text-xs font-normal text-gray-400">（可选）</span>
          </label>
          <textarea
            v-model="remark"
            rows="3"
            class="w-full resize-none rounded-sm border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="补充记忆点、例句、易混辨析等…"
          />
        </div>

        <!-- 来源题目提示 -->
        <p v-if="props.source?.questionSnippet" class="rounded-sm bg-gray-50 px-3 py-2 text-xs text-gray-400">
          来源题目：{{ props.source.questionSnippet }}
        </p>

        <p v-if="error" class="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{{ error }}</p>

        <div class="mt-auto flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            @click="close"
          >取消</button>
          <button
            type="button"
            class="rounded-sm bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            :disabled="!canSave || saving"
            @click="save"
          >{{ editing ? '保存修改' : '保存添加' }}</button>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

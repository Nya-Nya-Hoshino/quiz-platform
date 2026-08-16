/**
 * 笔记系统（Note Book）
 *
 * 与错题本 / 收藏本同类的后端同步功能：
 * - 本地持久化到 localStorage（quiz-platform:notes）
 * - 登录后随账号数据包自动上传云端（auth store 实时同步）
 *
 * 记录字段（一行笔记至少需要 原词 + 译文 两个字段，备注可选）：
 * - word        原词（必填）
 * - translation 译文（必填）
 * - remark      备注（可选）
 * - questionId / questionSnippet  来源题目（做题界面添加时自动附带）
 *
 * 笔记页（/notes）会把全部记录自动渲染为格式化 Markdown 文档，
 * 每新增/修改一行，Markdown 文档即时更新。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'quiz-platform:notes'
/** 删除墓碑表（删除传播）：{ 笔记ID: 删除时间戳 } */
const DELETED_KEY = 'quiz-platform:notes:deleted'

export interface NoteRecord {
  /** 笔记唯一 ID */
  id: string
  /** 原词（必填） */
  word: string
  /** 译文（必填） */
  translation: string
  /** 备注（可选） */
  remark?: string
  /** 来源题目 ID（做题界面添加时自动附带） */
  questionId?: string
  /** 来源题目题干摘要 */
  questionSnippet?: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后修改时间戳 */
  updatedAt: number
}

export interface NoteInput {
  word: string
  translation: string
  remark?: string
  questionId?: string
  questionSnippet?: string
}

function loadAll(): NoteRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as NoteRecord[]
      return parsed.filter((r) => r && r.id && r.word && r.translation)
    }
  } catch {
    /* ignore */
  }
  return []
}

function persist(records: NoteRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

/* ===== 删除墓碑（删除传播：防止云端旧数据把已删除的笔记合并回来） ===== */
function loadDeleted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DELETED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>
      return typeof parsed === 'object' && parsed ? parsed : {}
    }
  } catch {
    /* ignore */
  }
  return {}
}
function persistDeleted(deleted: Record<string, number>): void {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(deleted))
  } catch {
    /* ignore */
  }
}

/** 校验一行笔记是否合法：原词与译文至少填写（均可为纯文本，允许任意语言字符） */
export function validateNote(input: NoteInput): { ok: boolean; error?: string } {
  if (!input.word || !String(input.word).trim()) {
    return { ok: false, error: '请填写原词' }
  }
  if (!input.translation || !String(input.translation).trim()) {
    return { ok: false, error: '请填写译文' }
  }
  return { ok: true }
}

export const useNotesStore = defineStore('notes', () => {
  const records = ref<NoteRecord[]>(loadAll())
  /** 删除墓碑：{ 笔记ID: 删除时间戳 } */
  const deleted = ref<Record<string, number>>(loadDeleted())

  const total = computed(() => records.value.length)

  /** 新增一条笔记（原词 + 译文必填，备注可选） */
  function add(input: NoteInput): NoteRecord {
    const check = validateNote(input)
    if (!check.ok) throw new Error(check.error)
    const now = Date.now()
    const record: NoteRecord = {
      id: `note-${now}-${Math.random().toString(36).slice(2, 8)}`,
      word: String(input.word).trim(),
      translation: String(input.translation).trim(),
      remark: input.remark && String(input.remark).trim() ? String(input.remark).trim() : undefined,
      questionId: input.questionId || undefined,
      questionSnippet: input.questionSnippet || undefined,
      createdAt: now,
      updatedAt: now,
    }
    records.value.unshift(record)
    persist(records.value)
    return record
  }

  /** 编辑一条笔记（更新 原词/译文/备注；编辑 = 重新活跃 → 清除删除墓碑） */
  function update(id: string, input: NoteInput): NoteRecord | undefined {
    const check = validateNote(input)
    if (!check.ok) throw new Error(check.error)
    const found = records.value.find((r) => r.id === id)
    if (!found) return undefined
    found.word = String(input.word).trim()
    found.translation = String(input.translation).trim()
    found.remark = input.remark && String(input.remark).trim() ? String(input.remark).trim() : undefined
    found.updatedAt = Date.now()
    if (deleted.value[id] != null) {
      delete deleted.value[id]
      persistDeleted(deleted.value)
    }
    persist(records.value)
    return found
  }

  /** 删除一条笔记（记录删除墓碑，删除跨设备生效） */
  function remove(id: string): void {
    records.value = records.value.filter((r) => r.id !== id)
    deleted.value[id] = Date.now()
    persist(records.value)
    persistDeleted(deleted.value)
  }

  /** 清空全部笔记（全部墓碑化） */
  function clear(): void {
    const now = Date.now()
    for (const r of records.value) {
      deleted.value[r.id] = now
    }
    records.value = []
    persist(records.value)
    persistDeleted(deleted.value)
  }

  /** 从云端/外部加载整组记录（覆盖本地并持久化）；可同时载入删除墓碑 */
  function hydrate(loaded: NoteRecord[], deletedMap?: Record<string, number>): void {
    records.value = Array.isArray(loaded) ? loaded.filter((r) => r && r.id && r.word && r.translation) : []
    if (deletedMap) {
      deleted.value = { ...deletedMap }
      persistDeleted(deleted.value)
    }
    persist(records.value)
  }

  return {
    records,
    deleted,
    total,
    add,
    update,
    remove,
    clear,
    hydrate,
    validate: validateNote,
  }
})

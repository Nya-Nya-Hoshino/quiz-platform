import type { UserAnswerValue } from '../types/exam'

export interface PersonalProgress {
  version: 1
  currentIndex: number
  answers: Record<string, UserAnswerValue>
  submitted: string[]
  completed: boolean
  updatedAt: number
}

// 独立于公共进度同步；账号保留原样，仅编码为安全存储键。
function key(username: string, id: string): string {
  return `quiz-platform:personal-bank:progress:${encodeURIComponent(username)}:${id}`
}

export function loadPersonalProgress(username: string, id: string): PersonalProgress | null {
  if (!username || !id) return null
  try {
    const raw = localStorage.getItem(key(username, id))
    if (!raw) return null
    const saved = JSON.parse(raw) as PersonalProgress
    if (saved.version !== 1 || !Number.isSafeInteger(saved.currentIndex) || saved.currentIndex < 0
      || !saved.answers || typeof saved.answers !== 'object' || Array.isArray(saved.answers)
      || !Array.isArray(saved.submitted) || !saved.submitted.every(value => typeof value === 'string')
      || typeof saved.completed !== 'boolean' || !Number.isFinite(saved.updatedAt)) return null
    return saved
  } catch { return null }
}

export function savePersonalProgress(username: string, id: string, state: Omit<PersonalProgress, 'version' | 'updatedAt'>): void {
  if (!username || !id) return
  try {
    localStorage.setItem(key(username, id), JSON.stringify({
      version: 1, currentIndex: state.currentIndex, answers: state.answers,
      submitted: state.submitted, completed: state.completed, updatedAt: Date.now(),
    }))
  } catch { /* 隐私模式或存储满时仍可继续本次练习。 */ }
}

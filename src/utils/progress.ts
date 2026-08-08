/**
 * 答题进度本地持久化（练习/考试中途关闭网站后可恢复）
 *
 * 存储位置：localStorage（本机保存）
 * key 规则：quiz-platform:progress:{mode}:{examId}
 */

const PREFIX = 'quiz-platform:progress'

export interface ProgressData<T> {
  /** 试卷 ID */
  examId: string
  /** 保存时间戳 */
  savedAt: number
  /** 业务数据（states/answers/currentIndex 等） */
  payload: T
}

/** 保存进度（自动带时间戳） */
export function saveProgress<T>(mode: 'practice' | 'exam', examId: string, payload: T): void {
  try {
    const data: ProgressData<T> = { examId, savedAt: Date.now(), payload }
    localStorage.setItem(`${PREFIX}:${mode}:${examId}`, JSON.stringify(data))
  } catch {
    /* localStorage 不可用（隐私模式/超限）时静默失败 */
  }
}

/** 读取进度，返回 null 表示无存档 */
export function loadProgress<T>(mode: 'practice' | 'exam', examId: string): ProgressData<T> | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${mode}:${examId}`)
    if (!raw) return null
    return JSON.parse(raw) as ProgressData<T>
  } catch {
    return null
  }
}

/** 是否存在存档 */
export function hasProgress(mode: 'practice' | 'exam', examId: string): boolean {
  try {
    return localStorage.getItem(`${PREFIX}:${mode}:${examId}`) !== null
  } catch {
    return false
  }
}

/** 清除存档 */
export function clearProgress(mode: 'practice' | 'exam', examId: string): void {
  try {
    localStorage.removeItem(`${PREFIX}:${mode}:${examId}`)
  } catch {
    /* ignore */
  }
}

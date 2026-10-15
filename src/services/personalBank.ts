import type { ExamSection } from '../types/exam'

export interface PersonalPracticeMeta {
  id: string
  title: string
  receivedAt: number
  totalQuestions: number
  totalScore: number
  sections: ExamSection[]
}

export class PersonalBankError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request<T>(path: string, token: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  if (!token) throw new PersonalBankError('请先登录后查看个人题库', 401)
  const response = await fetch(`/api/personal-bank${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal, cache: 'no-store',
  })
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !result) throw new PersonalBankError(result?.error ?? `个人题库请求失败（${response.status}）`, response.status)
  return result
}

export function fetchPersonalPractices(token: string, signal?: AbortSignal): Promise<{ practices: PersonalPracticeMeta[]; canManage: boolean }> {
  return request('', token, signal)
}

export function fetchPersonalPractice(id: string, token: string, signal?: AbortSignal): Promise<{ practice: PersonalPracticeMeta; exam: Record<string, unknown> }> {
  return request(`/${encodeURIComponent(id)}`, token, signal)
}

export function sendPersonalPractice(username: string, exam: Record<string, unknown>, token: string, signal?: AbortSignal): Promise<{ username: string; practice: PersonalPracticeMeta }> {
  return request('/deliver', token, signal, { username, exam })
}

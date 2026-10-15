import type { Exam } from '../types/exam'
import type { StandardAnswer } from '../types/question'
import { parseExamRaw, findQuestion, buildQuestionRefs } from './parser'

/** 私人导入题干只保留既有的无属性下划线标记，其余内容作为文本显示。 */
function safeQuestionMarkup(text: string): string {
  return text.split(/(<u>|<\/u>)/g).map(part => {
    if (part === '<u>' || part === '</u>') return part
    return part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }).join('')
}

/** 使用现有解析器，文本答案保留服务器校验后的原值，避免被当作字母选项索引。 */
export function parsePersonalExam(raw: Record<string, unknown>): Exam {
  const exam = parseExamRaw(raw)
  for (const ref of buildQuestionRefs(exam)) {
    const question = findQuestion(exam, ref.id)
    if (question) question.question = safeQuestionMarkup(question.question)
  }
  for (const q of raw.questions as Record<string, unknown>[]) {
    if (q.type !== 'fill_blank' && q.type !== 'short_answer') continue
    const question = findQuestion(exam, `${exam.id}-${String(q.id)}`)
    if (question) question.answer = q.answer as StandardAnswer
  }
  return exam
}

/**
 * Markdown 渲染工具（AI 输出可视化）
 *
 * 使用 markdown-it 将 AI 返回的 markdown 文本渲染为 HTML。
 * - html: false —— 不渲染原始 HTML，防止 AI 输出注入脚本（XSS）
 * - linkify —— 裸 URL 自动转链接
 * - breaks —— 单换行转 <br>（AI 输出常用单换行分段）
 * - 外部链接自动加 target="_blank" rel="noopener"
 */
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

/** 渲染 markdown 为安全 HTML（配合 .md-body 样式使用） */
export function renderMarkdown(src: string): string {
  if (!src) return ''
  return md
    .render(src)
    // 外部链接新窗口打开
    .replace(/<a href="/g, '<a target="_blank" rel="noopener noreferrer" href="')
}

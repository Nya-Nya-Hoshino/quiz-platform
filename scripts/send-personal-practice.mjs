#!/usr/bin/env node
/** 本机服务器操作工具，不通过公网提供投递权限。 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createPersonalBank } from '../server-personal-bank.mjs'

const usage = '用法：node scripts/send-personal-practice.mjs --username "完整账号名" --file "练习.json" [--data-dir "data目录"]'
try {
  const { values } = parseArgs({ options: {
    username: { type: 'string' }, file: { type: 'string' }, 'data-dir': { type: 'string' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log(usage)
  } else {
    if (!values.username || !values.file) throw new Error(usage)
    const dataDir = values['data-dir'] ? resolve(values['data-dir']) : fileURLToPath(new URL('../data/', import.meta.url))
    const raw = JSON.parse(readFileSync(resolve(values.file), 'utf8'))
    const practice = createPersonalBank(dataDir).deliver(values.username, raw)
    console.log(`已投递给 ${values.username}：${practice.title}（${practice.totalQuestions} 题）`)
    console.log(`练习 ID：${practice.id}`)
  }
} catch (error) {
  console.error(`投递失败：${error.message}`)
  process.exitCode = 1
}

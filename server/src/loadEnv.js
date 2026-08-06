import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

/** 读取 server/.env（若存在），不覆盖已有 process.env */
export function loadEnv(filename = '.env') {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = path.join(dir, filename)
  if (!fs.existsSync(file)) return false

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i).trim()
    let val = trimmed.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
  return true
}

// ESM import 会提升执行：在其它模块读 env 之前先加载
loadEnv()

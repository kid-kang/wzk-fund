/**
 * 将 @vant/weapp 打到 miniprogram_npm（完整 lib，避免开发者工具缺依赖报错）。
 * 上传体积由 project.config.json 的 packOptions.ignore 控制 node_modules。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'node_modules', '@vant', 'weapp', 'lib')
const DEST = path.join(ROOT, 'miniprogram_npm', '@vant', 'weapp')

function copyDir(from, to) {
  fs.mkdirSync(to, {recursive: true})
  for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

if (!fs.existsSync(SRC)) {
  console.error('missing @vant/weapp lib, run npm install first')
  process.exit(1)
}

fs.rmSync(DEST, {recursive: true, force: true})
copyDir(SRC, DEST)
fs.copyFileSync(
  path.join(ROOT, 'node_modules', '@vant', 'weapp', 'package.json'),
  path.join(DEST, 'package.json'),
)

console.log('vant packed (full lib)')

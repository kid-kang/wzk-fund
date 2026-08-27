import './loadEnv.js'
import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import router from './routes.js'
import {startGoldAlert} from './services/goldAlert.js'

const app = new Koa()
const PORT = Number(process.env.PORT) || 8787
const GOLD_ALERT_ENABLED = process.env.GOLD_ALERT_ENABLED !== '0'

app.use(cors())
app.use(bodyParser())

app.use(async (ctx, next) => {
  const start = Date.now()
  try {
    await next()
  } catch (err) {
    ctx.status = err.status || 500
    ctx.body = {success: false, message: err.message || '服务器错误'}
    console.error('[error]', err)
  }
  const ms = Date.now() - start
  console.log(`${ctx.method} ${ctx.path} ${ctx.status} ${ms}ms`)
})

app.use(router.routes()).use(router.allowedMethods())

app.listen(PORT, () => {
  console.log(`wzk-fund proxy listening on http://127.0.0.1:${PORT}`)
  if (GOLD_ALERT_ENABLED) startGoldAlert()
})

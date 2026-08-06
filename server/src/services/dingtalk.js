import '../loadEnv.js'
import crypto from 'crypto'
import axios from 'axios'

function getWebhook() {
  return process.env.DINGTALK_WEBHOOK || ''
}

function getSecret() {
  return process.env.DINGTALK_SECRET || ''
}

function buildSignedUrl(webhook = getWebhook(), secret = getSecret()) {
  if (!webhook) throw new Error('未配置 DINGTALK_WEBHOOK，请在 server/.env 中设置')
  if (!secret) throw new Error('未配置 DINGTALK_SECRET，请在 server/.env 中设置')

  const timestamp = Date.now()
  const stringToSign = `${timestamp}\n${secret}`
  const sign = encodeURIComponent(
    crypto.createHmac('sha256', secret).update(stringToSign).digest('base64'),
  )
  const sep = webhook.includes('?') ? '&' : '?'
  return `${webhook}${sep}timestamp=${timestamp}&sign=${sign}`
}

/**
 * 发送钉钉群机器人文本消息
 * @param {string} content 消息内容
 * @param {{ atMobiles?: string[], atUserIds?: string[], isAtAll?: boolean }} [at]
 */
export async function sendDingTalkText(content, at = {}) {
  if (!content) throw new Error('钉钉消息内容不能为空')

  const url = buildSignedUrl()
  const body = {
    msgtype: 'text',
    text: {content: String(content)},
    at: {
      atMobiles: at.atMobiles || [],
      atUserIds: at.atUserIds || [],
      isAtAll: !!at.isAtAll,
    },
  }

  const res = await axios.post(url, body, {
    timeout: 10000,
    headers: {'Content-Type': 'application/json'},
    validateStatus: () => true,
  })

  const data = res.data || {}
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || `钉钉发送失败 (errcode=${data.errcode})`)
  }
  return data
}

/**
 * 发送钉钉 markdown 消息
 * @param {string} title
 * @param {string} text markdown 正文
 * @param {{ atMobiles?: string[], atUserIds?: string[], isAtAll?: boolean }} [at]
 */
export async function sendDingTalkMarkdown(title, text, at = {}) {
  if (!title || !text) throw new Error('钉钉 markdown 标题和正文不能为空')

  const url = buildSignedUrl()
  const body = {
    msgtype: 'markdown',
    markdown: {title: String(title), text: String(text)},
    at: {
      atMobiles: at.atMobiles || [],
      atUserIds: at.atUserIds || [],
      isAtAll: !!at.isAtAll,
    },
  }

  const res = await axios.post(url, body, {
    timeout: 10000,
    headers: {'Content-Type': 'application/json'},
    validateStatus: () => true,
  })

  const data = res.data || {}
  if (data.errcode !== 0) {
    throw new Error(data.errmsg || `钉钉发送失败 (errcode=${data.errcode})`)
  }
  return data
}

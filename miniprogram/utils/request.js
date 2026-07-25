const {getApiBase} = require('./config')

function request({url, method = 'GET', data, header}) {
  const base = getApiBase()
  const path = url.startsWith('/') ? url : `/${url}`
  let finalUrl = `${base}${path.startsWith('/api') ? path : `/api${path}`}`

  const upper = String(method || 'GET').toUpperCase()
  let payload = data
  if (upper === 'GET') {
    const qs = Object.assign({}, data || {}, {_t: Date.now()})
    const query = Object.keys(qs)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(qs[k])}`)
      .join('&')
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + query
    payload = undefined
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: finalUrl,
      method: upper,
      data: payload,
      timeout: 30000,
      header: Object.assign(
        {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        header || {},
      ),
      success(res) {
        const body = res.data
        if (res.statusCode >= 400) {
          const msg =
            (body && (body.message || body.msg)) || `HTTP ${res.statusCode}`
          reject(new Error(msg))
          return
        }
        if (body && body.success === false) {
          reject(new Error(body.message || '请求失败'))
          return
        }
        resolve(body)
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'))
      },
    })
  })
}

module.exports = {request}

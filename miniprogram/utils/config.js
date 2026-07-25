const API_BASE_KEY = 'wzk-fund-api-base'
const DEFAULT_API_BASE = 'http://127.0.0.1:8787'

function getApiBase() {
  try {
    const v = wx.getStorageSync(API_BASE_KEY)
    if (typeof v === 'string' && v.trim()) {
      return v.trim().replace(/\/+$/, '')
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_API_BASE
}

function setApiBase(base) {
  const next = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  if (!next) {
    wx.removeStorageSync(API_BASE_KEY)
    return DEFAULT_API_BASE
  }
  wx.setStorageSync(API_BASE_KEY, next)
  return next
}

module.exports = {
  API_BASE_KEY,
  DEFAULT_API_BASE,
  getApiBase,
  setApiBase,
}

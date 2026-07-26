export const API_BASE_KEY = 'wzk-fund-api-base'

/** 开发默认走同源 /api（Rsbuild 代理）；「我的」可改为如 http://192.168.x.x:8787 */
export const DEFAULT_API_BASE = '/api'

export function getApiBase(): string {
  try {
    const v = localStorage.getItem(API_BASE_KEY)
    if (typeof v === 'string' && v.trim()) {
      return v.trim().replace(/\/+$/, '')
    }
  } catch {
    // ignore
  }
  return DEFAULT_API_BASE
}

export function setApiBase(base: string): string {
  const next = String(base || '')
    .trim()
    .replace(/\/+$/, '')
  if (!next || next === DEFAULT_API_BASE) {
    try {
      localStorage.removeItem(API_BASE_KEY)
    } catch {
      // ignore
    }
    return DEFAULT_API_BASE
  }
  try {
    localStorage.setItem(API_BASE_KEY, next)
  } catch {
    // ignore
  }
  return next
}

/**
 * Axios baseURL：
 * - 默认 `/api`（开发代理）
 * - 用户填主机（如 http://192.168.1.2:8787）时自动补 `/api`，对齐小程序
 */
export function getAxiosBaseURL(): string {
  const base = getApiBase()
  if (!base || base === '/api') return '/api'
  if (base.endsWith('/api')) return base
  return `${base}/api`
}

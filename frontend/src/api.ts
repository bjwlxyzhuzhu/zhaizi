import { useAuth } from './store'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return false
        const d = await r.json()
        useAuth.getState().setSession(d.access_token, d.user)
        return true
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0))
  }
  return refreshing
}

export async function request<T = any>(method: string, url: string, body?: any, retry = true): Promise<T> {
  const token = useAuth.getState().token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const r = await fetch('/api' + url, { method, headers, body: payload, credentials: 'include' })
  if (r.status === 401 && retry && !url.startsWith('/auth/login')) {
    if (await tryRefresh()) return request<T>(method, url, body, false)
    useAuth.getState().logout()
    throw new ApiError(401, '登录已失效，请重新登录')
  }
  if (!r.ok) {
    let msg = `请求失败（${r.status}）`
    try {
      const d = await r.json()
      msg = typeof d.detail === 'string' ? d.detail : msg
    } catch {
      /* ignore */
    }
    if (r.status === 403 && msg.includes('首次登录')) useAuth.getState().markMustChange()
    throw new ApiError(r.status, msg)
  }
  const ct = r.headers.get('content-type') || ''
  return (ct.includes('application/json') ? r.json() : (r.blob() as any)) as T
}

export const api = {
  get: <T = any>(u: string) => request<T>('GET', u),
  post: <T = any>(u: string, b?: any) => request<T>('POST', u, b ?? {}),
  put: <T = any>(u: string, b?: any) => request<T>('PUT', u, b ?? {}),
  patch: <T = any>(u: string, b?: any) => request<T>('PATCH', u, b ?? {}),
  del: <T = any>(u: string) => request<T>('DELETE', u),
}

/** 下载需要鉴权的文件 */
export async function download(method: 'GET' | 'POST', url: string, filename: string, body?: any) {
  const blob = await request<Blob>(method, url, body)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

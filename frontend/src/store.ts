import { create } from 'zustand'

export type Role = 'admin' | 'researcher' | 'user'
export interface Me {
  id: number
  account: string
  name: string
  org: string
  role: Role
  role_label: string
  is_super: boolean
  identity_type: string
  must_change_pwd: boolean
  points: number
  unread: number
}

interface AuthState {
  token: string | null
  user: Me | null
  ready: boolean
  setSession: (token: string, user: Me) => void
  setUser: (patch: Partial<Me>) => void
  markMustChange: () => void
  logout: () => void
  setReady: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  ready: false,
  setSession: (token, user) => set({ token, user, ready: true }),
  setUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
  markMustChange: () => set((s) => (s.user ? { user: { ...s.user, must_change_pwd: true } } : s)),
  logout: () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    set({ token: null, user: null, ready: true })
  },
  setReady: () => set({ ready: true }),
}))

export const can = {
  research: (r?: Role) => r === 'researcher',
  dashboard: (r?: Role) => r === 'admin' || r === 'researcher',
  admin: (r?: Role) => r === 'admin',
  tasks: (r?: Role) => r === 'user',
  review: (r?: Role) => r === 'admin' || r === 'researcher',
}

/** 站点署名：匿名参赛模式（ZZ_ANON=1）下为空，由 /api/health 下发 */
interface SiteState { anon: boolean; orgLine: string; orgShort: string; imageCredit: string; load: () => void }
export const useSite = create<SiteState>((set) => ({
  anon: true, orgLine: '', orgShort: '', imageCredit: '',
  load: () => {
    fetch('/api/health').then((r) => r.json())
      .then((d) => set({ anon: !!d.anon, orgLine: d.org_line || '', orgShort: d.org_short || '', imageCredit: d.image_credit || '' }))
      .catch(() => {})
  },
}))

/** 尊重系统“减少动态效果”设置（PRD §6 动效） */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// @vitest-environment jsdom
// #1279: ヘッダーは useOrganization の組織をエラーで除かずに出す。ログインの失効の後に、前の利用者の組織名と運営の表示が残らないこと
// （実際の auth-js 2.87.1・偽物の Response だけ・実通信なし・Sentry は記録だけ）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), onAuthStateChange: vi.fn(), capture: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: m.getSession, getUser: m.getUser, onAuthStateChange: m.onAuthStateChange } } }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: m.capture } }))
vi.mock('@/lib/api/settingsReadApi', () => ({ staffSettingsReadApi: { listByUserId: async () => ({ data: [{ id: 'fixture-staff', organization_id: 'hq' }], error: null }) } }))
vi.mock('@/lib/organization', () => ({
  QUEENS_WALTZ_ORG_ID: 'hq',
  getOrganizations: vi.fn(),
  getCurrentOrganizationId: async () => 'hq',
  fetchOrganizationForStaffSession: async (id: string) => ({ id, name: '架空の所属組織', slug: 'fixture-org', is_license_manager: true }),
  getOrganizationBySlug: async () => null,
}))
// ヘッダーの中の、この確認に関係しない部品（ログイン中の利用者の表示は今の画面の状態のまま）
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'admin', staffName: '架空のスタッフ' }, signOut: vi.fn() }) }))
vi.mock('@/hooks/useOrgThemePreset', () => ({ useOrgThemePreset: () => ({ primary: '#000000' }) }))
vi.mock('./NotificationDropdown', () => ({ NotificationDropdown: () => null }))

import { Header } from './Header'

function liveAuth() {
  const key = 'fixture-header-1279', future = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } }
  const memory = new Map<string, string>([[key, JSON.stringify(future)]])
  let revoked = false
  const sdk = createClient('https://fixture.invalid', 'fixture-publishable', {
    auth: { storageKey: key, storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v) }, removeItem: k => { memory.delete(k) } }, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      const h = { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' }
      if (path === '/auth/v1/user') return revoked
        ? new Response(JSON.stringify({ code: 'session_not_found', message: 'fixture session revoked' }), { status: 403, headers: h })
        : new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' }), { status: 200, headers: h })
      if (path === '/auth/v1/token') return new Response(JSON.stringify({ code: 'refresh_token_not_found', message: 'fixture expired refresh token' }), { status: 400, headers: h })
      throw new Error('想定外の要求')
    } },
  })
  m.getSession.mockImplementation(() => sdk.auth.getSession())
  m.getUser.mockImplementation(() => sdk.auth.getUser())
  m.onAuthStateChange.mockImplementation((cb: never) => sdk.auth.onAuthStateChange(cb))
  return { sdk, revoke() { revoked = true }, expire() { memory.set(key, JSON.stringify({ ...future, expires_at: Math.floor(Date.now() / 1000) - 5 })) } }
}
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })

for (const mode of ['revoke', 'expire'] as const) {
  it(`${mode === 'revoke' ? 'サーバー側の失効' : '期限切れの更新の拒否'}の後、ヘッダーに前の所属組織の名前と運営の表示を出さない（報告は 1 回）`, async () => {
    const f = liveAuth()
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
    const host = document.createElement('div'), root = createRoot(host)
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard']}><Header /></MemoryRouter></QueryClientProvider>))
    await tick()
    expect(host.textContent).toContain('架空の所属組織'); expect(host.textContent).toContain('MMQ運営')
    f[mode]()
    await act(async () => { await client.invalidateQueries({ queryKey: ['organization', 'current'] }) }); await tick()
    expect(host.textContent).not.toContain('架空の所属組織'); expect(host.textContent).not.toContain('MMQ運営')
    expect(client.getQueryState(['organization', 'current'])?.status).toBe('error')
    expect(m.capture).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount()); await f.sdk.auth.stopAutoRefresh()
  })
}

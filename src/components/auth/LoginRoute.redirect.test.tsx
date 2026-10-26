// @vitest-environment jsdom
// 2026-10-26 本番ログイン障害（調査側レビュー）: アプリ全体の利用者情報（reloadUser）だけ先に確定すると、/login の
// 「ログイン済みなら移動」が働き、行き先（所属組織・戻り先）を確かめる前に /dashboard などへ移ってしまう。
// AppRoot と同じ判定（authPageRedirect）と本物の LoginForm を組み合わせ、行き先の読み取りが無応答・失敗のあいだは移動しないことを確かめる
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null as null | { id: string; role: string }, listeners: new Set<() => void>() }))
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), reloadUser: vi.fn(), profile: vi.fn(), org: vi.fn(), staff: vi.fn() }))
vi.mock('@/contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0)
    React.useEffect(() => { auth.listeners.add(force); return () => { auth.listeners.delete(force) } }, [])
    return { signIn: mocks.signIn, signOut: vi.fn(), reloadUser: mocks.reloadUser, loading: false, user: auth.user, isInitialized: true }
  } }
})
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: () => {} }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/lib/api/organizationReadApi', () => ({
  loginProfileReadApi: { findUserProfile: mocks.profile, findStaffWithOrganizationSlug: mocks.staff, findStaffOnly: vi.fn() },
  organizationReadApi: { findSlugById: mocks.org },
}))
vi.mock('@/lib/authResendSignup', () => ({ resendSignupConfirmationEmail: vi.fn() }))
vi.mock('@/contexts/auth/authDiagnostics', () => ({ reportAuthFailure: vi.fn() }))
import { useAuth } from '@/contexts/AuthContext'
import { LoginForm } from './LoginForm'
import { authPageRedirect, useLoginCompletionPending } from './loginCompletion'

// AppRoot の /login の分岐と同じ形
function LoginRoute() {
  const { user, isInitialized } = useAuth() as unknown as { user: { role: string } | null; isInitialized: boolean }
  const loginPending = useLoginCompletionPending()
  const to = authPageRedirect({ isInitialized, user, loginPending, returnTo: null, organizationSlug: null })
  return to ? <Navigate to={to} replace /> : <LoginForm />
}
const paths: string[] = []
function Where() { const p = useLocation().pathname; if (paths.at(-1) !== p) paths.push(p); return null }
const never = () => new Promise(() => {})
const USER = { id: 'fake-user', email: 'qa@example.invalid', email_confirmed_at: '2026-01-01' }
let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); sessionStorage.clear(); paths.length = 0; auth.user = null
  mocks.signIn.mockReset().mockResolvedValue({ user: USER })
  // アプリ全体の利用者情報はすぐ確定する（管理者）
  mocks.reloadUser.mockReset().mockImplementation(async () => { auth.user = { id: USER.id, role: 'admin' }; auth.listeners.forEach((l) => l()); return auth.user })
  mocks.profile.mockReset().mockResolvedValue({ data: { role: 'admin', organization_id: 'fake-org', is_store_representative: false }, error: null })
  mocks.org.mockReset().mockResolvedValue({ data: { slug: 'fake-org' }, error: null })
  mocks.staff.mockReset().mockResolvedValue({ data: null, error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
async function renderAndSubmit() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/login']}><Where /><Routes><Route path="/login" element={<LoginRoute />} /><Route path="*" element={<p>moved</p>} /></Routes></MemoryRouter>))
  const inputs = host.querySelectorAll('input')
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    set.call(inputs[0], 'qa@example.invalid'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    set.call(inputs[1], 'fake-pass-123'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  await act(async () => vi.advanceTimersByTimeAsync(1))
}

describe('/login の自動移動と、ログイン画面の行き先の確認', () => {
  it.each(['profile', 'org', 'staff'] as const)('アプリ全体の利用者情報が先に確定しても、行き先の %s が無応答のあいだは移動せず、期限後も再読み込みを出したまま', async (stage) => {
    mocks[stage].mockImplementation(never)
    await renderAndSubmit()
    expect(auth.user).not.toBeNull()
    expect(paths).toEqual(['/login'])
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(paths).toEqual(['/login'])
    expect(host.querySelector('[data-testid="login-profile-retry"]')).not.toBeNull()
  })
  it('行き先の読み取りが失敗しても /dashboard へ移らない。再読み込みで所属組織のスケジュールへ', async () => {
    mocks.profile.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await renderAndSubmit()
    expect(paths).toEqual(['/login'])
    await act(async () => (host.querySelector('[data-testid="login-profile-retry"]') as HTMLButtonElement).click())
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(paths).toEqual(['/login', '/fake-org/schedule'])
  })
  it('ログイン済みで /login を開いただけ（ログイン画面の操作なし）なら、従来どおり移動する', async () => {
    auth.user = { id: USER.id, role: 'admin' }
    await act(async () => root.render(<MemoryRouter initialEntries={['/login']}><Where /><Routes><Route path="/login" element={<LoginRoute />} /><Route path="*" element={<p>moved</p>} /></Routes></MemoryRouter>))
    expect(paths.at(-1)).toBe('/dashboard')
  })
})

describe('authPageRedirect（AppRoot の判定）', () => {
  it('初期化前・未ログイン・ログイン完了の途中は移動しない。お客様は戻り先、店舗代表は店舗ダッシュボード', () => {
    const u = { role: 'admin' }
    expect(authPageRedirect({ isInitialized: false, user: u, loginPending: false, returnTo: null, organizationSlug: null })).toBeNull()
    expect(authPageRedirect({ isInitialized: true, user: null, loginPending: false, returnTo: null, organizationSlug: null })).toBeNull()
    expect(authPageRedirect({ isInitialized: true, user: u, loginPending: true, returnTo: null, organizationSlug: null })).toBeNull()
    expect(authPageRedirect({ isInitialized: true, user: u, loginPending: false, returnTo: null, organizationSlug: null })).toBe('/dashboard')
    expect(authPageRedirect({ isInitialized: true, user: { role: 'customer' }, loginPending: false, returnTo: '/a', organizationSlug: null })).toBe('/a')
    expect(authPageRedirect({ isInitialized: true, user: { role: 'staff', isStoreRepresentative: true }, loginPending: false, returnTo: null, organizationSlug: 'qw' })).toBe('/qw/store-dashboard')
  })
})

// @vitest-environment jsdom
// useOrganization の取得の失敗の報告と、取り直しの境界（QW-20261023-001）。
// 未ログインの通常の状態を不具合として送らない。本当の失敗（ログイン済みの利用者の認証の失敗・権限の拒否・通信や DB の異常）は、
// 1 回の取得の失敗につき 1 回だけ送り、エラーの状態として返す。利用者が替わったら前の利用者の組織を出さない。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type AuthCb = (event: string, session: { user: { id: string } } | null) => void
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  listByUserId: vi.fn(),
  getCurrentOrganizationId: vi.fn(),
  fetchOrganizationForStaffSession: vi.fn(),
  captureException: vi.fn(),
  authCallbacks: [] as AuthCb[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, onAuthStateChange: mocks.onAuthStateChange } },
}))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: mocks.captureException } }))
vi.mock('@/lib/api/settingsReadApi', () => ({ staffSettingsReadApi: { listByUserId: mocks.listByUserId } }))
vi.mock('@/lib/organization', () => ({
  QUEENS_WALTZ_ORG_ID: 'hq',
  getOrganizations: vi.fn(),
  getCurrentOrganizationId: mocks.getCurrentOrganizationId,
  fetchOrganizationForStaffSession: mocks.fetchOrganizationForStaffSession,
}))

import { useOrganization } from './useOrganization'

type Result = ReturnType<typeof useOrganization>

// auth-js と同じ名前・形の架空のエラー（実際の通信はしない）
function authError(name: string, status?: number) { const e = new Error(name) as Error & { status?: number; __isAuthError: boolean }; e.name = name; e.status = status; e.__isAuthError = true; return e }
const sessionMissing = () => authError('AuthSessionMissingError', 400)
const pgError = (code: string, message = 'db error') => Object.assign(new Error(message), { code, details: null, hint: null })
const session = (id: string) => ({ data: { session: { access_token: 't', user: { id } } }, error: null })
const noSession = () => ({ data: { session: null }, error: null })
const staffOk = (id = 's1') => ({ data: [{ id, organization_id: 'hq' }], error: null })

const tick = async (n = 10) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

function harness() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  const results: Array<{ value: Result | null }> = []
  const roots: Root[] = []
  async function mount(count = 1) {
    for (let i = 0; i < count; i++) {
      const slot: { value: Result | null } = { value: null }
      results.push(slot)
      function Probe() { slot.value = useOrganization(); return null }
      const root = createRoot(document.createElement('div'))
      roots.push(root)
      await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
    }
    await tick()
  }
  async function unmountAll() { for (const r of roots.splice(0)) await act(async () => r.unmount()) }
  const last = () => results[results.length - 1].value!
  return { client, mount, unmountAll, last, results }
}
const emitAuth = async (event: string, s: { user: { id: string } } | null) => { await act(async () => { for (const cb of mocks.authCallbacks) cb(event, s) }); await tick() }
const reported = (kind?: string) => mocks.captureException.mock.calls.filter(c => !kind || c[1]?.tags?.kind === kind).length

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authCallbacks.length = 0
  mocks.onAuthStateChange.mockImplementation((cb: AuthCb) => { mocks.authCallbacks.push(cb); return { data: { subscription: { unsubscribe: vi.fn() } } } })
  mocks.getCurrentOrganizationId.mockResolvedValue('hq')
  mocks.fetchOrganizationForStaffSession.mockImplementation(async (id: string) => ({ id, name: id }))
})

describe('未ログイン（手元にログインの記録が無い）', () => {
  it('通常の状態として扱い、Sentry へ送らず、エラーにもしない', async () => {
    mocks.getSession.mockResolvedValue(noSession())
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    const h = harness(); await h.mount()
    expect(h.last().error).toBeNull()
    expect(h.last().userId).toBeNull()
    expect(reported()).toBe(0)
    await h.unmountAll()
  })

  it('画面の部品が付け直されても（ヘッダーの再表示など）毎回は取り直さない', async () => {
    mocks.getSession.mockResolvedValue(noSession())
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    const h = harness(); await h.mount(3); await h.unmountAll(); await h.mount(2)
    expect(mocks.getSession.mock.calls.length + mocks.getUser.mock.calls.length).toBe(1)
    expect(reported()).toBe(0)
    await h.unmountAll()
  })
})

describe('ログイン済みの利用者の本当の失敗は隠さない', () => {
  it('(a) 手元にログインの記録があるのにサーバーが接続なし（AuthSessionMissingError）と答えたら、報告しエラーの状態にする', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    const h = harness(); await h.mount()
    expect(h.last().error).not.toBeNull()
    expect(reported('auth-error')).toBe(1)
    await h.unmountAll()
  })

  it('(b) 認証のサーバーの異常（500）を「未ログインの成功」に置き換えず、エラーの状態にして 1 回だけ報告する（再試行の後）', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: authError('AuthApiError', 500) })
    const h = harness(); await h.mount()
    expect(h.last().error).not.toBeNull()
    expect(h.last().userId).toBeNull()
    expect(mocks.getUser).toHaveBeenCalledTimes(2)
    expect(reported('auth-error')).toBe(1)
    await h.unmountAll()
  })
})

describe('スタッフ情報の取得の失敗: 1 回の取得の失敗につき 1 回だけ報告し、別の取得は抑えない', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('(c) 3 つの部品が同時に使っていて、再試行も失敗したら、報告は 1 回・取得は最初と再試行の 2 回', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('08006', 'connection failure') })
    const h = harness(); await h.mount(3)
    expect(h.results.every(r => r.value?.error)).toBe(true)
    expect(mocks.listByUserId).toHaveBeenCalledTimes(2)
    expect(reported('staff-query-error')).toBe(1)
    await h.unmountAll()
  })

  it('(c) 再試行で成功したら報告しない', async () => {
    mocks.listByUserId.mockResolvedValueOnce({ data: null, error: pgError('08006') }).mockResolvedValue(staffOk())
    const h = harness(); await h.mount()
    expect(h.last().staff?.id).toBe('s1')
    expect(reported()).toBe(0)
    await h.unmountAll()
  })

  it('権限の拒否（42501）は再試行せず、1 回だけ報告する', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('42501', 'permission denied') })
    const h = harness(); await h.mount()
    expect(mocks.listByUserId).toHaveBeenCalledTimes(1)
    expect(reported('staff-query-error')).toBe(1)
    await h.unmountAll()
  })

  it('(c) 失敗の後の本人の明示の取り直し・付け直しは新しい取得なので、また失敗すればまた報告する（永続には抑えない）', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('42501') })
    const h = harness(); await h.mount()
    expect(reported()).toBe(1)
    await act(async () => { await h.last().refetch() }); await tick()
    expect(reported()).toBe(2)
    await h.unmountAll(); await h.mount()
    expect(reported()).toBe(3)
    mocks.listByUserId.mockResolvedValue(staffOk())
    await h.unmountAll(); await h.mount()
    expect(h.last().staff?.id).toBe('s1')
    expect(reported()).toBe(3)
    await h.unmountAll()
  })
})

describe('利用者の切り替え・ログアウト・取り消し', () => {
  it('別の利用者でログインしたら、前の利用者の組織をすぐに出さなくなり、新しい利用者で取り直す', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.listByUserId.mockResolvedValue(staffOk('s1'))
    const h = harness(); await h.mount()
    expect(h.last().staff?.id).toBe('s1')
    mocks.getSession.mockResolvedValue(session('u2'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    mocks.listByUserId.mockResolvedValue(staffOk('s2'))
    await emitAuth('SIGNED_IN', { user: { id: 'u2' } })
    expect(h.last().userId).toBe('u2')
    expect(h.last().staff?.id).toBe('s2')
    await h.unmountAll()
  })

  it('ログアウトしたら前の利用者の組織を残さず、未ログインの状態にする（報告なし）', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.listByUserId.mockResolvedValue(staffOk('s1'))
    const h = harness(); await h.mount()
    mocks.getSession.mockResolvedValue(noSession())
    await emitAuth('SIGNED_OUT', null)
    expect(h.last().staff).toBeNull()
    expect(h.last().userId).toBeNull()
    expect(reported()).toBe(0)
    await h.unmountAll()
  })

  it('切り替えの前に始まった取得が後から返っても、前の利用者の結果は出さず、取り消しを失敗として報告しない', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    let releaseU1: (v: unknown) => void = () => {}
    mocks.listByUserId.mockImplementationOnce(() => new Promise(r => { releaseU1 = r }))
    const h = harness(); await h.mount()
    mocks.getSession.mockResolvedValue(session('u2'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null })
    mocks.listByUserId.mockResolvedValue(staffOk('s2'))
    await emitAuth('SIGNED_IN', { user: { id: 'u2' } })
    releaseU1(staffOk('s1')); await tick()
    expect(h.last().userId).toBe('u2')
    expect(h.last().staff?.id).toBe('s2')
    expect(reported()).toBe(0)
    await h.unmountAll()
  })

  it('同じ利用者のまま（トークンの更新・タブの復帰）では取り直さない', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.listByUserId.mockResolvedValue(staffOk('s1'))
    const h = harness(); await h.mount()
    await emitAuth('TOKEN_REFRESHED', { user: { id: 'u1' } })
    await emitAuth('SIGNED_IN', { user: { id: 'u1' } })
    expect(mocks.listByUserId).toHaveBeenCalledTimes(1)
    await h.unmountAll()
  })
})

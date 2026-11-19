// @vitest-environment jsdom
// useOrganization の取得の失敗の報告と、取り直しの境界（QW-20261023-001）。
// 未ログインの通常の状態を不具合として送らない。本当の失敗（ログイン済みの利用者の認証の失敗・権限の拒否・通信や DB の異常）は、
// 1 回の取得の失敗につき 1 回だけ送り、エラーの状態として返す。利用者が替わったら前の利用者の組織を出さない。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'

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
// postgrest-js 2.87.1 と同じく、失敗は普通のオブジェクト（Error ではない）
const pgError = (code: string, message = 'db error') => ({ message, code, details: 'fixture details', hint: 'fixture hint' })
const session = (id: string) => ({ data: { session: { access_token: 't', user: { id } } }, error: null })
const noSession = () => ({ data: { session: null }, error: null })
const staffOk = (id = 's1') => ({ data: [{ id, organization_id: 'hq' }], error: null })

const tick = async (n = 10) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }

function harness() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  const results: Array<{ value: Result | null }> = []
  const roots: Root[] = []
  // count 個の部品を同じ描画で同時に付ける（ヘッダーとサイドバーが同じ画面で同時に使う形）
  async function mount(count = 1) {
    const slots = Array.from({ length: count }, () => ({ value: null as Result | null }))
    results.push(...slots)
    const probes = slots.map((slot, i) => { function Probe() { slot.value = useOrganization(); return null }; return <Probe key={i} /> })
    const root = createRoot(document.createElement('div'))
    roots.push(root)
    await act(async () => root.render(<QueryClientProvider client={client}>{probes}</QueryClientProvider>))
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

  it('権限の拒否（42501・普通のオブジェクト）は再試行せず、1 回だけ報告し、本当の message と code を残す（details は送らない）', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('42501', 'permission denied for table staff') })
    const h = harness(); await h.mount()
    expect(mocks.listByUserId).toHaveBeenCalledTimes(1)
    expect(reported('staff-query-error')).toBe(1)
    const [err, ctx] = mocks.captureException.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('permission denied for table staff')
    expect((err as { code?: string }).code).toBe('42501')
    expect(ctx.tags.code).toBe('42501'); expect(ctx.extra.hint).toBe('fixture hint'); expect(ctx.extra.details).toBeUndefined()
    expect((h.last().error as { code?: string } | null)?.code).toBe('42501')
    await h.unmountAll()
  })

  it('DB の異常（08006・普通のオブジェクト）は 1 回再試行し、最後の失敗で message と code を残して 1 回報告する', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('08006', 'connection failure') })
    const h = harness(); await h.mount()
    expect(mocks.listByUserId).toHaveBeenCalledTimes(2)
    const [err, ctx] = mocks.captureException.mock.calls[0]
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    expect((err as Error).message).toBe('connection failure'); expect(ctx.tags.code).toBe('08006')
    await h.unmountAll()
  })

  it('PostgREST の通信の失敗（普通のオブジェクト・code 空）は 1 回再試行し、最後の失敗を通信の失敗として 1 回報告する', async () => {
    mocks.listByUserId.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', details: 'stack', hint: '', code: '' } })
    const h = harness(); await h.mount()
    expect(mocks.listByUserId).toHaveBeenCalledTimes(2)
    expect(mocks.captureException).toHaveBeenCalledTimes(1)
    const [err, ctx] = mocks.captureException.mock.calls[0]
    expect((err as Error).message).toBe('useOrganization staff-query-error: 通信の失敗（fetch-failed）')
    expect(ctx.tags.network).toBe('fetch-failed')
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

  it('最初の取得の途中に同じ利用者の SIGNED_IN（購読の開始・初期化の知らせ）が来ても、取り消して始め直さない', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    let release: (v: unknown) => void = () => {}
    mocks.listByUserId.mockImplementationOnce(() => new Promise(r => { release = r }))
    const h = harness(); await h.mount()
    await emitAuth('SIGNED_IN', { user: { id: 'u1' } })
    release(staffOk('s1')); await tick()
    expect(mocks.listByUserId).toHaveBeenCalledTimes(1)
    expect(h.last().staff?.id).toBe('s1')
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

// 実際の auth-js（2.87.1）で、ログインの記録があるのにサーバーが session_not_found を返す順序（通信は偽物の Response だけ・実通信なし）
describe('実際の auth-js: 失効した接続の削除と SIGNED_OUT の通知の順序', () => {
  function realAuth() {
    const key = 'fixture-auth', memory = new Map<string, string>([[key, JSON.stringify({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } })]])
    const requests: string[] = []
    const sdk = createClient('https://fixture.invalid', 'fixture-publishable', {
      auth: { storageKey: key, storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v) }, removeItem: k => { memory.delete(k) } }, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input: RequestInfo | URL) => {
        const url = String(input); requests.push(new URL(url).pathname)
        if (!url.endsWith('/auth/v1/user')) throw new Error('想定外の要求')
        return new Response(JSON.stringify({ code: 'session_not_found', message: 'fixture session revoked' }), { status: 403, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } })
      } },
    })
    mocks.getSession.mockImplementation(() => sdk.auth.getSession())
    mocks.getUser.mockImplementation(() => sdk.auth.getUser())
    mocks.onAuthStateChange.mockImplementation((cb: AuthCb) => sdk.auth.onAuthStateChange(cb as never))
    return { sdk, requests }
  }

  it('サーバー側で失効して auth-js が SIGNED_OUT を出しても、真の失敗を未ログインの成功で消さない（報告 1 件・エラーを残す）', async () => {
    const { sdk, requests } = realAuth()
    const h = harness(); await h.mount(); await tick(20)
    expect(requests).toEqual(['/auth/v1/user'])
    expect(reported('auth-error')).toBe(1)
    expect(h.last().error).not.toBeNull()
    // 回復: 次の付け直しで取り直すと、記録は消えているので未ログインの成功になる（追加の報告なし）
    await h.unmountAll(); await h.mount(); await tick(20)
    expect(h.last().error).toBeNull(); expect(h.last().userId).toBeNull()
    expect(reported()).toBe(1)
    await h.unmountAll(); await sdk.auth.stopAutoRefresh()
  })

  it('スタッフ表示の後に期限が切れ、本人の取り直しで更新（refresh）が失敗して SIGNED_OUT が出ても、真の失敗を未ログインの成功で消さない', async () => {
    const key = 'fixture-expired', future = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } }
    const memory = new Map<string, string>([[key, JSON.stringify(future)]]), requests: string[] = []
    const sdk = createClient('https://fixture.invalid', 'fixture-publishable', {
      auth: { storageKey: key, storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v) }, removeItem: k => { memory.delete(k) } }, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname; requests.push(path)
        if (path === '/auth/v1/user') return new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } })
        if (path === '/auth/v1/token') return new Response(JSON.stringify({ code: 'refresh_token_not_found', message: 'fixture expired refresh token' }), { status: 400, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } })
        throw new Error('想定外の要求')
      } },
    })
    mocks.getSession.mockImplementation(() => sdk.auth.getSession())
    mocks.getUser.mockImplementation(() => sdk.auth.getUser())
    mocks.onAuthStateChange.mockImplementation((cb: AuthCb) => sdk.auth.onAuthStateChange(cb as never))
    mocks.listByUserId.mockResolvedValue(staffOk('s1'))
    const h = harness(); await h.mount(); await tick(20)
    expect(h.last().staff?.id).toBe('s1')
    memory.set(key, JSON.stringify({ ...future, expires_at: Math.floor(Date.now() / 1000) - 5 }))
    await act(async () => { await h.last().refetch() }); await tick(20)
    expect(requests).toEqual(['/auth/v1/user', '/auth/v1/token'])
    expect(reported('auth-session-error')).toBe(1)
    expect(h.last().error).not.toBeNull()
    await h.unmountAll(); await sdk.auth.stopAutoRefresh()
  })

  it('その後の本人の明示のログアウトでは、報告なしで未ログインになる', async () => {
    const { sdk } = realAuth()
    const h = harness(); await h.mount(); await tick(20)
    expect(h.last().error).not.toBeNull()
    await act(async () => { await sdk.auth.signOut({ scope: 'local' }) }); await tick(20)
    expect(h.last().error).toBeNull(); expect(h.last().userId).toBeNull()
    expect(reported()).toBe(1)
    await h.unmountAll(); await sdk.auth.stopAutoRefresh()
  })
})

// #1279: スタッフの組織情報を一度出した後に、ログインが失効・期限切れの更新の拒否・認証の異常になったら、
// エラーと報告（1 回）は残したまま、前の利用者の組織・スタッフ・権限を、どの部品にも共有の置き場（QueryClient）にも残さない
describe('失効の後に前の利用者の組織情報を返さない（#1279）', () => {
  // 実際の auth-js（2.87.1）。通信は偽物の Response だけ（実通信なし）
  function liveAuth() {
    const key = 'fixture-1279', future = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'u1' } }
    const memory = new Map<string, string>([[key, JSON.stringify(future)]]), requests: string[] = []
    let revoked = false
    const sdk = createClient('https://fixture.invalid', 'fixture-publishable', {
      auth: { storageKey: key, storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v) }, removeItem: k => { memory.delete(k) } }, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname; requests.push(path)
        const h = { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' }
        if (path === '/auth/v1/user') return revoked
          ? new Response(JSON.stringify({ code: 'session_not_found', message: 'fixture session revoked' }), { status: 403, headers: h })
          : new Response(JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' }), { status: 200, headers: h })
        if (path === '/auth/v1/token') return new Response(JSON.stringify({ code: 'refresh_token_not_found', message: 'fixture expired refresh token' }), { status: 400, headers: h })
        throw new Error('想定外の要求')
      } },
    })
    mocks.getSession.mockImplementation(() => sdk.auth.getSession())
    mocks.getUser.mockImplementation(() => sdk.auth.getUser())
    mocks.onAuthStateChange.mockImplementation((cb: AuthCb) => sdk.auth.onAuthStateChange(cb as never))
    return { sdk, requests, revoke() { revoked = true }, expire() { memory.set(key, JSON.stringify({ ...future, expires_at: Math.floor(Date.now() / 1000) - 5 })) } }
  }
  const nothing = { organization: null, staff: null, organizationId: null, userId: null, isLicenseManager: false }
  const visible = (r: Result) => ({ organization: r.organization, staff: r.staff, organizationId: r.organizationId, userId: r.userId, isLicenseManager: r.isLicenseManager })
  function expectHidden(h: ReturnType<typeof harness>) {
    for (const r of h.results) { expect(visible(r.value!)).toEqual(nothing); expect(r.value!.error).not.toBeNull() }
    const q = h.client.getQueryState(['organization', 'current'])
    expect(q?.status).toBe('error'); expect(q?.data).toBeUndefined()
  }
  beforeEach(() => {
    mocks.listByUserId.mockResolvedValue(staffOk('s1'))
    mocks.fetchOrganizationForStaffSession.mockImplementation(async (id: string) => ({ id, name: id, is_license_manager: true }))
  })

  for (const mode of ['revoke', 'expire'] as const) {
    it(`${mode === 'revoke' ? 'サーバー側の失効（getUser）' : '期限切れの更新の拒否（getSession）'}: 2 つの部品と QueryClient から前の組織を消し、エラーと報告 1 回は残す`, async () => {
      const f = liveAuth()
      const h = harness(); await h.mount(2); await tick(20)
      for (const r of h.results) { expect(r.value!.staff?.id).toBe('s1'); expect(r.value!.isLicenseManager).toBe(true) }
      f[mode]()
      await act(async () => { await h.last().refetch() }); await tick(20)
      expect(f.requests).toEqual(mode === 'revoke' ? ['/auth/v1/user', '/auth/v1/user'] : ['/auth/v1/user', '/auth/v1/token'])
      expectHidden(h)
      expect(reported(mode === 'revoke' ? 'auth-error' : 'auth-session-error')).toBe(1); expect(reported()).toBe(1)
      // 付け直し（ページの移動）でも前の組織は出ず、取り直して未ログインへ回復する（追加の報告なし）
      await h.unmountAll(); await h.mount(); await tick(20)
      expect(visible(h.last())).toEqual(nothing); expect(h.last().error).toBeNull(); expect(reported()).toBe(1)
      await h.unmountAll(); await f.sdk.auth.stopAutoRefresh()
    })
  }

  it('ログインの記録は残ったままの認証のサーバーの異常（500）でも、確かめられない前の組織は返さない（報告は再試行の後の 1 回）', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const h = harness(); await h.mount(2)
    expect(h.last().staff?.id).toBe('s1')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: authError('AuthApiError', 500) })
    await act(async () => { await h.last().refetch() }); await tick(20)
    expectHidden(h)
    expect(reported('auth-error')).toBe(1)
    await h.unmountAll()
  })

  it('同じ利用者を確かめた後のスタッフ情報の DB の異常では、その利用者の前の組織を出し続ける（エラーと報告 1 回は残す）', async () => {
    mocks.getSession.mockResolvedValue(session('u1'))
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const h = harness(); await h.mount(2)
    mocks.listByUserId.mockResolvedValue({ data: null, error: pgError('08006') })
    await act(async () => { await h.last().refetch() }); await tick(20)
    for (const r of h.results) { expect(r.value!.staff?.id).toBe('s1'); expect(r.value!.userId).toBe('u1'); expect(r.value!.error).not.toBeNull() }
    expect(h.client.getQueryState(['organization', 'current'])?.data).toMatchObject({ userId: 'u1' })
    expect(reported('staff-query-error')).toBe(1)
    await h.unmountAll()
  })
})

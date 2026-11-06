// @vitest-environment jsdom
// useOrganization の本当の失敗が、実際の Sentry SDK と今の initSentry の設定（ignoreErrors・beforeSend・Dedupe など）を通って残るかの確認。
// 送信の部分（transport）だけを記録に置き換える（通信なし。実際の Sentry へは送らない）。
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const sent = vi.hoisted(() => [] as unknown[])
vi.mock('@sentry/react', async (orig) => {
  const real = await orig<typeof import('@sentry/react')>()
  return { ...real, init: (opts: Parameters<typeof real.init>[0]) => real.init({ ...opts, transport: () => ({ send: async (env: unknown) => { sent.push(env); return { statusCode: 200 } }, flush: async () => true }) }) }
})
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), listByUserId: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } } }))
vi.mock('@/lib/api/settingsReadApi', () => ({ staffSettingsReadApi: { listByUserId: mocks.listByUserId } }))
vi.mock('@/lib/organization', () => ({ QUEENS_WALTZ_ORG_ID: 'hq', getOrganizations: vi.fn(), getCurrentOrganizationId: async () => 'hq', fetchOrganizationForStaffSession: async () => null }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

let useOrganization: typeof import('./useOrganization').useOrganization
let Sentry: typeof import('@/lib/sentry').Sentry
let initSentry: () => void
beforeAll(async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://fixture@example.invalid/1')
  vi.stubEnv('VITE_APP_ENV', 'production')
  const s = await import('@/lib/sentry'); initSentry = s.initSentry; Sentry = s.Sentry
  useOrganization = (await import('./useOrganization')).useOrganization
})
// 独立した試験どうしで SDK の状態（Dedupe の直前の event など）を持ち越さないよう、試験ごとに初期化し直す（同じ設定）
beforeEach(() => { initSentry() })

// 送られた event のうち、useOrganization の報告だけを取り出す（中身は値の名前と message だけを見る）
function orgEvents(): Array<{ kind: string; value: string; network?: string; code?: string }> {
  const out: Array<{ kind: string; value: string; network?: string; code?: string }> = []
  for (const env of sent as Array<[unknown, Array<[{ type: string }, { tags?: Record<string, string>; exception?: { values?: Array<{ value?: string }> } }]>]>) {
    for (const [header, item] of env[1]) if (header.type === 'event' && item.tags?.source === 'useOrganization') out.push({ kind: item.tags.kind, value: item.exception?.values?.[0]?.value ?? '', network: item.tags.network, code: item.tags.code })
  }
  return out
}
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
async function load() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  function Probe() { useOrganization(); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await settle()
  await act(async () => root.unmount())
  await Sentry.flush(1000)
}
const named = (name: string, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { name }, extra)
const withSession = () => mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't', user: { id: 'u1' } } }, error: null })

describe('実際の SDK と今の除外の設定を通った後に残るもの', () => {
  it.each([
    ['認証のサーバーの異常（500）', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthApiError', 'fixture auth server error', { status: 500 }) }), 'auth-error'],
    ['ログインの記録があるのにサーバー側で接続なし', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthSessionMissingError', 'Auth session missing! fixture-revoked', { status: 400 }) }), 'auth-error'],
    ['スタッフ情報の DB の異常（PostgREST の普通のオブジェクト）', () => { mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }); mocks.listByUserId.mockResolvedValue({ data: null, error: { message: 'fixture connection failure', code: '08006', details: 'd', hint: '' } }) }, 'staff-query-error'],
    ['スタッフ情報の権限の拒否（PostgREST の普通のオブジェクト）', () => { mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }); mocks.listByUserId.mockResolvedValue({ data: null, error: { message: 'permission denied for table staff (fixture)', code: '42501', details: null, hint: null } }) }, 'staff-query-error'],
  ])('%s は送信まで残る（1 回）', async (_name, arrange, kind) => {
    vi.clearAllMocks(); sent.length = 0; withSession(); arrange()
    await load()
    expect(orgEvents().map(e => e.kind)).toEqual([kind])
  })

  it('DB の異常の本当の message と code が送信の中身に残る', async () => {
    vi.clearAllMocks(); sent.length = 0; withSession()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.listByUserId.mockResolvedValue({ data: null, error: { message: 'permission denied for table staff (fixture)', code: '42501', details: null, hint: null } })
    await load()
    const ev = orgEvents()
    expect(ev).toHaveLength(1); expect(ev[0].value).toBe('permission denied for table staff (fixture)'); expect(ev[0].code).toBe('42501')
  })

  // 全体の除外（ignoreErrors の 'Load failed'・'NetworkError'、beforeSend の完全一致 'Failed to fetch'）は変えない。
  // この取得の最後の通信の失敗だけを、除外に当たらない文言に包み直して 1 件残す
  it.each([
    ['Chrome の通信の失敗（認証）', 'Failed to fetch', 'fetch-failed', 'auth'],
    ['Safari の通信の失敗（認証）', 'Load failed', 'load-failed', 'auth'],
    ['Firefox の通信の失敗（認証）', 'NetworkError when attempting to fetch resource.', 'network-error', 'auth'],
    ['Chrome の通信の失敗（スタッフ情報・PostgREST）', 'TypeError: Failed to fetch', 'fetch-failed', 'staff'],
    ['Safari の通信の失敗（スタッフ情報・PostgREST）', 'TypeError: Load failed', 'load-failed', 'staff'],
    ['Firefox の通信の失敗（スタッフ情報・PostgREST）', 'TypeError: NetworkError when attempting to fetch resource.', 'network-error', 'staff'],
  ])('%s は最後の失敗につき 1 件残る', async (_name, message, label, where) => {
    vi.clearAllMocks(); sent.length = 0; withSession()
    if (where === 'auth') mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthRetryableFetchError', message, { status: 0 }) })
    else { mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }); mocks.listByUserId.mockResolvedValue({ data: null, error: { message, details: 'stack', hint: '', code: '' } }) }
    await load()
    const ev = orgEvents()
    expect(ev).toHaveLength(1)
    expect(ev[0].kind).toBe(where === 'auth' ? 'auth-error' : 'staff-query-error')
    expect(ev[0].network).toBe(label)
  })

  it('全体の除外は変えていない: useOrganization の外の同じ通信の失敗は今までどおり送られない', async () => {
    sent.length = 0
    for (const m of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) Sentry.captureException(new TypeError(m))
    await Sentry.flush(1000)
    expect((sent as unknown[]).length).toBe(0)
  })

  it('同じ SDK・同じ QueryClient で: 3 つの部品と内部の再試行で 1 件、本人の明示の取り直しで起きた同じ中身の新しい失敗はもう 1 件（Dedupe に落とされない）', async () => {
    vi.clearAllMocks(); sent.length = 0; withSession()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mocks.listByUserId.mockResolvedValue({ data: null, error: { message: 'fixture connection failure', code: '08006', details: 'd', hint: '' } })
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
    const slots: Array<{ value: ReturnType<typeof useOrganization> | null }> = [{ value: null }, { value: null }, { value: null }]
    const probes = slots.map((slot, i) => { function Probe() { slot.value = useOrganization(); return null }; return <Probe key={i} /> })
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(<QueryClientProvider client={client}>{probes}</QueryClientProvider>))
    await settle(); await Sentry.flush(1000)
    expect(mocks.listByUserId).toHaveBeenCalledTimes(2)
    expect(orgEvents()).toHaveLength(1)
    for (let n = 2; n <= 3; n++) {
      await act(async () => { await slots[0].value!.refetch() }); await settle(); await Sentry.flush(1000)
      const ev = orgEvents()
      expect(ev).toHaveLength(n)
      expect(ev.every(e => e.code === '08006' && e.value.startsWith('fixture connection failure'))).toBe(true)
    }
    await act(async () => root.unmount())
  })

  it('未ログイン（ログインの記録なし）は送らない', async () => {
    vi.clearAllMocks(); sent.length = 0
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await load()
    expect(orgEvents()).toEqual([])
  })
})

// @vitest-environment jsdom
// useOrganization の本当の失敗が、実際の Sentry SDK と今の initSentry の設定（ignoreErrors・beforeSend・Dedupe など）を通って残るかの確認。
// 送信の部分（transport）だけを記録に置き換える（通信なし。実際の Sentry へは送らない）。
import { describe, it, expect, vi, beforeAll } from 'vitest'
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
beforeAll(async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://fixture@example.invalid/1')
  vi.stubEnv('VITE_APP_ENV', 'production')
  const s = await import('@/lib/sentry'); s.initSentry(); Sentry = s.Sentry
  useOrganization = (await import('./useOrganization')).useOrganization
})

// 送られた event のうち、useOrganization の報告だけを取り出す（中身は値の名前と message だけを見る）
function orgEvents(): Array<{ kind: string; value: string }> {
  const out: Array<{ kind: string; value: string }> = []
  for (const env of sent as Array<[unknown, Array<[{ type: string }, { tags?: Record<string, string>; exception?: { values?: Array<{ value?: string }> } }]>]>) {
    for (const [header, item] of env[1]) if (header.type === 'event' && item.tags?.source === 'useOrganization') out.push({ kind: item.tags.kind, value: item.exception?.values?.[0]?.value ?? '' })
  }
  return out
}
async function load() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  function Probe() { useOrganization(); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  await act(async () => root.unmount())
  await Sentry.flush(1000)
}
const named = (name: string, message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { name }, extra)
const withSession = () => mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't', user: { id: 'u1' } } }, error: null })

describe('実際の SDK と今の除外の設定を通った後に残るもの', () => {
  it.each([
    ['認証のサーバーの異常（500）', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthApiError', 'fixture auth server error', { status: 500 }) }), 'auth-error'],
    ['ログインの記録があるのにサーバー側で接続なし', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthSessionMissingError', 'Auth session missing! fixture-revoked', { status: 400 }) }), 'auth-error'],
    ['スタッフ情報の DB の異常', () => { mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }); mocks.listByUserId.mockResolvedValue({ data: null, error: Object.assign(new Error('fixture connection failure'), { code: '08006' }) }) }, 'staff-query-error'],
    ['スタッフ情報の権限の拒否', () => { mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }); mocks.listByUserId.mockResolvedValue({ data: null, error: Object.assign(new Error('permission denied for table staff (fixture)'), { code: '42501' }) }) }, 'staff-query-error'],
  ])('%s は送信まで残る（1 回）', async (_name, arrange, kind) => {
    vi.clearAllMocks(); sent.length = 0; withSession(); arrange()
    await load()
    expect(orgEvents().map(e => e.kind)).toEqual([kind])
  })

  // 既存の全体の方針（src/lib/sentry.ts の ignoreErrors の 'Load failed'・'NetworkError' と、beforeSend の完全一致 'Failed to fetch'）で
  // 落ちるもの。今回は全体の方針を変えない（修正前も同じく落ちていた）。区別して記録する
  it.each([
    ['Chrome の通信の失敗（認証）', 'Failed to fetch'],
    ['Safari の通信の失敗（認証）', 'Load failed'],
    ['Firefox の通信の失敗（認証）', 'NetworkError when attempting to fetch resource.'],
  ])('%s は既存の除外で送られない（今回は変えない）', async (_name, message) => {
    vi.clearAllMocks(); sent.length = 0; withSession()
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: named('AuthRetryableFetchError', message, { status: 0 }) })
    await load()
    expect(orgEvents()).toEqual([])
  })

  it('未ログイン（ログインの記録なし）は送らない', async () => {
    vi.clearAllMocks(); sent.length = 0
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await load()
    expect(orgEvents()).toEqual([])
  })
})

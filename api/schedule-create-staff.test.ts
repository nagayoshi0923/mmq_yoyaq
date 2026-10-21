/**
 * 公演の作成と担当（GM・スタッフ参加）を 1 つの取引で保存する経路（PR #1210、migration 20261022010000）。
 * 担当付きの作成は create_schedule_event_with_staff を担当者の権限で呼び、直接の INSERT はしない。
 * 担当の保存に失敗したら公演は作られず、失敗を返す（以前は担当空の公演が残り、成功扱いになっていた）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => ({
  inserts: [] as unknown[],
  rpc: vi.fn(),
  scopedJwt: [] as string[],
  failCreatedRead: false,
  reads: 0,
}))
vi.mock('./_lib/db.js', () => ({
  getMissingEnvError: () => null,
  db: {
    from: (table: string) => {
      let op = 'select'
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.insert = (p: unknown) => { op = 'insert'; mock.inserts.push({ table, p }); return q }
      for (const m of ['eq', 'neq', 'in', 'order', 'limit', 'ilike', 'or', 'is', 'not']) q[m] = () => q
      const data = () => {
        if (table === 'stores') return { id: 's1', organization_id: 'org-1' }
        if (table === 'schedule_events') return op === 'insert' ? { id: 'plain-event' } : { id: 'atomic-event', gms: ['A'], gm_roles: { A: 'main' } }
        return null
      }
      q.single = q.maybeSingle = async () => {
        if (table === 'schedule_events' && op === 'select') { mock.reads += 1; if (mock.failCreatedRead) return { data: null, error: { message: 'timeout' } } }
        return { data: data(), error: null }
      }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
      return q
    },
  },
}))
vi.mock('./_lib/auth.js', () => ({
  requireAuth: async () => ({ orgId: 'org-1', userId: 'user-1', role: 'staff', jwt: 'user-jwt' }),
  requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error { constructor(public status: number, m: string) { super(m) } },
  createUserScopedClient: (jwt: string) => { mock.scopedJwt.push(jwt); return { rpc: mock.rpc } },
}))
import handler from './schedule'

async function call(body: Record<string, unknown>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, query: {}, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}
const createBody = { date: '2026-11-01', store_id: 's1', category: 'open', start_time: '14:00:00', end_time: '17:00:00', gms: [], gm_roles: {}, organization_id: 'foreign' }
beforeEach(() => { mock.inserts.length = 0; mock.scopedJwt.length = 0; mock.rpc.mockReset(); mock.failCreatedRead = false; mock.reads = 0 })

describe('POST /api/schedule 担当付きの作成', () => {
  it('担当付きは 1 つの取引の RPC を担当者の権限で呼び、直接 INSERT しない。組織と担当の列は公演データから外す', async () => {
    mock.rpc.mockResolvedValue({ data: 'atomic-event', error: null })
    const entries = [{ staff_id: 'st2', mode: 'additional', reservation_id: null }]
    const { status, body } = await call({ ...createBody, staff_assignment: { gms: ['A', 'B'], gm_roles: { A: 'main', B: 'staff' }, entries } })
    expect(status).toBe(201)
    expect(body).toMatchObject({ id: 'atomic-event', gms: ['A'] })
    expect(mock.inserts).toEqual([])
    expect(mock.scopedJwt).toEqual(['user-jwt'])
    expect(mock.rpc).toHaveBeenCalledWith('create_schedule_event_with_staff', {
      p_event: { date: '2026-11-01', store_id: 's1', category: 'open', start_time: '14:00:00', end_time: '17:00:00' },
      p_gms: ['A', 'B'], p_gm_roles: { A: 'main', B: 'staff' }, p_entries: entries,
    })
  })
  it.each([['23514', 409], ['40001', 409], ['55P03', 409], ['42501', 403], ['22023', 400]])('RPC が %s で失敗したら %i を返し、公演は作られない', async (code, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { code, message: '担当スタッフを特定できません' } })
    const result = await call({ ...createBody, staff_assignment: { gms: ['A'], gm_roles: {}, entries: [] } })
    expect(result.status).toBe(status)
    expect(result.body.error).toContain('公演は作成されていません')
    expect(mock.inserts).toEqual([])
  })
  it('想定外の失敗は 500 で、内部の文言を出さない', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: '内部' } })
    const result = await call({ ...createBody, staff_assignment: { gms: ['A'], gm_roles: {}, entries: [] } })
    expect(result.status).toBe(500)
    expect(result.body.error).not.toContain('内部')
  })
  it('担当なし（GM 未指定）は従来どおり直接 INSERT し、RPC を呼ばない', async () => {
    for (const extra of [{}, { staff_assignment: { gms: [], gm_roles: {}, entries: [] } }]) {
      mock.inserts.length = 0
      const { status } = await call({ ...createBody, ...extra })
      expect(status).toBe(201)
      expect(mock.inserts).toHaveLength(1)
    }
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('担当の形式が不正なら 400 で何も書かない', async () => {
    for (const bad of ['x', { gms: 'A', gm_roles: {} }, { gms: ['A'], gm_roles: [] }, { gms: [], gm_roles: {}, entries: [{ staff_id: 's' }] }]) {
      expect((await call({ ...createBody, staff_assignment: bad })).status).toBe(400)
    }
    expect(mock.inserts).toEqual([])
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/schedule 作成の確定／未確定（PR #1210 Codex 再レビュー 2e24bbf の 4）', () => {
  const payload = { ...createBody, staff_assignment: { gms: ['A'], gm_roles: { A: 'main' }, entries: [] } }
  it('確定後の取得だけが失敗しても 500 にせず、作成済み（ID 既知）として返す', async () => {
    mock.failCreatedRead = true
    mock.rpc.mockResolvedValue({ data: 'committed-1', error: null })
    const { status, body } = await call(payload)
    expect(status).toBe(201)
    expect(body).toMatchObject({ id: 'committed-1', gms: ['A'], gm_roles: { A: 'main' }, organization_id: 'org-1', date: '2026-11-01', store_id: 's1', read_back: false })
    expect(mock.reads).toBe(2)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
  it('担当なしの作成も、INSERT 確定後の取得失敗は作成済みとして返す', async () => {
    mock.failCreatedRead = true
    const { status, body } = await call(createBody)
    expect(status).toBe(201)
    expect(body).toMatchObject({ id: 'plain-event', read_back: false })
  })
  it.each([
    ['通信の失敗（SQLSTATE なし）', { data: null, error: { code: '', message: 'TypeError: fetch failed' } }],
    ['応答に ID が無い', { data: null, error: null }],
  ])('%s は「作成されていません」と断定せず 502（作成されたか不明）を返す', async (_label, rpcResult) => {
    mock.rpc.mockResolvedValue(rpcResult)
    const { status, body } = await call(payload)
    expect(status).toBe(502)
    expect(body).toMatchObject({ outcome: 'unknown' })
    expect(body.error).toContain('確認できませんでした')
    expect(body.error).not.toContain('されていません')
  })
})


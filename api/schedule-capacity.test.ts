import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), row: {} as Record<string, unknown>, error: null as unknown }))
vi.mock('./_lib/db.js', () => ({ db: mocks, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: async () => ({ orgId: 'org', userId: 'user', role: 'staff' }), requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error {} }))
import handler from './schedule'
async function request(capacity: number) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method: 'PATCH', headers: {}, query: { id: 'event' }, body: { capacity } } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.row = { id: 'event', organization_id: 'org', store_id: 'store', current_participants: 8, max_participants: null, capacity: null }
  mocks.error = null
  mocks.from.mockImplementation(() => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: mocks.update.mockReturnThis(), maybeSingle: async () => ({ data: mocks.row, error: null }), single: async () => ({ data: mocks.row, error: mocks.error }) }
    return chain
  })
})
describe('公演保存APIの定員超過', () => {
  it('定員超過を保存前に拒否し、具体的な対処を返す', async () => {
    const res = await request(7)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAPACITY_EXCEEDED', error: expect.stringContaining('定員7名に対して参加人数が8名') }))
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('他組織の人数をエラーに表示しない', async () => {
    mocks.row.organization_id = 'other'
    const res = await request(7)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('定員内なら通常保存する', async () => {
    const res = await request(8)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(mocks.update).toHaveBeenCalled()
  })
  it('事前確認後に予約が増えてもDBエラーを説明する', async () => {
    mocks.error = { code: '23514', message: 'schedule_events_participants_check' }
    const res = await request(8)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAPACITY_EXCEEDED', error: expect.stringContaining('予約者一覧を更新') }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AuthUser } from './auth'
const mocks = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), update: vi.fn(), insert: vi.fn(), result: { data: { id: 'saved' } as unknown, error: null as unknown } }))
vi.mock('./db.js', () => ({ db: mocks }))
import { bookingCutoffSettings } from './bookingCutoffSettings'
const user: AuthUser = { userId: 'actor', orgId: 'own-org', role: 'admin', jwt: '' }
const master = '11111111-1111-4111-8111-111111111111'
const revision = '2026-09-24T00:00:00Z'
function response() { const r = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; r.status.mockReturnValue(r); return r }
async function save(minutes: unknown, id: string | undefined = master, actor = user) {
 const r = response()
 await bookingCutoffSettings({ query: { id }, body: { minutes, expected_updated_at: revision, expected_minutes: null, organization_id: 'other-org' } } as unknown as VercelRequest, r as unknown as VercelResponse, actor, true)
 return r
}
beforeEach(() => {
 vi.clearAllMocks(); mocks.result = { data: { id: 'saved' }, error: null }
 const chain = { select: () => chain, eq: mocks.eq, is: mocks.eq, update: mocks.update, insert: mocks.insert, maybeSingle: async () => mocks.result }
 mocks.eq.mockReturnValue(chain); mocks.update.mockReturnValue(chain); mocks.insert.mockResolvedValue(mocks.result); mocks.from.mockReturnValue(chain)
})
describe('通常予約締切設定の権限と継承', () => {
 it.each(['customer','staff'] as const)('%sは保存できない', async role => {
  await expect(save(7, master, { ...user, role })).rejects.toMatchObject({ status: 403 }); expect(mocks.update).not.toHaveBeenCalled()
 })
 it('組織なしでは保存しない', async () => { expect((await save(7, master, { ...user, orgId: '' })).status).toHaveBeenCalledWith(403) })
 it.each([-1,1441,1.5,'7',undefined])('不正値%sは保存しない', async minutes => { expect((await save(minutes)).status).toHaveBeenCalledWith(400); expect(mocks.update).not.toHaveBeenCalled() })
 it('0分を継承扱いせず保存し、認証済み組織と更新前の締切で限定する', async () => {
  expect((await save(0)).status).toHaveBeenCalledWith(200)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ booking_cutoff_minutes: 0 }))
  expect(mocks.eq).toHaveBeenCalledWith('organization_id', 'own-org'); expect(mocks.eq).toHaveBeenCalledWith('booking_cutoff_minutes', null)
 })
 it('共通設定に戻すとNULLを保存する', async () => { await save(null); expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ booking_cutoff_minutes: null })) })
 it('組織共通値をNULLにできない', async () => {
  const r=response(); await bookingCutoffSettings({query:{},body:{minutes:null,expected_updated_at:revision}} as VercelRequest,r as unknown as VercelResponse,user,true)
  expect(r.status).toHaveBeenCalledWith(400)
 })
 it('競合時は成功にしない', async () => { mocks.result.data=null; expect((await save(7)).status).toHaveBeenCalledWith(409) })
})

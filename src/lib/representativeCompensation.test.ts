import { beforeEach, describe, expect, it, vi } from 'vitest'
import { representativeCompensation } from '../../api/_lib/representativeCompensation'
import type { AuthUser } from '../../api/_lib/auth'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../../api/_lib/db.js', () => ({ db: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))
const user: AuthUser = { userId: 'actor', orgId: 'trusted-org', role: 'staff', jwt: '' }
function request(action: string, body: object) { return { query: { action }, body } as unknown as VercelRequest }
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res as unknown as VercelResponse
}
describe('representative compensation notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: { success: true } }) })
  it('sends one batch notification with server-generated coupon IDs', async () => {
    mocks.rpc.mockResolvedValue({ data: { already_granted: false, quantity: 3, coupon_ids: ['a', 'b', 'c'] } })
    await representativeCompensation(request('grant-representative-compensation', {
      reservation_id: 'reservation', gm_cancellation_confirmed: true, organization_id: 'untrusted', coupon_ids: ['forged'], snapshot: {},
    }), response(), user)
    expect(mocks.rpc.mock.calls[0][1].p_organization_id).toBe('trusted-org')
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('send-coupon-granted', { body: { customerCouponIds: ['a', 'b', 'c'] } })
  })
  it('does not resend on replay', async () => {
    mocks.rpc.mockResolvedValue({ data: { already_granted: true, quantity: 3, coupon_ids: ['a', 'b', 'c'] } })
    await representativeCompensation(request('grant-representative-compensation', { gm_cancellation_confirmed: true }), response(), user)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('does not notify in preview or without cancellation confirmation', async () => {
    mocks.rpc.mockResolvedValue({ data: { already_granted: false, snapshot: {} } })
    await representativeCompensation(request('preview-representative-compensation', {}), response(), user)
    expect(mocks.rpc.mock.calls[0][1].p_apply).toBe(false)
    await representativeCompensation(request('grant-representative-compensation', {}), response(), user)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('reports notification failure without retrying the grant', async () => {
    mocks.rpc.mockResolvedValue({ data: { already_granted: false, quantity: 3, coupon_ids: ['a', 'b', 'c'] } })
    mocks.invoke.mockRejectedValue(new Error('timeout'))
    const res = response()
    await representativeCompensation(request('grant-representative-compensation', { gm_cancellation_confirmed: true }), res, user)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ notification_failed: true }))
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects customer access before reading data', async () => {
    await expect(representativeCompensation(request('preview-representative-compensation', {}), response(), { ...user, role: 'customer' })).rejects.toThrow('スタッフ')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

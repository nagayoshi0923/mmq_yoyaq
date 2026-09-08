import { it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { compensatedCancellation } from '../../api/_lib/compensatedCancellation'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), from: vi.fn() }))
vi.mock('../../api/_lib/db.js', () => ({ db: { from: mock.from, functions: { invoke: mock.invoke } } }))
vi.mock('../../api/_lib/auth.js', () => ({ requireStaff: vi.fn(), createUserScopedClient: () => ({ rpc: mock.rpc }) }))
const user = { userId: 'actor', orgId: 'org', role: 'staff' as const, jwt: 'verified-user-jwt' }
function req(action: string) { return { query: { action }, body: { event_id: 'event', gm_cancellation_confirmed: true } } as unknown as VercelRequest }
function res() { const r = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; r.status.mockReturnValue(r); return r as unknown as VercelResponse }
beforeEach(() => { vi.clearAllMocks() })
it('preview does not invoke any email', async () => {
  mock.rpc.mockResolvedValue({ data: { snapshot: {} } })
  await compensatedCancellation(req('preview-compensated-cancellation'), res(), user)
  expect(mock.rpc.mock.calls[0][1].p_apply).toBe(false)
  expect(mock.invoke).not.toHaveBeenCalled()
})
it('sends only persisted pending cancellation notices, never separate coupon notices', async () => {
  mock.rpc.mockResolvedValue({ data: { already_completed: true, reservation_ids: ['pending', 'sent'] } })
  const results = [
    { data: { status: 'pending', payload: { reservationId: 'pending', customerEmail: 'test@example.invalid' } } },
    { data: { status: 'sent', payload: {} } },
    { data: [{ reservation_id: 'pending', status: 'sent' }, { reservation_id: 'sent', status: 'sent' }] },
  ]
  mock.from.mockImplementation(() => {
    const result = results.shift()
    const q: any = { then: (resolve: (r: unknown) => unknown) => Promise.resolve(resolve(result)), maybeSingle: async () => result }
    q.select = () => q; q.eq = () => q
    return q
  })
  mock.invoke.mockResolvedValue({ data: { success: true } })
  const response = res()
  await compensatedCancellation(req('confirm-compensated-cancellation'), response, user)
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('send-cancellation-confirmation', { body: { reservationId: 'pending', customerEmail: 'test@example.invalid' } })
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ notification_pending: false }))
})

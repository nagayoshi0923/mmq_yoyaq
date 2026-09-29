import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: mocks, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: async () => ({ orgId: 'org', userId: 'user', role: 'admin' }), requireStaff: () => {}, ApiError: class extends Error {} }))
import handler from './assignments'
const row = { staff_id: 'staff', scenario_master_id: 'scenario', can_main_gm: true, can_sub_gm: false, is_experienced: false }
async function request(action: string, body: Record<string, unknown>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method: 'POST', headers: {}, query: { action }, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === 'staff_scenario_assignments' ? [row] : [{ scenario_master_id: 'scenario' }], error: null }
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: { id: 'staff' }, error: null }), then: (resolve: (x: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    return chain
  })
})
describe('bulk assignment stale-client protection', () => {
  for (const action of ['update_staff_assignments', 'update_scenario_assignments']) {
    const payload = action === 'update_staff_assignments' ? { staff_id: 'staff', assignments: [{ scenarioId: 'scenario', ...row }] } : { scenario_master_id: 'scenario', staff_ids: ['staff'] }
    it(`${action}: old clients without a baseline cannot write`, async () => {
      const res = await request(action, payload)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'ASSIGNMENT_BASELINE_REQUIRED' }))
      expect(mocks.from).not.toHaveBeenCalled()
      expect(mocks.rpc).not.toHaveBeenCalled()
    })
    it(`${action}: another edit after opening prevents bulk overwrite`, async () => {
      const res = await request(action, { ...payload, expected_assignments: [{ ...row, can_sub_gm: true }], confirm_clear: true })
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'ASSIGNMENTS_CHANGED' }))
      expect(mocks.rpc).not.toHaveBeenCalled()
    })
  }
})

describe('scenario GM atomic editor', () => {
  const changes = { removed: ['old-staff'], upserts: [{ ...row }] }
  it('sends one transaction with the authenticated actor and complete baseline', async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null })
    const res = await request('save_scenario_gm_changes', { scenario_master_id: 'scenario', changes, expected_assignments: [row], p_actor: 'forged' })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_scenario_gm_changes_atomic', { p_org: 'org', p_scenario: 'scenario', p_changes: changes, p_expected: [row], p_actor: 'user' })
    expect(res.json).toHaveBeenCalledWith([row])
  })
  it('rejects missing baselines before any write', async () => {
    const res = await request('save_scenario_gm_changes', { scenario_master_id: 'scenario', changes })
    expect(res.status).toHaveBeenCalledWith(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('reports concurrent edits without falling back to separate writes', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001' } })
    const res = await request('save_scenario_gm_changes', { scenario_master_id: 'scenario', changes, expected_assignments: [row] })
    expect(res.status).toHaveBeenCalledWith(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})

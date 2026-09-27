import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPrivateGroupCandidates } from './privateGroupCandidateDates'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }))
beforeEach(() => vi.clearAllMocks())
const input = { groupId: 'group', requestId: 'request', scenarioId: 'scenario', storeIds: ['store'], candidates: [{ date: '2030-01-01', time_slot: 'afternoon', start_time: '13:00', end_time: '16:00' }] }
describe('候補追加の一括保存', () => {
  it('同じ送信番号をDBへ渡し、再送成功も受理する', async () => {
    rpc.mockResolvedValue({ data: { success: true, candidate_ids: ['candidate'], replayed: true }, error: null })
    await expect(addPrivateGroupCandidates(input)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('private_group_add_candidate_dates', {
      p_group_id: 'group', p_request_id: 'request', p_expected_scenario_id: 'scenario', p_expected_store_ids: ['store'], p_candidates: input.candidates,
    })
  })
  it('締切や権限エラーをそのまま返す', async () => {
    const error = { code: 'P0045', message: '締切' }
    rpc.mockResolvedValue({ data: null, error })
    await expect(addPrivateGroupCandidates(input)).rejects.toEqual(error)
  })
  it.each([null, { success: false }, { success: true }, { success: true, candidate_ids: [] }])('不確かな保存結果 %j は成功扱いしない', async data => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(addPrivateGroupCandidates(input)).rejects.toThrow('保存結果を確認できません')
  })
})

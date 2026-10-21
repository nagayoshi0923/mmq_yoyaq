import { expect, it, vi } from 'vitest'
import { assignmentApi } from './assignmentApi'
import { apiClient } from './apiClient'
vi.mock('./apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }))
it('an explicitly cleared detailed roster sends an empty payload with its original baseline', async () => {
  const baseline = [{ scenario_master_id: 'experienced', can_main_gm: false, can_sub_gm: false, is_experienced: true }]
  await assignmentApi.updateStaffAssignments('staff', [], undefined, { confirmClear: true, expectedAssignments: baseline })
  expect(apiClient.get).not.toHaveBeenCalled()
  expect(apiClient.post).toHaveBeenCalledWith('/api/assignments?action=update_staff_assignments', { staff_id: 'staff', assignments: [], confirm_clear: true, expected_assignments: baseline })
})

it('作品の担当は 50 件ずつ同時に取り、スタッフ名の取得も 1 回で済ませる（並びは分割順のまま）', async () => {
  vi.mocked(apiClient.get).mockReset()
  const ids = Array.from({ length: 120 }, (_, i) => `s${i}`)
  const started: string[] = []
  const resolvers: Array<() => void> = []
  vi.mocked(apiClient.get).mockImplementation((url: string) => {
    started.push(url)
    if (url === '/api/staff') return Promise.resolve([{ id: 'st1', name: 'A' }, { id: 'st2', name: 'B' }])
    const first = decodeURIComponent(url.split('scenario_ids=')[1]).split(',')[0]
    return new Promise(resolve => resolvers.push(() => resolve([
      { scenario_master_id: first, staff_id: first === 's0' ? 'st1' : 'st2', can_main_gm: true, can_sub_gm: false, is_experienced: false },
    ])))
  })
  const pending = assignmentApi.getBatchScenarioAssignments(ids)
  await Promise.resolve()
  // 3 つの分割と /api/staff が、どれかの応答を待たずに全部出ている
  expect(started.filter(u => u.startsWith('/api/assignments')).length).toBe(3)
  expect(started.filter(u => u === '/api/staff').length).toBe(1)
  resolvers.reverse().forEach(r => r())
  const result = await pending
  expect([...result.keys()]).toEqual(['s0', 's50', 's100'])
  expect(result.get('s0')?.gmStaff).toEqual(['A'])
  expect(result.get('s100')?.gmStaff).toEqual(['B'])
})

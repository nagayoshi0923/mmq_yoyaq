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

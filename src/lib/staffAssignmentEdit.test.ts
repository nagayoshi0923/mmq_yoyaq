import { expect, it } from 'vitest'
import { selectedStaffAssignments } from './staffAssignmentEdit'
it('legacy selection UI retains existing main/sub and inactive rows while applying intentional changes', () => {
  const rows = [{ scenario_master_id: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false }, { scenario_master_id: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false }, { scenario_master_id: 'old', can_main_gm: false, can_sub_gm: false, is_experienced: false }]
  const result = selectedStaffAssignments(rows, ['main', 'sub', 'new'], [])
  expect(result).toEqual([{ scenarioId: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false }, { scenarioId: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false }, { scenarioId: 'new', can_main_gm: true, can_sub_gm: true, is_experienced: false }, { scenarioId: 'old', can_main_gm: false, can_sub_gm: false, is_experienced: false }])
  expect(selectedStaffAssignments(rows, ['sub'], ['main'])[1]).toEqual({ scenarioId: 'main', can_main_gm: false, can_sub_gm: false, is_experienced: true })
})

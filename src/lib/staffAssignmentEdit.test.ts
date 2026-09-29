import { expect, it } from 'vitest'
import { selectedStaffAssignments, toggleExperiencedAssignment } from './staffAssignmentEdit'
it('未選択の既存行を体験済みにしても保存対象が二重登録にならない', () => {
  const inactive = { scenario_master_id: 'old', can_main_gm: false, can_sub_gm: false, is_experienced: false }
  const gm = { scenario_master_id: 'gm', can_main_gm: true, can_sub_gm: false, is_experienced: false }
  const result = toggleExperiencedAssignment([inactive, gm], 'old')
  expect(result).toEqual([{ ...inactive, is_experienced: true }, gm])
  expect(inactive.is_experienced).toBe(false)
  expect(toggleExperiencedAssignment(result, 'old')).toEqual([gm])
})
it('体験済みの新規追加とGM担当の保護を維持する', () => {
  const gm = { scenario_master_id: 'gm', can_main_gm: false, can_sub_gm: true, is_experienced: false }
  const result = toggleExperiencedAssignment([gm], 'new')
  expect(result).toEqual([gm, { scenario_master_id: 'new', can_main_gm: false, can_sub_gm: false, is_experienced: true }])
  expect(toggleExperiencedAssignment(result, 'gm')).toEqual(result)
})
it('legacy selection UI retains existing main/sub and inactive rows while applying intentional changes', () => {
  const rows = [{ scenario_master_id: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false }, { scenario_master_id: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false }, { scenario_master_id: 'old', can_main_gm: false, can_sub_gm: false, is_experienced: false }]
  const result = selectedStaffAssignments(rows, ['main', 'sub', 'new'], [])
  expect(result).toEqual([{ scenarioId: 'main', can_main_gm: true, can_sub_gm: false, is_experienced: false }, { scenarioId: 'sub', can_main_gm: false, can_sub_gm: true, is_experienced: false }, { scenarioId: 'new', can_main_gm: true, can_sub_gm: true, is_experienced: false }, { scenarioId: 'old', can_main_gm: false, can_sub_gm: false, is_experienced: false }])
  expect(selectedStaffAssignments(rows, ['sub'], ['main'])[1]).toEqual({ scenarioId: 'main', can_main_gm: false, can_sub_gm: false, is_experienced: true })
})

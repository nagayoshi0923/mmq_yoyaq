export interface ScenarioGmAssignment {
  staff_id: string
  can_main_gm?: boolean
  can_sub_gm?: boolean
  notes?: string | null
}

/** Only explicit selection/role changes are written; saving prices must not rewrite GM assignments. */
export function getScenarioAssignmentChanges(
  original: ScenarioGmAssignment[],
  edited: ScenarioGmAssignment[],
  selectedStaffIds: string[],
) {
  const before = new Map(original.map(a => [a.staff_id, a]))
  const after = new Map(edited.map(a => [a.staff_id, a]))
  const selected = new Set(selectedStaffIds)
  return {
    removed: original.filter(a => !selected.has(a.staff_id)).map(a => a.staff_id),
    upserts: [...selected].flatMap(staff_id => {
      const prior = before.get(staff_id)
      const current = after.get(staff_id)
      const can_main_gm = current?.can_main_gm ?? true
      const can_sub_gm = current?.can_sub_gm ?? true
      if (prior && prior.can_main_gm === can_main_gm && prior.can_sub_gm === can_sub_gm) return []
      return [{ staff_id, can_main_gm, can_sub_gm, is_experienced: !can_main_gm && !can_sub_gm, notes: prior?.notes ?? null }]
    }),
  }
}

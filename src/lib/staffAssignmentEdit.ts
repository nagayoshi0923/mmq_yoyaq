import type { Staff } from '@/types'

export interface AssignmentSnapshot {
  scenario_master_id: string
  can_main_gm: boolean
  can_sub_gm: boolean
  is_experienced: boolean
}

export interface StaffAssignmentInput {
  scenarioId: string
  can_main_gm: boolean
  can_sub_gm: boolean
  is_experienced: boolean
  notes?: string | null
}

export type StaffEditData = Staff & {
  assignment_edit?: {
    records: StaffAssignmentInput[]
    baseline: AssignmentSnapshot[]
  }
}

export function assignmentSnapshot(rows: AssignmentSnapshot[]): AssignmentSnapshot[] {
  return rows.map(r => ({
    scenario_master_id: r.scenario_master_id,
    can_main_gm: r.can_main_gm === true,
    can_sub_gm: r.can_sub_gm === true,
    is_experienced: r.is_experienced === true,
  }))
}

export function sameAssignmentState(a: AssignmentSnapshot[], b: AssignmentSnapshot[]): boolean {
  const normalize = (rows: AssignmentSnapshot[]) => assignmentSnapshot(rows)
    .sort((x, y) => x.scenario_master_id.localeCompare(y.scenario_master_id))
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

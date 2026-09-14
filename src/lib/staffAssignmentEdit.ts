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

// 役割を持たない従来の選択UIでも、既存GMのメイン/サブを保持する。
export function selectedStaffAssignments(baseline: AssignmentSnapshot[], gmIds: string[], experiencedIds: string[]): StaffAssignmentInput[] {
  const old = new Map(baseline.map(a => [a.scenario_master_id, a]))
  const gm = new Set(gmIds)
  const experienced = new Set(experiencedIds)
  const ids = new Set([...gm, ...experienced, ...baseline.filter(a => !a.can_main_gm && !a.can_sub_gm && !a.is_experienced).map(a => a.scenario_master_id)])
  return Array.from(ids, scenarioId => {
    const previous = old.get(scenarioId)
    const wasGm = previous?.can_main_gm || previous?.can_sub_gm
    return { scenarioId, can_main_gm: gm.has(scenarioId) && (wasGm ? previous.can_main_gm : true), can_sub_gm: gm.has(scenarioId) && (wasGm ? previous.can_sub_gm : true), is_experienced: !gm.has(scenarioId) && experienced.has(scenarioId) }
  })
}

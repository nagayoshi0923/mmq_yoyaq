import { getGmResponses } from '@/lib/gmResponseApi'
import { supabase } from '@/lib/supabase'
import { fetchBatchedIds } from '@/lib/fetchBatchedIds'
import { resolveStaffProfileGmSlotCount } from '@/lib/gmScenarioMode'
import {
  isGmAvailableForCandidate,
  isGmMarkedAvailable,
  shouldIncludeGmResponseRow,
} from './gmAvailabilityStatus'

/**
 * 同一候補に対して、必要GM人数と（2人以上のとき）メイン／サブの役割が揃うか。
 * 店舗確認待ち（gm_confirmed）に上げる前に GM 回答側で利用する。
 */
export async function isReservationReadyForStoreAfterGmResponses(
  reservationId: string
): Promise<boolean> {
  const { data: res, error } = await supabase
    .from('reservations')
    .select('id, organization_id, scenario_master_id, candidate_datetimes')
    .eq('id', reservationId)
    .maybeSingle()

  if (error) throw error
  if (!res) throw new Error('予約情報を確認できません')

  const scenarioMasterId = res.scenario_master_id as string | null
  const orgId = res.organization_id as string | null
  const candidates = (res.candidate_datetimes as { candidates?: unknown[] } | null)?.candidates || []
  const nCand = candidates.length

  if (!scenarioMasterId || !orgId) throw new Error('作品と組織の情報を確認できません')
  const { data: viewRow, error: scenarioError } = await supabase
    .from('organization_scenarios_with_master')
    .select('gm_count')
    .eq('scenario_master_id', scenarioMasterId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (scenarioError) throw scenarioError
  if (!viewRow) throw new Error('作品の必要GM数を確認できません')
  const requiredGm = resolveStaffProfileGmSlotCount({ gm_count: viewRow.gm_count })

  const responses = await getGmResponses([reservationId])

  const rows = (responses || []).filter(shouldIncludeGmResponseRow).filter(isGmMarkedAvailable)
  if (rows.length === 0 || nCand === 0) return false

  const staffIdsAll = [...new Set<string>(rows.map(r => r.staff_id).filter((id): id is string => typeof id === 'string' && !!id))]
  const { data: activeStaff } = await fetchBatchedIds(staffIdsAll, ids => supabase
    .from('staff').select('id').eq('organization_id', orgId).eq('status', 'active').in('id', ids))
  const activeIds = new Set(activeStaff.map(staff => staff.id))
  const { data: assigns } = await fetchBatchedIds([...activeIds], ids => supabase
    .from('staff_scenario_assignments').select('staff_id, can_main_gm, can_sub_gm')
    .eq('scenario_master_id', scenarioMasterId).eq('organization_id', orgId).in('staff_id', ids))
  const assignMap = new Map(assigns.map(assignment => [assignment.staff_id, {
    can_main: assignment.can_main_gm === true,
    can_sub: assignment.can_sub_gm === true,
  }]))

  for (let i = 0; i < nCand; i++) {
    const staffForI = new Set<string>()
    for (const r of rows) {
      if (activeIds.has(r.staff_id) && isGmAvailableForCandidate(r, i)) {
        staffForI.add(String(r.staff_id))
      }
    }
    if (staffForI.size < requiredGm) continue

    // 同じ1人をメインとサブの両方として数えない。未登録の担当能力は推測しない。
    const people = [...staffForI]
    const rolesCovered = people.some(main => assignMap.get(main)?.can_main &&
      people.filter(other => other !== main && assignMap.get(other)?.can_sub).length >= requiredGm - 1)
    if (!rolesCovered) continue
    return true
  }
  return false
}

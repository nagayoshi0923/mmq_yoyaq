import { supabase } from '@/lib/supabase'
import { resolveStaffProfileGmSlotCount } from '@/lib/gmScenarioMode'
import { isGmMarkedAvailable, shouldIncludeGmResponseRow } from './gmAvailabilityStatus'

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

  if (error || !res) return false

  const scenarioMasterId = res.scenario_master_id as string | null
  const orgId = res.organization_id as string | null
  const candidates = (res.candidate_datetimes as { candidates?: unknown[] } | null)?.candidates || []
  const nCand = candidates.length

  let requiredGm = 1
  if (scenarioMasterId && orgId) {
    const { data: viewRow } = await supabase
      .from('organization_scenarios_with_master')
      .select('gm_count')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', orgId)
      .maybeSingle()
    requiredGm = resolveStaffProfileGmSlotCount({ gm_count: viewRow?.gm_count })
  }

  const { data: responses } = await supabase
    .from('gm_availability_responses')
    .select('staff_id, response_status, available_candidates, responded_at, response_datetime')
    .eq('reservation_id', reservationId)

  const rows = (responses || []).filter(shouldIncludeGmResponseRow).filter(isGmMarkedAvailable)
  if (rows.length === 0 || nCand === 0) return false

  const staffIdsAll = [...new Set(rows.map((r) => String(r.staff_id)).filter(Boolean))]

  const assignMap = new Map<string, { can_main: boolean; can_sub: boolean }>()
  if (requiredGm >= 2 && scenarioMasterId && orgId && staffIdsAll.length > 0) {
    for (const sid of staffIdsAll) {
      assignMap.set(sid, { can_main: true, can_sub: true })
    }
    const { data: assigns } = await supabase
      .from('staff_scenario_assignments')
      .select('staff_id, can_main_gm, can_sub_gm')
      .eq('scenario_master_id', scenarioMasterId)
      .eq('organization_id', orgId)
      .in('staff_id', staffIdsAll)
    for (const a of assigns || []) {
      assignMap.set(String(a.staff_id), {
        can_main: a.can_main_gm === true,
        can_sub: a.can_sub_gm === true,
      })
    }
  }

  for (let i = 0; i < nCand; i++) {
    const staffForI = new Set<string>()
    for (const r of rows) {
      if (r.available_candidates?.includes(i)) {
        staffForI.add(String(r.staff_id))
      }
    }
    if (staffForI.size < requiredGm) continue

    if (requiredGm >= 2) {
      let anyMain = false
      let anySub = false
      for (const sid of staffForI) {
        const cap = assignMap.get(sid) ?? { can_main: true, can_sub: true }
        if (cap.can_main) anyMain = true
        if (cap.can_sub) anySub = true
      }
      if (!anyMain || !anySub) continue
    }
    return true
  }
  return false
}

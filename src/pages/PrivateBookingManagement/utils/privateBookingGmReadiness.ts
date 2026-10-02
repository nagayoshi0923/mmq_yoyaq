import { hasReadyGmTeam } from '../../../../supabase/functions/_shared/privateBookingReadiness'
import { getGmResponses } from '@/lib/gmResponseApi'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { fetchBatchedIds } from '@/lib/fetchBatchedIds'
import { resolveStaffProfileGmSlotCount } from '@/lib/gmScenarioMode'
import {
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
  const { data: res, error } = await privateBookingMgmtReadApi.findReservationForReadiness(reservationId)

  if (error) throw error
  if (!res) throw new Error('予約情報を確認できません')

  const scenarioMasterId = res.scenario_master_id as string | null
  const orgId = res.organization_id as string | null
  const candidates = (res.candidate_datetimes as { candidates?: unknown[] } | null)?.candidates || []
  const nCand = candidates.length

  if (!scenarioMasterId || !orgId) throw new Error('作品と組織の情報を確認できません')
  const { data: viewRow, error: scenarioError } = await privateBookingMgmtReadApi.findScenarioGmCount(scenarioMasterId, orgId)
  if (scenarioError) throw scenarioError
  if (!viewRow) throw new Error('作品の必要GM数を確認できません')
  const requiredGm = resolveStaffProfileGmSlotCount({ gm_count: viewRow.gm_count })

  const responses = await getGmResponses([reservationId])

  const rows = (responses || []).filter(shouldIncludeGmResponseRow).filter(isGmMarkedAvailable)
  if (rows.length === 0 || nCand === 0) return false

  const staffIdsAll = [...new Set<string>(rows.map(r => r.staff_id).filter((id): id is string => typeof id === 'string' && !!id))]
  const { data: activeStaff } = await fetchBatchedIds(staffIdsAll, ids => privateBookingMgmtReadApi.listActiveStaffByIds(orgId, ids))
  const activeIds = new Set(activeStaff.map(staff => staff.id))
  const { data: assigns } = await fetchBatchedIds([...activeIds], ids => privateBookingMgmtReadApi.listGmAssignmentsByStaffIds(scenarioMasterId, orgId, ids))
  return hasReadyGmTeam(nCand, requiredGm, rows.filter(r => activeIds.has(r.staff_id)), assigns)
}

import type { SupabaseClient } from '@supabase/supabase-js'

export type ScenarioPlayerBounds = { min: number; max: number }

/**
 * 招待で参加できる人数の上限（シナリオ定員の max）
 */
export function memberInvitationCap(
  bounds: ScenarioPlayerBounds,
): number {
  return bounds.max
}

/**
 * グループから貸切申込するときの予約人数。
 * 今いるメンバー数ではなく作品定員（max）を使う。あとからメンバーを足せるようにする。
 */
export function resolvePrivateGroupBookingParticipantCount(opts: {
  scenarioPlayerMax?: number | null
  targetParticipantCount?: number | null
}): number {
  const max = opts.scenarioPlayerMax
  if (typeof max === 'number' && Number.isFinite(max) && max > 0) {
    return Math.floor(max)
  }
  const target = opts.targetParticipantCount
  if (typeof target === 'number' && Number.isFinite(target) && target > 0) {
    return Math.floor(target)
  }
  return 1
}


export async function fetchScenarioPlayerBoundsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
  scenarioMasterId: string
): Promise<ScenarioPlayerBounds | null> {
  const { data: viewRow } = await supabase
    .from('organization_scenarios_with_master')
    .select('player_count_min, player_count_max')
    .eq('organization_id', organizationId)
    .eq('scenario_master_id', scenarioMasterId)
    .maybeSingle()

  if (!viewRow) return null
  const min = viewRow.player_count_min
  const max = viewRow.player_count_max
  if (typeof min !== 'number' || typeof max !== 'number' || min < 1 || max < min) {
    return null
  }
  return { min, max }
}

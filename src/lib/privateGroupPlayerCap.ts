import type { SupabaseClient } from '@supabase/supabase-js'

export type ScenarioPlayerBounds = { min: number; max: number }

/** マスタと organization_scenarios の上書きから実効の min/max を求める */
export function mergeScenarioPlayerBounds(
  master: { player_count_min?: number | null; player_count_max?: number | null } | null | undefined,
  orgOverride: {
    override_player_count_min?: number | null
    override_player_count_max?: number | null
  } | null | undefined
): ScenarioPlayerBounds | null {
  if (!master) return null
  const min = orgOverride?.override_player_count_min ?? master.player_count_min
  const max = orgOverride?.override_player_count_max ?? master.player_count_max
  if (typeof min !== 'number' || typeof max !== 'number' || min < 1 || max < min) {
    return null
  }
  return { min, max }
}

/**
 * 招待で参加できる人数の上限（シナリオ定員の max）
 */
export function memberInvitationCap(
  bounds: ScenarioPlayerBounds,
): number {
  return bounds.max
}


export async function fetchScenarioPlayerBoundsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
  scenarioMasterId: string
): Promise<ScenarioPlayerBounds | null> {
  const { data: sm } = await supabase
    .from('scenario_masters')
    .select('player_count_min, player_count_max')
    .eq('id', scenarioMasterId)
    .maybeSingle()

  const { data: os } = await supabase
    .from('organization_scenarios')
    .select('override_player_count_min, override_player_count_max')
    .eq('organization_id', organizationId)
    .eq('scenario_master_id', scenarioMasterId)
    .maybeSingle()

  return mergeScenarioPlayerBounds(sm, os)
}

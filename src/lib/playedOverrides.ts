/**
 * 体験済みの除外オーバーライド（customer_played_overrides）の共有ヘルパ。
 *
 * 行が在る (customer_id, scenario_master_id) = その顧客はそのシナリオを「未体験扱い」。
 * 予約由来で自動付与された体験済みを、本人（やスタッフ）が解除するための永続レコード。
 * 体験済み計算（usePlayedScenarios / MyPage / ScenarioHero）はこの集合を差し引いて表示する。
 * RLS で本人/スタッフのみ。集計（売上/給与/キット/顧客台帳）には影響させない＝表示判定専用。
 */
import { supabase } from './supabase'
import { logger } from '@/utils/logger'

/** 顧客の除外 scenario_master_id 集合を取得（失敗時は空集合＝従来どおり全表示にフォールバック）。 */
export async function fetchPlayedOverrideIds(customerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('customer_played_overrides')
    .select('scenario_master_id')
    .eq('customer_id', customerId)
  if (error) {
    logger.warn('fetchPlayedOverrideIds failed:', error)
    return new Set()
  }
  return new Set((data ?? []).map((r: { scenario_master_id: string }) => r.scenario_master_id).filter(Boolean))
}

/** 体験済みを解除（= override を追加）。既存なら何もしない（冪等）。 */
export async function addPlayedOverride(customerId: string, scenarioMasterId: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('customer_played_overrides')
    .upsert(
      { customer_id: customerId, scenario_master_id: scenarioMasterId, reason: reason ?? null },
      { onConflict: 'customer_id,scenario_master_id', ignoreDuplicates: true }
    )
  if (error) throw error
}

/**
 * 解除を取り消す（= override を削除して体験済みに戻す）。
 * 戻り値は実際に override を削除したかどうか。再登録時に既存履歴を重複追加しないために使う。
 */
export async function removePlayedOverride(customerId: string, scenarioMasterId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('customer_played_overrides')
    .delete()
    .eq('customer_id', customerId)
    .eq('scenario_master_id', scenarioMasterId)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

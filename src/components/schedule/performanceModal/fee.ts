/**
 * 公演モーダルの料金サマリー算出（純関数・テスト対象）
 *
 * PerformanceModal の renderPerformanceSummary から抽出（Phase 5-4・挙動不変）。
 * カテゴリ別に「ラベル＋料金表記」を算出する表示ロジック。副作用なし。
 */
import type { Scenario } from '@/types'

/** シナリオの通常参加費（1名あたり）。participation_costs の normal/通常を優先、無ければ participation_fee。 */
export function getNormalFeeAmount(scenario: Scenario): number | null {
  if (scenario.participation_costs && scenario.participation_costs.length > 0) {
    const normalCosts = scenario.participation_costs.filter(
      c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
    )
    if (normalCosts.length >= 1) return normalCosts[0].amount
  }
  return scenario.participation_fee || null
}

/** 「¥per / ¥total」形式（total は per × max を満員想定で計算）。 */
export function formatFee(per: number, max: number): string {
  return `¥${per.toLocaleString()} / ¥${(per * max).toLocaleString()}`
}

export interface CategoryFeeOptions {
  venueRentalFee?: number | null
  maxParticipants?: number | null
}

/**
 * カテゴリ別の料金サマリー { label, fee } を算出する。
 * 対象外（MTG/メモ/シナリオ未選択など）は null。scenario は呼び出し側で解決して渡す。
 */
export function computeCategoryFee(
  category: string,
  scenario: Scenario | null | undefined,
  opts: CategoryFeeOptions = {},
): { label: string; fee: string } | null {
  if (category === 'mtg' || category === 'memo') return null
  if (category === 'venue_rental') {
    const fee = opts.venueRentalFee ?? 12000
    return { label: '場所貸し', fee: `¥${fee.toLocaleString()}` }
  }
  if (category === 'venue_rental_free') return { label: '場所貸し', fee: '¥0' }
  if (category === 'testplay') return { label: 'テストプレイ', fee: '¥0' }
  if (!scenario) return null
  const maxP = scenario.player_count_max || opts.maxParticipants || 1
  if (category === 'gmtest') {
    let per = 0
    if (scenario.participation_costs && scenario.participation_costs.length > 0) {
      const gmtestCost = scenario.participation_costs.find(
        c => c.time_slot === 'gmtest' && (c.status === 'active' || !c.status)
      )
      if (gmtestCost) per = gmtestCost.amount
    }
    if (!per && scenario.gm_test_participation_fee) per = scenario.gm_test_participation_fee
    return { label: 'GMテスト', fee: per > 0 ? formatFee(per, maxP) : '¥0' }
  }
  if (category === 'private') {
    const perPerson = getNormalFeeAmount(scenario)
    if (perPerson) return { label: '貸切', fee: formatFee(perPerson, maxP) }
    return null
  }
  // open / offsite / package など
  if (scenario.participation_costs && scenario.participation_costs.length > 0) {
    const normalCosts = scenario.participation_costs.filter(
      c => (c.time_slot === 'normal' || c.time_slot === '通常') && (c.status === 'active' || !c.status)
    )
    if (normalCosts.length === 1) return { label: '', fee: formatFee(normalCosts[0].amount, maxP) }
    if (normalCosts.length > 1) {
      const amounts = normalCosts.map(c => c.amount)
      const min = Math.min(...amounts)
      const max = Math.max(...amounts)
      if (min === max) return { label: '', fee: formatFee(min, maxP) }
      return { label: '', fee: `¥${min.toLocaleString()}〜 / ¥${(max * maxP).toLocaleString()}` }
    }
  }
  if (scenario.participation_fee) {
    return { label: '', fee: formatFee(scenario.participation_fee, maxP) }
  }
  return null
}

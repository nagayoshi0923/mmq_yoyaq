/**
 * シナリオ料金 (参加費/ライセンス料/GM代金) の取得ヘルパ。
 *
 * 背景: 料金は 旧単一カラム と 新JSONB配列 の2系統で保存されており、
 * UI (PricingSection / GmSettingsSection) は新形式に保存するが、
 * 旧カラムは同期されない。読み手側で配列を優先しないとUI設定値が反映されない。
 *
 * このファイルは api/ からも import される（相対パス）ので、ブラウザ専用APIや
 * @/ パスエイリアスに依存しないこと。
 */

export type PricingCategory = 'normal' | 'gmtest'

export interface ParticipationCost {
  time_slot?: string
  amount?: number | null
  status?: string
  startDate?: string
  endDate?: string
}

export interface LicenseReward {
  item?: string
  amount?: number | null
  status?: string
  startDate?: string
  endDate?: string
}

export interface GmCostEntry {
  role: string
  reward: number
  category?: PricingCategory | string
}

export interface ScenarioPricing {
  participation_costs?: ParticipationCost[] | null
  license_rewards?: LicenseReward[] | null
  gm_costs?: GmCostEntry[] | null
  participation_fee?: number | null
  gm_test_participation_fee?: number | null
  license_amount?: number | null
  gm_test_license_amount?: number | null
  // フランチャイズ系ライセンス料（store_ownership_type に応じて使い分け）
  franchise_license_amount?: number | null
  franchise_gm_test_license_amount?: number | null
  external_license_amount?: number | null
  external_gm_test_license_amount?: number | null
  fc_receive_license_amount?: number | null
  fc_receive_gm_test_license_amount?: number | null
  fc_author_license_amount?: number | null
  fc_author_gm_test_license_amount?: number | null
}

export type StoreOwnershipType = 'corporate' | 'franchise' | 'office' | null | undefined

/**
 * organization_scenarios_with_master / organization_scenarios の SELECT 文字列。
 * 料金計算で必要なカラムを全て含む（旧カラム + 新JSONB配列 + フランチャイズ系）。
 *
 * 使い方:
 *   .select(`id, scenario_master_id, title, ${SCENARIO_PRICING_COLUMNS}`)
 *
 * 新カラムが増えたらここを更新すれば全箇所に伝播する。
 */
export const SCENARIO_PRICING_COLUMNS =
  'participation_fee, gm_test_participation_fee, participation_costs, ' +
  'license_amount, gm_test_license_amount, license_rewards, ' +
  'franchise_license_amount, franchise_gm_test_license_amount, ' +
  'external_license_amount, external_gm_test_license_amount, ' +
  'fc_receive_license_amount, fc_receive_gm_test_license_amount, ' +
  'fc_author_license_amount, fc_author_gm_test_license_amount, ' +
  'gm_costs'

function pickActiveAmount<T extends { amount?: number | null; status?: string }>(
  entries: T[] | null | undefined,
  matcher: (e: T) => boolean,
): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null
  const matched = entries.filter(matcher)
  if (matched.length === 0) return null
  const active = matched.find(e => (e.status ?? 'active') === 'active')
  const chosen = active ?? matched[0]
  return chosen.amount ?? null
}

/**
 * 参加費を取得。
 * 優先: participation_costs[time_slot=cat] (active) → 旧 *_participation_fee カラム
 * gmtest で見つからない場合は normal にフォールバック
 */
export function getParticipationFee(
  scenario: ScenarioPricing | null | undefined,
  category: PricingCategory,
): number {
  if (!scenario) return 0
  if (category === 'gmtest') {
    const fromCosts = pickActiveAmount(scenario.participation_costs, c => c.time_slot === 'gmtest')
    if (fromCosts != null) return fromCosts
    if (scenario.gm_test_participation_fee != null) return scenario.gm_test_participation_fee
    return getParticipationFee(scenario, 'normal')
  }
  const fromCosts = pickActiveAmount(scenario.participation_costs, c => c.time_slot === 'normal')
  if (fromCosts != null) return fromCosts
  return scenario.participation_fee ?? 0
}

/**
 * ライセンス料を取得。
 * 優先: license_rewards[item=cat] (active) → 旧 *_license_amount カラム
 * gmtest で見つからない場合は normal にフォールバック
 */
export function getLicenseAmount(
  scenario: ScenarioPricing | null | undefined,
  category: PricingCategory,
): number {
  if (!scenario) return 0
  if (category === 'gmtest') {
    const fromRewards = pickActiveAmount(scenario.license_rewards, r => r.item === 'gmtest')
    if (fromRewards != null) return fromRewards
    if (scenario.gm_test_license_amount != null) return scenario.gm_test_license_amount
    return getLicenseAmount(scenario, 'normal')
  }
  const fromRewards = pickActiveAmount(scenario.license_rewards, r => r.item === 'normal')
  if (fromRewards != null) return fromRewards
  return scenario.license_amount ?? 0
}

/**
 * 店舗の ownership_type を加味したライセンス料取得 (**本社/FC受取の視点**)。
 *
 * フランチャイズ店舗で公演する場合 (本社がFC店から受け取る金額):
 *   fc_receive_* → external_* → 自店ライセンス → 通常へフォールバック
 *
 * 直営/オフィス店舗:
 *   通常の自店ライセンス (getLicenseAmount と同じ)
 *
 * 注: ライセンスには「本社受取」と「作者支払い」など複数視点がDBに混在する。
 *   本社受取 → このヘルパ (fc_receive_*)
 *   作者支払い (フランチャイズ店公演時) → franchise_* / fc_author_* (現状は useAuthorReportData.ts に直書き)
 */
export function getLicenseAmountForStore(
  scenario: ScenarioPricing | null | undefined,
  storeOwnershipType: StoreOwnershipType,
  category: PricingCategory,
): number {
  if (!scenario) return 0
  const isFranchise = storeOwnershipType === 'franchise'
  if (!isFranchise) {
    return getLicenseAmount(scenario, category)
  }
  // フランチャイズ: FC受取 → 他店受取 → 自店ライセンスへフォールバック
  if (category === 'gmtest') {
    const fcReceive = scenario.fc_receive_gm_test_license_amount
    if (fcReceive != null && fcReceive !== 0) return fcReceive
    const external = scenario.external_gm_test_license_amount
    if (external != null && external !== 0) return external
    return getLicenseAmount(scenario, 'gmtest')
  }
  const fcReceive = scenario.fc_receive_license_amount
  if (fcReceive != null && fcReceive !== 0) return fcReceive
  const external = scenario.external_license_amount
  if (external != null && external !== 0) return external
  return getLicenseAmount(scenario, 'normal')
}

/**
 * 指定カテゴリ (normal/gmtest) の gm_costs エントリを取得。
 * gmtest 配列が空のときは normal をフォールバック。
 */
export function getGmCostEntries(
  scenario: ScenarioPricing | null | undefined,
  category: PricingCategory,
): GmCostEntry[] {
  if (!Array.isArray(scenario?.gm_costs) || scenario!.gm_costs!.length === 0) return []
  const all = scenario!.gm_costs!
  const matched = all.filter(g => (g.category || 'normal') === category)
  if (category === 'gmtest' && matched.length === 0) {
    return all.filter(g => (g.category || 'normal') === 'normal')
  }
  return matched
}

/**
 * 指定カテゴリの GM代金合計 (gm_costs の reward を合算)。
 * activeGmCount を渡すと role 優先順 (main, sub, gm3, gm4) で活発GM数まで集計。
 * 未指定 (undefined) なら全エントリ合算。
 */
export function sumGmCosts(
  scenario: ScenarioPricing | null | undefined,
  category: PricingCategory,
  activeGmCount?: number,
): number {
  const entries = getGmCostEntries(scenario, category)
  if (entries.length === 0) return 0
  if (activeGmCount === undefined) {
    return entries.reduce((sum, g) => sum + (g.reward || 0), 0)
  }
  const roleOrder: Record<string, number> = { main: 0, sub: 1, gm3: 2, gm4: 3 }
  const sorted = [...entries].sort(
    (a, b) => (roleOrder[a.role.toLowerCase()] ?? 999) - (roleOrder[b.role.toLowerCase()] ?? 999),
  )
  const sliced = activeGmCount > 0 ? sorted.slice(0, activeGmCount) : sorted
  return sliced.reduce((sum, g) => sum + (g.reward || 0), 0)
}

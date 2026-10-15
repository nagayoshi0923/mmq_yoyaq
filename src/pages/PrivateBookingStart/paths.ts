/** 貸切を始めるページ（店舗を選ぶ → 作品を選ぶ）。MMQ 全体トップの「参加店舗から選ぶ」の行き先 */
export const PRIVATE_BOOKING_START_PATH = '/private-booking/select-organization'

/** 作品ページの貸切リクエストのタブ。希望店舗は stores で渡し、グループ作成の希望店舗の初期値にする */
export function privateScenarioTabPath(orgSlug: string, scenario: { id: string; slug?: string | null }, storeIds: readonly string[] = []): string {
  const params = new URLSearchParams({ tab: 'private' })
  if (storeIds.length > 0) params.set('stores', storeIds.join(','))
  return `/${orgSlug}/scenario/${encodeURIComponent(scenario.slug || scenario.id)}?${params.toString().replace(/%2C/g, ',')}`
}

/** URL の stores（カンマ区切り）を ID の並びにする */
export function parseStoreIdsParam(value: string | null | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
}

/**
 * 作品ページから貸切グループ作成ページへのリンク。希望店舗（作品ページの貸切タブでいま選んでいる店舗。
 * 貸切を始めるページから ?stores= で来たときはその店舗）を stores で渡し、どの入口のボタンからでも同じ店舗で開く。
 */
export function privateGroupCreatePath(options: {
  scenarioMasterId?: string | null
  organizationSlug?: string | null
  storeIds?: readonly string[]
  noDates?: boolean
}): string {
  const params = new URLSearchParams()
  if (options.scenarioMasterId) params.set('scenarioId', options.scenarioMasterId)
  if (options.organizationSlug) params.set('org', options.organizationSlug)
  if (options.noDates) params.set('mode', 'no-dates')
  const storeIds = [...new Set(options.storeIds ?? [])]
  if (storeIds.length > 0) params.set('stores', storeIds.join(','))
  return `/group/create?${params.toString().replace(/%2C/g, ',')}`
}

/**
 * 希望店舗と作品の上演可能店舗の食い違いを知らせる文面。
 * 上演可能店舗は DB の判定（private_booking_slot_store_checks）と同じ条件:
 * 稼働中・オフィス以外で、作品に上演店舗の指定があればその店舗、無ければ臨時会場以外。
 */
export interface StoreForHint {
  id: string
  name: string
  short_name?: string | null
  ownership_type?: string | null
  is_temporary?: boolean | null
}

export function playableStoresForScenario(stores: StoreForHint[], scenarioAvailableStores: string[] | null | undefined): StoreForHint[] {
  const limit = scenarioAvailableStores ?? []
  return stores.filter(s => s.ownership_type !== 'office' && (limit.length > 0 ? limit.includes(s.id) : !s.is_temporary))
}

/** 共通がない、または希望店舗の一部で上演できないときだけ文面を返す */
export function scenarioStoreHintText(playable: StoreForHint[], preferredStoreIds: string[], preferredStores: StoreForHint[] = []): string | null {
  if (preferredStoreIds.length === 0 || playable.length === 0) return null
  const name = (s: StoreForHint) => s.short_name || s.name
  const playableNames = playable.map(name).join('・')
  const common = playable.filter(s => preferredStoreIds.includes(s.id))
  if (common.length === 0) return `この作品は ${playableNames} で上演できます。希望店舗に含めてください。`
  const unplayable = preferredStoreIds.filter(id => !playable.some(s => s.id === id))
  if (unplayable.length === 0) return null
  const unplayableNames = unplayable.map(id => preferredStores.find(s => s.id === id)).filter((s): s is StoreForHint => !!s).map(name)
  const missing = playable.filter(s => !preferredStoreIds.includes(s.id))
  return `この作品は ${playableNames} で上演できます${unplayableNames.length > 0 ? `（${unplayableNames.join('・')}では上演できません）` : ''}。${missing.length > 0 ? '空きが少ないときは、ほかの上演店舗も希望店舗に含めてください。' : '候補日は上演できる店舗の空きで表示します。'}`
}

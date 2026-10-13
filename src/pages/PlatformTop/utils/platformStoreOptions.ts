import type { StoreOption } from '@/components/public-top/StorePicker'
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'

/** 全体トップの店舗の選択肢（エリアを選んでいればそのエリアの店舗だけ）。名前は「組織 店舗」 */
export function platformStoreOptions(performances: readonly PublicPerformance[], area: string | null): StoreOption[] {
  const map = new Map<string, StoreOption>()
  for (const p of performances) {
    if (!p.store_id || map.has(p.store_id)) continue
    if (area && p.prefecture !== area) continue
    const store = p.store_short_name || p.store_name
    map.set(p.store_id, { id: p.store_id, label: store.startsWith(p.organization_name) ? store : `${p.organization_name} ${store}` })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}

/**
 * クーポンを使える店舗の表示（マイページのクーポン。2026-10-12 社長要望）。
 * クーポンは発行した組織（店舗グループ）の店舗でだけ使える。店舗名はお客様向けの名前（src/lib/publicStoreName.ts）。
 * 店舗数は、クーポンを使える場所として数える（臨時会場・休止中だけ除く。レンタルスペースも含める。社長指定「7 店舗」）。
 * お客様向けの文に「運営」の語は使わない（社長指示 2026-10-12）。
 * 例: 「クインズワルツ（東京・埼玉 7 店舗）」／対象店舗を絞ったクーポンは「クインズワルツ（高田馬場店・大久保店）」
 */
import {
  storeAreaLabel,
  storeDisplayName,
  type StoreAreaSource,
  type StoreCountSource,
  type StoreNameSource,
} from './publicStoreName.js'

export type CouponStoreSource = StoreNameSource & StoreCountSource & StoreAreaSource & { id: string }

/** クーポンを使える場所として数えるか（臨時会場・休止中を除く） */
export function isCouponUsableStore(store: StoreCountSource): boolean {
  return !store.is_temporary && store.status !== 'inactive'
}

export function couponUsableStoresLabel(
  organizationName: string | null | undefined,
  stores: readonly CouponStoreSource[],
  targetStoreIds?: readonly string[] | null,
): string {
  const org = organizationName?.trim() || '発行した店舗グループ'
  const targets = targetStoreIds && targetStoreIds.length > 0
    ? stores.filter(store => targetStoreIds.includes(store.id))
    : []
  if (targets.length > 0) {
    const names = [...new Set(targets.map(store => storeDisplayName(store, { organizationName })))]
    return `${org}（${names.join('・')}）`
  }
  const usable = stores.filter(isCouponUsableStore)
  const count = usable.length
  if (count === 0) return `${org}の店舗`
  // 地域の文字は予約サイトのトップと同じ数え方（レンタルスペースは地域に足さない）
  const area = storeAreaLabel(usable)
  return `${org}（${area ? `${area} ` : ''}${count} 店舗）`
}

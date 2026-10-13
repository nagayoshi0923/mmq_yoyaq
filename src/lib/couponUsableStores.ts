/**
 * クーポンを使える店舗の表示（マイページのクーポン。2026-10-12 社長要望）。
 * クーポンは発行した組織（店舗グループ）の店舗でだけ使える。店舗名はお客様向けの名前（src/lib/publicStoreName.ts）。
 * 一覧に出す店舗は、臨時会場・休止中だけ除く（レンタルスペースも含める）。
 * お客様向けの文に「運営」の語は使わない（社長指示 2026-10-12）。
 * 例: 「クインズワルツの全店舗（東京・埼玉）」／対象店舗を絞ったクーポンは「クインズワルツ（高田馬場店・大久保店）」
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

export interface CouponUsableStores {
  /** 「クインズワルツの全店舗（東京・埼玉）」／絞ったクーポンは「クインズワルツ（高田馬場店・大久保店）」 */
  label: string
  /** 押すと開く店舗名の一覧（お客様向けの名前）。絞ったクーポンは label に並べるので空 */
  storeNames: string[]
}

/**
 * 店舗数は出さない（数え方の違いで予約サイトのトップの「N 店舗」と食い違うため。点検 33 の再発、2026-10-12）。
 * 全店舗で使えるクーポンは「○○の全店舗（地域）」とし、店舗名は押したときの一覧で見せる。
 */
export function couponUsableStores(
  organizationName: string | null | undefined,
  stores: readonly CouponStoreSource[],
  targetStoreIds?: readonly string[] | null,
): CouponUsableStores {
  const org = organizationName?.trim() || '発行した店舗グループ'
  const nameOf = (store: CouponStoreSource) => storeDisplayName(store, { organizationName })
  const targets = targetStoreIds && targetStoreIds.length > 0
    ? stores.filter(store => targetStoreIds.includes(store.id))
    : []
  if (targets.length > 0) {
    return { label: `${org}（${[...new Set(targets.map(nameOf))].join('・')}）`, storeNames: [] }
  }
  const usable = stores.filter(isCouponUsableStore)
  if (usable.length === 0) return { label: `${org}の店舗`, storeNames: [] }
  // 地域の文字は予約サイトのトップと同じ数え方（レンタルスペースは地域に足さない）
  const area = storeAreaLabel(usable)
  return {
    label: `${org}の全店舗${area ? `（${area}）` : ''}`,
    storeNames: [...new Set(usable.map(nameOf))],
  }
}

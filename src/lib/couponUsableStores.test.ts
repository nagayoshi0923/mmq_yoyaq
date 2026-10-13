import { describe, expect, it } from 'vitest'
import { couponUsableStores } from './couponUsableStores'

const stores = [
  { id: 'a', name: 'クインズワルツ高田馬場店', region: '東京都' },
  { id: 'b', name: '仮設店①', public_name: 'フォレスト①', region: '東京都' },
  { id: 'c', name: 'クインズワルツ埼玉大宮店', region: '埼玉県' },
  { id: 'd', name: '馬場オフィス(レンタルスペース)', public_name: '馬場(レ)', ownership_type: 'office', region: '東京都' },
  { id: 'e', name: '臨時会場1', is_temporary: true },
  { id: 'f', name: '閉店した店', status: 'inactive', region: '東京都' },
]

describe('クーポンを使える店舗の表示', () => {
  it('全店舗のクーポンは数を出さず「全店舗（地域）」、一覧は馬場(レ)を含め臨時会場・休止中を除く', () => {
    expect(couponUsableStores('クインズワルツ', stores)).toEqual({
      label: 'クインズワルツの全店舗（東京・埼玉）',
      storeNames: ['高田馬場店', 'フォレスト①', '埼玉大宮店', '馬場(レ)'],
    })
  })
  it('対象店舗を絞ったクーポンは店舗名（お客様向けの名前）を並べる', () => {
    expect(couponUsableStores('クインズワルツ', stores, ['a', 'b'])).toEqual({ label: 'クインズワルツ（高田馬場店・フォレスト①）', storeNames: [] })
  })
  it('店舗が読めないときは組織名だけ', () => {
    expect(couponUsableStores('クインズワルツ札幌店', []).label).toBe('クインズワルツ札幌店の店舗')
  })
})

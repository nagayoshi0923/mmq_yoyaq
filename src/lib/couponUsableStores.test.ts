import { describe, expect, it } from 'vitest'
import { couponUsableStoresLabel } from './couponUsableStores'

const stores = [
  { id: 'a', name: 'クインズワルツ高田馬場店', region: '東京都' },
  { id: 'b', name: '仮設店①', public_name: 'フォレスト①', region: '東京都' },
  { id: 'c', name: 'クインズワルツ埼玉大宮店', region: '埼玉県' },
  { id: 'd', name: '馬場オフィス(レンタルスペース)', ownership_type: 'office', region: '東京都' },
  { id: 'e', name: '臨時会場1', is_temporary: true },
]

describe('クーポンを使える店舗の表示', () => {
  it('組織名と地域・店舗数（レンタルスペースを含め、臨時会場は除く）', () => {
    expect(couponUsableStoresLabel('クインズワルツ', stores)).toBe('クインズワルツ（東京・埼玉 4 店舗）')
  })
  it('対象店舗を絞ったクーポンは店舗名（お客様向けの名前）', () => {
    expect(couponUsableStoresLabel('クインズワルツ', stores, ['a', 'b'])).toBe('クインズワルツ（高田馬場店・フォレスト①）')
  })
  it('店舗が読めないときは組織名だけ', () => {
    expect(couponUsableStoresLabel('クインズワルツ札幌店', [])).toBe('クインズワルツ札幌店の店舗')
  })
})

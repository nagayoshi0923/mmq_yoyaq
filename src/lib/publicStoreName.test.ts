import { describe, expect, it } from 'vitest'
import {
  autoOrganizationTagline,
  countPublicStores,
  storeAreaLabel,
  storeDisplayName,
  storePrefecture,
} from './publicStoreName'

const ORG = 'クインズワルツ'
const stores = [
  { name: 'クインズワルツ高田馬場店', region: '東京都', address: '東京都新宿区高田馬場1-1', status: 'active' },
  { name: 'クインズワルツ仮設店①', region: '東京都', status: 'active' },
  { name: 'クインズワルツ大久保店', region: '東京都', status: 'active' },
  { name: 'クインズワルツ大塚店', region: '東京都', status: 'active' },
  { name: 'クインズワルツ埼玉大宮店', region: '埼玉県', status: 'active' },
  { name: 'クインズワルツ仮設店②', region: '東京都', status: 'active' },
  { name: 'クインズワルツ馬場オフィス(レンタルスペース)', region: '東京都', status: 'active' },
  { name: '臨時会場1', is_temporary: true, status: 'active' },
  { name: '閉店した店', region: '千葉県', status: 'inactive' },
]

describe('お客様向けの店舗名（storeDisplayName）', () => {
  it('組織名の接頭辞を外す', () => {
    expect(storeDisplayName({ name: 'クインズワルツ高田馬場店' }, { organizationName: ORG })).toBe('高田馬場店')
    expect(storeDisplayName({ name: 'クインズワルツ仮設店①' }, { organizationName: ORG })).toBe('仮設店①')
  })
  it('お客様向けの名前（public_name）があればそれ', () => {
    expect(storeDisplayName({ name: 'クインズワルツ仮設店①', public_name: 'フォレスト①' }, { organizationName: ORG })).toBe('フォレスト①')
    expect(storeDisplayName({ name: 'クインズワルツ仮設店②', public_name: '  ' }, { organizationName: ORG })).toBe('仮設店②')
  })
  it('外すと空になるときは元の名前（店舗名＝組織名）', () => {
    expect(storeDisplayName({ name: 'クインズワルツ札幌店' }, { organizationName: 'クインズワルツ札幌店' })).toBe('クインズワルツ札幌店')
  })
  it('臨時会場はその日の会場名、無ければ「特設会場」（社内名の「臨時会場1」は出さない）', () => {
    const temp = { name: '臨時会場1', is_temporary: true, temporary_venue_names: { '2026-10-24': '別会場' } }
    expect(storeDisplayName(temp, { organizationName: ORG, date: '2026-10-24' })).toBe('別会場')
    expect(storeDisplayName(temp, { organizationName: ORG, date: '2026-10-25' })).toBe('特設会場')
  })
  it('店舗が引けないときは公演の会場名から', () => {
    expect(storeDisplayName(null, { organizationName: ORG, fallback: 'クインズワルツ大塚店' })).toBe('大塚店')
    expect(storeDisplayName(null)).toBe('店舗未定')
  })
})

describe('店舗数・地域（1 つの計算元）', () => {
  it('臨時会場・休止中・オフィスを数えない', () => {
    expect(countPublicStores(stores)).toBe(6)
  })
  it('都道府県は region、無ければ住所の先頭', () => {
    expect(storePrefecture({ region: '東京都' })).toBe('東京都')
    expect(storePrefecture({ address: '埼玉県さいたま市大宮区' })).toBe('埼玉県')
    expect(storePrefecture({ address: '北海道札幌市' })).toBe('北海道')
  })
  it('地域の文字と自動の一言', () => {
    expect(storeAreaLabel(stores)).toBe('東京・埼玉')
    expect(autoOrganizationTagline(stores)).toBe('東京・埼玉 6 店舗のマーダーミステリー専門店')
    expect(autoOrganizationTagline([{ name: '札幌店', address: '北海道札幌市' }])).toBe('北海道のマーダーミステリー専門店')
  })
})

describe('狭い欄の短い店舗名（storeShortDisplayName）', () => {
  it('お客様向けの名前、無ければ略称、臨時会場はその日の会場名', async () => {
    const { storeShortDisplayName } = await import('./publicStoreName')
    expect(storeShortDisplayName({ name: 'クインズワルツ仮設店①', short_name: '仮設①', public_name: 'フォレスト①' })).toBe('フォレスト①')
    expect(storeShortDisplayName({ name: 'クインズワルツ高田馬場店', short_name: '馬場' })).toBe('馬場')
    expect(storeShortDisplayName({ name: '臨時会場1', short_name: '臨時1', is_temporary: true, temporary_venue_names: { '2026-10-24': '別会場' } }, '2026-10-24')).toBe('別会場')
  })
})

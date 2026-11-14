import { expect, it } from 'vitest'
import { defaultPrivateBookingStoreIds } from './defaultPrivateBookingStoreIds'

it('フランチャイズ店（埼玉大宮店など）は最初はチェックしない', () => {
  expect(defaultPrivateBookingStoreIds([
    { id: 'baba', ownership_type: 'corporate' },
    { id: 'omiya', ownership_type: 'franchise' },
    { id: 'otsuka', ownership_type: null },
  ])).toEqual(['baba', 'otsuka'])
})

it('上演できる店舗がフランチャイズ店だけなら全店をチェックする（札幌店の組織など）', () => {
  expect(defaultPrivateBookingStoreIds([
    { id: 'sapporo', ownership_type: 'franchise' },
  ])).toEqual(['sapporo'])
})

it('上演できる店舗が無ければ空', () => {
  expect(defaultPrivateBookingStoreIds([])).toEqual([])
})

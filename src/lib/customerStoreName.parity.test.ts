import { describe, expect, it } from 'vitest'
import { storeDisplayName } from './publicStoreName'
import { customerStoreName } from '../../supabase/functions/_shared/customer-store-name'

// メール（Edge Function）と画面で店舗名の決め方が同じであること
describe('メールの店舗名は画面と同じ決め方', () => {
  const ORG = 'クインズワルツ'
  const cases = [
    { name: 'クインズワルツ高田馬場店' },
    { name: 'クインズワルツ仮設店①', public_name: 'フォレスト①' },
    { name: 'クインズワルツ札幌店' },
    { name: '臨時会場1', is_temporary: true, temporary_venue_names: { '2026-10-24': '別会場' } },
    { name: '臨時会場2', is_temporary: true, temporary_venue_names: {} },
  ]
  it.each(cases)('$name', (store) => {
    const org = store.name === 'クインズワルツ札幌店' ? 'クインズワルツ札幌店' : ORG
    expect(customerStoreName({ ...store, organizations: { name: org } }, { date: '2026-10-24' }))
      .toBe(storeDisplayName(store, { organizationName: org, date: '2026-10-24' }))
  })
  it('店舗が無いときは会場名', () => {
    expect(customerStoreName(null, { fallback: '会場A' })).toBe('会場A')
  })
})

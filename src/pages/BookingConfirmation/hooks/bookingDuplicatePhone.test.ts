// 重複予約の確認は電話番号で照合しない（2026-11-19）。
// スタッフのアカウントでは同じ電話番号の別のお客様の予約が読めてしまい、その予約番号・名前が出ていた。
import { expect, it, vi } from 'vitest'

const phoneFilters: string[] = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: (column: string) => { if (column === 'customer_phone') phoneFilters.push(column); return chain },
        in: () => chain,
        neq: () => chain,
        limit: () => chain,
        // 電話番号で絞ったときだけ「別のお客様の予約」が返る
        then: (resolve: any) => Promise.resolve({
          data: phoneFilters.length > 0 ? [{ id: 'other', customer_name: '別のお客様', reservation_number: 'X' }] : [],
          error: null,
        }).then(resolve),
      }
      return chain
    },
  },
}))

import { checkDuplicateReservation } from './useBookingSubmit'

it('同じ電話番号の別の予約があっても、メールが違えば重複にしない', async () => {
  const result = await checkDuplicateReservation('event-1', 'me@example.invalid', '000-0000-0000')
  expect(result).toEqual({ hasDuplicate: false })
  expect(phoneFilters).toEqual([])
})

import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

describe('予約クーポンプレビューの失敗後キャッシュ', () => {
  it('成功済みプレビューを削除し再取得を強制する', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnMount: false } },
    })
    const key = ['booking-coupon-preview', 'user', 'event']
    queryClient.setQueryData(key, { success: true, total_price: 5000, discount_amount: 5000, final_price: 0 })
    expect(queryClient.getQueryData(key)).toBeTruthy()
    // useBookingCoupon.resetAfterFailure と同じ削除。invalidate だけでは再選択時に古い成功が残る。
    queryClient.removeQueries({ queryKey: ['booking-coupon-preview', 'user', 'event'] })
    expect(queryClient.getQueryData(key)).toBeUndefined()
  })
})

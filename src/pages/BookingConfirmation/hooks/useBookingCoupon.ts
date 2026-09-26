import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import type { CustomerCoupon } from '@/types'
export function useBookingCoupon(userId: string | undefined, eventId: string, participantCount: number) {
  const [selection, setSelection] = useState<{ userId: string | undefined; eventId: string; id: string | null }>({ userId, eventId, id: null })
  // 対象変更の描画時点から旧選択を無効にする。
  const selectedCouponId = selection.userId === userId && selection.eventId === eventId ? selection.id : null
  const setSelectedCouponId = (id: string | null) => setSelection({ userId, eventId, id })
  const couponsQuery = useQuery({
    queryKey: ['booking-coupons', userId, eventId], enabled: !!userId,
    queryFn: () => apiClient.get<CustomerCoupon[]>(`/api/coupons?type=available&event_id=${encodeURIComponent(eventId)}`),
  })
  const availableCoupons = couponsQuery.data ?? []
  const selectedCoupon = availableCoupons.find(c => c.id === selectedCouponId)
  const couponPreview = useQuery({
    queryKey: ['booking-coupon-preview', userId, eventId, participantCount, selectedCouponId],
    enabled: !!userId && !!selectedCouponId,
    retry: false,
    queryFn: () => apiClient.post<{ success: boolean; total_price: number; discount_amount: number; final_price: number }>(
      '/api/coupons?action=preview-booking', { customer_coupon_id: selectedCouponId, event_id: eventId, participant_count: participantCount }),
  })
  const couponReady = !selectedCouponId || (!!couponPreview.data?.success && !couponPreview.isFetching && !couponPreview.error)
  const couponDiscount = selectedCouponId && couponReady ? couponPreview.data?.discount_amount ?? 0 : 0
  return { selectedCouponId, setSelectedCouponId, selectedCoupon, availableCoupons, couponsQuery, couponPreview, couponReady, couponDiscount }
}

/** 予約に付いたクーポンと来店確認の状態を読む（スタッフ側。社長決定 B、2026-10-20） */
import { useQuery } from '@tanstack/react-query'
import { getReservationCouponStatuses } from '@/lib/api/couponApi'

export function useReservationCouponStatuses(reservationIds: string[]) {
  const ids = [...new Set(reservationIds)].filter(Boolean).sort()
  return useQuery({
    queryKey: ['reservation-coupons', ids.join(',')],
    queryFn: () => getReservationCouponStatuses(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
  })
}

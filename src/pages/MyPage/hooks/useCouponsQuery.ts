import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllCoupons, useCoupon as consumeCoupon, getCurrentReservations, redeemCouponUsage } from '@/lib/api/couponApi'

export const couponsKeys = {
  coupons: ['my-coupons'] as const,
  currentReservations: ['my-coupons', 'current-reservations'] as const,
}

export function useCouponsQuery() {
  return useQuery({
    queryKey: couponsKeys.coupons,
    queryFn: () => getAllCoupons(),
  })
}

export function useCurrentReservationsQuery() {
  return useQuery({
    queryKey: couponsKeys.currentReservations,
    queryFn: () => getCurrentReservations(),
  })
}

export function useUseCouponMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ couponId, reservationId }: { couponId: string; reservationId: string }) =>
      consumeCoupon(couponId, reservationId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: couponsKeys.coupons, refetchType: 'all' })
      }
    },
  })
}

/** 予約に適用済みのクーポンを来店時に「もぎる」（来店確認の印だけ付ける） */
export function useRedeemCouponUsageMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (usageId: string) => redeemCouponUsage(usageId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: couponsKeys.coupons, refetchType: 'all' })
      }
    },
  })
}

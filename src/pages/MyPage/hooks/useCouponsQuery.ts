import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllCoupons, useCoupon, getCurrentReservations } from '@/lib/api/couponApi'

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
      useCoupon(couponId, reservationId),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: couponsKeys.coupons })
      }
    },
  })
}

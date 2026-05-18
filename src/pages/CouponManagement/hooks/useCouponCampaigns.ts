import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCampaigns } from '@/lib/api/couponApi'
import type { CouponCampaign } from '@/types'

export const couponKeys = {
  campaigns: ['coupon-campaigns'] as const,
}

export function useCouponCampaigns() {
  const queryClient = useQueryClient()

  const { data: campaigns = [], isLoading } = useQuery<CouponCampaign[]>({
    queryKey: couponKeys.campaigns,
    queryFn: getCampaigns,
    staleTime: 5 * 60 * 1000,
  })

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: couponKeys.campaigns })

  return { campaigns, isLoading, refetch }
}

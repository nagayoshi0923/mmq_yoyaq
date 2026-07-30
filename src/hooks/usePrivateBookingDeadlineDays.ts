/**
 * 貸切公演の予約受付締切（公演日の何日前まで申込可能か）を取得するフック
 *
 * 設定値は reservation_settings.private_booking_deadline_days（設定 > 予約設定）。
 * anon からも読めるよう get_private_booking_deadline_days RPC 経由で取得する。
 * 組織は organizationId / organizationSlug のどちらかで指定（両方省略時は全体の最大値）。
 * 未設定・取得失敗時は 14 日にフォールバックする。
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export const DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS = 14

interface UsePrivateBookingDeadlineDaysOptions {
  organizationId?: string | null
  organizationSlug?: string | null
}

export async function fetchPrivateBookingDeadlineDays(
  options?: UsePrivateBookingDeadlineDaysOptions
): Promise<number> {
  const { data, error } = await supabase.rpc('get_private_booking_deadline_days', {
    p_organization_id: options?.organizationId ?? null,
    p_organization_slug: options?.organizationSlug ?? null,
  })
  if (error) {
    logger.error('貸切予約締切日数の取得に失敗:', error)
    return DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS
  }
  return typeof data === 'number' ? data : DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS
}

export function usePrivateBookingDeadlineDays(
  options?: UsePrivateBookingDeadlineDaysOptions
): number {
  const { data } = useQuery({
    queryKey: [
      'private-booking-deadline-days',
      options?.organizationId ?? null,
      options?.organizationSlug ?? null,
    ],
    queryFn: () => fetchPrivateBookingDeadlineDays(options),
    staleTime: 5 * 60 * 1000,
  })
  return data ?? DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS
}

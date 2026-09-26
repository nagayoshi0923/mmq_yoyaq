/**
 * 貸切公演の予約受付締切（公演日の何日前まで申込可能か）を取得するフック
 *
 * 設定値は組織共通 → シナリオの順で解決します。
 * anon からも読めるよう get_effective_private_booking_deadline_days RPC 経由で取得する。
 * 組織は organizationId / organizationSlug のどちらかで指定（両方省略時は全体の最大値）。
 * 初期値は14日。読込中・取得失敗時は受付を広げないよう最大90日で制限する。
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export const DEFAULT_PRIVATE_BOOKING_DEADLINE_DAYS = 14

interface UsePrivateBookingDeadlineDaysOptions {
  scenarioId?: string | null
  organizationId?: string | null
  organizationSlug?: string | null
}

export async function fetchPrivateBookingDeadlineDays(
  options?: UsePrivateBookingDeadlineDaysOptions
): Promise<number> {
  const { data, error } = await supabase.rpc('get_effective_private_booking_deadline_days', {
    p_scenario_id: options?.scenarioId ?? null,
    p_organization_id: options?.organizationId ?? null,
    p_organization_slug: options?.organizationSlug ?? null,
  })
  if (error) {
    logger.error('貸切予約締切日数の取得に失敗:', error)
    return 90
  }
  return typeof data === 'number' && Number.isInteger(data) && data >= 0 && data <= 90 ? data : 90
}

export function usePrivateBookingDeadlineState(
  options?: UsePrivateBookingDeadlineDaysOptions
): { days: number; loading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: [
      'private-booking-deadline-days',
      options?.scenarioId ?? null,
      options?.organizationId ?? null,
      options?.organizationSlug ?? null,
    ],
    queryFn: () => fetchPrivateBookingDeadlineDays(options),
    staleTime: 5 * 60 * 1000,
  })
  return { days: data ?? 90, loading: isPending }
}

export function usePrivateBookingDeadlineDays(options?: UsePrivateBookingDeadlineDaysOptions): number {
  return usePrivateBookingDeadlineState(options).days
}

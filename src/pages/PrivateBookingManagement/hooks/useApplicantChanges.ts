/**
 * 承認画面のカードに出す「申込者の変更履歴」（主催者の引き継ぎ、マイページ改修 段階 3）。
 * 成立した引き継ぎ依頼（private_group_handover_requests の accepted）の、いつ・誰から誰へ。
 */
import { useQuery } from '@tanstack/react-query'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { toApplicantChange, type ApplicantChange, type ApplicantChangeRow } from '../utils/applicantChanges'

export type { ApplicantChange }

export function useApplicantChanges(organizationId: string | null, reservationIds: string[]) {
  const ids = [...new Set(reservationIds)].sort()
  return useQuery({
    queryKey: ['private-applicant-changes', organizationId, ids],
    enabled: Boolean(organizationId) && ids.length > 0,
    queryFn: async (): Promise<Record<string, ApplicantChange[]>> => {
      const byReservation: Record<string, ApplicantChange[]> = {}
      for (let start = 0; start < ids.length; start += 100) {
        const { data, error } = await privateBookingMgmtReadApi.listApplicantChanges(organizationId!, ids.slice(start, start + 100))
        if (error) throw error
        for (const row of (data ?? []) as ApplicantChangeRow[]) {
          const change = toApplicantChange(row)
          if (change) (byReservation[change.reservation_id] ||= []).push(change)
        }
      }
      return byReservation
    },
    staleTime: 30_000,
  })
}

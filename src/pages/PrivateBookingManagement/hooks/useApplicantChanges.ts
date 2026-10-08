/**
 * 承認画面のカードに出す「申込者の変更履歴」（主催者の引き継ぎ、マイページ改修 段階 3）。
 * 成立した引き継ぎ依頼（private_group_handover_requests の accepted）の、いつ・誰から誰へ。
 */
import { useQuery } from '@tanstack/react-query'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'

export interface ApplicantChange {
  id: string
  reservation_id: string
  responded_at: string
  from_name: string
  to_name: string
}

interface Row {
  id: string
  reservation_id: string | null
  responded_at: string | null
  previous_customer: { customer_name?: string | null; display_name?: string | null } | null
  accepted_contact: { name?: string | null } | null
}

export function toApplicantChange(row: Row): ApplicantChange | null {
  if (!row.reservation_id || !row.responded_at) return null
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    responded_at: row.responded_at,
    from_name: row.previous_customer?.customer_name || row.previous_customer?.display_name || '不明',
    to_name: row.accepted_contact?.name || '不明',
  }
}

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
        for (const row of (data ?? []) as Row[]) {
          const change = toApplicantChange(row)
          if (change) (byReservation[change.reservation_id] ||= []).push(change)
        }
      }
      return byReservation
    },
    staleTime: 30_000,
  })
}

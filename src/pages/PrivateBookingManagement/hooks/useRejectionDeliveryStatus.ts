import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/utils/toast'
import { privateBookingMgmtRpcApi } from '@/lib/api/privateBookingMgmtReadApi'
export interface RejectionDeliveryStatus {
  reservation_id: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'superseded'
  attempt_count: number
  last_error: string | null
  updated_at: string
  can_retry: boolean
}
export function useRejectionDeliveryStatus(organizationId: string | null, reservationIds: string[]) {
  const ids = [...new Set(reservationIds)].sort()
  const queryClient = useQueryClient()
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await privateBookingMgmtRpcApi.retryRejectionDelivery(id)
      if (error || data !== true) throw error || new Error('retry_failed')
    },
    onSuccess: () => {
      showToast.success('メールの再試行を予約しました')
      void queryClient.invalidateQueries({ queryKey: ['private-rejection-delivery-status', organizationId] })
    },
    onError: () => showToast.error('再試行を予約できません。送信状況を再読み込みしてください'),
  })
  const query = useQuery({
    queryKey: ['private-rejection-delivery-status', organizationId, ids],
    enabled: !!organizationId && ids.length > 0,
    queryFn: async (): Promise<RejectionDeliveryStatus[]> => {
      const rows: RejectionDeliveryStatus[] = []
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await privateBookingMgmtRpcApi.getRejectionDeliveryStatus(ids.slice(offset, offset + 100))
        if (error) throw error
        rows.push(...(data || []))
      }
      return rows
    },
    refetchInterval: query => query.state.data?.some(row => ['pending', 'sending'].includes(row.status)) ? 15_000 : false,
    staleTime: 5_000,
  })
  return { ...query, retry: retry.mutate, retrying: retry.isPending }
}
export function rejectionDeliveryLabel(status: RejectionDeliveryStatus['status']): string {
  return {pending:'メール送信待ち（自動再試行あり）',sending:'メール送信処理中',sent:'メール送信受付済み',
    failed:'メール未送信：設定・宛先の確認が必要です',uncertain:'メール送信結果が不明：通知履歴を確認し、重複再送しないでください',
    superseded:'予約の状態が変わったため、旧メールの送信を停止しました'}[status]
}

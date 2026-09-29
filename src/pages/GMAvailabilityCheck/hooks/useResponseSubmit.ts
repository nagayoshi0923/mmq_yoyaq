import { saveGmResponse } from '@/lib/gmResponseApi'
import { candidateIndexesFromOrders } from '@/lib/gmCandidateSelection'
import { nextGmResponseStatus } from '../../../../supabase/functions/_shared/privateBookingReadiness'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { isReservationReadyForStoreAfterGmResponses } from '@/pages/PrivateBookingManagement/utils/privateBookingGmReadiness'
import type { GMRequest } from './useGMRequests'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'

interface UseResponseSubmitProps {
  requests: GMRequest[]
  selectedCandidates: Record<string, number[]>
  gmScheduleConflicts?: Record<string, Record<number, boolean>>
  notes: Record<string, string>
  onSubmitSuccess: () => void
}

/**
 * GM回答送信処理フック
 */
export function useResponseSubmit({ 
  requests, 
  selectedCandidates, 
  gmScheduleConflicts,
  notes, 
  onSubmitSuccess 
}: UseResponseSubmitProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  // GM本人の既存予定と被る可能性がある候補を選択して送信しようとした際の確認ダイアログ対象
  const [conflictConfirmTarget, setConflictConfirmTarget] = useState<{ requestId: string; allUnavailable: boolean; conflictOrders: number[] } | null>(null)

  /**
   * 回答を送信
   */
  const handleSubmit = async (requestId: string, allUnavailable: boolean = false) => {
    // 画面の表示番号を、読込時の候補配列位置へ変換して保存する。
    const selectedOrders = allUnavailable ? [] : (selectedCandidates[requestId] || [])

    // ⚠️ GM本人の既存予定と被る可能性がある候補を選んでいる場合は、送信前に確認
    if (!allUnavailable && selectedOrders.length > 0 && gmScheduleConflicts?.[requestId]) {
      const conflictOrders = selectedOrders.filter(order => gmScheduleConflicts[requestId]?.[order])
      if (conflictOrders.length > 0) {
        setConflictConfirmTarget({ requestId, allUnavailable, conflictOrders })
        return
      }
    }

    await runSubmit(requestId, allUnavailable)
  }

  /**
   * 競合確認ダイアログで「このまま送信する」を選んだ場合に呼ばれる
   */
  const confirmSubmitDespiteConflict = async () => {
    if (!conflictConfirmTarget) return
    const { requestId, allUnavailable } = conflictConfirmTarget
    await runSubmit(requestId, allUnavailable)
  }

  const runSubmit = async (requestId: string, allUnavailable: boolean) => {
    setSubmitting(requestId)
    let responseSaved = false

    try {
      const selectedOrders = allUnavailable ? [] : (selectedCandidates[requestId] || [])
      const request = requests.find(r => r.id === requestId)
      if (!request) throw new Error('回答する依頼が見つかりません')
      const availableCandidates = allUnavailable ? [] : candidateIndexesFromOrders(request.candidate_datetimes?.candidates || [], selectedOrders)
      const responseStatus = allUnavailable ? 'all_unavailable' : (availableCandidates.length > 0 ? 'available' : 'pending')
      
      await saveGmResponse({reservationId:request.reservation_id,staffId:request.staff_id,
        candidates:request.candidate_datetimes?.candidates || [],
        expectedResponse:{id:request.id,updated_at:request.updated_at},
        availableCandidates,responseStatus,notes:notes[requestId] || null})

      responseSaved = true

      // 必要GM数が2人以上のシナリオは、同一候補で人数が揃いメイン／サブ役がカバーできるまで店舗確認待ちにしない
      if (availableCandidates.length > 0) {
        const request = requests.find(r => r.id === requestId)
        if (request) {
          const { data: curRow, error: statusError } = await supabase
            .from('reservations')
            .select('status')
            .eq('id', request.reservation_id)
            .maybeSingle()
          if (statusError || !curRow) throw statusError || new Error('予約が見つかりません')
          const prevStatus = curRow.status

          const readyForStore = await isReservationReadyForStoreAfterGmResponses(request.reservation_id)
          const newStatus = nextGmResponseStatus(prevStatus, readyForStore)

          const updateData: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          }

          const gmResponseParams: RpcAdminUpdateReservationFieldsParams = {
            p_reservation_id: request.reservation_id,
            p_updates: updateData,
          }
          const { data: reservationResult, error: reservationError } = newStatus === prevStatus
            ? { data: { success: true }, error: null }
            : await supabase.rpc('admin_update_reservation_fields', gmResponseParams)

          if (reservationError || reservationResult?.success === false) {
            throw reservationError || new Error(reservationResult.error || '予約更新に失敗しました')
          } else if (!readyForStore && prevStatus !== 'gm_confirmed') {
            showToast.info(
              '回答を保存しました。同じ候補で必要人数とメイン・サブの担当条件が揃うまで、GM確認中として表示します。'
            )
          }
        }
      }
      
    } catch (error) {
      logger.error('送信エラー:', error)
      showToast.error(responseSaved
        ? '回答は保存済みですが、予約の状態確認・更新に失敗しました。再度送信してください。'
        : error instanceof Error ? error.message : '回答を保存できませんでした。再度お試しください。')
    } finally {
      setSubmitting(null)
      if (responseSaved) onSubmitSuccess()
    }
  }

  return {
    submitting,
    handleSubmit,
    conflictConfirmOpen: conflictConfirmTarget !== null,
    conflictConfirmOrders: conflictConfirmTarget?.conflictOrders ?? [],
    setConflictConfirmOpen: (open: boolean) => { if (!open) setConflictConfirmTarget(null) },
    confirmSubmitDespiteConflict,
  }
}


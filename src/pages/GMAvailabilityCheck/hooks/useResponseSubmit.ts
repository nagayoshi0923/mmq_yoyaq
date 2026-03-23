import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { isReservationReadyForStoreAfterGmResponses } from '@/pages/PrivateBookingManagement/utils/privateBookingGmReadiness'
import type { GMRequest } from './useGMRequests'

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

  /**
   * 回答を送信
   */
  const handleSubmit = async (requestId: string, allUnavailable: boolean = false) => {
    setSubmitting(requestId)
    
    try {
      // UI上は1始まりだが、DBには0始まりで保存
      const selectedOrders = allUnavailable ? [] : (selectedCandidates[requestId] || [])

      // ⚠️ GM本人の既存予定と被る可能性がある候補を選んでいる場合は、送信前に確認
      if (!allUnavailable && selectedOrders.length > 0 && gmScheduleConflicts?.[requestId]) {
        const conflictOrders = selectedOrders.filter(order => gmScheduleConflicts[requestId]?.[order])
        if (conflictOrders.length > 0) {
          const ok = window.confirm(
            `選択した候補の中に、あなたの既存予定と重複の可能性がある日時があります（候補${conflictOrders.join(', ')}）。\nこのまま送信しますか？`
          )
          if (!ok) return
        }
      }

      const availableCandidates = allUnavailable ? [] : selectedOrders.map(c => c - 1)
      const responseStatus = allUnavailable ? 'all_unavailable' : (availableCandidates.length > 0 ? 'available' : 'pending')
      
      // GM回答を更新
      const { error } = await supabase
        .from('gm_availability_responses')
        .update({
          response_status: responseStatus,
          available_candidates: availableCandidates,
          responded_at: new Date().toISOString(),
          notes: notes[requestId] || null
        })
        .eq('id', requestId)
      
      if (error) {
        logger.error('回答送信エラー:', error)
        return
      }
      
      // 必要GM数が2人以上のシナリオは、同一候補で人数が揃いメイン／サブ役がカバーできるまで店舗確認待ちにしない
      if (availableCandidates.length > 0) {
        const request = requests.find(r => r.id === requestId)
        if (request) {
          const { data: curRow } = await supabase
            .from('reservations')
            .select('status')
            .eq('id', request.reservation_id)
            .maybeSingle()
          const prevStatus = curRow?.status || 'pending'

          const readyForStore = await isReservationReadyForStoreAfterGmResponses(request.reservation_id)
          // validate_reservation_status_transition: gm_confirmed → pending_gm は不可のため、店側待ち済みは据え置き
          let newStatus: string
          if (readyForStore) {
            newStatus = 'gm_confirmed'
          } else if (prevStatus === 'gm_confirmed') {
            newStatus = 'gm_confirmed'
          } else {
            newStatus = 'pending_gm'
          }

          const updateData: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          }

          const { error: reservationError } = await supabase.rpc('admin_update_reservation_fields', {
            p_reservation_id: request.reservation_id,
            p_updates: updateData,
          })

          if (reservationError) {
            logger.error('予約更新エラー:', reservationError)
          } else if (!readyForStore && prevStatus !== 'gm_confirmed') {
            showToast.info(
              '回答を保存しました。2人以上GMが必要な作品は、同一候補で必要人数が揃い、メイン／サブの両方を担える人が含まれるまで店舗確認待ちになりません。'
            )
          }
        }
      }
      
      // 成功したらリロード
      onSubmitSuccess()
    } catch (error) {
      logger.error('送信エラー:', error)
    } finally {
      setSubmitting(null)
    }
  }

  return {
    submitting,
    handleSubmit
  }
}


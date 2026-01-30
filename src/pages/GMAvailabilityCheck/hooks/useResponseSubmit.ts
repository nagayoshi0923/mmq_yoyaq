import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
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
      
      // GMが1つでも出勤可能な候補を選択した場合、ステータスを更新
      // 注意：候補は削除せず全て保持する（複数GMの回答を考慮）
      if (availableCandidates.length > 0) {
        const request = requests.find(r => r.id === requestId)
        if (request) {
          // GMが回答したら店側確認待ちステータスに
          const newStatus = 'gm_confirmed'
          
          // 候補は削除せず、そのまま保持（available_candidatesで表示を制御）
          const updateData: any = {
            status: newStatus,
            updated_at: new Date().toISOString()
          }
          
          const { error: reservationError } = await supabase.rpc('admin_update_reservation_fields', {
            p_reservation_id: request.reservation_id,
            p_updates: updateData
          })
          
          if (reservationError) {
            logger.error('予約更新エラー:', reservationError)
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


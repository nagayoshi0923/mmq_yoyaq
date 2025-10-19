import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { GMRequest } from './useGMRequests'

interface UseResponseSubmitProps {
  requests: GMRequest[]
  selectedCandidates: Record<string, number[]>
  notes: Record<string, string>
  onSubmitSuccess: () => void
}

/**
 * GM回答送信処理フック
 */
export function useResponseSubmit({ 
  requests, 
  selectedCandidates, 
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
      const availableCandidates = allUnavailable ? [] : (selectedCandidates[requestId] || [])
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
      if (availableCandidates.length > 0) {
        const request = requests.find(r => r.id === requestId)
        if (request) {
          // GMが選択した候補のみを残す
          const confirmedCandidates = request.candidate_datetimes?.candidates?.filter(
            (c: any) => availableCandidates.includes(c.order)
          ) || []
          
          const updatedCandidateDatetimes: any = {
            ...request.candidate_datetimes,
            candidates: confirmedCandidates
          }
          
          // GMが回答したら店側確認待ちステータスに
          const newStatus = 'gm_confirmed'
          
          const updateData: any = {
            status: newStatus,
            candidate_datetimes: updatedCandidateDatetimes,
            updated_at: new Date().toISOString()
          }
          
          const { error: reservationError } = await supabase
            .from('reservations')
            .update(updateData)
            .eq('id', request.reservation_id)
          
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


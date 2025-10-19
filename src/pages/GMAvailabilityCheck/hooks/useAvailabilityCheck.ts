import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GMRequest } from './useGMRequests'

/**
 * スケジュール競合チェックフック
 */
export function useAvailabilityCheck() {
  const [candidateAvailability, setCandidateAvailability] = useState<Record<string, Record<number, boolean>>>({})

  /**
   * 時間帯文字列から内部形式に変換
   */
  const getTimeSlotFromCandidate = (timeSlot: string): string => {
    if (timeSlot === '朝') return 'morning'
    if (timeSlot === '昼') return 'afternoon'
    if (timeSlot === '夜') return 'evening'
    return 'morning'
  }

  /**
   * 開始時刻から時間帯を判定
   */
  const getTimeSlotFromTime = (startTime: string): string => {
    const hour = parseInt(startTime.split(':')[0])
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }

  /**
   * 特定の候補日時が既存のスケジュールと被っているかチェック
   */
  const checkCandidateAvailability = async (candidate: any, storeId: string): Promise<boolean> => {
    if (!storeId) return true // 店舗未選定の場合はチェックしない
    
    // 時間帯を変換
    const timeSlot = getTimeSlotFromCandidate(candidate.timeSlot)
    
    // その日・その店舗の既存公演を取得
    const { data: existingEvents } = await supabase
      .from('schedule_events')
      .select('start_time, end_time')
      .eq('date', candidate.date)
      .eq('store_id', storeId)
    
    if (existingEvents && existingEvents.length > 0) {
      // 既存公演の時間帯を確認
      for (const event of existingEvents) {
        const eventTimeSlot = getTimeSlotFromTime(event.start_time)
        if (eventTimeSlot === timeSlot) {
          return false // 被っている
        }
      }
    }
    
    // 確定済みの貸切リクエストとも競合しないかチェック
    const { data: confirmedPrivateEvents } = await supabase
      .from('reservations')
      .select('candidate_datetimes, store_id')
      .eq('reservation_source', 'web_private')
      .in('status', ['confirmed', 'gm_confirmed'])
      .eq('store_id', storeId)
    
    if (confirmedPrivateEvents && confirmedPrivateEvents.length > 0) {
      for (const reservation of confirmedPrivateEvents) {
        const candidates = reservation.candidate_datetimes?.candidates || []
        for (const c of candidates) {
          if (c.date === candidate.date && c.timeSlot === candidate.timeSlot) {
            return false // 貸切リクエストと被っている
          }
        }
      }
    }
    
    return true // 空いている
  }

  /**
   * 各候補日時の利用可能性を更新
   */
  const updateCandidateAvailability = async (request: GMRequest, storeId: string) => {
    const availability: Record<number, boolean> = {}
    
    for (const candidate of request.candidate_datetimes?.candidates || []) {
      const isAvailable = await checkCandidateAvailability(candidate, storeId)
      availability[candidate.order] = isAvailable
    }
    
    setCandidateAvailability({
      ...candidateAvailability,
      [request.id]: availability
    })
  }

  return {
    candidateAvailability,
    setCandidateAvailability,
    checkCandidateAvailability,
    updateCandidateAvailability,
    getTimeSlotFromCandidate,
    getTimeSlotFromTime
  }
}


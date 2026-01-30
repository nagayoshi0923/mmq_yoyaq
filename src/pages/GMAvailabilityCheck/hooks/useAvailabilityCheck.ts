import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GMRequest } from './useGMRequests'

/**
 * スケジュール競合チェックフック
 */
export function useAvailabilityCheck() {
  const [candidateAvailability, setCandidateAvailability] = useState<Record<string, Record<number, boolean>>>({})
  const [gmScheduleConflicts, setGmScheduleConflicts] = useState<Record<string, Record<number, boolean>>>({})

  const timeToMinutes = (time: string): number => {
    const [h, m] = time.split(':')
    return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10)
  }

  const overlaps = (startA: string, endA: string, startB: string, endB: string): boolean => {
    const aS = timeToMinutes(startA)
    const aE = timeToMinutes(endA)
    const bS = timeToMinutes(startB)
    const bE = timeToMinutes(endB)
    return aS < bE && aE > bS
  }

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
      .eq('is_cancelled', false)
    
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
  const updateCandidateAvailability = async (request: GMRequest, storeId: string, gmName?: string) => {
    const availability: Record<number, boolean> = {}
    const gmConflicts: Record<number, boolean> = {}

    // GM本人の既存予定（schedule_events.gms）をまとめて取得して、候補と時間重複するかをチェック
    let gmEventsByDate: Record<string, Array<{ start_time: string; end_time: string }>> = {}
    if (gmName && request.candidate_datetimes?.candidates?.length) {
      const dates = Array.from(new Set(request.candidate_datetimes.candidates.map(c => c.date).filter(Boolean)))
      if (dates.length > 0) {
        const { data: gmEvents } = await supabase
          .from('schedule_events')
          .select('date, start_time, end_time, gms')
          .in('date', dates)
          .eq('is_cancelled', false)
          .contains('gms', [gmName])

        ;(gmEvents || []).forEach((e: any) => {
          const date = e.date
          if (!date) return
          const start = (e.start_time || '').substring(0, 5)
          const end = (e.end_time || '').substring(0, 5)
          if (!start || !end) return
          gmEventsByDate[date] = gmEventsByDate[date] || []
          gmEventsByDate[date].push({ start_time: start, end_time: end })
        })
      }
    }
    
    for (const candidate of request.candidate_datetimes?.candidates || []) {
      const isAvailable = await checkCandidateAvailability(candidate, storeId)
      availability[candidate.order] = isAvailable

      // GM本人の予定との重複（警告用）
      if (gmName) {
        const start = (candidate.startTime || '').substring(0, 5)
        const end = (candidate.endTime || '').substring(0, 5)
        const dateEvents = gmEventsByDate[candidate.date] || []
        gmConflicts[candidate.order] = !!(start && end && dateEvents.some(e => overlaps(start, end, e.start_time, e.end_time)))
      } else {
        gmConflicts[candidate.order] = false
      }
    }
    
    setCandidateAvailability({
      ...candidateAvailability,
      [request.id]: availability
    })

    setGmScheduleConflicts({
      ...gmScheduleConflicts,
      [request.id]: gmConflicts
    })
  }

  return {
    candidateAvailability,
    gmScheduleConflicts,
    setCandidateAvailability,
    checkCandidateAvailability,
    updateCandidateAvailability,
    getTimeSlotFromCandidate,
    getTimeSlotFromTime
  }
}


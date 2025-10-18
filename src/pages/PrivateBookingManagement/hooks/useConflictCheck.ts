import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * 競合チェック機能
 */
interface ConflictInfo {
  storeDateConflicts: Set<string> // 'storeId-date-timeSlot' の形式
  gmDateConflicts: Set<string> // 'gmId-date-timeSlot' の形式
}

export const useConflictCheck = () => {
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo>({
    storeDateConflicts: new Set(),
    gmDateConflicts: new Set()
  })

  /**
   * 競合情報をロード
   */
  const loadConflictInfo = useCallback(async (reservationId: string) => {
    try {
      // 貸切リクエストの情報を取得
      const { data: requestData, error: requestError } = await supabase
        .from('private_booking_requests')
        .select('candidate_datetimes, scenario_id')
        .eq('id', reservationId)
        .single()

      if (requestError) throw requestError
      if (!requestData) return

      const candidates = requestData.candidate_datetimes?.candidates || []
      const requestedStores = requestData.candidate_datetimes?.requestedStores || []

      // 店舗ごとの競合をチェック
      const storeDateConflictsSet = new Set<string>()
      
      for (const candidate of candidates) {
        const date = candidate.date
        const startTime = candidate.startTime
        const endTime = candidate.endTime

        // 各希望店舗について競合をチェック
        for (const store of requestedStores) {
          const storeId = store.storeId

          // この日時・店舗で既に予定がある公演を検索
          const { data: conflictEvents, error: conflictError } = await supabase
            .from('schedule_events')
            .select('id')
            .eq('date', date)
            .eq('store_id', storeId)
            .eq('is_cancelled', false)
            .or(`start_time.lte.${startTime},end_time.gte.${endTime}`)

          if (conflictError) {
            logger.error('店舗競合チェックエラー:', conflictError)
            continue
          }

          if (conflictEvents && conflictEvents.length > 0) {
            const conflictKey = `${storeId}-${date}-${candidate.timeSlot}`
            storeDateConflictsSet.add(conflictKey)
          }
        }
      }

      // GM個別の競合はGM選択時にチェック（loadGMConflicts経由）
      setConflictInfo({
        storeDateConflicts: storeDateConflictsSet,
        gmDateConflicts: new Set()
      })
    } catch (error) {
      logger.error('競合情報ロードエラー:', error)
    }
  }, [])

  /**
   * 特定GMの競合をチェック
   */
  const loadGMConflicts = useCallback(async (
    gmId: string,
    candidates: Array<{ date: string; timeSlot: string; startTime: string; endTime: string }>
  ) => {
    try {
      const gmDateConflictsSet = new Set<string>()

      for (const candidate of candidates) {
        const date = candidate.date
        const startTime = candidate.startTime
        const endTime = candidate.endTime

        // このGMがこの日時に既に出勤予定があるかチェック
        const { data: conflictEvents, error: conflictError } = await supabase
          .from('schedule_events')
          .select('id, gms')
          .eq('date', date)
          .eq('is_cancelled', false)
          .or(`start_time.lte.${startTime},end_time.gte.${endTime}`)

        if (conflictError) {
          logger.error('GM競合チェックエラー:', conflictError)
          continue
        }

        if (conflictEvents && conflictEvents.length > 0) {
          // GMリストに含まれているかチェック
          const hasConflict = conflictEvents.some(event => 
            event.gms && Array.isArray(event.gms) && event.gms.includes(gmId)
          )
          
          if (hasConflict) {
            const conflictKey = `${gmId}-${date}-${candidate.timeSlot}`
            gmDateConflictsSet.add(conflictKey)
          }
        }
      }

      // 既存の店舗競合は保持したまま、GM競合を更新
      setConflictInfo(prev => ({
        ...prev,
        gmDateConflicts: gmDateConflictsSet
      }))
    } catch (error) {
      logger.error('GM競合情報ロードエラー:', error)
    }
  }, [])

  return {
    conflictInfo,
    loadConflictInfo,
    loadGMConflicts
  }
}


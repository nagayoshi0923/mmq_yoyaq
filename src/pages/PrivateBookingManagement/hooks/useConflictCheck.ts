import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * 既存イベント情報
 */
export interface ExistingEventInfo {
  id: string
  scenario: string
  startTime: string
  endTime: string
  storeId: string
  date: string
}

/**
 * 競合チェック機能
 */
interface ConflictInfo {
  storeDateConflicts: Set<string> // 'storeId-date-timeSlot' の形式
  gmDateConflicts: Set<string> // 'gmId-date-timeSlot' の形式
  existingEvents: ExistingEventInfo[] // 既存イベントの詳細情報
}

export const useConflictCheck = () => {
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo>({
    storeDateConflicts: new Set(),
    gmDateConflicts: new Set(),
    existingEvents: []
  })

  /**
   * 競合情報をロード
   */
  const loadConflictInfo = useCallback(async (reservationId: string) => {
    logger.log('🔍 loadConflictInfo 開始:', reservationId)
    try {
      // 貸切リクエストの情報を取得（reservationsテーブルから）
      const { data: requestData, error: requestError } = await supabase
        .from('reservations')
        .select('candidate_datetimes, scenario_id')
        .eq('id', reservationId)
        .single()

      logger.log('📋 予約データ:', requestData)

      if (requestError) {
        logger.error('予約データ取得エラー:', requestError)
        return
      }
      if (!requestData) {
        logger.log('❌ 予約データなし')
        return
      }

      const candidates = requestData.candidate_datetimes?.candidates || []
      const requestedStores = requestData.candidate_datetimes?.requestedStores || []

      // 店舗ごとの競合をチェック
      const storeDateConflictsSet = new Set<string>()
      const existingEventsList: ExistingEventInfo[] = []
      
      // 候補日時の日付一覧を取得
      const candidateDates = [...new Set(candidates.map((c: any) => c.date))]
      
      if (candidateDates.length === 0) {
        logger.log('候補日時がありません')
        setConflictInfo({
          storeDateConflicts: new Set(),
          gmDateConflicts: new Set(),
          existingEvents: []
        })
        return
      }
      
      // 候補日時の全店舗で既存イベントを一括取得
      const { data: allEvents, error: eventsError } = await supabase
        .from('schedule_events')
        .select('id, scenario, date, start_time, end_time, store_id')
        .in('date', candidateDates)
        .eq('is_cancelled', false)
      
      if (eventsError) {
        logger.error('既存イベント取得エラー:', eventsError)
      } else if (allEvents && allEvents.length > 0) {
        logger.log(`既存イベント取得: ${allEvents.length}件`, allEvents)
        // 既存イベントリストを作成
        allEvents.forEach(event => {
          existingEventsList.push({
            id: event.id,
            scenario: event.scenario || '不明',
            startTime: event.start_time?.substring(0, 5) || '',
            endTime: event.end_time?.substring(0, 5) || '',
            storeId: event.store_id || '',
            date: event.date
          })
        })
      } else {
        logger.log('既存イベントなし')
      }
      
      for (const candidate of candidates) {
        const date = candidate.date
        const startTime = candidate.startTime
        const endTime = candidate.endTime

        // 各希望店舗について競合をチェック
        const storesToCheck = requestedStores.length > 0 ? requestedStores : []
        for (const store of storesToCheck) {
          const storeId = store.storeId

          // 既存イベントから競合をチェック
          const conflictEvents = existingEventsList.filter(event => 
            event.storeId === storeId && 
            event.date === date &&
            startTime < event.endTime && endTime > event.startTime
          )

          if (conflictEvents.length > 0) {
            const conflictKey = `${storeId}-${date}-${candidate.timeSlot}`
            storeDateConflictsSet.add(conflictKey)
          }
        }
      }

      logger.log('競合情報更新:', { 
        existingEvents: existingEventsList.length,
        conflicts: storeDateConflictsSet.size 
      })

      // GM個別の競合はGM選択時にチェック（loadGMConflicts経由）
      setConflictInfo({
        storeDateConflicts: storeDateConflictsSet,
        gmDateConflicts: new Set(),
        existingEvents: existingEventsList
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

      // 既存の店舗競合とイベント情報は保持したまま、GM競合を更新
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


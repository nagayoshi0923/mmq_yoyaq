import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
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
   * 🚨 CRITICAL: 競合情報をロード
   * 
   * この関数は以下の2つのテーブルをチェックする必要があります：
   * 1. schedule_events テーブル（手動追加・インポートされた全公演）
   * 2. reservations テーブル（確定済み貸切予約）
   * 
   * どちらか一方だけのチェックでは不十分です！
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
      
      // 🚨 CRITICAL: 2つのテーブルから競合をチェック
      // 1. schedule_events テーブル（手動追加・インポートされた全公演）
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

      // 🚨 CRITICAL: reservations テーブルからも確定済み予約をチェック
      // schedule_events だけでなく、予約済みの貸切も競合対象
      const { data: allReservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('id, title, requested_datetime, duration, store_id, scenario_id, scenarios:scenario_id(title)')
        .in('status', ['confirmed', 'gm_confirmed', 'pending'])
        .not('requested_datetime', 'is', null)
        .neq('id', reservationId) // 自分自身は除外

      if (reservationsError) {
        logger.error('既存予約取得エラー:', reservationsError)
      } else if (allReservations && allReservations.length > 0) {
        logger.log(`既存予約取得: ${allReservations.length}件`)
        // 予約をイベントリストに変換（競合チェック対象として追加）
        allReservations.forEach(reservation => {
          if (!reservation.requested_datetime || !reservation.store_id) return
          
          const datetime = new Date(reservation.requested_datetime)
          const date = datetime.toISOString().split('T')[0]
          
          // 候補日に含まれない予約はスキップ
          if (!candidateDates.includes(date)) return
          
          const startTime = datetime.toTimeString().substring(0, 5)
          const durationMinutes = reservation.duration || 180
          const endDateTime = new Date(datetime.getTime() + durationMinutes * 60 * 1000)
          const endTime = endDateTime.toTimeString().substring(0, 5)
          
          const scenarioTitle = (reservation.scenarios as { title?: string } | null)?.title || reservation.title || '貸切予約'
          
          existingEventsList.push({
            id: reservation.id,
            scenario: scenarioTitle,
            startTime,
            endTime,
            storeId: reservation.store_id,
            date
          })
        })
        logger.log(`競合チェック対象（イベント+予約）: ${existingEventsList.length}件`)
      }
      
      for (const candidate of candidates) {
        const date = candidate.date
        const startTime = candidate.startTime
        const endTime = candidate.endTime

        // 各希望店舗について競合をチェック
        const storesToCheck = requestedStores.length > 0 ? requestedStores : []
        for (const store of storesToCheck) {
          const storeId = store.storeId

          // 既存イベント（schedule_events + 確定済みreservations）から競合をチェック
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
   * 🚨 CRITICAL: 特定GMの競合をチェック
   * 
   * この関数は以下の2つのテーブルをチェックする必要があります：
   * 1. schedule_events テーブル（手動追加・インポートされた全公演）
   * 2. reservations テーブル（確定済み貸切予約でGMが割り当てられているもの）
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

        // 🚨 CRITICAL: 1. schedule_eventsからGMの競合をチェック
        const { data: conflictEvents, error: conflictError } = await supabase
          .from('schedule_events')
          .select('id, gms')
          .eq('date', date)
          .eq('is_cancelled', false)
          .or(`start_time.lte.${sanitizeForPostgRestFilter(startTime) || startTime},end_time.gte.${sanitizeForPostgRestFilter(endTime) || endTime}`)

        if (conflictError) {
          logger.error('GM競合チェックエラー:', conflictError)
          continue
        }

        let hasConflict = false

        if (conflictEvents && conflictEvents.length > 0) {
          // GMリストに含まれているかチェック
          hasConflict = conflictEvents.some(event => 
            event.gms && Array.isArray(event.gms) && event.gms.includes(gmId)
          )
        }

        // 🚨 CRITICAL: 2. reservationsからGMの競合をチェック（確定済み貸切予約）
        if (!hasConflict) {
          const { data: conflictReservations, error: reservationError } = await supabase
            .from('reservations')
            .select('id, gm_staff, event_datetime')
            .eq('status', 'confirmed')
            .eq('gm_staff', gmId)

          if (reservationError) {
            logger.error('GM予約競合チェックエラー:', reservationError)
          } else if (conflictReservations && conflictReservations.length > 0) {
            // 日付と時間が競合するかチェック
            hasConflict = conflictReservations.some(reservation => {
              if (!reservation.event_datetime) return false
              
              const eventDate = new Date(reservation.event_datetime)
              const reservationDateStr = eventDate.toISOString().split('T')[0]
              
              if (reservationDateStr !== date) return false
              
              const hours = eventDate.getHours().toString().padStart(2, '0')
              const minutes = eventDate.getMinutes().toString().padStart(2, '0')
              const reservationStartTime = `${hours}:${minutes}`
              // デフォルトで3時間後を終了時間とする
              const endHours = (eventDate.getHours() + 3).toString().padStart(2, '0')
              const reservationEndTime = `${endHours}:${minutes}`
              
              // 時間の重複チェック
              return startTime < reservationEndTime && endTime > reservationStartTime
            })
          }
        }
          
        if (hasConflict) {
          const conflictKey = `${gmId}-${date}-${candidate.timeSlot}`
          gmDateConflictsSet.add(conflictKey)
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


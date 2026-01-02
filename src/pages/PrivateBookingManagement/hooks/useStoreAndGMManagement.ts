import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'

interface ConflictInfo {
  storeDateConflicts: Set<string> // 'storeId-date-timeSlot' の形式
  gmDateConflicts: Set<string> // 'gmId-date-timeSlot' の形式
}

/**
 * 店舗とGMのデータ管理、競合チェックを行うフック
 */
export function useStoreAndGMManagement() {
  const [stores, setStores] = useState<any[]>([])
  const [availableGMs, setAvailableGMs] = useState<any[]>([])
  const [allGMs, setAllGMs] = useState<any[]>([])
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo>({
    storeDateConflicts: new Set(),
    gmDateConflicts: new Set()
  })

  // 店舗データの読み込み（組織対応済み）
  const loadStores = useCallback(async () => {
    try {
      const data = await storeApi.getAll()
      setStores(data || [])
    } catch (error) {
      logger.error('店舗情報取得エラー:', error)
    }
  }, [])

  // 🚨 CRITICAL: スケジュール競合チェック機能
  // この関数は以下の両方をチェックする必要があります：
  // 1. reservations テーブル（確定済み貸切予約）
  // 2. schedule_events テーブル（手動追加・インポートされた全公演）
  // ⚠️ どちらか一方だけのチェックでは不十分です！
  const loadConflictInfo = useCallback(async (currentRequestId: string) => {
    try {
      const storeDateConflicts = new Set<string>()
      const gmDateConflicts = new Set<string>()

      // 1. 確定済みの予約を全て取得（reservationsテーブル）
      const { data: confirmedReservations, error: reservationsError } = await supabase
        .from('reservations')
        .select('id, store_id, gm_staff, candidate_datetimes')
        .eq('status', 'confirmed')
        .neq('id', currentRequestId)

      if (reservationsError) throw reservationsError

      confirmedReservations?.forEach(reservation => {
        const candidates = reservation.candidate_datetimes?.candidates || []
        candidates.forEach((candidate: any) => {
          if (candidate.status === 'confirmed') {
            if (reservation.store_id) {
              storeDateConflicts.add(`${reservation.store_id}-${candidate.date}-${candidate.timeSlot}`)
            }
            if (reservation.gm_staff) {
              gmDateConflicts.add(`${reservation.gm_staff}-${candidate.date}-${candidate.timeSlot}`)
            }
          }
        })
      })

      // 2. スケジュールイベントも取得（schedule_eventsテーブル）
      const { data: scheduleEvents, error: scheduleError } = await supabase
        .from('schedule_events')
        .select('id, store_id, date, start_time, gms, is_cancelled')
        .eq('is_cancelled', false)

      if (scheduleError) throw scheduleError

      // 時間帯判定関数
      const getTimeSlot = (startTime: string): string => {
        const hour = parseInt(startTime.split(':')[0])
        if (hour < 12) return '朝'
        if (hour < 17) return '昼'
        return '夜'
      }

      scheduleEvents?.forEach(event => {
        if (!event.date || !event.start_time) return
        
        const timeSlot = getTimeSlot(event.start_time)
        
        if (event.store_id) {
          storeDateConflicts.add(`${event.store_id}-${event.date}-${timeSlot}`)
        }
        
        if (event.gms && Array.isArray(event.gms)) {
          event.gms.forEach((gmId: string) => {
            if (gmId) {
              gmDateConflicts.add(`${gmId}-${event.date}-${timeSlot}`)
            }
          })
        }
      })

      setConflictInfo({ storeDateConflicts, gmDateConflicts })
    } catch (error) {
      logger.error('競合情報取得エラー:', error)
    }
  }, [])

  // 全GMの読み込み
  const loadAllGMs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .contains('role', ['gm'])
        .order('name')

      if (error) throw error
      setAllGMs(data || [])
    } catch (error) {
      logger.error('GM情報取得エラー:', error)
    }
  }, [])

  // 利用可能なGMの読み込み
  const loadAvailableGMs = useCallback(async (reservationId: string) => {
    try {
      // まず全てのレスポンスを取得してからフィルタリング
      const { data: responses, error } = await supabase
        .from('gm_availability_responses')
        .select('staff_id, gm_name, response_type, available_candidates, selected_candidate_index, notes')
        .eq('reservation_id', reservationId)
      
      if (error) {
        logger.error('GM可否情報取得エラー:', error)
        throw error
      }

      // クライアント側でフィルタリング（CORSエラー回避のため）
      const filteredResponses = (responses || []).filter(
        (response: any) => response.response_type === 'available' || response.response_type === 'unavailable'
      )

      const gmList = filteredResponses.map((response: any) => ({
        gm_id: response.staff_id,
        gm_name: response.gm_name,
        response_type: response.response_type,
        available_candidates: response.available_candidates || [],
        selected_candidate_index: response.selected_candidate_index,
        notes: response.notes || ''
      }))

      setAvailableGMs(gmList)
    } catch (error: any) {
      logger.error('GM可否情報取得エラー:', error)
      // エラー時は空配列を設定してUIが壊れないようにする
      setAvailableGMs([])
    }
  }, [])

  return {
    stores,
    availableGMs,
    allGMs,
    conflictInfo,
    loadStores,
    loadConflictInfo,
    loadAllGMs,
    loadAvailableGMs
  }
}


import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

/**
 * 既存イベント情報
 */
interface ExistingEventInfo {
  id: string
  scenario: string
  startTime: string
  endTime: string
  storeId: string
  date: string
}

interface ConflictInfo {
  storeDateConflicts: Set<string> // 'storeId-date-timeSlot' の形式
  gmDateConflicts: Set<string> // 'gmId-date-timeSlot' の形式
  existingEvents: ExistingEventInfo[] // 既存イベントの詳細情報
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
    gmDateConflicts: new Set(),
    existingEvents: []
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
      const existingEventsList: ExistingEventInfo[] = []

      // schedule_events.gms は「GM名(text)配列」運用のため、名前→staff.id に解決してから競合キーを作る
      const orgId = await getCurrentOrganizationId()
      const gmNameToId = new Map<string, string>()
      try {
        let staffQuery = supabase
          .from('staff')
          .select('id, name')

        if (orgId) {
          staffQuery = staffQuery.eq('organization_id', orgId)
        }

        const { data: staffRows, error: staffError } = await staffQuery
        if (staffError) {
          logger.warn('スタッフ一覧取得に失敗（GM競合チェック精度が落ちる可能性）:', staffError)
        } else {
          ;(staffRows || []).forEach((s: any) => {
            if (s?.id && s?.name) gmNameToId.set(s.name, s.id)
          })
        }
      } catch (e) {
        logger.warn('スタッフ一覧取得で例外（GM競合チェック精度が落ちる可能性）:', e)
      }

      // まず現在のリクエストの候補日時を取得
      const { data: currentRequest, error: requestError } = await supabase
        .from('reservations')
        .select('candidate_datetimes')
        .eq('id', currentRequestId)
        .single()

      if (requestError) {
        logger.error('現在のリクエスト取得エラー:', requestError)
      }

      // 候補日時の日付を抽出
      const candidateDates: string[] = []
      if (currentRequest?.candidate_datetimes?.candidates) {
        currentRequest.candidate_datetimes.candidates.forEach((c: any) => {
          if (c.date && !candidateDates.includes(c.date)) {
            candidateDates.push(c.date)
          }
        })
      }
      logger.log('📅 候補日付:', candidateDates)

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

      // 2. スケジュールイベントを候補日付でフィルタリングして取得
      // ⚠️ 全件取得するとSupabaseの1000件制限に達する可能性があるため
      let scheduleQuery = supabase
        .from('schedule_events')
        .select('id, store_id, date, start_time, end_time, scenario, gms, is_cancelled')
        .eq('is_cancelled', false)

      // 候補日付がある場合はフィルタリング
      if (candidateDates.length > 0) {
        scheduleQuery = scheduleQuery.in('date', candidateDates)
      }

      const { data: scheduleEvents, error: scheduleError } = await scheduleQuery

      if (scheduleError) throw scheduleError
      
      logger.log('📊 取得したスケジュールイベント:', scheduleEvents?.length, '件')

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
        
        // 既存イベント情報を追加
        existingEventsList.push({
          id: event.id,
          scenario: event.scenario || '不明',
          startTime: event.start_time?.substring(0, 5) || '',
          endTime: event.end_time?.substring(0, 5) || '',
          storeId: event.store_id || '',
          date: event.date
        })
        
        if (event.store_id) {
          storeDateConflicts.add(`${event.store_id}-${event.date}-${timeSlot}`)
        }
        
        if (event.gms && Array.isArray(event.gms)) {
          event.gms.forEach((gmName: string) => {
            if (!gmName) return
            const gmId = gmNameToId.get(gmName)
            if (gmId) {
              gmDateConflicts.add(`${gmId}-${event.date}-${timeSlot}`)
            }
          })
        }
      })

      logger.log('📊 競合情報更新:', { 
        existingEvents: existingEventsList.length,
        storeConflicts: storeDateConflicts.size,
        gmConflicts: gmDateConflicts.size
      })

      setConflictInfo({ storeDateConflicts, gmDateConflicts, existingEvents: existingEventsList })
    } catch (error) {
      logger.error('競合情報取得エラー:', error)
    }
  }, [])

  // 全GMの読み込み（組織対応、avatar_colorも取得）
  const loadAllGMs = useCallback(async () => {
    try {
      const orgId = await getCurrentOrganizationId()
      let query = supabase
        .from('staff')
        .select('id, name, avatar_color')
        .contains('role', ['gm'])
      
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query.order('name')

      if (error) throw error
      setAllGMs(data || [])
    } catch (error) {
      logger.error('GM情報取得エラー:', error)
    }
  }, [])

  // 利用可能なGMの読み込み（スタッフのavatar_colorも取得）
  const loadAvailableGMs = useCallback(async (reservationId: string) => {
    try {
      // まず全てのレスポンスを取得してからフィルタリング（スタッフのavatar_colorも含める）
      const { data: responses, error } = await supabase
        .from('gm_availability_responses')
        .select('staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, staff:staff_id(avatar_color)')
        .eq('reservation_id', reservationId)
      
      if (error) {
        logger.error('GM可否情報取得エラー:', error)
        throw error
      }

      // クライアント側でフィルタリング（CORSエラー回避のため）
      const filteredResponses = (responses || []).filter(
        (response: any) => response.response_status === 'available' || response.response_status === 'unavailable'
      )

      const gmList = filteredResponses.map((response: any) => ({
        gm_id: response.staff_id,
        gm_name: response.gm_name,
        response_status: response.response_status,
        available_candidates: response.available_candidates || [],
        selected_candidate_index: response.selected_candidate_index,
        notes: response.notes || '',
        avatar_color: response.staff?.avatar_color || null
      }))

      logger.log('📋 GM回答情報:', gmList.length, '件', gmList.map(g => `${g.gm_name}(${g.response_status}): 候補${(g.available_candidates || []).map((i: number) => i+1).join(',')}`))

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


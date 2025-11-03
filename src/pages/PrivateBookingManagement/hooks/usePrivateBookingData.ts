import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface PrivateBookingRequest {
  id: string
  reservation_number: string
  scenario_id?: string
  scenario_title: string
  customer_name: string
  customer_email: string
  customer_phone: string
  candidate_datetimes: {
    candidates: Array<{
      order: number
      date: string
      timeSlot: string
      startTime: string
      endTime: string
      status: string
    }>
    requestedStores?: Array<{
      storeId: string
      storeName: string
    }>
    confirmedStore?: {
      storeId: string
      storeName: string
    }
  }
  participant_count: number
  notes: string
  status: string
  gm_responses?: Array<{
    gm_name?: string
    response_type: string
    available_candidates?: number[]
    selected_candidate_index?: number
    notes?: string
  }>
  created_at: string
}

interface UsePrivateBookingDataProps {
  userId?: string
  userRole?: string
  activeTab: 'pending' | 'all'
}

/**
 * 貸切予約データの取得と管理
 */
export const usePrivateBookingData = ({ userId, userRole, activeTab }: UsePrivateBookingDataProps) => {
  const [requests, setRequests] = useState<PrivateBookingRequest[]>([])
  const [loading, setLoading] = useState(true)

  /**
   * 貸切リクエストをロード
   */
  const loadRequests = useCallback(async () => {
    try {
      setLoading(true)

      // 管理者以外の場合、自分が担当しているシナリオのIDを取得
      let allowedScenarioIds: string[] | null = null

      if (userRole !== 'admin') {
        logger.log('📋 スタッフユーザー - 担当シナリオのみ表示')

        // ログインユーザーのstaffレコードを取得
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', userId)
          .single()

        if (staffData) {
          // 担当シナリオのIDを取得
          const { data: assignments } = await supabase
            .from('staff_scenario_assignments')
            .select('scenario_id')
            .eq('staff_id', staffData.id)

          if (assignments && assignments.length > 0) {
            allowedScenarioIds = assignments.map(a => a.scenario_id)
            logger.log(`✅ ${allowedScenarioIds.length}件の担当シナリオを検出`)
          } else {
            logger.log('⚠️ 担当シナリオなし - 空の結果を返します')
            allowedScenarioIds = [] // 空配列で何も表示しない
          }
        } else {
          logger.log('⚠️ スタッフレコード未紐づけ - 空の結果を返します')
          allowedScenarioIds = [] // 空配列で何も表示しない
        }
      } else {
        logger.log('👑 管理者ユーザー - 全てのリクエスト表示')
      }

      // reservationsテーブルから貸切リクエストを取得
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id(title),
          customers:customer_id(name, phone)
        `)
        .eq('reservation_source', 'web_private')
        .order('created_at', { ascending: false })

      // スタッフの場合、担当シナリオのみに絞り込み
      if (allowedScenarioIds !== null) {
        if (allowedScenarioIds.length === 0) {
          // 担当シナリオがない場合は空の結果を返す
          setRequests([])
          setLoading(false)
          return
        }
        query = query.in('scenario_id', allowedScenarioIds)
      }

      // タブによってフィルター
      if (activeTab === 'pending') {
        query = query.in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])
      } else {
        query = query.in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store', 'confirmed', 'cancelled'])
      }

      const { data, error } = await query

      if (error) {
        logger.error('Supabaseエラー:', error)
        throw error
      }

      // 各リクエストに対してGM回答を取得
      interface ReservationData {
        id: string
        reservation_number?: string
        scenario_id?: string
        scenarios?: { title: string }
        title?: string
        customers?: { name: string; phone: string }
        customer_name?: string  // reservationsテーブルに直接保存されている場合
        customer_email?: string
        customer_phone?: string
        candidate_datetimes?: {
          candidates: Array<{
            order: number
            date: string
            timeSlot: string
            startTime: string
            endTime: string
            status: string
          }>
          requestedStores?: Array<{
            storeId: string
            storeName: string
          }>
          confirmedStore?: {
            storeId: string
            storeName: string
          }
        }
        participant_count?: number
        customer_notes?: string
        status: string
        created_at: string
      }

      const formattedData: PrivateBookingRequest[] = await Promise.all(
        (data || []).map(async (req: ReservationData) => {
          // GM回答を別途取得
          const { data: gmResponses } = await supabase
            .from('gm_availability_responses')
            .select('gm_name, response_type, available_candidates, selected_candidate_index, notes')
            .eq('reservation_id', req.id)
            .in('response_type', ['available', 'unavailable'])

          // デバッグ: candidate_datetimesの構造を確認
          if (req.candidate_datetimes?.candidates) {
            req.candidate_datetimes.candidates.forEach((candidate, idx) => {
              if (!candidate.date || candidate.date === 'Invalid Date' || isNaN(new Date(candidate.date).getTime())) {
                console.warn(`[貸切予約 ${req.id}] 候補${idx + 1}の日付が無効:`, {
                  order: candidate.order,
                  date: candidate.date,
                  timeSlot: candidate.timeSlot
                })
              }
            })
          }

          return {
            id: req.id,
            reservation_number: req.reservation_number || '',
            scenario_id: req.scenario_id,
            scenario_title: req.scenarios?.title || req.title || 'シナリオ名不明',
            customer_name: req.customer_name || req.customers?.name || '顧客名不明',
            customer_email: req.customer_email || '',
            customer_phone: req.customer_phone || req.customers?.phone || '',
            candidate_datetimes: req.candidate_datetimes || { candidates: [] },
            participant_count: req.participant_count || 0,
            notes: req.customer_notes || '',
            status: req.status,
            gm_responses: gmResponses || [],
            created_at: req.created_at
          }
        })
      )

      setRequests(formattedData)
    } catch (error) {
      logger.error('貸切リクエスト取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [userId, userRole, activeTab])

  /**
   * 月ごとにフィルタリング
   */
  const filterByMonth = useCallback((reqs: PrivateBookingRequest[], currentDate: Date) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    return reqs.filter(req => {
      if (!req.candidate_datetimes?.candidates || req.candidate_datetimes.candidates.length === 0) return false
      const firstCandidate = req.candidate_datetimes.candidates[0]
      if (!firstCandidate.date) return false
      
      const candidateDate = new Date(firstCandidate.date)
      if (isNaN(candidateDate.getTime())) {
        console.warn(`[貸切予約 ${req.id}] 無効な日付でフィルタリングをスキップ:`, firstCandidate.date)
        return false
      }
      
      return candidateDate.getFullYear() === year && candidateDate.getMonth() === month
    })
  }, [])

  return {
    requests,
    loading,
    loadRequests,
    filterByMonth
  }
}


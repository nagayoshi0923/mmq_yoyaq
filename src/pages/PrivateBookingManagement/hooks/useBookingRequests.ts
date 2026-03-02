import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { PrivateBookingRequest } from './usePrivateBookingData'

interface UseBookingRequestsProps {
  userId?: string
  userRole?: string
  activeTab: 'pending' | 'all'
}

/**
 * 貸切リクエストのデータ取得を管理するフック
 */
export function useBookingRequests({ userId, userRole, activeTab }: UseBookingRequestsProps) {
  const [requests, setRequests] = useState<PrivateBookingRequest[]>([])
  const [loading, setLoading] = useState(true)

  // 月ごとにフィルタリング
  const filterByMonth = useCallback((reqs: PrivateBookingRequest[], date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    return reqs.filter(req => {
      if (!req.candidate_datetimes?.candidates || req.candidate_datetimes.candidates.length === 0) return false
      const firstCandidate = req.candidate_datetimes.candidates[0]
      const candidateDate = new Date(firstCandidate.date)
      return candidateDate.getFullYear() === year && candidateDate.getMonth() === month
    })
  }, [])

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
          // 担当シナリオのIDを取得（staff_scenario_assignments.scenario_id = scenario_master_id）
          const { data: assignments } = await supabase
            .from('staff_scenario_assignments')
            .select('scenario_id')
            .eq('staff_id', staffData.id)
          
          if (assignments && assignments.length > 0) {
            // scenario_id は scenario_master_id を参照
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
          scenario_masters:scenario_master_id(title),
          customers:customer_id(name, phone)
        `)
        .eq('reservation_source', 'web_private')
        .order('created_at', { ascending: false })

      // スタッフの場合、担当シナリオのみに絞り込み
      if (allowedScenarioIds !== null) {
        if (allowedScenarioIds.length === 0) {
          setRequests([])
          setLoading(false)
          return
        }
        query = query.in('scenario_master_id', allowedScenarioIds)
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
      const formattedData: PrivateBookingRequest[] = await Promise.all(
        (data || []).map(async (req: any) => {
          // GM回答を別途取得（スタッフのavatar_colorも含める）
          const { data: gmResponses } = await supabase
            .from('gm_availability_responses')
            .select('staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, staff:staff_id(avatar_color)')
            .eq('reservation_id', req.id)
            .in('response_status', ['available', 'unavailable'])
          
          return {
            id: req.id,
            reservation_number: req.reservation_number || '',
            scenario_master_id: req.scenario_master_id,
            scenario_title: req.scenario_masters?.title || req.title || 'シナリオ名不明',
            customer_name: req.customers?.name || '顧客名不明',
            customer_email: req.customer_email || '',
            customer_phone: req.customers?.phone || req.customer_phone || '',
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

  return {
    requests,
    loading,
    loadRequests,
    filterByMonth
  }
}


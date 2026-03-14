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
      
      // reservationsテーブルから貸切リクエストを取得（private_groupsのinvite_codeとscenario_idも含む）
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenario_masters:scenario_master_id(title),
          customers:customer_id(name, phone),
          private_groups:private_group_id(invite_code, scenario_id)
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
          // GM回答を別途取得（スタッフのavatar_colorと名前も含める）
          const { data: gmResponses } = await supabase
            .from('gm_availability_responses')
            .select('staff_id, gm_name, response_status, available_candidates, selected_candidate_index, notes, staff:staff_id(name, avatar_color)')
            .eq('reservation_id', req.id)
            .in('response_status', ['available', 'unavailable'])
          
          // GM名がnullの場合はスタッフテーブルの名前を使用
          const transformedGMResponses = (gmResponses || []).map((gm: any) => ({
            ...gm,
            gm_name: gm.gm_name || gm.staff?.name || ''
          }))
          
          // 確定済み予約で候補日が1つしかない場合、元の候補日をprivate_group_candidate_datesから復元
          let candidateDatetimes = req.candidate_datetimes || { candidates: [] }
          const currentCandidates = candidateDatetimes.candidates || []
          
          // private_group_idがある場合、元の候補日を取得
          let originalCandidates: any[] = []
          if (req.private_group_id) {
            const { data: candidateDatesData } = await supabase
              .from('private_group_candidate_dates')
              .select('id, date, time_slot, start_time, end_time')
              .eq('group_id', req.private_group_id)
              .order('date', { ascending: true })
            
            originalCandidates = candidateDatesData || []
          }
          
          logger.log(`📋 予約 ${req.id}: 現在の候補数=${currentCandidates.length}, 元の候補数=${originalCandidates.length}`)
          
          // 元の候補日が多い場合は復元
          if (originalCandidates.length > currentCandidates.length) {
            logger.log(`🔄 候補日を復元: ${originalCandidates.map((c: any) => c.date).join(', ')}`)
            // 確定された候補を特定
            const confirmedCandidate = currentCandidates.find((c: any) => c.status === 'confirmed')
            
            // 元の候補日をcandidate_datetimes形式に変換
            const restoredCandidates = originalCandidates.map((cd: any, idx: number) => {
              const isConfirmed = confirmedCandidate && 
                confirmedCandidate.date === cd.date && 
                confirmedCandidate.timeSlot === cd.time_slot
              
              return {
                order: idx + 1,
                date: cd.date,
                timeSlot: cd.time_slot,
                startTime: cd.start_time || confirmedCandidate?.startTime || '10:00',
                endTime: cd.end_time || confirmedCandidate?.endTime || '13:00',
                status: isConfirmed ? 'confirmed' : 'pending'
              }
            })
            
            candidateDatetimes = {
              ...candidateDatetimes,
              candidates: restoredCandidates
            }
          }
          
          // scenario_master_id のフォールバック: private_groups.scenario_id を使用
          const scenarioMasterId = req.scenario_master_id || req.private_groups?.scenario_id
          if (!scenarioMasterId) {
            logger.log(`⚠️ 予約 ${req.id}: scenario_master_id が未設定（private_groups.scenario_id も未設定）`)
          }
          
          return {
            id: req.id,
            reservation_number: req.reservation_number || '',
            scenario_master_id: scenarioMasterId,
            scenario_title: req.scenario_masters?.title || req.title || 'シナリオ名不明',
            customer_name: req.customers?.name || '顧客名不明',
            customer_email: req.customer_email || '',
            customer_phone: req.customers?.phone || req.customer_phone || '',
            candidate_datetimes: candidateDatetimes,
            participant_count: req.participant_count || 0,
            notes: req.customer_notes || '',
            status: req.status,
            gm_responses: transformedGMResponses,
            created_at: req.created_at,
            invite_code: req.private_groups?.invite_code || ''
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


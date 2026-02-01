import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import * as storeApi from '@/lib/api'
import { logger } from '@/utils/logger'

export interface GMRequest {
  id: string
  reservation_id: string
  reservation_number: string
  scenario_title: string
  customer_name: string
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
  response_status: string
  available_candidates: number[]
  notes: string
  reservation_status?: string
  has_other_gm_response?: boolean
  created_at: string
}

interface UseGMRequestsProps {
  userId?: string
}

/**
 * GMリクエストデータ取得・管理フック
 */
export function useGMRequests({ userId }: UseGMRequestsProps) {
  const [requests, setRequests] = useState<GMRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stores, setStores] = useState<any[]>([])
  const [staffName, setStaffName] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, number[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  /**
   * 店舗データ取得
   */
  const loadStores = async () => {
    try {
      const storesData = await storeApi.storeApi.getAll()
      setStores(storesData)
    } catch (error) {
      logger.error('店舗データ取得エラー:', error)
    }
  }

  /**
   * GMリクエスト取得
   */
  const loadGMRequests = async () => {
    if (!userId) return
    
    try {
      setIsLoading(true)
      
      // 現在のユーザーのstaff_idを取得
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, discord_id:discord_user_id, name')
        .eq('user_id', userId)
        .single()
      
      if (staffError) {
        logger.error('スタッフ情報取得エラー:', staffError)
        setRequests([])
        setIsLoading(false)
        return
      }
      
      if (!staffData) {
        logger.error('このユーザーにはスタッフ情報が紐付けられていません')
        setRequests([])
        setIsLoading(false)
        return
      }
      
      const staffId = staffData.id
      setStaffName(staffData.name || '')
      
      // このGMに送られた確認リクエストを取得
      const { data: responsesData, error: responsesError } = await supabase
        .from('gm_availability_responses')
        .select(`
          id,
          reservation_id,
          response_status,
          available_candidates,
          notes,
          response_type,
          selected_candidate_index,
          gm_discord_id,
          gm_name,
          response_datetime,
          reservations:reservation_id (
            reservation_number,
            title,
            customer_name,
            candidate_datetimes,
            status,
            store_id,
            created_at,
            stores:store_id (
              id,
              name,
              short_name
            )
          )
        `)
        .or(`staff_id.eq.${staffId}${staffData.discord_id ? `,gm_discord_id.eq.${staffData.discord_id}` : ''}`)
        .order('response_datetime', { ascending: false })
      
      if (responsesError) {
        logger.error('GMリクエスト取得エラー:', responsesError)
        setRequests([])
        return
      }
      
      logger.log('🔍 GM確認ページ - 取得したデータ:', {
        staffId,
        staffDiscordId: staffData.discord_id,
        responsesCount: responsesData?.length || 0,
        responsesData: responsesData
      })
      
      // 同じreservation_idに対する他のGMの回答をチェック
      const reservationIds = (responsesData || []).map((r: any) => r.reservation_id).filter(Boolean)
      
      const otherGMResponses: Set<string> = new Set()
      
      if (reservationIds.length > 0) {
        const { data: allResponsesData } = await supabase
          .from('gm_availability_responses')
          .select('reservation_id, response_status, staff_id')
          .in('reservation_id', reservationIds)
          .neq('staff_id', staffId)
          .in('response_status', ['available', 'all_unavailable'])
        
        if (allResponsesData) {
          allResponsesData.forEach((r: any) => {
            if (r.response_status && r.response_status !== 'pending') {
              otherGMResponses.add(r.reservation_id)
            }
          })
        }
      }
      
      // データを整形
      const formattedRequests: GMRequest[] = (responsesData || []).map((response: any) => {
        const hasOtherGMResponse = otherGMResponses.has(response.reservation_id)
        
        let candidateDatetimes = response.reservations?.candidate_datetimes || { candidates: [] }
        
        // requestedStoresが空で、store_idがある場合は補完
        if ((!candidateDatetimes.requestedStores || candidateDatetimes.requestedStores.length === 0) && response.reservations?.store_id) {
          const storeInfo = response.reservations.stores
          if (storeInfo) {
            candidateDatetimes = {
              ...candidateDatetimes,
              requestedStores: [{
                storeId: storeInfo.id,
                storeName: storeInfo.name,
                storeShortName: storeInfo.short_name
              }]
            }
          }
        }
        
        return {
          id: response.id,
          reservation_id: response.reservation_id,
          reservation_number: response.reservations?.reservation_number || '',
          scenario_title: response.reservations?.title || '',
          customer_name: response.reservations?.customer_name || '',
          candidate_datetimes: candidateDatetimes,
          response_status: response.response_status || 'pending',
          available_candidates: response.available_candidates || [],
          notes: response.notes || '',
          reservation_status: response.reservations?.status || 'pending',
          has_other_gm_response: hasOtherGMResponse,
          created_at: response.reservations?.created_at || new Date().toISOString()
        }
      })
      
      setRequests(formattedRequests)
      
      // 既に回答済みのリクエストは選択状態を復元
      const initialSelections: Record<string, number[]> = {}
      const initialNotes: Record<string, string> = {}
      formattedRequests.forEach(req => {
        if (req.available_candidates && req.available_candidates.length > 0) {
          initialSelections[req.id] = req.available_candidates
        }
        if (req.notes) {
          initialNotes[req.id] = req.notes
        }
      })
      setSelectedCandidates(initialSelections)
      setNotes(initialNotes)
      
    } catch (error) {
      logger.error('データ読み込みエラー:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * 候補日時の選択をトグル
   */
  const toggleCandidate = (requestId: string, candidateOrder: number) => {
    const current = selectedCandidates[requestId] || []
    const newSelection = current.includes(candidateOrder)
      ? current.filter(c => c !== candidateOrder)
      : [...current, candidateOrder]
    
    setSelectedCandidates({
      ...selectedCandidates,
      [requestId]: newSelection
    })
  }

  /**
   * 月でフィルタリング
   */
  const filterByMonth = (reqs: GMRequest[]) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    
    return reqs.filter(req => {
      const candidates = req.candidate_datetimes?.candidates || []
      return candidates.some(c => {
        const [cYear, cMonth] = c.date.split('-').map(Number)
        return cYear === year && cMonth === month
      })
    })
  }

  /**
   * フィルタリングされたリクエスト
   */
  const pendingRequests = requests.filter(r => 
    r.response_status === 'pending' || 
    r.response_status === null || 
    r.response_status === '' ||
    r.response_status === 'available'
  )

  const allRequests = filterByMonth(requests)

  /**
   * 月ナビゲーション
   */
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const formatMonthYear = (date: Date) => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`
  }

  // 初期データ読み込み
  useEffect(() => {
    if (userId) {
      loadGMRequests()
      loadStores()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return {
    // 状態
    requests,
    isLoading,
    stores,
    staffName,
    activeTab,
    setActiveTab,
    currentDate,
    setCurrentDate,
    selectedCandidates,
    setSelectedCandidates,
    notes,
    setNotes,
    
    // 関数
    loadGMRequests,
    loadStores,
    toggleCandidate,
    filterByMonth,
    
    // フィルタリング結果
    pendingRequests,
    allRequests,
    
    // ナビゲーション (非推奨: MonthSwitcher使用を推奨)
    handlePrevMonth,
    handleNextMonth,
    formatMonthYear
  }
}


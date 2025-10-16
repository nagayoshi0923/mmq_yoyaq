import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, CheckCircle2, XCircle, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PrivateBookingRequest {
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
  gm_responses?: any[]
  created_at: string
}

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<PrivateBookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  
  // sessionStorageからタブの状態を復元
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>(() => {
    const saved = sessionStorage.getItem('privateBookingActiveTab')
    return (saved === 'all' || saved === 'pending') ? saved : 'pending'
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availableGMs, setAvailableGMs] = useState<any[]>([])
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [allGMs, setAllGMs] = useState<any[]>([]) // 全GMのリスト（強行選択用）
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)
  const [conflictInfo, setConflictInfo] = useState<{
    storeDateConflicts: Set<string> // 'storeId-date-timeSlot' の形式
    gmDateConflicts: Set<string> // 'gmId-date-timeSlot' の形式
  }>({ storeDateConflicts: new Set(), gmDateConflicts: new Set() })

  // ヘルパー関数を先に定義
  const getElapsedTime = (createdAt: string) => {
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now.getTime() - created.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return `${diffDays}日前`
    } else if (diffHours > 0) {
      return `${diffHours}時間前`
    } else if (diffMins > 0) {
      return `${diffMins}分前`
    } else {
      return '今'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
      case 'pending_gm':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            GM確認待ち
          </Badge>
        )
      case 'gm_confirmed':
      case 'pending_store':
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
            店舗確認待ち
          </Badge>
        )
      case 'confirmed':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
            承認済み
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
            却下
          </Badge>
        )
      default:
        return null
    }
  }

  const getCardClassName = (status: string) => {
    switch (status) {
      case 'pending':
      case 'pending_gm':
        return 'border-yellow-200 bg-yellow-50/30'
      case 'gm_confirmed':
      case 'pending_store':
        return 'border-orange-200 bg-orange-50/30'
      case 'confirmed':
        return 'border-green-200 bg-green-50/30'
      case 'cancelled':
        return 'border-red-200 bg-red-50/30'
      default:
        return ''
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  const formatMonthYear = (date: Date): string => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`
  }

  // 月ごとにフィルタリング
  const filterByMonth = (reqs: PrivateBookingRequest[]) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    return reqs.filter(req => {
      if (!req.candidate_datetimes?.candidates || req.candidate_datetimes.candidates.length === 0) return false
      const firstCandidate = req.candidate_datetimes.candidates[0]
      const candidateDate = new Date(firstCandidate.date)
      return candidateDate.getFullYear() === year && candidateDate.getMonth() === month
    })
  }

  // スクロール位置の保存と復元
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    let scrollTimer: NodeJS.Timeout
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        sessionStorage.setItem('privateBookingScrollY', window.scrollY.toString())
        sessionStorage.setItem('privateBookingScrollTime', Date.now().toString())
      }, 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    const savedY = sessionStorage.getItem('privateBookingScrollY')
    const savedTime = sessionStorage.getItem('privateBookingScrollTime')
    if (savedY && savedTime) {
      const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
      if (timeSinceScroll < 10000) {
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedY, 10))
        }, 100)
      }
    }
  }, [])

  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      setInitialLoadComplete(true)
      const savedY = sessionStorage.getItem('privateBookingScrollY')
      const savedTime = sessionStorage.getItem('privateBookingScrollTime')
      if (savedY && savedTime) {
        const timeSinceScroll = Date.now() - parseInt(savedTime, 10)
        if (timeSinceScroll < 10000) {
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedY, 10))
          }, 200)
        }
      }
    }
  }, [loading, initialLoadComplete])

  // タブの状態を保存
  useEffect(() => {
    sessionStorage.setItem('privateBookingActiveTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [activeTab])

  useEffect(() => {
    const initializeRequest = async () => {
      if (selectedRequest) {
        // データロード
        loadAvailableGMs(selectedRequest.id)
        await loadConflictInfo(selectedRequest.id)
        
        // 確定店舗があればそれを選択、なければ最初の希望店舗を選択
        if (selectedRequest.candidate_datetimes?.confirmedStore) {
          setSelectedStoreId(selectedRequest.candidate_datetimes.confirmedStore.storeId)
        } else if (selectedRequest.candidate_datetimes?.requestedStores && selectedRequest.candidate_datetimes.requestedStores.length > 0) {
          setSelectedStoreId(selectedRequest.candidate_datetimes.requestedStores[0].storeId)
        }
        
        // 競合情報ロード完了後に少し待ってから選択可能な候補を自動選択
        setTimeout(() => {
          selectFirstAvailableCandidate()
        }, 150)
      }
    }
    
    initializeRequest()
  }, [selectedRequest])

  // 店舗またはGMが変更されたときも競合情報を更新
  useEffect(() => {
    const updateConflictsAndReselect = async () => {
      if (selectedRequest) {
        await loadConflictInfo(selectedRequest.id)
        
        // 選択中の候補日時が競合している場合は、選択可能な候補を自動選択
        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
            c => c.order === selectedCandidateOrder
          )
          if (selectedCandidate) {
            const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${selectedCandidate.date}-${selectedCandidate.timeSlot}` : null
            const gmConflictKey = selectedGMId ? `${selectedGMId}-${selectedCandidate.date}-${selectedCandidate.timeSlot}` : null
            
            // 競合情報の取得完了後にチェック（非同期のため少し待つ）
            setTimeout(() => {
              const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
              const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
              
              if (hasStoreConflict || hasGMConflict) {
                // 競合がある場合、選択可能な候補を自動選択
                selectFirstAvailableCandidate()
              }
            }, 100)
          }
        }
      }
    }
    
    updateConflictsAndReselect()
  }, [selectedStoreId, selectedGMId])

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, short_name')
        .order('name')

      if (error) throw error
      setStores(data || [])
    } catch (error) {
      console.error('店舗情報取得エラー:', error)
    }
  }

  const loadConflictInfo = async (currentRequestId: string) => {
    try {
      // 確定済みの予約を全て取得
      const { data: confirmedReservations, error } = await supabase
        .from('reservations')
        .select('id, store_id, gm_staff, candidate_datetimes')
        .eq('status', 'confirmed')
        .neq('id', currentRequestId)

      if (error) throw error

      const storeDateConflicts = new Set<string>()
      const gmDateConflicts = new Set<string>()

      confirmedReservations?.forEach(reservation => {
        const candidates = reservation.candidate_datetimes?.candidates || []
        candidates.forEach((candidate: any) => {
          if (candidate.status === 'confirmed') {
            // 店舗の競合情報
            if (reservation.store_id) {
              storeDateConflicts.add(`${reservation.store_id}-${candidate.date}-${candidate.timeSlot}`)
            }
            // GMの競合情報
            if (reservation.gm_staff) {
              gmDateConflicts.add(`${reservation.gm_staff}-${candidate.date}-${candidate.timeSlot}`)
            }
          }
        })
      })

      setConflictInfo({ storeDateConflicts, gmDateConflicts })
    } catch (error) {
      console.error('競合情報取得エラー:', error)
    }
  }

  // 選択可能な最初の候補日時を自動選択
  const selectFirstAvailableCandidate = () => {
    if (!selectedRequest?.candidate_datetimes?.candidates) return
    
    // 全ての候補をチェックして、競合していない最初の候補を選択
    for (const candidate of selectedRequest.candidate_datetimes.candidates) {
      const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${candidate.timeSlot}` : null
      const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
      
      const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
      const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
      
      // 競合がない候補を見つけたら選択
      if (!hasStoreConflict && !hasGMConflict) {
        setSelectedCandidateOrder(candidate.order)
        return
      }
    }
    
    // 全て競合している場合は、最初の候補を選択
    if (selectedRequest.candidate_datetimes.candidates.length > 0) {
      setSelectedCandidateOrder(selectedRequest.candidate_datetimes.candidates[0].order)
    }
  }

  const loadAllGMs = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, role')
        .order('name')

      if (error) throw error
      
      // roleが配列なので、'gm'を含むスタッフをフィルタリング
      const gmStaff = (data || []).filter(staff => 
        staff.role && (
          staff.role.includes('gm') || 
          staff.role.includes('GM')
        )
      )
      
      setAllGMs(gmStaff)
    } catch (error) {
      console.error('GM情報取得エラー:', error)
    }
  }

  const loadAvailableGMs = async (reservationId: string) => {
    try {
      // まず、このリクエストのシナリオIDを取得
      const request = requests.find(r => r.id === reservationId)
      
      if (!request?.scenario_id) {
        setAvailableGMs([])
        return
      }
      
      // シナリオの担当GMを取得（staff_scenario_assignments）
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('staff_scenario_assignments')
        .select('staff_id, staff:staff_id(id, name)')
        .eq('scenario_id', request.scenario_id)
      
      // 対応可能と回答したGMも取得（Discord経由も含む）
      const { data: availableData, error: availableError } = await supabase
        .from('gm_availability_responses')
        .select('staff_id, available_candidates, notes, response_type, selected_candidate_index, gm_discord_id, gm_name')
        .eq('reservation_id', reservationId)
        .in('response_type', ['available'])
        .not('response_type', 'is', null)
      
      // デバッグ：取得したデータをログ出力
      console.log('🔍 貸切確認ページ - GM回答データ:', {
        reservationId,
        availableDataCount: availableData?.length || 0,
        availableData: availableData,
        availableError: availableError
      })
      
      // 担当GMのIDリストを作成
      const assignedGMIds = (assignmentData || []).map((a: any) => a.staff_id)
      
      // 対応可能GMの情報をマップに変換（Discord経由も含む）
      const availableGMMap = new Map()
      const discordGMMap = new Map()
      
      ;(availableData || []).forEach((a: any) => {
        if (a.staff_id) {
          // 通常のstaff_id経由の回答
          availableGMMap.set(a.staff_id, {
            available_candidates: a.available_candidates || [],
            selected_candidate_index: a.selected_candidate_index,
            notes: a.notes || ''
          })
        } else if (a.gm_discord_id) {
          // Discord経由の回答
          discordGMMap.set(a.gm_discord_id, {
            available_candidates: a.available_candidates || [],
            selected_candidate_index: a.selected_candidate_index,
            notes: a.notes || '',
            gm_name: a.gm_name
          })
        }
      })
      
      // Discord IDでGMを検索してstaff_idにマッピング
      const discordToStaffMap = new Map()
      allGMs.forEach(gm => {
        if (gm.discord_id && discordGMMap.has(gm.discord_id)) {
          discordToStaffMap.set(gm.id, discordGMMap.get(gm.discord_id))
        }
      })
      
      // ハイライト対象のGMを作成（担当GM + 対応可能GM + Discord経由GM）
      const highlightGMs = allGMs
        .filter(gm => 
          assignedGMIds.includes(gm.id) || 
          availableGMMap.has(gm.id) || 
          discordToStaffMap.has(gm.id)
        )
        .map(gm => {
          const availableInfo = availableGMMap.get(gm.id) || discordToStaffMap.get(gm.id) || {}
          return {
            id: gm.id,
            name: gm.name,
            available_candidates: availableInfo.available_candidates || [],
            selected_candidate_index: availableInfo.selected_candidate_index,
            notes: availableInfo.notes || '',
            isAssigned: assignedGMIds.includes(gm.id),
            isAvailable: availableGMMap.has(gm.id) || discordToStaffMap.has(gm.id)
          }
        })
      
      setAvailableGMs(highlightGMs)
      
      // デフォルトで最初の担当GMを選択（対応可能GMがいればそちらを優先）
      if (highlightGMs.length > 0) {
        // 対応可能と回答したGMを優先
        const availableGM = highlightGMs.find(gm => gm.isAvailable)
        if (availableGM) {
          setSelectedGMId(availableGM.id)
        } else {
          // いなければ最初の担当GMを選択
          setSelectedGMId(highlightGMs[0].id)
        }
      } else if (allGMs.length > 0) {
        // 担当GMがいない場合は最初のGMを選択
        setSelectedGMId(allGMs[0].id)
      }
    } catch (error) {
      console.error('GM情報取得エラー:', error)
      setAvailableGMs([])
    }
  }

  const loadRequests = async () => {
    try {
      setLoading(true)
      
      // 管理者以外の場合、自分が担当しているシナリオのIDを取得
      let allowedScenarioIds: string[] | null = null
      
      if (user?.role !== 'admin') {
        console.log('📋 スタッフユーザー - 担当シナリオのみ表示')
        
        // ログインユーザーのstaffレコードを取得
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', user?.id)
          .single()
        
        if (staffData) {
          // 担当シナリオのIDを取得
          const { data: assignments } = await supabase
            .from('staff_scenario_assignments')
            .select('scenario_id')
            .eq('staff_id', staffData.id)
          
          if (assignments && assignments.length > 0) {
            allowedScenarioIds = assignments.map(a => a.scenario_id)
            console.log(`✅ ${allowedScenarioIds.length}件の担当シナリオを検出`)
          } else {
            console.log('⚠️ 担当シナリオなし - 空の結果を返します')
            allowedScenarioIds = [] // 空配列で何も表示しない
          }
        } else {
          console.log('⚠️ スタッフレコード未紐づけ - 空の結果を返します')
          allowedScenarioIds = [] // 空配列で何も表示しない
        }
      } else {
        console.log('👑 管理者ユーザー - 全てのリクエスト表示')
      }
      
      // reservationsテーブルから貸切リクエストを取得
      // reservation_source='web_private' で貸切リクエストを識別
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
        // 店舗確認待ち = 未確定のすべて（GM確認待ち + 店舗確認待ち）
        query = query.in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])
      } else {
        // 全て
        query = query.in('status', ['pending', 'pending_gm', 'gm_confirmed', 'pending_store', 'confirmed', 'cancelled'])
      }

      const { data, error } = await query

      if (error) {
        console.error('Supabaseエラー:', error)
        throw error
      }

      // 各リクエストに対してGM回答を取得
      const formattedData: PrivateBookingRequest[] = await Promise.all(
        (data || []).map(async (req: any) => {
          // GM回答を別途取得
          const { data: gmResponses } = await supabase
            .from('gm_availability_responses')
            .select('gm_name, response_type, available_candidates, selected_candidate_index, notes')
            .eq('reservation_id', req.id)
            .in('response_type', ['available', 'unavailable'])
          
          return {
            id: req.id,
            reservation_number: req.reservation_number || '',
            scenario_id: req.scenario_id,
            scenario_title: req.scenarios?.title || req.title || 'シナリオ名不明',
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
      console.error('貸切リクエスト取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!selectedGMId) {
      console.error('承認に必要な情報が不足しています: selectedGMId')
      return
    }

    if (!selectedStoreId) {
      console.error('承認に必要な情報が不足しています: selectedStoreId')
      return
    }

    if (!selectedCandidateOrder) {
      console.error('承認に必要な情報が不足しています: selectedCandidateOrder')
      return
    }

    try {
      setSubmitting(true)

      // 選択された候補日時のみを残して、ステータスをconfirmedに
      const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
        c => c.order === selectedCandidateOrder
      )
      
      if (!selectedCandidate) {
        setSubmitting(false)
        return
      }

      const updatedCandidateDatetimes = {
        ...selectedRequest?.candidate_datetimes,
        candidates: [{
          ...selectedCandidate,
          status: 'confirmed'
        }],
        confirmedStore: selectedRequest?.candidate_datetimes?.requestedStores?.find(
          (s: any) => s.storeId === selectedStoreId
        ) || {
          storeId: selectedStoreId,
          storeName: stores.find(s => s.id === selectedStoreId)?.name || '',
          storeShortName: stores.find(s => s.id === selectedStoreId)?.short_name || ''
        }
      }

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          gm_staff: selectedGMId,
          store_id: selectedStoreId,
          candidate_datetimes: updatedCandidateDatetimes,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error

      // スケジュールに記録
      const startTime = new Date(`${selectedCandidate.date}T${selectedCandidate.startTime}:00`)
      const endTime = new Date(`${selectedCandidate.date}T${selectedCandidate.endTime}:00`)
      
      // 店舗名を取得
      const selectedStore = stores.find(s => s.id === selectedStoreId)
      const storeName = selectedStore?.name || '店舗不明'

      // 必須項目の検証
      if (!selectedCandidate.date || !selectedCandidate.startTime || !selectedCandidate.endTime || !storeName) {
        console.error('スケジュール記録に必要な情報が不足しています:', {
          date: selectedCandidate.date,
          startTime: selectedCandidate.startTime,
          endTime: selectedCandidate.endTime,
          storeName
        })
      } else {
        const { error: scheduleError } = await supabase
          .from('schedule_events')
          .insert({
            date: selectedCandidate.date,
            venue: storeName,
            scenario: selectedRequest?.scenario_title || '',
            start_time: selectedCandidate.startTime,
            end_time: selectedCandidate.endTime,
            start_at: startTime.toISOString(),
            end_at: endTime.toISOString(),
            store_id: selectedStoreId,
            gms: selectedGMId ? [selectedGMId] : [],
            is_reservation_enabled: true,
            status: 'confirmed',
            category: 'open'
          })

        if (scheduleError) {
          console.error('スケジュール記録エラー:', scheduleError)
          // スケジュール記録に失敗しても承認は完了させる
        } else {
          console.log('スケジュール記録完了:', {
            date: selectedCandidate.date,
            venue: storeName,
            gms: selectedGMId ? [selectedGMId] : []
          })
        }
      }

      // お客様への連絡機能（メール送信）
      try {
        const customerEmail = selectedRequest?.customer_email
        if (customerEmail) {
          // メール送信のロジックをここに追加
          console.log('承認完了メールを送信:', customerEmail)
          // 実際のメール送信API呼び出しをここに実装
        }
      } catch (emailError) {
        console.error('メール送信エラー:', emailError)
        // メール送信に失敗しても承認は完了させる
      }

      setSelectedRequest(null)
      setSelectedGMId('')
      setSelectedStoreId('')
      setSelectedCandidateOrder(null)
      setAvailableGMs([])
      
      // リクエスト一覧を再読み込み
      await loadRequests()
    } catch (error) {
      console.error('承認エラー:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejectClick = (requestId: string) => {
    // デフォルトの却下メッセージをセット
    const defaultMessage = `誠に申し訳ございませんが、ご希望の日程では店舗の空きがなく、貸切での受付が難しい状況です。

別の日程でのご検討をお願いできますでしょうか。
または、通常公演へのご参加も歓迎しております。

ご不明点等ございましたら、お気軽にお問い合わせください。`
    
    setRejectionReason(defaultMessage)
    setRejectRequestId(requestId)
    setShowRejectDialog(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectRequestId) return
    
    if (!rejectionReason.trim()) {
      return
    }

    try {
      setSubmitting(true)

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'cancelled',
          cancellation_reason: rejectionReason,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', rejectRequestId)

      if (error) throw error

      setSelectedRequest(null)
      setRejectionReason('')
      setShowRejectDialog(false)
      setRejectRequestId(null)
      loadRequests()
    } catch (error) {
      console.error('却下エラー:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejectCancel = () => {
    setShowRejectDialog(false)
    setRejectRequestId(null)
    setRejectionReason('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="private-booking-management" />
        <div className="container mx-auto max-w-4xl px-6 py-12 text-center">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (selectedRequest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="private-booking-management" />
        
        <div className="container mx-auto max-w-4xl px-6 py-6">
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedRequest(null)
              setRejectionReason('')
            }}
            className="mb-4"
          >
            ← 一覧に戻る
          </Button>

          <Card className={getCardClassName(selectedRequest.status)}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">{selectedRequest.scenario_title}</CardTitle>
                {getStatusBadge(selectedRequest.status)}
              </div>
              <div className="text-sm text-muted-foreground space-y-1 mt-2">
                <div>予約番号: {selectedRequest.reservation_number}</div>
                <div className="flex items-center gap-4">
                  <span>申込日: {formatDateTime(selectedRequest.created_at)}</span>
                  <span className="text-orange-600 font-medium">({getElapsedTime(selectedRequest.created_at)})</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* 顧客情報 */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                    <Users className="w-4 h-4" />
                    顧客情報
                  </h3>
                  <div className="space-y-2 text-sm p-4 bg-background rounded-lg border">
                    <div className="flex items-center gap-2">
                      <span className="font-medium min-w-[80px]">お名前:</span>
                      <span>{selectedRequest.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium min-w-[80px]">メール:</span>
                      <span>{selectedRequest.customer_email || '未登録'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium min-w-[80px]">電話番号:</span>
                      <span>{selectedRequest.customer_phone || '未登録'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium min-w-[80px]">参加人数:</span>
                      <span>{selectedRequest.participant_count}名</span>
                    </div>
                  </div>
                </div>

                {/* 候補日時の選択 */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                    <Calendar className="w-4 h-4" />
                    開催日時を選択
                  </h3>
                  <div className="space-y-2">
                    {selectedRequest.candidate_datetimes?.candidates?.map((candidate: any) => {
                      const isSelected = selectedCandidateOrder === candidate.order
                      
                      // この日時に競合があるかチェック
                      const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${candidate.timeSlot}` : null
                      const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
                      const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
                      const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
                      const hasConflict = hasStoreConflict || hasGMConflict
                      
                      return (
                        <div
                          key={candidate.order}
                          onClick={() => !hasConflict && setSelectedCandidateOrder(candidate.order)}
                          className={`flex items-center gap-3 p-3 rounded border-2 transition-all ${
                            hasConflict
                              ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'border-purple-500 bg-purple-50 cursor-pointer'
                              : 'border-gray-200 bg-background hover:border-purple-300 cursor-pointer'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            hasConflict
                              ? 'border-red-300 bg-red-100'
                              : isSelected
                              ? 'border-purple-500 bg-purple-500'
                              : 'border-gray-300'
                          }`}>
                            {hasConflict ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            ) : null}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                                候補{candidate.order}
                              </Badge>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{formatDate(candidate.date)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                              </div>
                              {hasStoreConflict && (
                                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                  店舗予約済み
                                </Badge>
                              )}
                              {hasGMConflict && (
                                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                  GM予約済み
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {selectedRequest.status === 'pending' && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      ℹ️ GMの回答前でも日時を選択して確定できます
                    </div>
                  )}
                </div>

                {/* 開催店舗の選択 */}
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                    <MapPin className="w-4 h-4" />
                    開催店舗の選択
                  </h3>
                  <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="店舗を選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((store) => {
                        const requestedStores = selectedRequest.candidate_datetimes?.requestedStores || []
                        // requestedStoresが空配列の場合は「全店舗」を希望していると解釈
                        const isAllStoresRequested = requestedStores.length === 0
                        const isRequested = isAllStoresRequested || requestedStores.some(rs => rs.storeId === store.id)
                        
                        // この店舗が選択された候補日時で使用可能かチェック
                        let isStoreDisabled = false
                        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
                          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
                            c => c.order === selectedCandidateOrder
                          )
                          if (selectedCandidate) {
                            const conflictKey = `${store.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
                            isStoreDisabled = conflictInfo.storeDateConflicts.has(conflictKey)
                            
                            if (isStoreDisabled) {
                              console.log(`🚫 店舗競合: ${store.name} (${conflictKey})`)
                            }
                          }
                        }
                        
                        return (
                          <SelectItem 
                            key={store.id} 
                            value={store.id}
                            disabled={isStoreDisabled}
                          >
                            {store.name}
                            {isRequested && ' (お客様希望)'}
                            {isStoreDisabled && ' - 予約済み'}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedRequest.candidate_datetimes?.requestedStores?.length === 0 ? (
                      <span>ℹ️ お客様は全ての店舗を希望しています</span>
                    ) : (selectedRequest.candidate_datetimes?.requestedStores?.length ?? 0) > 0 ? (
                      <span>ℹ️ (お客様希望) の店舗がお客様の希望店舗です</span>
                    ) : null}
                  </div>
                </div>

                {/* 顧客メモ */}
                {selectedRequest.notes && (
                  <div>
                    <h3 className="font-semibold mb-3 text-purple-800">お客様からのメモ</h3>
                    <div className="p-4 bg-background rounded-lg border">
                      <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                    </div>
                  </div>
                )}

                {/* 担当GMの選択 */}
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-3 text-purple-800">担当GMを選択してください</h3>
                  <Select value={selectedGMId} onValueChange={setSelectedGMId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="GMを選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {allGMs.map((gm) => {
                        const availableGM = availableGMs.find(ag => ag.id === gm.id)
                        const isAvailable = !!availableGM
                        const gmNotes = availableGM?.notes || ''
                        
                        // このGMが選択された候補日時で使用可能かチェック
                        let isGMDisabled = false
                        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
                          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
                            c => c.order === selectedCandidateOrder
                          )
                          if (selectedCandidate) {
                            const conflictKey = `${gm.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
                            isGMDisabled = conflictInfo.gmDateConflicts.has(conflictKey)
                          }
                        }
                        
                        return (
                          <SelectItem 
                            key={gm.id} 
                            value={gm.id}
                            disabled={isGMDisabled}
                          >
                            {gm.name}
                            {isAvailable && ' (担当GM)'}
                            {gmNotes && ` - ${gmNotes}`}
                            {isGMDisabled && ' - 予約済み'}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {availableGMs.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      ℹ️ (担当GM) がこのシナリオの担当GMです
                    </div>
                  )}
                </div>

                {/* GM回答情報（参考用） */}
                {selectedRequest.gm_responses && selectedRequest.gm_responses.length > 0 && (
                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-3 text-gray-600">参考：全GM回答情報</h3>
                    <div className="space-y-2">
                      {selectedRequest.gm_responses.map((response: any, idx: number) => (
                        <div key={idx} className="p-3 rounded bg-gray-50 border border-gray-200 flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-700">{response.gm_name || `GM ${idx + 1}`}</div>
                            {response.notes && (
                              <div className="text-sm text-gray-600 mt-1">{response.notes}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ステータスメッセージ */}
                {selectedRequest.status === 'pending' && (
                  <div className="pt-6 border-t">
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-yellow-800">
                        <Clock className="w-5 h-5" />
                        <span className="font-medium">
                          現在、GMによる対応可否の確認を待っています。必要に応じて日時・GM・店舗を選択して承認、または却下できます。
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* アクションボタン */}
                {(selectedRequest.status === 'pending' || selectedRequest.status === 'pending_gm' || selectedRequest.status === 'gm_confirmed' || selectedRequest.status === 'pending_store') && (
                  <div className="flex gap-3 pt-6 border-t">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-200 hover:bg-red-50"
                      onClick={() => handleRejectClick(selectedRequest.id)}
                      disabled={submitting}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      却下する
                    </Button>
                    <Button
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={submitting || !selectedCandidateOrder || !selectedGMId || !selectedStoreId}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      承認する
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 却下確認モーダル */}
          {showRejectDialog && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-red-800">貸切リクエストの却下</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      以下のメッセージがお客様に送信されます。必要に応じて編集してください。
                    </p>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={8}
                      className="resize-none"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="outline"
                      onClick={handleRejectCancel}
                      disabled={submitting}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleRejectConfirm}
                      disabled={submitting || !rejectionReason.trim()}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      {submitting ? '送信中...' : '却下する'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 月の切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'pending_gm' || r.status === 'gm_confirmed' || r.status === 'pending_store')
  const allRequests = filterByMonth(requests)
  const filteredRequests = activeTab === 'pending' ? filterByMonth(pendingRequests) : allRequests

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="private-booking-management" />
      
      <div className="container mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-3xl font-bold mb-2">貸切リクエスト確認</h1>
        <p className="text-muted-foreground mb-6">GMが対応可能と回答したリクエストを確認・承認します</p>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'all')}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending">
              店舗確認待ち
              {pendingRequests.length > 0 && (
                <Badge className="ml-2 bg-orange-600 text-xs px-1.5 py-0">
                  {filterByMonth(pendingRequests).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">全て</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {/* 月切り替え */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                前月
              </Button>
              
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{formatMonthYear(currentDate)}</h2>
                <Badge variant="outline" className="text-xs px-2 py-1">
                  {filterByMonth(pendingRequests).length}件
                </Badge>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextMonth}
              >
                次月
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {filterByMonth(pendingRequests).length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {formatMonthYear(currentDate)}の確認待ち貸切リクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {filterByMonth(pendingRequests).map((request) => (
                  <Card key={request.id} className={getCardClassName(request.status)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 mt-2">
                    <div>予約番号: {request.reservation_number}</div>
                    <div className="flex items-center gap-2">
                      <span>申込日時: {formatDateTime(request.created_at)}</span>
                      <span className="text-orange-600 font-medium">({getElapsedTime(request.created_at)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      お客様: {request.customer_name} ({request.participant_count}名)
                    </div>
                    {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>希望店舗:</span>
                        {request.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                          <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                            {store.storeName}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* GM選択済み候補日時 */}
                    <div>
                      <p className="text-sm font-medium mb-3 text-purple-800">
                        GMが選択した候補日時（店側確認待ち）
                      </p>
                      <div className="space-y-2">
                        {request.candidate_datetimes?.candidates?.map((candidate: any) => (
                          <div
                            key={candidate.order}
                            className="flex items-center gap-3 p-3 rounded bg-purple-50 border-purple-300 border"
                          >
                            <CheckCircle2 className="w-5 h-5 text-purple-600" />
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                                  候補{candidate.order}
                                </Badge>
                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{formatDate(candidate.date)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 確定済み店舗の表示 */}
                    {request.candidate_datetimes?.confirmedStore && (
                      <div className="p-3 rounded border bg-purple-50 border-purple-200">
                        <div className="text-sm">
                          <span className="font-medium text-purple-800">開催店舗: </span>
                          <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
                        </div>
                      </div>
                    )}

                    {/* 顧客メモ */}
                    {request.notes && (
                      <div className="pt-3 border-t">
                        <p className="text-sm font-medium mb-2 text-muted-foreground">お客様からのメモ</p>
                        <p className="text-sm bg-background p-3 rounded border">{request.notes}</p>
                      </div>
                    )}

                    {/* 詳細確認ボタン */}
                    <div className="pt-3 border-t">
                      <Button
                        onClick={() => setSelectedRequest(request)}
                        className="w-full"
                        variant="default"
                      >
                        詳細確認・承認/却下
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {formatMonthYear(currentDate)}の貸切リクエストはありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredRequests.map((request) => (
              <Card key={request.id} className={getCardClassName(request.status)}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 mt-2">
                    <div>予約番号: {request.reservation_number}</div>
                    <div className="flex items-center gap-2">
                      <span>申込日時: {formatDateTime(request.created_at)}</span>
                      <span className="text-orange-600 font-medium">({getElapsedTime(request.created_at)})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      お客様: {request.customer_name} ({request.participant_count}名)
                    </div>
                    {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>希望店舗:</span>
                        {request.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                          <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                            {store.storeName}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* GM選択済み候補日時 */}
                    <div>
                      <p className="text-sm font-medium mb-3 text-purple-800">
                        {request.status === 'confirmed' ? '確定した候補日時' : (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'GMが選択した候補日時（店舗確認待ち）' : 'リクエストされた候補日時'}
                      </p>
                      <div className="space-y-2">
                        {request.candidate_datetimes?.candidates?.map((candidate: any) => (
                          <div
                            key={candidate.order}
                            className={`flex items-center gap-3 p-3 rounded border ${
                              request.status === 'confirmed' ? 'bg-green-50 border-green-300' :
                              (request.status === 'gm_confirmed' || request.status === 'pending_store') ? 'bg-purple-50 border-purple-300' :
                              'bg-gray-50 border-gray-300'
                            }`}
                          >
                            {request.status === 'confirmed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (request.status === 'gm_confirmed' || request.status === 'pending_store') ? (
                              <CheckCircle2 className="w-5 h-5 text-purple-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                                  候補{candidate.order}
                                </Badge>
                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{formatDate(candidate.date)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <span>{candidate.timeSlot} {candidate.startTime} - {candidate.endTime}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 確定済み店舗の表示 */}
                    {request.candidate_datetimes?.confirmedStore && (
                      <div className="p-3 rounded border bg-purple-50 border-purple-200">
                        <div className="text-sm">
                          <span className="font-medium text-purple-800">開催店舗: </span>
                          <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
                        </div>
                      </div>
                    )}

                    {/* 顧客メモ */}
                    {request.notes && (
                      <div className="pt-3 border-t">
                        <p className="text-sm font-medium mb-2 text-muted-foreground">お客様からのメモ</p>
                        <p className="text-sm bg-background p-3 rounded border">{request.notes}</p>
                      </div>
                    )}

                    {/* 詳細確認ボタン（店舗確認待ちの場合のみ） */}
                    {(request.status === 'gm_confirmed' || request.status === 'pending_store') && (
                      <div className="pt-3 border-t">
                        <Button
                          onClick={() => setSelectedRequest(request)}
                          className="w-full"
                          variant="default"
                        >
                          詳細確認・承認/却下
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {/* 月切り替え */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                前月
              </Button>
              
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{formatMonthYear(currentDate)}</h2>
                <Badge variant="outline" className="text-xs px-2 py-1">
                  {allRequests.length}件
                </Badge>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextMonth}
              >
                次月
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {allRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {formatMonthYear(currentDate)}の貸切リクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {allRequests.map((request) => (
                  <Card key={request.id} className={getCardClassName(request.status)}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1 mt-2">
                        <div>予約番号: {request.reservation_number}</div>
                        <div className="flex items-center gap-2">
                          <span>申込日時: {formatDateTime(request.created_at)}</span>
                          <span className="text-orange-600 font-medium">({getElapsedTime(request.created_at)})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          お客様: {request.customer_name} ({request.participant_count}名)
                        </div>
                        {request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>希望店舗:</span>
                            {request.candidate_datetimes.requestedStores.map((store, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {store.storeName}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {(!request.candidate_datetimes?.requestedStores || request.candidate_datetimes.requestedStores.length === 0) && (
                          <div className="text-blue-600 text-sm">
                            希望店舗: 全ての店舗（顧客希望）
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* GM回答表示 */}
                        {request.gm_responses && request.gm_responses.length > 0 && (
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <h4 className="font-medium text-blue-900 mb-2">GM回答状況</h4>
                            <div className="space-y-1">
                              {request.gm_responses.map((response: any, index: number) => (
                                <div key={index} className="text-sm text-blue-800">
                                  {response.gm_name || 'GM名不明'}: {response.response_type === 'available' ? '✅ 出勤可能' : '❌ 出勤不可'}
                                  {response.available_candidates && response.available_candidates.length > 0 && (
                                    <span className="ml-2 text-blue-600">
                                      (候補{response.available_candidates.map((idx: number) => idx + 1).join(', ')})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 候補日時表示 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {request.candidate_datetimes?.candidates?.map((candidate, index) => (
                            <div key={index} className="border rounded-lg p-3 bg-gray-50">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="w-4 h-4 text-gray-500" />
                                <span className="font-medium">候補{index + 1}</span>
                                <Badge variant={candidate.status === 'confirmed' ? 'default' : 'outline'}>
                                  {candidate.status === 'confirmed' ? '確定' : '候補'}
                                </Badge>
                              </div>
                              <div className="text-sm text-gray-600">
                                <div>{formatDate(candidate.date)}</div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {candidate.timeSlot} {candidate.startTime}-{candidate.endTime}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 詳細確認ボタン */}
                        {(request.status === 'gm_confirmed' || request.status === 'pending_store') && (
                          <div className="flex justify-center pt-4">
                            <Button
                              onClick={() => setSelectedRequest(request)}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              詳細確認
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

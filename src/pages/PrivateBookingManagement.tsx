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
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availableGMs, setAvailableGMs] = useState<any[]>([])
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [allGMs, setAllGMs] = useState<any[]>([]) // 全GMのリスト（強行選択用）
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectRequestId, setRejectRequestId] = useState<string | null>(null)

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
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            GM確認待ち
          </Badge>
        )
      case 'gm_confirmed':
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
            店側確認待ち
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
        return 'border-yellow-200 bg-yellow-50/30'
      case 'gm_confirmed':
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

  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [activeTab])

  useEffect(() => {
    if (selectedRequest) {
      loadAvailableGMs(selectedRequest.id)
      
      // 確定店舗があればそれを選択、なければ最初の希望店舗を選択
      if (selectedRequest.candidate_datetimes?.confirmedStore) {
        setSelectedStoreId(selectedRequest.candidate_datetimes.confirmedStore.storeId)
      } else if (selectedRequest.candidate_datetimes?.requestedStores && selectedRequest.candidate_datetimes.requestedStores.length > 0) {
        setSelectedStoreId(selectedRequest.candidate_datetimes.requestedStores[0].storeId)
      }
      
      // 最初の候補日時を選択
      if (selectedRequest.candidate_datetimes?.candidates && selectedRequest.candidate_datetimes.candidates.length > 0) {
        setSelectedCandidateOrder(selectedRequest.candidate_datetimes.candidates[0].order)
      }
    }
  }, [selectedRequest])

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
      
      // 対応可能と回答したGMも取得
      const { data: availableData, error: availableError } = await supabase
        .from('gm_availability_responses')
        .select('staff_id, available_candidates, notes')
        .eq('reservation_id', reservationId)
        .eq('response_status', 'available')
      
      // 担当GMのIDリストを作成
      const assignedGMIds = (assignmentData || []).map((a: any) => a.staff_id)
      
      // 対応可能GMの情報をマップに変換
      const availableGMMap = new Map(
        (availableData || []).map((a: any) => [
          a.staff_id,
          {
            available_candidates: a.available_candidates || [],
            notes: a.notes || ''
          }
        ])
      )
      
      // ハイライト対象のGMを作成（担当GM + 対応可能GM）
      const highlightGMs = allGMs
        .filter(gm => assignedGMIds.includes(gm.id) || availableGMMap.has(gm.id))
        .map(gm => ({
          id: gm.id,
          name: gm.name,
          available_candidates: availableGMMap.get(gm.id)?.available_candidates || [],
          notes: availableGMMap.get(gm.id)?.notes || '',
          isAssigned: assignedGMIds.includes(gm.id),
          isAvailable: availableGMMap.has(gm.id)
        }))
      
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

      // タブによってフィルター
      if (activeTab === 'pending') {
        // 店舗確認待ちのみ（GM確認待ち + GM確認済み）
        query = query.in('status', ['pending', 'gm_confirmed'])
      } else {
        // 全て
        query = query.in('status', ['pending', 'gm_confirmed', 'confirmed', 'cancelled'])
      }

      const { data, error } = await query

      if (error) {
        console.error('Supabaseエラー:', error)
        throw error
      }

      // データ整形
      const formattedData: PrivateBookingRequest[] = (data || []).map((req: any) => ({
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
        gm_responses: req.gm_responses || [],
        created_at: req.created_at
      }))

      setRequests(formattedData)
    } catch (error) {
      console.error('貸切リクエスト取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!selectedGMId) {
      alert('GMを選択してください')
      return
    }

    if (!selectedStoreId) {
      alert('店舗を選択してください')
      return
    }

    if (!selectedCandidateOrder) {
      alert('開催日時を選択してください')
      return
    }

    try {
      setSubmitting(true)

      // 選択された候補日時のみを残して、ステータスをconfirmedに
      const selectedCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
        c => c.order === selectedCandidateOrder
      )
      
      if (!selectedCandidate) {
        alert('選択された日時が見つかりません')
        setSubmitting(false)
        return
      }

      // 重複チェック1: 同じ日時・同じ店舗で確定済みの予約がないか確認
      const { data: conflictingReservations, error: conflictError } = await supabase
        .from('reservations')
        .select('id, reservation_number, candidate_datetimes, store_id')
        .eq('status', 'confirmed')
        .eq('store_id', selectedStoreId)
        .neq('id', requestId) // 現在のリクエストは除外

      if (conflictError) throw conflictError

      // 同じ日付・同じタイムスロットの予約があるかチェック
      const hasDateConflict = conflictingReservations?.some(reservation => {
        const confirmedCandidates = reservation.candidate_datetimes?.candidates || []
        return confirmedCandidates.some((candidate: any) => 
          candidate.status === 'confirmed' &&
          candidate.date === selectedCandidate.date &&
          candidate.timeSlot === selectedCandidate.timeSlot
        )
      })

      if (hasDateConflict) {
        const storeName = stores.find(s => s.id === selectedStoreId)?.name || '選択された店舗'
        alert(`エラー: ${selectedCandidate.date} ${selectedCandidate.timeSlot} の ${storeName} は既に別の予約で確定済みです。\n\n別の日時または店舗を選択してください。`)
        setSubmitting(false)
        return
      }

      // 重複チェック2: 同じ日時・同じGMで確定済みの予約がないか確認
      const { data: gmConflictingReservations, error: gmConflictError } = await supabase
        .from('reservations')
        .select('id, reservation_number, candidate_datetimes, gm_staff')
        .eq('status', 'confirmed')
        .eq('gm_staff', selectedGMId)
        .neq('id', requestId)

      if (gmConflictError) throw gmConflictError

      const hasGMConflict = gmConflictingReservations?.some(reservation => {
        const confirmedCandidates = reservation.candidate_datetimes?.candidates || []
        return confirmedCandidates.some((candidate: any) => 
          candidate.status === 'confirmed' &&
          candidate.date === selectedCandidate.date &&
          candidate.timeSlot === selectedCandidate.timeSlot
        )
      })

      if (hasGMConflict) {
        const gmName = allGMs.find(gm => gm.id === selectedGMId)?.name || '選択されたGM'
        alert(`エラー: ${selectedCandidate.date} ${selectedCandidate.timeSlot} に ${gmName} は既に別の予約で確定済みです。\n\n別の日時またはGMを選択してください。`)
        setSubmitting(false)
        return
      }

      if (!confirm('この貸切リクエストを承認しますか？\n承認後、顧客に通知が送信されます。')) {
        setSubmitting(false)
        return
      }

      const updatedCandidateDatetimes = {
        ...selectedRequest?.candidate_datetimes,
        candidates: [{
          ...selectedCandidate,
          status: 'confirmed'
        }]
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

      alert('貸切リクエストを承認しました！')
      setSelectedRequest(null)
      setSelectedGMId('')
      setSelectedStoreId('')
      setSelectedCandidateOrder(null)
      setAvailableGMs([])
      loadRequests()
    } catch (error) {
      console.error('承認エラー:', error)
      alert('承認に失敗しました')
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
      alert('却下理由を入力してください')
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

      alert('貸切リクエストを却下しました')
      setSelectedRequest(null)
      setRejectionReason('')
      setShowRejectDialog(false)
      setRejectRequestId(null)
      loadRequests()
    } catch (error) {
      console.error('却下エラー:', error)
      alert('却下に失敗しました')
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
                      return (
                        <div
                          key={candidate.order}
                          onClick={() => setSelectedCandidateOrder(candidate.order)}
                          className={`flex items-center gap-3 p-3 rounded border-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 bg-background hover:border-purple-300'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-purple-500 bg-purple-500'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            )}
                          </div>
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
                        
                        return (
                          <SelectItem 
                            key={store.id} 
                            value={store.id}
                          >
                            {store.name}
                            {isRequested && ' (お客様希望)'}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedRequest.candidate_datetimes?.requestedStores?.length === 0 ? (
                      <span>ℹ️ お客様は全ての店舗を希望しています</span>
                    ) : selectedRequest.candidate_datetimes?.requestedStores?.length > 0 ? (
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
                        
                        return (
                          <SelectItem 
                            key={gm.id} 
                            value={gm.id}
                          >
                            {gm.name}
                            {isAvailable && ' (担当GM)'}
                            {gmNotes && ` - ${gmNotes}`}
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
                {(selectedRequest.status === 'pending' || selectedRequest.status === 'gm_confirmed') && (
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

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'gm_confirmed')
  const allRequests = filterByMonth(requests)
  
  // 月の切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

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
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">全て</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  現在確認待ちの貸切リクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {pendingRequests.map((request) => (
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
            翌月
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
                        {request.status === 'confirmed' ? '確定した候補日時' : request.status === 'gm_confirmed' ? 'GMが選択した候補日時（店側確認待ち）' : 'リクエストされた候補日時'}
                      </p>
                      <div className="space-y-2">
                        {request.candidate_datetimes?.candidates?.map((candidate: any) => (
                          <div
                            key={candidate.order}
                            className={`flex items-center gap-3 p-3 rounded border ${
                              request.status === 'confirmed' ? 'bg-green-50 border-green-300' :
                              request.status === 'gm_confirmed' ? 'bg-purple-50 border-purple-300' :
                              'bg-gray-50 border-gray-300'
                            }`}
                          >
                            {request.status === 'confirmed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : request.status === 'gm_confirmed' ? (
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
                    {request.status === 'gm_confirmed' && (
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
    </Tabs>
      </div>
    </div>
  )
}

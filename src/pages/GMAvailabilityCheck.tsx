import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import * as storeApi from '@/lib/api'

interface GMRequest {
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
  reservation_status?: string // 予約全体のステータス（pending, confirmed, etc.）
  has_other_gm_response?: boolean // 他のGMが既に回答済みか
}

export function GMAvailabilityCheck() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<GMRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, number[]>>({})
  const [candidateAvailability, setCandidateAvailability] = useState<Record<string, Record<number, boolean>>>({}) // requestId -> candidateOrder -> isAvailable
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [stores, setStores] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending')
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    loadGMRequests()
    loadStores()
  }, [user])
  
  const loadStores = async () => {
    try {
      const storesData = await storeApi.storeApi.getAll()
      setStores(storesData)
    } catch (error) {
      console.error('店舗データ取得エラー:', error)
    }
  }
  
  // 特定の候補日時が既存のスケジュールと被っているかチェック
  const checkCandidateAvailability = async (candidate: any, storeId: string): Promise<boolean> => {
    if (!storeId) return true // 店舗未選定の場合はチェックしない
    
    // 時間帯を変換
    const timeSlot = getTimeSlotFromCandidate(candidate.timeSlot)
    
    // その日・その店舗の既存公演を取得
    const { data: existingEvents } = await supabase
      .from('schedule_events')
      .select('start_time, end_time')
      .eq('date', candidate.date)
      .eq('store_id', storeId)
    
    if (existingEvents && existingEvents.length > 0) {
      // 既存公演の時間帯を確認
      for (const event of existingEvents) {
        const eventTimeSlot = getTimeSlotFromTime(event.start_time)
        if (eventTimeSlot === timeSlot) {
          return false // 被っている
        }
      }
    }
    
    // 確定済みの貸切リクエストとも競合しないかチェック
    const { data: confirmedPrivateEvents } = await supabase
      .from('reservations')
      .select('candidate_datetimes, store_id')
      .eq('reservation_source', 'web_private')
      .in('status', ['confirmed', 'gm_confirmed'])
      .eq('store_id', storeId)
    
    if (confirmedPrivateEvents && confirmedPrivateEvents.length > 0) {
      for (const reservation of confirmedPrivateEvents) {
        const candidates = reservation.candidate_datetimes?.candidates || []
        for (const c of candidates) {
          if (c.date === candidate.date && c.timeSlot === candidate.timeSlot) {
            return false // 貸切リクエストと被っている
          }
        }
      }
    }
    
    return true // 空いている
  }
  
  const getTimeSlotFromCandidate = (timeSlot: string): string => {
    if (timeSlot === '朝') return 'morning'
    if (timeSlot === '昼') return 'afternoon'
    if (timeSlot === '夜') return 'evening'
    return 'morning'
  }
  
  const getTimeSlotFromTime = (startTime: string): string => {
    const hour = parseInt(startTime.split(':')[0])
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }
  

  const loadGMRequests = async () => {
    if (!user) return
    
    try {
      setIsLoading(true)
      
      // 現在のユーザーのstaff_idを取得
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (staffError) {
        console.error('スタッフ情報取得エラー:', staffError)
        // RLSエラーの場合でも続行（開発環境用）
        // TODO: 本番環境ではRLSを適切に設定
        setRequests([])
        setIsLoading(false)
        return
      }
      
      if (!staffData) {
        console.error('このユーザーにはスタッフ情報が紐付けられていません')
        setRequests([])
        setIsLoading(false)
        return
      }
      
      const staffId = staffData.id
      
      // このGMに送られた確認リクエストを取得
      const { data: responsesData, error: responsesError } = await supabase
        .from('gm_availability_responses')
        .select(`
          id,
          reservation_id,
          response_status,
          available_candidates,
          notes,
          reservations:reservation_id (
            reservation_number,
            title,
            customer_name,
            candidate_datetimes,
            status,
            store_id,
            stores:store_id (
              id,
              name,
              short_name
            )
          )
        `)
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
      
      if (responsesError) {
        console.error('GMリクエスト取得エラー:', responsesError)
        setRequests([])
        return
      }
      
      // 同じreservation_idに対する他のGMの回答をチェック
      const reservationIds = (responsesData || []).map((r: any) => r.reservation_id).filter(Boolean)
      
      let otherGMResponses: Set<string> = new Set()
      
      if (reservationIds.length > 0) {
        const { data: allResponsesData } = await supabase
          .from('gm_availability_responses')
          .select('reservation_id, response_status, staff_id')
          .in('reservation_id', reservationIds)
          .neq('staff_id', staffId) // 自分以外のGM
          .in('response_status', ['available', 'all_unavailable']) // 回答済み
        
        // 他のGMが回答済みのreservation_idをセットに追加
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
          has_other_gm_response: hasOtherGMResponse
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
      console.error('データ読み込みエラー:', error)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  const toggleCandidate = async (requestId: string, candidateOrder: number) => {
    const current = selectedCandidates[requestId] || []
    const newSelection = current.includes(candidateOrder)
      ? current.filter(c => c !== candidateOrder)
      : [...current, candidateOrder]
    
    setSelectedCandidates({
      ...selectedCandidates,
      [requestId]: newSelection
    })
    
    // 候補が選択された場合、自動的に店舗を選定
    // 自動選定ロジックは削除
  }
  
  // 各候補日時の利用可能性を更新
  const updateCandidateAvailability = async (request: GMRequest, storeId: string) => {
    const availability: Record<number, boolean> = {}
    
    for (const candidate of request.candidate_datetimes?.candidates || []) {
      const isAvailable = await checkCandidateAvailability(candidate, storeId)
      availability[candidate.order] = isAvailable
    }
    
    setCandidateAvailability({
      ...candidateAvailability,
      [request.id]: availability
    })
  }

  const handleSubmit = async (requestId: string, allUnavailable: boolean = false) => {
    setSubmitting(requestId)
    
    try {
      const availableCandidates = allUnavailable ? [] : (selectedCandidates[requestId] || [])
      const responseStatus = allUnavailable ? 'all_unavailable' : (availableCandidates.length > 0 ? 'available' : 'pending')
      
      // GM回答を更新
      const { error } = await supabase
        .from('gm_availability_responses')
        .update({
          response_status: responseStatus,
          available_candidates: availableCandidates,
          responded_at: new Date().toISOString(),
          notes: notes[requestId] || null
        })
        .eq('id', requestId)
      
      if (error) {
        console.error('回答送信エラー:', error)
        alert('回答の送信に失敗しました')
        return
      }
      
      // GMが1つでも出勤可能な候補を選択した場合、ステータスを更新
      if (availableCandidates.length > 0) {
        // 該当するリクエストを取得
        const request = requests.find(r => r.id === requestId)
        if (request) {
          // GMが選択した候補のみを残す（他の候補は削除）
          const confirmedCandidates = request.candidate_datetimes?.candidates?.filter(
            (c: any) => availableCandidates.includes(c.order)
          ) || []
          
          const updatedCandidateDatetimes: any = {
            ...request.candidate_datetimes,
            candidates: confirmedCandidates
          }
          
          // GMが回答したら店側確認待ちステータスに
          const newStatus = 'gm_confirmed'
          
          const updateData: any = {
            status: newStatus,
            candidate_datetimes: updatedCandidateDatetimes,
            updated_at: new Date().toISOString()
          }
          
          const { error: reservationError } = await supabase
            .from('reservations')
            .update(updateData)
            .eq('id', request.reservation_id)
          
          if (reservationError) {
            console.error('予約更新エラー:', reservationError)
            alert(`予約の更新に失敗しました: ${reservationError.message}`)
          }
        }
      }
      
      // 成功したらリロード
      await loadGMRequests()
      
      if (availableCandidates.length === 0) {
        alert('回答を送信しました')
      } else {
        alert(`回答を送信しました。店側の最終確認待ちです。`)
      }
    } catch (error) {
      console.error('送信エラー:', error)
      alert('エラーが発生しました')
    } finally {
      setSubmitting(null)
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="gm-availability" />
        <div className="container mx-auto max-w-4xl px-6 py-12 text-center">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  // 月ごとにフィルタリング
  const filterByMonth = (reqs: GMRequest[]) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    return reqs.filter(r => {
      // candidate_datetimesから最初の候補日時を取得
      const firstCandidate = r.candidate_datetimes?.candidates?.[0]
      if (!firstCandidate) return false
      
      const candidateDate = new Date(firstCandidate.date)
      return candidateDate.getFullYear() === year && candidateDate.getMonth() === month
    })
  }

  // 未回答のリクエスト：自分が未回答 & 他のGMも未回答 & 予約が確定していない
  const pendingRequests = requests.filter(r => 
    r.response_status === 'pending' && 
    !r.has_other_gm_response &&
    r.reservation_status !== 'confirmed' &&
    r.reservation_status !== 'gm_confirmed'
  )
  
  // 全てのリクエスト（月でフィルタリング）
  const allRequests = filterByMonth(requests)
  
  // 月の切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }
  
  const formatMonthYear = (date: Date) => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="gm-availability" />
      
      <div className="container mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-3xl font-bold mb-2">貸切リクエスト確認</h1>
        <p className="text-muted-foreground mb-6">出勤可能な候補日時を選択してください</p>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'all')}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending">
              未回答
              {pendingRequests.length > 0 && (
                <Badge className="ml-2 bg-purple-600 text-xs px-1.5 py-0">
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
                {pendingRequests.map((request) => {
                  const isResponded = request.response_status !== 'pending'
                  const isConfirmed = request.reservation_status === 'confirmed'
                  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
                  const currentSelections = selectedCandidates[request.id] || []
                  
                  return (
                <Card key={request.id} className={
                  isConfirmed 
                    ? 'border-blue-200 bg-blue-50/30' 
                    : isGMConfirmed
                      ? 'border-orange-200 bg-orange-50/30'
                      : isResponded 
                        ? 'border-green-200 bg-green-50/30' 
                        : ''
                }>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                      <div className="flex gap-2">
                        {isConfirmed && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                            確定済み
                          </Badge>
                        )}
                        {isGMConfirmed && (
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                            店側確認待ち
                          </Badge>
                        )}
                        {isResponded && !isConfirmed && !isGMConfirmed && (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                            回答済み
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <div>予約番号: {request.reservation_number}</div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        お客様: {request.customer_name}
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
                      {/* 開催予定店舗 */}
                      <div className="mb-4">
                        <div className="text-sm text-muted-foreground mb-1">開催予定店舗</div>
                        {request.candidate_datetimes?.confirmedStore ? (
                          <div className="font-medium">{request.candidate_datetimes.confirmedStore.storeName}</div>
                        ) : request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 ? (
                          <>
                            <div className="flex gap-2 flex-wrap">
                              {request.candidate_datetimes?.requestedStores?.map((store: any, index: number) => (
                                <span key={index} className="font-medium">
                                  {store.storeName}{index < (request.candidate_datetimes?.requestedStores?.length || 0) - 1 ? ' / ' : ''}
                                </span>
                              ))}
                            </div>
                            {(request.candidate_datetimes?.requestedStores?.length || 0) > 1 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                ※ 最終店舗は店舗管理者が決定します
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-muted-foreground">店舗未定（店舗管理者が決定します）</div>
                        )}
                      </div>

                      {/* 候補日時 */}
                      <div>
                        <p className="text-sm font-medium mb-3 text-purple-800">
                          {isConfirmed ? '確定した候補日時' : isGMConfirmed ? '選択した候補日時（店側確認待ち）' : '以下の候補から出勤可能な日時を選択してください（複数選択可）'}
                        </p>
                        <div className="space-y-2">
                          {request.candidate_datetimes?.candidates?.map((candidate: any) => {
                            const isSelected = currentSelections.includes(candidate.order)
                            const availability = candidateAvailability[request.id]
                            const isAvailable = availability ? availability[candidate.order] !== false : true
                            const isDisabled = isResponded || isConfirmed || isGMConfirmed || !isAvailable
                            
                            return (
                              <div
                                key={candidate.order}
                                className={`flex items-center gap-3 p-3 rounded border ${
                                  !isAvailable
                                    ? 'bg-red-50 border-red-200 cursor-not-allowed opacity-60'
                                    : isConfirmed 
                                      ? 'bg-gray-50 border-gray-200 cursor-default'
                                      : isGMConfirmed
                                        ? 'bg-orange-50 border-orange-200 cursor-default'
                                        : isSelected 
                                          ? 'bg-purple-50 border-purple-300 cursor-pointer' 
                                          : 'bg-accent border-border hover:bg-accent/80 cursor-pointer'
                                }`}
                                onClick={() => !isDisabled && toggleCandidate(request.id, candidate.order)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  disabled={isDisabled}
                                  className="pointer-events-none"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                                      候補{candidate.order}
                                    </Badge>
                                    {!isAvailable && (
                                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                                        満席
                                      </Badge>
                                    )}
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
                                {isSelected && isAvailable && (
                                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* 確定済み店舗の表示 */}
                      {(isConfirmed || isGMConfirmed) && request.candidate_datetimes?.confirmedStore && (
                        <div className="p-3 rounded border bg-purple-50 border-purple-200">
                          <div className="text-sm">
                            <span className="font-medium text-purple-800">開催店舗: </span>
                            <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
                          </div>
                        </div>
                      )}

                      {/* メモ */}
                      {!isResponded && (
                        <div>
                          <label className="text-sm font-medium mb-1.5 block">
                            メモ（任意）
                          </label>
                          <Textarea
                            value={notes[request.id] || ''}
                            onChange={(e) => setNotes({ ...notes, [request.id]: e.target.value })}
                            placeholder="特記事項があれば入力してください"
                            rows={3}
                          />
                        </div>
                      )}

                      {/* 回答済みの場合はメモを表示 */}
                      {isResponded && request.notes && (
                        <div className="bg-muted/50 rounded p-3">
                          <div className="text-sm font-medium mb-1">メモ</div>
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {request.notes}
                          </div>
                        </div>
                      )}

                      {/* ボタン */}
                      {!isResponded && !isConfirmed && !isGMConfirmed && (
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            className="flex-1 border-red-200 hover:bg-red-50"
                            onClick={() => handleSubmit(request.id, true)}
                            disabled={submitting === request.id}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            すべて出勤不可
                          </Button>
                          <Button
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            onClick={() => handleSubmit(request.id, false)}
                            disabled={submitting === request.id || currentSelections.length === 0}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            {submitting === request.id ? '送信中...' : '回答を送信'}
                          </Button>
                        </div>
                      )}

                      {/* 確定済みの表示 */}
                      {isConfirmed && (
                        <div className="p-3 rounded border bg-blue-50 border-blue-200">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span className="font-medium text-blue-800">
                              この予約は確定されました
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* GM確認済み（店側確認待ち）の表示 */}
                      {isGMConfirmed && (
                        <div className="p-3 rounded border bg-orange-50 border-orange-200">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-orange-600" />
                            <span className="font-medium text-orange-800">
                              GMの確認は完了しました。店側で最終的な開催日を決定します。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 回答済みの表示（未確定・GM確認済み以外） */}
                      {isResponded && !isConfirmed && !isGMConfirmed && (
                        <div className={`p-3 rounded border ${
                          request.response_status === 'available' 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 text-sm">
                            {request.response_status === 'available' ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span className="font-medium text-green-800">
                                  回答済み：候補{request.available_candidates.join(', ')}が出勤可能
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-800">
                                  回答済み：すべて出勤不可
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
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
            {allRequests.map((request) => {
              const isResponded = request.response_status !== 'pending'
              const isConfirmed = request.reservation_status === 'confirmed'
              const isGMConfirmed = request.reservation_status === 'gm_confirmed'
              const hasOtherGMResponse = request.has_other_gm_response
              const currentSelections = selectedCandidates[request.id] || []
              
              return (
                <Card key={request.id} className={
                  isConfirmed 
                    ? 'border-blue-200 bg-blue-50/30' 
                    : isGMConfirmed
                      ? 'border-orange-200 bg-orange-50/30'
                      : hasOtherGMResponse
                        ? 'border-gray-300 bg-gray-100/50'
                        : isResponded 
                          ? 'border-green-200 bg-green-50/30' 
                          : ''
                }>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                      <div className="flex gap-2">
                        {isConfirmed && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                            確定済み
                          </Badge>
                        )}
                        {isGMConfirmed && (
                          <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                            店側確認待ち
                          </Badge>
                        )}
                        {hasOtherGMResponse && !isConfirmed && !isGMConfirmed && (
                          <Badge variant="outline" className="bg-gray-200 text-gray-700 border-gray-300">
                            他のGMが回答済み
                          </Badge>
                        )}
                        {isResponded && !isConfirmed && !isGMConfirmed && !hasOtherGMResponse && (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                            回答済み
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <div>予約番号: {request.reservation_number}</div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        お客様: {request.customer_name}
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
                      {/* 開催予定店舗 */}
                      <div className="mb-4">
                        <div className="text-sm text-muted-foreground mb-1">開催予定店舗</div>
                        {request.candidate_datetimes?.confirmedStore ? (
                          <div className="font-medium">{request.candidate_datetimes.confirmedStore.storeName}</div>
                        ) : request.candidate_datetimes?.requestedStores && request.candidate_datetimes.requestedStores.length > 0 ? (
                          <>
                            <div className="flex gap-2 flex-wrap">
                              {request.candidate_datetimes?.requestedStores?.map((store: any, index: number) => (
                                <span key={index} className="font-medium">
                                  {store.storeName}{index < (request.candidate_datetimes?.requestedStores?.length || 0) - 1 ? ' / ' : ''}
                                </span>
                              ))}
                            </div>
                            {(request.candidate_datetimes?.requestedStores?.length || 0) > 1 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                ※ 最終店舗は店舗管理者が決定します
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-muted-foreground">店舗未定（店舗管理者が決定します）</div>
                        )}
                      </div>

                      {/* 候補日時 */}
                      <div>
                        <p className="text-sm font-medium mb-3 text-purple-800">
                          {isConfirmed ? '確定した候補日時' : 
                           isGMConfirmed ? '選択した候補日時（店側確認待ち）' : 
                           hasOtherGMResponse ? '候補日時（他のGMが回答済み）' :
                           '候補日時'}
                        </p>
                        <div className="space-y-2">
                          {request.candidate_datetimes?.candidates?.map((candidate: any) => {
                            const isSelected = currentSelections.includes(candidate.order)
                            
                            return (
                              <div
                                key={candidate.order}
                                className={`flex items-center gap-3 p-3 rounded border ${
                                  isConfirmed 
                                    ? 'bg-gray-50 border-gray-200'
                                    : isGMConfirmed
                                      ? 'bg-orange-50 border-orange-200'
                                      : hasOtherGMResponse
                                        ? 'bg-gray-100 border-gray-300'
                                        : isSelected 
                                          ? 'bg-purple-50 border-purple-300' 
                                          : 'bg-gray-50 border-gray-200'
                                }`}
                              >
                                {isSelected && !hasOtherGMResponse ? (
                                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                                ) : hasOtherGMResponse ? (
                                  <XCircle className="w-5 h-5 text-gray-400" />
                                ) : null}
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
                      </div>

                      {/* 確定済み店舗の表示 */}
                      {(isConfirmed || isGMConfirmed) && request.candidate_datetimes?.confirmedStore && (
                        <div className="p-3 rounded border bg-purple-50 border-purple-200">
                          <div className="text-sm">
                            <span className="font-medium text-purple-800">開催店舗: </span>
                            <span className="text-purple-900">{request.candidate_datetimes.confirmedStore.storeName}</span>
                          </div>
                        </div>
                      )}

                      {/* 確定済みの表示 */}
                      {isConfirmed && (
                        <div className="p-3 rounded border bg-blue-50 border-blue-200">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <span className="font-medium text-blue-800">
                              この予約は確定されました
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* GM確認済み（店側確認待ち）の表示 */}
                      {isGMConfirmed && (
                        <div className="p-3 rounded border bg-orange-50 border-orange-200">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-orange-600" />
                            <span className="font-medium text-orange-800">
                              GMの確認は完了しました。店側で最終的な開催日を決定します。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 他のGMが回答済みの表示 */}
                      {hasOtherGMResponse && !isConfirmed && !isGMConfirmed && (
                        <div className="p-3 rounded border bg-gray-100 border-gray-300">
                          <div className="flex items-center gap-2 text-sm">
                            <XCircle className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-700">
                              他のGMが既に回答しているため、このリクエストは閉じられました
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 回答済みの表示（未確定・GM確認済み以外） */}
                      {isResponded && !isConfirmed && !isGMConfirmed && !hasOtherGMResponse && (
                        <div className={`p-3 rounded border ${
                          request.response_status === 'available' 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center gap-2 text-sm">
                            {request.response_status === 'available' ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <span className="font-medium text-green-800">
                                  回答済み：候補{request.available_candidates.join(', ')}が出勤可能
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-800">
                                  回答済み：すべて出勤不可
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </TabsContent>
    </Tabs>
      </div>
    </div>
  )
}


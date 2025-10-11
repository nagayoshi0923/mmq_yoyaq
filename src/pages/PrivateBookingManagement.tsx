import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, CheckCircle2, XCircle, MapPin, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PrivateBookingRequest {
  id: string
  reservation_number: string
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

  // ヘルパー関数を先に定義
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

  const loadAvailableGMs = async (reservationId: string) => {
    try {
      // gm_availability_responsesから対応可能なGMを取得
      const { data, error } = await supabase
        .from('gm_availability_responses')
        .select(`
          id,
          staff_id,
          response_status,
          available_candidates,
          notes,
          staff:staff_id (
            id,
            name
          )
        `)
        .eq('reservation_id', reservationId)
        .eq('response_status', 'available')

      if (error) throw error

      const gms = (data || []).map((response: any) => ({
        id: response.staff_id,
        name: response.staff?.name || '名前不明',
        available_candidates: response.available_candidates || [],
        notes: response.notes || ''
      }))

      setAvailableGMs(gms)
      
      // デフォルトで最初のGMを選択
      if (gms.length > 0) {
        setSelectedGMId(gms[0].id)
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

      console.log('貸切リクエスト取得結果:', { data, error, activeTab })

      if (error) {
        console.error('Supabaseエラー:', error)
        throw error
      }

      // データ整形
      const formattedData: PrivateBookingRequest[] = (data || []).map((req: any) => ({
        id: req.id,
        reservation_number: req.reservation_number || '',
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

      console.log('整形後のデータ:', formattedData)
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

    if (!confirm('この貸切リクエストを承認しますか？\n承認後、顧客に通知が送信されます。')) return

    try {
      setSubmitting(true)

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          gm_staff: selectedGMId, // 選択されたGMのIDを保存
          store_id: selectedStoreId, // 選択された店舗のIDを保存
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error

      alert('貸切リクエストを承認しました！')
      setSelectedRequest(null)
      setSelectedGMId('')
      setSelectedStoreId('')
      setAvailableGMs([])
      loadRequests()
    } catch (error) {
      console.error('承認エラー:', error)
      alert('承認に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async (requestId: string) => {
    if (!rejectionReason.trim()) {
      alert('却下理由を入力してください')
      return
    }

    if (!confirm('この貸切リクエストを却下しますか？\n却下後、顧客に理由が通知されます。')) return

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
        .eq('id', requestId)

      if (error) throw error

      alert('貸切リクエストを却下しました')
      setSelectedRequest(null)
      setRejectionReason('')
      loadRequests()
    } catch (error) {
      console.error('却下エラー:', error)
      alert('却下に失敗しました')
    } finally {
      setSubmitting(false)
    }
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

                {/* GMが選択した候補日時 */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                    <Calendar className="w-4 h-4" />
                    GMが選択した候補日時
                  </h3>
                  <div className="space-y-2">
                    {selectedRequest.candidate_datetimes?.candidates?.map((candidate: any) => (
                      <div
                        key={candidate.order}
                        className="flex items-center gap-3 p-3 rounded bg-purple-50 border border-purple-200"
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

                {/* 希望店舗と店舗選択 */}
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                    <MapPin className="w-4 h-4" />
                    開催店舗の選択
                  </h3>
                  
                  {/* お客様の希望店舗 */}
                  {selectedRequest.candidate_datetimes?.requestedStores && selectedRequest.candidate_datetimes.requestedStores.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm font-medium text-blue-900 mb-2">
                        お客様の希望店舗（{selectedRequest.candidate_datetimes.requestedStores.length}店舗）
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {selectedRequest.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                          <Badge key={index} variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                            {store.storeName}
                          </Badge>
                        ))}
                      </div>
                      {selectedRequest.candidate_datetimes.requestedStores.length === 1 && (
                        <div className="mt-2 text-xs text-blue-700">
                          ※ お客様は1店舗のみ希望されています。変更が必要な場合は事前に連絡をお願いします。
                        </div>
                      )}
                      {selectedRequest.candidate_datetimes.requestedStores.length > 1 && (
                        <div className="mt-2 text-xs text-blue-700">
                          ✓ お客様は複数店舗を許可されています。下記から選択してください。
                        </div>
                      )}
                    </div>
                  )}

                  {/* 店舗選択（複数希望の場合はお客様の希望店舗から、単一の場合は全店舗から選択可能） */}
                  <div className="space-y-2">
                    {(() => {
                      const requestedStores = selectedRequest.candidate_datetimes?.requestedStores || []
                      const isMultipleStoresRequested = requestedStores.length > 1
                      
                      // 複数店舗希望の場合は希望店舗のみ、単一の場合は全店舗を表示
                      const availableStores = isMultipleStoresRequested
                        ? stores.filter(s => requestedStores.some(rs => rs.storeId === s.id))
                        : stores

                      return availableStores.map((store) => {
                        const isRequested = requestedStores.some(rs => rs.storeId === store.id)
                        
                        return (
                          <div
                            key={store.id}
                            onClick={() => setSelectedStoreId(store.id)}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedStoreId === store.id
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 bg-background hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selectedStoreId === store.id
                                  ? 'border-purple-500 bg-purple-500'
                                  : 'border-gray-300'
                              }`}>
                                {selectedStoreId === store.id && (
                                  <CheckCircle2 className="w-4 h-4 text-white" />
                                )}
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                <span className="font-medium">{store.name}</span>
                                {isRequested && (
                                  <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 text-xs">
                                    お客様希望
                                  </Badge>
                                )}
                                {!isRequested && !isMultipleStoresRequested && (
                                  <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 text-xs">
                                    要連絡
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}
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

                {/* 対応可能なGM選択 */}
                {availableGMs.length > 0 && (
                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-3 text-purple-800">担当GMを選択してください</h3>
                    <div className="space-y-2">
                      {availableGMs.map((gm) => (
                        <div
                          key={gm.id}
                          onClick={() => setSelectedGMId(gm.id)}
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedGMId === gm.id
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 bg-background hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                              selectedGMId === gm.id
                                ? 'border-purple-500 bg-purple-500'
                                : 'border-gray-300'
                            }`}>
                              {selectedGMId === gm.id && (
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-base">{gm.name}</div>
                              {gm.available_candidates && gm.available_candidates.length > 0 && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  対応可能候補: 候補{gm.available_candidates.join(', ')}
                                </div>
                              )}
                              {gm.notes && (
                                <div className="text-sm mt-2 p-2 bg-gray-50 rounded">
                                  {gm.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* 却下理由入力 */}
                <div className="pt-6 border-t">
                  <label className="text-sm font-medium mb-2 block text-red-800">
                    却下する場合は理由を入力してください
                  </label>
                  <Textarea
                    placeholder="例: 希望日時に対応可能な店舗の空きがございません。別の日程をご検討いただけますか？"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>

                {/* ステータスメッセージ */}
                {selectedRequest.status === 'pending' && (
                  <div className="pt-6 border-t">
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-yellow-800">
                        <Clock className="w-5 h-5" />
                        <span className="font-medium">
                          現在、GMによる対応可否の確認を待っています。GMの回答後に承認・却下の判断が可能になります。
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* アクションボタン */}
                {selectedRequest.status === 'gm_confirmed' && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={submitting}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      size="lg"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      承認する
                    </Button>
                    <Button
                      onClick={() => handleReject(selectedRequest.id)}
                      disabled={submitting || !rejectionReason.trim()}
                      variant="destructive"
                      className="flex-1"
                      size="lg"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      却下する
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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

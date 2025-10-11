import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, CheckCircle2, XCircle, MapPin } from 'lucide-react'
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

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      setLoading(true)
      
      // reservationsテーブルから貸切リクエストを取得
      // reservation_source='web_private' で貸切リクエストを識別
      // status='gm_confirmed' で店舗確認待ち
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id(title),
          customers:customer_id(name, phone)
        `)
        .eq('reservation_source', 'web_private')
        .eq('status', 'gm_confirmed')
        .order('created_at', { ascending: false })

      console.log('貸切リクエスト取得結果:', { data, error })

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
    if (!confirm('この貸切リクエストを承認しますか？\n承認後、顧客に通知が送信されます。')) return

    try {
      setSubmitting(true)

      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error

      alert('貸切リクエストを承認しました！')
      setSelectedRequest(null)
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

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
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

          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">{selectedRequest.scenario_title}</CardTitle>
                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                  店側確認待ち
                </Badge>
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

                {/* 希望店舗 */}
                {selectedRequest.candidate_datetimes?.requestedStores && selectedRequest.candidate_datetimes.requestedStores.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                      <MapPin className="w-4 h-4" />
                      お客様の希望店舗
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {selectedRequest.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                        <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200">
                          {store.storeName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 確定店舗 */}
                {selectedRequest.candidate_datetimes?.confirmedStore && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
                      <MapPin className="w-4 h-4" />
                      確定店舗
                    </h3>
                    <div className="p-3 rounded border bg-purple-50 border-purple-200">
                      <div className="text-sm">
                        <span className="font-medium text-purple-800">開催店舗: </span>
                        <span className="text-purple-900">{selectedRequest.candidate_datetimes.confirmedStore.storeName}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 顧客メモ */}
                {selectedRequest.notes && (
                  <div>
                    <h3 className="font-semibold mb-3 text-purple-800">お客様からのメモ</h3>
                    <div className="p-4 bg-background rounded-lg border">
                      <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                    </div>
                  </div>
                )}

                {/* GM回答情報 */}
                {selectedRequest.gm_responses && selectedRequest.gm_responses.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-purple-800">GM回答情報</h3>
                    <div className="space-y-2">
                      {selectedRequest.gm_responses.map((response: any, idx: number) => (
                        <div key={idx} className="p-3 rounded bg-green-50 border border-green-200 flex items-start gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{response.gm_name || `GM ${idx + 1}`}</div>
                            {response.notes && (
                              <div className="text-sm text-muted-foreground mt-1">{response.notes}</div>
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

                {/* アクションボタン */}
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="private-booking-management" />
      
      <div className="container mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-3xl font-bold mb-2">貸切リクエスト確認</h1>
        <p className="text-muted-foreground mb-6">GMが対応可能と回答したリクエストを確認・承認します</p>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              現在確認待ちの貸切リクエストはありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {requests.map((request) => (
              <Card key={request.id} className="border-orange-200 bg-orange-50/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                    <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">
                      店側確認待ち
                    </Badge>
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
      </div>
    </div>
  )
}

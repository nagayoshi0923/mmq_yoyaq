import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, User, Phone, Mail, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface PrivateBookingRequest {
  id: string
  scenario_id: string
  scenario_title: string
  customer_name: string
  customer_email: string
  customer_phone: string
  preferred_dates: string[]
  preferred_stores: string[]
  participant_count: number
  notes?: string
  status: 'pending_gm' | 'pending_store' | 'approved' | 'rejected'
  gm_responses?: any[]
  created_at: string
  updated_at: string
}

interface GMResponse {
  gm_id: string
  gm_name: string
  available: boolean
  preferred_date?: string
  notes?: string
}

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<PrivateBookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [activeTab, setActiveTab] = useState<'pending_store' | 'all'>('pending_store')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadRequests()
  }, [activeTab])

  const loadRequests = async () => {
    try {
      setLoading(true)
      
      // reservationsテーブルから貸切リクエストを取得
      // reservation_source='web_private'で貸切リクエストを識別
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id(title),
          stores:store_id(name),
          customers:customer_id(name, phone, user_id)
        `)
        .eq('reservation_source', 'web_private')
        .order('created_at', { ascending: false })

      // タブによってフィルター
      if (activeTab === 'pending_store') {
        // GMが確認済み（gm_confirmed）で店舗確認待ち
        query = query.eq('status', 'gm_confirmed')
      }

      const { data, error } = await query

      console.log('貸切リクエスト取得結果:', { data, error, activeTab })

      if (error) {
        console.error('Supabaseエラー:', error)
        throw error
      }

      // データ整形
      const formattedData = (data || []).map((req: any) => {
        // customer_emailはusersテーブルから取得する必要がある
        return {
          id: req.id,
          scenario_id: req.scenario_id,
          scenario_title: req.scenarios?.title || req.title || 'シナリオ名不明',
          customer_name: req.customers?.name || req.customer_name || '顧客名不明',
          customer_email: req.customer_email || '',
          customer_phone: req.customers?.phone || req.customer_phone || '',
          preferred_dates: req.candidate_datetimes?.candidates?.map((c: any) => c.date) || [],
          preferred_stores: req.candidate_datetimes?.requestedStores?.map((s: any) => s.storeName) || [],
          participant_count: req.participant_count || 0,
          notes: req.customer_notes || '',
          status: req.status === 'gm_confirmed' ? 'pending_store' : 
                  req.status === 'confirmed' ? 'approved' : 
                  req.status === 'cancelled' ? 'rejected' : 'pending_gm',
          gm_responses: req.gm_responses || [],
          created_at: req.created_at,
          updated_at: req.updated_at
        }
      })

      console.log('整形後のデータ:', formattedData)
      setRequests(formattedData)
    } catch (error) {
      console.error('貸切リクエスト取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!confirm('この貸切リクエストを承認しますか？')) return

    try {
      setSubmitting(true)

      // reservationsテーブルのstatusを'confirmed'に更新
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error

      alert('貸切リクエストを承認しました')
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

    if (!confirm('この貸切リクエストを却下しますか？')) return

    try {
      setSubmitting(true)

      // reservationsテーブルのstatusを'cancelled'に更新
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_gm':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">GM確認待ち</Badge>
      case 'pending_store':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">店舗確認待ち</Badge>
      case 'approved':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">承認済み</Badge>
      case 'rejected':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">却下</Badge>
      default:
        return <Badge variant="outline">不明</Badge>
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
  }

  const getGMAvailableCount = (request: PrivateBookingRequest): number => {
    if (!request.gm_responses) return 0
    return request.gm_responses.filter((r: any) => r.available).length
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="private-booking-management" />

      <div className="container mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">貸切リクエスト管理</h1>
          <p className="text-muted-foreground">顧客からの貸切リクエストを確認・承認します</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending_store">
              店舗確認待ち
              {requests.filter(r => r.status === 'pending_store').length > 0 && (
                <Badge className="ml-2 bg-orange-600">
                  {requests.filter(r => r.status === 'pending_store').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">全て</TabsTrigger>
          </TabsList>

          <TabsContent value="pending_store">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">読み込み中...</p>
              </div>
            ) : requests.filter(r => r.status === 'pending_store').length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">店舗確認待ちのリクエストはありません</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {requests.filter(r => r.status === 'pending_store').map((request) => (
                  <Card key={request.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                            {getStatusBadge(request.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            リクエスト日時: {formatDate(request.created_at)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* 顧客情報 */}
                        <div>
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            顧客情報
                          </h3>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span>{request.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-muted-foreground" />
                              <span>{request.customer_email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-muted-foreground" />
                              <span>{request.customer_phone}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span>参加人数: {request.participant_count}名</span>
                            </div>
                          </div>
                        </div>

                        {/* リクエスト内容 */}
                        <div>
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            希望日時・店舗
                          </h3>
                          <div className="space-y-2 text-sm">
                            <div>
                              <div className="text-muted-foreground mb-1">希望日程</div>
                              {request.preferred_dates?.map((date, idx) => (
                                <div key={idx} className="ml-2">• {formatDate(date)}</div>
                              ))}
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">希望店舗</div>
                              {request.preferred_stores?.map((store, idx) => (
                                <div key={idx} className="ml-2">• {store}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* GM対応状況 */}
                      {request.gm_responses && request.gm_responses.length > 0 && (
                        <div className="mt-6 pt-6 border-t">
                          <h3 className="font-semibold mb-3">GM対応状況</h3>
                          <div className="grid md:grid-cols-2 gap-3">
                            {request.gm_responses.map((response: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                                {response.available ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium">{response.gm_name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {response.available ? '対応可能' : '対応不可'}
                                    {response.preferred_date && ` - ${formatDate(response.preferred_date)}`}
                                  </div>
                                  {response.notes && (
                                    <div className="text-sm mt-1">{response.notes}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 text-sm">
                            <Badge variant="outline" className="bg-green-50">
                              対応可能GM: {getGMAvailableCount(request)}名
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* 顧客メモ */}
                      {request.notes && (
                        <div className="mt-6 pt-6 border-t">
                          <h3 className="font-semibold mb-2">顧客からのメモ</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.notes}</p>
                        </div>
                      )}

                      {/* アクションボタン */}
                      <div className="mt-6 pt-6 border-t">
                        <Button
                          onClick={() => setSelectedRequest(request)}
                          className="w-full"
                          variant="default"
                        >
                          詳細確認・承認/却下
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">読み込み中...</p>
              </div>
            ) : requests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">リクエストがありません</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {requests.map((request) => (
                  <Card key={request.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-xl">{request.scenario_title}</CardTitle>
                            {getStatusBadge(request.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            リクエスト日時: {formatDate(request.created_at)}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* 顧客情報 */}
                        <div>
                          <h3 className="font-semibold mb-3 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            顧客情報
                          </h3>
                          <div className="space-y-2 text-sm">
                            <div>{request.customer_name}</div>
                            <div className="text-muted-foreground">{request.customer_email}</div>
                          </div>
                        </div>

                        {/* リクエスト概要 */}
                        <div>
                          <h3 className="font-semibold mb-3">リクエスト概要</h3>
                          <div className="space-y-2 text-sm">
                            <div>希望日程: {request.preferred_dates?.length || 0}件</div>
                            <div>希望店舗: {request.preferred_stores?.length || 0}件</div>
                            <div>参加人数: {request.participant_count}名</div>
                            {request.gm_responses && (
                              <div>対応可能GM: {getGMAvailableCount(request)}名</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {request.status === 'pending_store' && (
                        <div className="mt-6 pt-6 border-t">
                          <Button
                            onClick={() => setSelectedRequest(request)}
                            className="w-full"
                            variant="default"
                          >
                            詳細確認・承認/却下
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 承認/却下モーダル */}
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl mb-2">{selectedRequest.scenario_title}</CardTitle>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedRequest.status)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(null)
                      setRejectionReason('')
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 詳細情報 */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3">顧客情報</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedRequest.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedRequest.customer_email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{selectedRequest.customer_phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>参加人数: {selectedRequest.participant_count}名</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">希望日時・店舗</h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">希望日程</div>
                        {selectedRequest.preferred_dates?.map((date, idx) => (
                          <div key={idx} className="ml-2">• {formatDate(date)}</div>
                        ))}
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">希望店舗</div>
                        {selectedRequest.preferred_stores?.map((store, idx) => (
                          <div key={idx} className="ml-2">• {store}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GM対応状況 */}
                {selectedRequest.gm_responses && selectedRequest.gm_responses.length > 0 && (
                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-3">GM対応状況</h3>
                    <div className="space-y-3">
                      {selectedRequest.gm_responses.map((response: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                          {response.available ? (
                            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-lg">{response.gm_name}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {response.available ? '✓ 対応可能' : '✗ 対応不可'}
                              {response.preferred_date && ` - 希望日: ${formatDate(response.preferred_date)}`}
                            </div>
                            {response.notes && (
                              <div className="mt-2 text-sm p-2 bg-background rounded">
                                {response.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 顧客メモ */}
                {selectedRequest.notes && (
                  <div className="pt-6 border-t">
                    <h3 className="font-semibold mb-2">顧客からのメモ</h3>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                    </div>
                  </div>
                )}

                {/* 却下理由入力 */}
                <div className="pt-6 border-t">
                  <h3 className="font-semibold mb-3">却下する場合は理由を入力してください</h3>
                  <Textarea
                    placeholder="却下理由を入力..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                  />
                </div>

                {/* アクションボタン */}
                <div className="flex gap-3 pt-6 border-t">
                  <Button
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={submitting}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    承認する
                  </Button>
                  <Button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={submitting || !rejectionReason.trim()}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    却下する
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


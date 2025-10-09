import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Search, Calendar, Clock, User, DollarSign, Filter, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Reservation } from '@/types'

// 予約管理画面用の拡張型
interface ReservationWithDetails extends Reservation {
  customer_name?: string
  event_date?: string
  event_time?: string
  scenario_title?: string
  store_name?: string
}

export function ReservationManagement() {
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all') // 通常予約 or 貸切リクエスト
  const [isLoading, setIsLoading] = useState(true)
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set())

  // 予約データを読み込む
  useEffect(() => {
    loadReservations()
  }, [])

  const loadReservations = async () => {
    try {
      setIsLoading(true)
      
      // Supabaseから予約データを取得
      // 貸切リクエストは先着順で優先されるため、古い順にソート
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id (title),
          stores:store_id (name)
        `)
        .order('priority', { ascending: false })  // 優先度が高い順
        .order('created_at', { ascending: true })  // 次に先着順（古い順）
      
      if (error) {
        console.error('予約データ取得エラー:', error)
        setReservations([])
        return
      }
      
      // データを整形
      const formattedData: ReservationWithDetails[] = (data || []).map((reservation: any) => {
        // requested_datetimeから日付と時刻を取得
        let eventDate = ''
        let eventTime = ''
        
        if (reservation.requested_datetime) {
          const dateStr = reservation.requested_datetime
          // 'YYYY-MM-DD HH:MM:SS' または 'YYYY-MM-DDTHH:MM:SS' 形式に対応
          const parts = dateStr.split('T')
          if (parts.length === 2) {
            eventDate = parts[0]
            eventTime = parts[1].slice(0, 5)
          } else {
            const spaceParts = dateStr.split(' ')
            if (spaceParts.length >= 2) {
              eventDate = spaceParts[0]
              eventTime = spaceParts[1].slice(0, 5)
            }
          }
        }
        
        return {
          ...reservation,
          scenario_title: reservation.scenarios?.title || reservation.title,
          store_name: reservation.stores?.name || '',
          event_date: eventDate,
          event_time: eventTime
        }
      })
      
      setReservations(formattedData)
    } catch (error) {
      console.error('予約データの読み込みエラー:', error)
      setReservations([])
    } finally {
      setIsLoading(false)
    }
  }

  // フィルタリング処理
  const filteredReservations = reservations.filter(reservation => {
    const matchesSearch = 
      reservation.reservation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reservation.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (reservation.scenario_title?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || reservation.status === statusFilter
    const matchesPayment = paymentFilter === 'all' || reservation.payment_status === paymentFilter
    const matchesType = typeFilter === 'all' || 
      (typeFilter === 'private' && reservation.reservation_source === 'web_private') ||
      (typeFilter === 'regular' && reservation.reservation_source !== 'web_private')
    
    return matchesSearch && matchesStatus && matchesPayment && matchesType
  })

  // ステータスバッジのスタイル
  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    const labels = {
      pending: '保留中',
      confirmed: '確定',
      completed: '完了',
      cancelled: 'キャンセル'
    }
    return (
      <Badge variant="outline" className={`${styles[status as keyof typeof styles]} font-normal`}>
        {labels[status as keyof typeof labels]}
      </Badge>
    )
  }

  // 展開/折りたたみのトグル
  const toggleExpanded = (reservationId: string) => {
    const newExpanded = new Set(expandedReservations)
    if (newExpanded.has(reservationId)) {
      newExpanded.delete(reservationId)
    } else {
      newExpanded.add(reservationId)
    }
    setExpandedReservations(newExpanded)
  }

  // candidate_datetimesから候補日時を抽出して表示用文字列に変換
  const extractCandidateDates = (candidateDatetimes: any): string[] => {
    if (!candidateDatetimes || !candidateDatetimes.candidates) return []
    
    return candidateDatetimes.candidates.map((candidate: any) => {
      const dateObj = new Date(candidate.date)
      const year = dateObj.getFullYear()
      const month = dateObj.getMonth() + 1
      const day = dateObj.getDate()
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      const weekday = weekdays[dateObj.getDay()]
      
      return `候補${candidate.order}: ${year}年${month}月${day}日(${weekday}) ${candidate.timeSlot} ${candidate.startTime}-${candidate.endTime}`
    })
  }

  // 支払いステータスバッジのスタイル
  const getPaymentBadge = (status: string) => {
    const styles = {
      pending: 'bg-orange-100 text-orange-800',
      paid: 'bg-green-100 text-green-800',
      refunded: 'bg-gray-100 text-gray-800'
    }
    const labels = {
      pending: '未払い',
      paid: '支払済',
      refunded: '返金済'
    }
    return (
      <Badge variant="outline" className={`${styles[status as keyof typeof styles]} font-normal`}>
        {labels[status as keyof typeof labels]}
      </Badge>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="reservations" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">予約管理</h1>
              <p className="text-muted-foreground mt-1">
                予約の確認・編集・キャンセルができます
              </p>
            </div>
            <Button>
              <Calendar className="w-4 h-4 mr-2" />
              新規予約作成
            </Button>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>総予約数</CardDescription>
                <CardTitle className="text-3xl">{reservations.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>貸切希望</CardDescription>
                <CardTitle className="text-3xl text-purple-600">
                  {reservations.filter(r => r.reservation_source === 'web_private').length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>確定済み</CardDescription>
                <CardTitle className="text-3xl text-blue-600">
                  {reservations.filter(r => r.status === 'confirmed').length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>保留中</CardDescription>
                <CardTitle className="text-3xl text-yellow-600">
                  {reservations.filter(r => r.status === 'pending').length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>未払い</CardDescription>
                <CardTitle className="text-3xl text-orange-600">
                  {reservations.filter(r => r.payment_status === 'pending').length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* 検索・フィルター */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">検索・フィルター</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* 検索 */}
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="予約番号、顧客名、シナリオで検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* 予約タイプフィルター */}
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="予約タイプ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="regular">通常予約</SelectItem>
                    <SelectItem value="private">貸切希望</SelectItem>
                  </SelectContent>
                </Select>

                {/* ステータスフィルター */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="ステータス" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべてのステータス</SelectItem>
                    <SelectItem value="pending">保留中</SelectItem>
                    <SelectItem value="confirmed">確定</SelectItem>
                    <SelectItem value="completed">完了</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>

                {/* 支払いステータスフィルター */}
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="支払い状況" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての支払い状況</SelectItem>
                    <SelectItem value="pending">未払い</SelectItem>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="refunded">返金済</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 予約一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">予約一覧</CardTitle>
              <CardDescription>
                {filteredReservations.length}件の予約
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">データを読み込み中...</p>
                </div>
              ) : filteredReservations.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">予約が見つかりません</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* ヘッダー行 */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/30 rounded-md font-medium text-sm">
                    <div className="col-span-2">予約番号</div>
                    <div className="col-span-1">顧客名</div>
                    <div className="col-span-2">公演日時</div>
                    <div className="col-span-1">予約日時</div>
                    <div className="col-span-2">シナリオ</div>
                    <div className="col-span-1">人数</div>
                    <div className="col-span-1">金額</div>
                    <div className="col-span-1">ステータス</div>
                    <div className="col-span-1">支払い</div>
                  </div>

                  {/* データ行 */}
                  {filteredReservations.map((reservation) => {
                    const isPrivate = reservation.reservation_source === 'web_private'
                    const isExpanded = expandedReservations.has(reservation.id)
                    const candidateDates = isPrivate ? extractCandidateDates(reservation.candidate_datetimes) : []
                    
                    return (
                    <Card 
                      key={reservation.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => isPrivate && toggleExpanded(reservation.id)}
                    >
                      <CardContent className="p-4">
                        <div className="grid grid-cols-12 gap-4 items-center text-sm">
                          <div className="col-span-2">
                            <div className="flex items-center gap-1">
                              <div className="font-mono text-xs">{reservation.reservation_number}</div>
                              {isPrivate && candidateDates.length > 1 && (
                                isExpanded ? <ChevronUp className="w-3 h-3 text-purple-600" /> : <ChevronDown className="w-3 h-3 text-purple-600" />
                              )}
                            </div>
                            {reservation.reservation_source === 'web_private' && (
                              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] mt-1">
                                貸切希望 ({candidateDates.length}件)
                              </Badge>
                            )}
                          </div>
                          <div className="col-span-1 flex items-center gap-1">
                            <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{reservation.customer_name}</span>
                          </div>
                          <div className="col-span-2">
                            <div className="flex items-center gap-1 mb-0.5">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs">{reservation.event_date || '-'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs">{reservation.event_time || '-'}</span>
                            </div>
                          </div>
                          <div className="col-span-1">
                            <div className="text-xs text-muted-foreground">
                              {reservation.created_at ? new Date(reservation.created_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {reservation.created_at ? new Date(reservation.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="truncate">{reservation.scenario_title}</div>
                            <div className="text-xs text-muted-foreground truncate">{reservation.store_name}</div>
                          </div>
                          <div className="col-span-1">
                            {reservation.participant_count}名
                          </div>
                          <div className="col-span-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs">{reservation.total_price?.toLocaleString() || 0}円</span>
                          </div>
                          <div className="col-span-1">
                            {getStatusBadge(reservation.status)}
                          </div>
                          <div className="col-span-1">
                            {getPaymentBadge(reservation.payment_status)}
                          </div>
                        </div>
                        
                        {/* 貸切リクエストの詳細を展開表示 */}
                        {isPrivate && isExpanded && (
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {/* 希望店舗 */}
                            <div>
                              <div className="text-sm font-medium mb-2 text-purple-800">希望店舗</div>
                              <div className="flex flex-wrap gap-1 pl-4">
                                {reservation.candidate_datetimes?.requestedStores && reservation.candidate_datetimes.requestedStores.length > 0 ? (
                                  reservation.candidate_datetimes.requestedStores.map((store: any, index: number) => (
                                    <Badge key={index} variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                                      {store.storeName}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
                                    すべて
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* 候補日時 */}
                            {candidateDates.length > 0 && (
                              <div>
                                <div className="text-sm font-medium mb-2 text-purple-800">候補日時一覧</div>
                                <div className="space-y-1">
                                  {candidateDates.map((candidate, index) => (
                                    <div key={index} className="text-xs text-muted-foreground pl-4">
                                      {candidate}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* お客様からのご要望 */}
                            {reservation.customer_notes && (
                              <div>
                                <div className="text-sm font-medium mb-2 text-purple-800">お客様からのご要望</div>
                                <div className="text-xs text-muted-foreground pl-4 whitespace-pre-wrap">
                                  {reservation.customer_notes}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


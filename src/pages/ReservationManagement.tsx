import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Search, Calendar, User, DollarSign, Filter } from 'lucide-react'
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
  const [isLoading, setIsLoading] = useState(true)

  // 予約データを読み込む
  useEffect(() => {
    loadReservations()
  }, [])

  const loadReservations = async () => {
    try {
      setIsLoading(true)
      // TODO: API実装後に置き換え
      // const data = await reservationApi.getAll()
      
      // モックデータ
      const mockData: ReservationWithDetails[] = [
        {
          id: '1',
          reservation_number: 'RES-2025-0001',
          customer_id: 'customer-1',
          customer_name: '山田太郎',
          schedule_event_id: 'event-1',
          event_date: '2025-10-12',
          event_time: '14:00',
          scenario_title: '人狼村の悲劇',
          store_name: '高田馬場店',
          title: '人狼村の悲劇',
          requested_datetime: '2025-10-12T14:00:00Z',
          duration: 240,
          participant_count: 6,
          base_price: 18000,
          options_price: 0,
          total_price: 18000,
          discount_amount: 0,
          final_price: 18000,
          payment_status: 'paid',
          status: 'confirmed',
          reservation_source: 'web',
          created_at: '2025-10-01T10:00:00Z',
          updated_at: '2025-10-01T10:00:00Z'
        },
        {
          id: '2',
          reservation_number: 'RES-2025-0002',
          customer_id: 'customer-2',
          customer_name: '佐藤花子',
          schedule_event_id: 'event-2',
          event_date: '2025-10-15',
          event_time: '19:00',
          scenario_title: '密室の謎',
          store_name: '別館1',
          title: '密室の謎',
          requested_datetime: '2025-10-15T19:00:00Z',
          duration: 180,
          participant_count: 4,
          base_price: 12000,
          options_price: 0,
          total_price: 12000,
          discount_amount: 0,
          final_price: 12000,
          payment_status: 'pending',
          status: 'pending',
          reservation_source: 'web',
          created_at: '2025-10-02T15:30:00Z',
          updated_at: '2025-10-02T15:30:00Z'
        }
      ]
      
      setReservations(mockData)
    } catch (error) {
      console.error('予約データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // フィルタリング処理
  const filteredReservations = reservations.filter(reservation => {
    const matchesSearch = 
      reservation.reservation_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reservation.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reservation.scenario_title.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || reservation.status === statusFilter
    const matchesPayment = paymentFilter === 'all' || reservation.payment_status === paymentFilter
    
    return matchesSearch && matchesStatus && matchesPayment
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>総予約数</CardDescription>
                <CardTitle className="text-3xl">{reservations.length}</CardTitle>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <div className="col-span-2">顧客名</div>
                    <div className="col-span-2">公演日時</div>
                    <div className="col-span-2">シナリオ</div>
                    <div className="col-span-1">人数</div>
                    <div className="col-span-1">金額</div>
                    <div className="col-span-1">ステータス</div>
                    <div className="col-span-1">支払い</div>
                  </div>

                  {/* データ行 */}
                  {filteredReservations.map((reservation) => (
                    <Card 
                      key={reservation.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-4">
                        <div className="grid grid-cols-12 gap-4 items-center text-sm">
                          <div className="col-span-2 font-mono text-xs">
                            {reservation.reservation_number}
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            {reservation.customer_name}
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <div>
                              <div>{reservation.event_date}</div>
                              <div className="text-xs text-muted-foreground">{reservation.event_time}</div>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div>{reservation.scenario_title}</div>
                            <div className="text-xs text-muted-foreground">{reservation.store_name}</div>
                          </div>
                          <div className="col-span-1">
                            {reservation.participant_count}名
                          </div>
                          <div className="col-span-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3 text-muted-foreground" />
                            {reservation.total_price.toLocaleString()}円
                          </div>
                          <div className="col-span-1">
                            {getStatusBadge(reservation.status)}
                          </div>
                          <div className="col-span-1">
                            {getPaymentBadge(reservation.payment_status)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


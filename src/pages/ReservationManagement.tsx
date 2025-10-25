import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Calendar, Search, CheckCircle, Settings } from 'lucide-react'

// サイドバーのメニュー項目定義
const RESERVATION_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'reservation-list', label: '予約一覧', icon: Calendar, description: 'すべての予約を表示' },
  { id: 'search', label: '検索', icon: Search, description: '予約を検索' },
  { id: 'status', label: 'ステータス管理', icon: CheckCircle, description: '予約ステータス' },
  { id: 'settings', label: '設定', icon: Settings, description: '表示設定' }
]
import { Search, Calendar, Clock, User, DollarSign, Filter, ChevronDown, ChevronUp } from 'lucide-react'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useReservationData } from '@/hooks/useReservationData'

export function ReservationManagement() {
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState('reservation-list')
  
  // フィルタ状態（sessionStorageと同期）
  const [searchTerm, setSearchTerm] = useSessionState('reservationSearchTerm', '')
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')

  // 予約データとフィルタリング
  const { reservations, isLoading } = useReservationData({
    searchTerm,
    statusFilter,
    paymentFilter,
    typeFilter
  })

  // スクロール位置の保存と復元
  useScrollRestoration({ pageKey: 'reservation', isLoading })

  // ステータスバッジ
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      confirmed: { label: '確定', variant: 'default' },
      pending: { label: '保留', variant: 'secondary' },
      cancelled: { label: 'キャンセル', variant: 'destructive' },
      pending_gm: { label: 'GM確認待ち', variant: 'secondary' },
      gm_confirmed: { label: 'GM確定', variant: 'default' },
      pending_store: { label: '店舗確認待ち', variant: 'secondary' }
    }
    const config = statusConfig[status] || { label: status, variant: 'outline' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  // 支払いステータスバッジ
  const getPaymentBadge = (status: string) => {
    const paymentConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
      paid: { label: '支払済', variant: 'default' },
      unpaid: { label: '未払い', variant: 'destructive' },
      pending: { label: '保留', variant: 'secondary' }
    }
    const config = paymentConfig[status] || { label: status, variant: 'secondary' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  // 展開/折りたたみ
  const toggleExpanded = (reservationId: string) => {
    setExpandedReservations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(reservationId)) {
        newSet.delete(reservationId)
      } else {
        newSet.add(reservationId)
      }
      return newSet
    })
  }

  // 候補日時の抽出
  const extractCandidateDates = (candidateDatetimes: any): string[] => {
    if (!candidateDatetimes || !candidateDatetimes.candidates) return []
    return candidateDatetimes.candidates.map((c: any) => {
      const date = new Date(c.date)
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
      return `${dateStr} ${c.timeSlot} ${c.startTime}-${c.endTime}`
    })
  }

  // 統計
  const stats = {
    total: reservations.length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    pending: reservations.filter(r => r.status === 'pending' || r.status === 'pending_gm' || r.status === 'gm_confirmed' || r.status === 'pending_store').length,
    unpaid: reservations.filter(r => r.payment_status === 'unpaid').length
  }

  if (isLoading) {
    return (
      <AppLayout
        currentPage="reservation"
        sidebar={
          <UnifiedSidebar
            title="予約管理"
            mode="list"
            menuItems={RESERVATION_MENU_ITEMS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        }
        stickyLayout={true}
      >
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      currentPage="reservation"
      sidebar={
        <UnifiedSidebar
          title="予約管理"
          mode="list"
          menuItems={RESERVATION_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-6 py-6"
      stickyLayout={true}
    >
      <div className="space-y-6">
        <div></div>

        {/* 統計サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>総予約数</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>確定済み</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.confirmed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>保留中</CardDescription>
              <CardTitle className="text-3xl text-yellow-600">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>未払い</CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.unpaid}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* フィルタ */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              <CardTitle>フィルター</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">検索</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="予約番号、顧客名..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">ステータス</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="confirmed">確定</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">支払い状況</label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="unpaid">未払い</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">予約種別</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="web">Web予約</SelectItem>
                    <SelectItem value="web_private">貸切リクエスト</SelectItem>
                    <SelectItem value="phone">電話予約</SelectItem>
                    <SelectItem value="walk_in">当日受付</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 予約一覧 */}
        <div className="space-y-4">
          {reservations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                該当する予約がありません
              </CardContent>
            </Card>
          ) : (
            reservations.map((reservation) => {
              const isExpanded = expandedReservations.has(reservation.id)
              return (
                <Card key={reservation.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-sm text-muted-foreground">
                            #{reservation.reservation_number}
                          </span>
                          {getStatusBadge(reservation.status)}
                          {getPaymentBadge(reservation.payment_status || 'unpaid')}
                          {reservation.reservation_source === 'web_private' && (
                            <Badge variant="outline">貸切</Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{reservation.scenario_title}</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span>{reservation.customer_name}</span>
                          </div>
                          {reservation.event_date && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span>{reservation.event_date}</span>
                            </div>
                          )}
                          {reservation.event_time && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span>{reservation.event_time}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                            <span>¥{reservation.total_amount?.toLocaleString() || '0'}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleExpanded(reservation.id)}
                        className="ml-4 p-2 hover:bg-gray-100 rounded"
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3 text-sm">
                        {reservation.reservation_source === 'web_private' && reservation.candidate_datetimes && (
                          <div>
                            <span className="font-medium">候補日時：</span>
                            <ul className="mt-1 ml-4 list-disc">
                              {extractCandidateDates(reservation.candidate_datetimes).map((date, i) => (
                                <li key={i}>{date}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {reservation.customer_notes && (
                          <div>
                            <span className="font-medium">備考：</span>
                            <p className="mt-1">{reservation.customer_notes}</p>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          作成日時: {new Date(reservation.created_at).toLocaleString('ja-JP')}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </AppLayout>
  )
}

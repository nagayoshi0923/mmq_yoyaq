import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { AppLayout } from '@/components/layout/AppLayout'
import { Calendar, Search, CheckCircle, Settings, Clock, User, DollarSign, Filter, ChevronDown, ChevronUp, Download, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useReservationData } from '@/hooks/useReservationData'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export function ReservationManagement() {
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set())
  
  // フィルタ状態（sessionStorageと同期）
  const [searchTerm, setSearchTerm] = useSessionState('reservationSearchTerm', '')
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')
  const [isFilterOpen, setIsFilterOpen] = useState(false)

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
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline', className?: string }> = {
      confirmed: { label: '確定', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
      pending: { label: '保留', variant: 'secondary', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' },
      cancelled: { label: 'キャンセル', variant: 'destructive' },
      pending_gm: { label: 'GM確認待ち', variant: 'secondary', className: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
      gm_confirmed: { label: 'GM確定', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
      pending_store: { label: '店舗確認待ち', variant: 'secondary', className: 'bg-purple-100 text-purple-800 hover:bg-purple-200' }
    }
    const config = statusConfig[status] || { label: status, variant: 'outline' }
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
  }

  // 支払いステータスバッジ
  const getPaymentBadge = (status: string) => {
    const paymentConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive', className?: string }> = {
      paid: { label: '支払済', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
      unpaid: { label: '未払い', variant: 'destructive', className: 'bg-red-100 text-red-800 hover:bg-red-200' },
      pending: { label: '保留', variant: 'secondary' }
    }
    const config = paymentConfig[status] || { label: status, variant: 'secondary' }
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
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

  // 統計
  const stats = useMemo(() => ({
    total: reservations.length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    pending: reservations.filter(r => r.status === 'pending' || r.status === 'pending_gm' || r.status === 'gm_confirmed' || r.status === 'pending_store').length,
    unpaid: reservations.filter(r => r.payment_status === 'unpaid').length
  }), [reservations])

  if (isLoading) {
    return (
      <AppLayout currentPage="reservations">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            読み込み中...
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout 
      currentPage="reservations"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-4 sm:space-y-6">
        {/* ヘッダーエリア */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">予約管理</h1>
              <p className="text-xs text-muted-foreground">全{stats.total}件の予約</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton topic="reservation" label="予約管理マニュアル" />
            <Button variant="outline" size="sm" className="h-9">
              <Download className="mr-2 h-4 w-4" />
              CSV出力
            </Button>
          </div>
        </div>

        {/* 統計サマリー（ダッシュボード風デザイン） */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-4 text-center">
              <div className="text-xs text-muted-foreground mb-1">総予約数</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50/50 border-green-100">
            <CardContent className="p-4 text-center">
              <div className="text-xs text-green-700 mb-1">確定済み</div>
              <div className="text-2xl font-bold text-green-700">{stats.confirmed}</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50/50 border-yellow-100">
            <CardContent className="p-4 text-center">
              <div className="text-xs text-yellow-700 mb-1">対応待ち</div>
              <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50/50 border-red-100">
            <CardContent className="p-4 text-center">
              <div className="text-xs text-red-700 mb-1">未払い</div>
              <div className="text-2xl font-bold text-red-700">{stats.unpaid}</div>
            </CardContent>
          </Card>
        </div>

        {/* フィルター＆検索 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="予約番号、顧客名、シナリオ名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="sm:w-auto w-full flex items-center justify-center gap-2"
          >
            <Filter className="h-4 w-4" />
            フィルター
            {(statusFilter !== 'all' || paymentFilter !== 'all' || typeFilter !== 'all') && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">!</Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* 詳細フィルター（開閉式） */}
        {isFilterOpen && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">ステータス</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background">
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
              <div className="space-y-2">
                <Label className="text-xs">支払い状況</Label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="bg-background">
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
              <div className="space-y-2">
                <Label className="text-xs">予約種別</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-background">
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
            </CardContent>
          </Card>
        )}

        {/* 予約リスト */}
        <div className="space-y-3">
          {reservations.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>該当する予約が見つかりませんでした</p>
                <Button 
                  variant="link" 
                  onClick={() => {
                    setSearchTerm('')
                    setStatusFilter('all')
                    setPaymentFilter('all')
                    setTypeFilter('all')
                  }}
                >
                  条件をクリア
                </Button>
              </CardContent>
            </Card>
          ) : (
            reservations.map((reservation) => {
              const isExpanded = expandedReservations.has(reservation.id)
              return (
                <Card key={reservation.id} className={`transition-all duration-200 ${isExpanded ? 'ring-2 ring-primary/10' : 'hover:shadow-md'}`}>
                  <CardContent className="p-0">
                    {/* メイン行（常に表示） */}
                    <div 
                      className="p-3 sm:p-4 cursor-pointer"
                      onClick={() => toggleExpanded(reservation.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        {/* 左側：基本情報 */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              #{reservation.reservation_number}
                            </span>
                            {getStatusBadge(reservation.status)}
                            {getPaymentBadge(reservation.payment_status || 'unpaid')}
                            {reservation.reservation_source === 'web_private' && (
                              <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 bg-purple-50">貸切</Badge>
                            )}
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                            <h3 className="font-bold text-base sm:text-lg leading-tight">
                              {reservation.scenario_title}
                            </h3>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              <span className="font-medium text-foreground">{reservation.customer_name}</span>
                              <span>様</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {reservation.event_date && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-primary/70" />
                                <span className="font-medium text-foreground">
                                  {format(new Date(reservation.event_date), 'M/d(EEE)', { locale: ja })}
                                </span>
                              </div>
                            )}
                            {reservation.event_time && (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-primary/70" />
                                <span>{reservation.event_time}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <DollarSign className="h-4 w-4 text-primary/70" />
                              <span>¥{reservation.total_amount?.toLocaleString() || '0'}</span>
                            </div>
                          </div>
                        </div>

                        {/* 右側：アクション（PCでは右端、SPでは下部） */}
                        <div className="flex items-center justify-between sm:justify-end gap-2 mt-2 sm:mt-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                          <span className="text-xs text-muted-foreground sm:hidden">詳細を表示</span>
                          <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 詳細エリア（展開時のみ） */}
                    {isExpanded && (
                      <div className="bg-muted/30 border-t px-3 py-3 sm:px-4 sm:py-4 space-y-4 text-sm animate-in slide-in-from-top-2 duration-200">
                        {reservation.reservation_source === 'web_private' && reservation.candidate_datetimes && (
                          <div className="bg-background p-3 rounded border">
                            <span className="font-medium text-muted-foreground block mb-1">候補日時：</span>
                            <ul className="list-disc list-inside space-y-0.5">
                              {reservation.candidate_datetimes.candidates?.map((c: any, i: number) => (
                                <li key={i}>
                                  {format(new Date(c.date), 'M/d(EEE)', { locale: ja })} {c.startTime}-{c.endTime}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {reservation.customer_notes && (
                          <div className="bg-yellow-50/50 p-3 rounded border border-yellow-100">
                            <span className="font-medium text-yellow-800 block mb-1 flex items-center gap-1">
                              <MoreHorizontal className="h-3 w-3" /> 備考
                            </span>
                            <p className="text-yellow-900">{reservation.customer_notes}</p>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                          <span>作成: {format(new Date(reservation.created_at), 'yyyy/MM/dd HH:mm')}</span>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            詳細編集ページへ
                          </Button>
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

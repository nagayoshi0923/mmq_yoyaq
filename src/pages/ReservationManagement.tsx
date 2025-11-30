import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { 
  Calendar, Search, Clock, User, DollarSign, Filter, 
  ChevronDown, Download, TrendingUp, AlertCircle, 
  CalendarDays, Globe, Phone, MonitorCheck, AlertTriangle
} from 'lucide-react'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useReservationData, ReservationWithDetails } from '@/hooks/useReservationData'
import { useReservationStats } from '@/hooks/useReservationStats'
import { format, isPast, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'

// 異常検知ロジック
const getReservationAlerts = (reservation: ReservationWithDetails) => {
  const alerts = []
  const eventDate = reservation.event_date ? new Date(reservation.event_date) : null
  const isEventPast = eventDate && isPast(eventDate)

  // 1. 過去の日付なのに保留中
  if (isEventPast && ['pending', 'pending_gm', 'pending_store'].includes(reservation.status)) {
    alerts.push({ type: 'warning', message: '過去の未処理予約' })
  }

  // 2. 確定済みだがスケジュールIDがない（貸切などでスケジュール連携漏れの可能性）
  // 注: 現状の型定義には schedule_event_id がないため、event_date があるかで簡易判定
  if (reservation.status === 'confirmed' && !reservation.event_date && reservation.reservation_source === 'web_private') {
    alerts.push({ type: 'error', message: '日時未確定の確定予約' })
  }

  // 3. 未払い（キャンセル以外）
  if (reservation.payment_status === 'unpaid' && reservation.status !== 'cancelled') {
    alerts.push({ type: 'payment', message: '未払い' })
  }

  return alerts
}

export function ReservationManagement() {
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set())
  
  // フィルタ状態
  const [searchTerm, setSearchTerm] = useSessionState('reservationSearchTerm', '')
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')
  const [alertFilter, setAlertFilter] = useSessionState('reservationAlertFilter', 'all') // 新規: アラートフィルター
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // データ取得
  const { reservations, isLoading: isListLoading } = useReservationData({
    searchTerm,
    statusFilter,
    paymentFilter,
    typeFilter
  })

  const { stats, isLoading: isStatsLoading } = useReservationStats()

  useScrollRestoration({ pageKey: 'reservation', isLoading: isListLoading })

  // グルーピングとアラートフィルタリング処理
  // ... (省略なしで実装)
  const groupedReservations = useMemo(() => { // useMemoの中身は変更なし
    let filtered = reservations
    if (alertFilter === 'alert_only') {
      filtered = reservations.filter(r => getReservationAlerts(r).length > 0)
    }

    const groups: Record<string, ReservationWithDetails[]> = {}
    const noDateGroup: ReservationWithDetails[] = []

    filtered.forEach(r => {
      if (r.event_date && isValid(new Date(r.event_date))) {
        const dateKey = r.event_date
        if (!groups[dateKey]) groups[dateKey] = []
        groups[dateKey].push(r)
      } else {
        noDateGroup.push(r)
      }
    })

    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

    return { sortedDates, groups, noDateGroup }
  }, [reservations, alertFilter])

  // UIヘルパー関数群
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
    return <Badge variant={config.variant} className={`h-4 px-1.5 text-[10px] ${config.className}`}>{config.label}</Badge>
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'web':
      case 'web_private':
        return <Globe className="h-3 w-3 text-blue-500" />
      case 'phone':
        return <Phone className="h-3 w-3 text-green-500" />
      case 'walk_in':
        return <User className="h-3 w-3 text-orange-500" />
      default:
        return <MonitorCheck className="h-3 w-3 text-gray-500" />
    }
  }

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      web: 'Web',
      web_private: '貸切',
      phone: '電話',
      walk_in: '当日',
      external: '外部'
    }
    return labels[source] || source
  }

  const toggleExpanded = (id: string) => {
    setExpandedReservations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const isLoading = isListLoading || isStatsLoading

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
    <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-1 py-2 sm:px-4 sm:py-4" className="mx-auto">
      <div className="space-y-2">
        <PageHeader
          className="!mb-1"
          title={
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-base font-bold">予約確認</span>
            </div>
          }
          description="予約データとスケジュールの整合性を確認"
        >
          <HelpButton topic="reservation" label="予約管理マニュアル" />
          <Button variant="outline" size="sm" className="h-7 text-xs px-2">
            <Download className="mr-1 h-3 w-3" />
            <span className="hidden sm:inline">CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        </PageHeader>

        {/* 統計サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="bg-card/50 relative overflow-hidden shadow-sm border-none bg-muted/20">
             <div className="absolute top-0 right-0 p-1 opacity-5"><TrendingUp className="w-6 h-6" /></div>
            <CardContent className="p-2">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 leading-none mb-1">今月</div>
              <div className="flex items-baseline gap-1"><div className="text-lg font-bold leading-none">{stats.monthlyTotal}</div><div className="text-[9px] text-muted-foreground">件</div></div>
              <div className="text-[9px] text-muted-foreground mt-0.5">¥{stats.monthlyRevenue.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50/30 border-none relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1 opacity-10"><Clock className="w-6 h-6 text-green-600" /></div>
            <CardContent className="p-2">
              <div className="text-[10px] text-green-700 font-medium leading-none mb-1">確定済</div>
              <div className="flex items-baseline gap-1"><div className="text-lg font-bold text-green-700 leading-none">{stats.confirmed}</div><div className="text-[9px] text-green-600/70">件</div></div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50/30 border-none relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1 opacity-10"><AlertCircle className="w-6 h-6 text-yellow-600" /></div>
            <CardContent className="p-2">
              <div className="text-[10px] text-yellow-700 font-medium leading-none mb-1">要対応</div>
              <div className="flex items-baseline gap-1"><div className="text-lg font-bold text-yellow-700 leading-none">{stats.pending}</div><div className="text-[9px] text-yellow-600/70">件</div></div>
            </CardContent>
          </Card>
          <Card className="bg-red-50/30 border-none relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1 opacity-10"><DollarSign className="w-6 h-6 text-red-600" /></div>
            <CardContent className="p-2">
              <div className="text-[10px] text-red-700 font-medium leading-none mb-1">未払い</div>
              <div className="flex items-baseline gap-1"><div className="text-lg font-bold text-red-700 leading-none">{stats.unpaid}</div><div className="text-[9px] text-red-600/70">件</div></div>
            </CardContent>
          </Card>
        </div>

        {/* フィルター＆検索 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input placeholder="検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-7 h-8 text-xs bg-background" />
          </div>
          <Button variant="outline" onClick={() => setIsFilterOpen(!isFilterOpen)} className={`h-8 text-xs px-2 sm:w-auto flex items-center justify-center gap-1 ${alertFilter !== 'all' ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : ''}`}>
            <Filter className="h-3 w-3" />
            <span className="hidden sm:inline">{alertFilter !== 'all' ? '要確認のみ' : 'フィルター'}</span>
            {(statusFilter !== 'all' || paymentFilter !== 'all' || typeFilter !== 'all' || alertFilter !== 'all') && (
              <Badge variant="secondary" className="ml-0.5 h-3.5 px-1 text-[9px]">!</Badge>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {isFilterOpen && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> 要確認</Label>
                <Select value={alertFilter} onValueChange={setAlertFilter}>
                  <SelectTrigger className="bg-white border-red-200 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="alert_only" className="text-red-600 font-medium">警告あり</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">ステータス</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background h-7 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="confirmed">確定</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">支払い</Label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="bg-background h-7 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="unpaid">未払い</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">ソース</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-background h-7 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="web_private">貸切</SelectItem>
                    <SelectItem value="phone">電話</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 予約リスト（日付グルーピング） */}
        <div className="space-y-2">
          {groupedReservations.sortedDates.length === 0 && groupedReservations.noDateGroup.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border rounded-md border-dashed bg-muted/10">
              <Search className="h-6 w-6 mx-auto mb-1 opacity-20" />
              <p className="text-xs">該当なし</p>
              <Button variant="link" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setPaymentFilter('all'); setTypeFilter('all'); setAlertFilter('all'); }} className="text-[10px] h-auto p-0">条件クリア</Button>
            </div>
          ) : (
            <>
              {/* 日付未定グループ */}
              {groupedReservations.noDateGroup.length > 0 && (
                <div className="space-y-1">
                  <h3 className="font-bold text-muted-foreground flex items-center gap-2 px-1 text-xs">
                    <CalendarDays className="h-3 w-3" /> 未定
                    <span className="text-[10px] bg-muted px-1 rounded-full">{groupedReservations.noDateGroup.length}</span>
                  </h3>
                  <div className="grid gap-1">
                    {groupedReservations.noDateGroup.map(reservation => (
                      <ReservationCard key={reservation.id} reservation={reservation} isExpanded={expandedReservations.has(reservation.id)} toggleExpanded={toggleExpanded} getStatusBadge={getStatusBadge} getSourceIcon={getSourceIcon} getSourceLabel={getSourceLabel} />
                    ))}
                  </div>
                </div>
              )}

              {/* 日付別グループ */}
              {groupedReservations.sortedDates.map(dateKey => (
                <div key={dateKey} className="space-y-1">
                  <h3 className={`font-bold flex items-center gap-2 px-1 sticky top-[50px] z-10 py-1 bg-background/95 backdrop-blur border-b w-full text-xs ${isPast(new Date(dateKey)) ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {/* @ts-ignore */}
                    {format(new Date(dateKey), 'M/d(EEE)', { locale: ja })}
                    <span className="text-[10px] bg-muted px-1.5 rounded-full font-normal">{groupedReservations.groups[dateKey].length}</span>
                  </h3>
                  <div className="grid gap-1">
                    {groupedReservations.groups[dateKey].map(reservation => (
                      <ReservationCard key={reservation.id} reservation={reservation} isExpanded={expandedReservations.has(reservation.id)} toggleExpanded={toggleExpanded} getStatusBadge={getStatusBadge} getSourceIcon={getSourceIcon} getSourceLabel={getSourceLabel} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// サブコンポーネント: 予約カード
function ReservationCard({ reservation, isExpanded, toggleExpanded, getStatusBadge, getSourceIcon, getSourceLabel }: any) {
  const alerts = getReservationAlerts(reservation)
  const hasAlerts = alerts.length > 0

  return (
    <div className={`bg-card border rounded transition-colors ${isExpanded ? 'ring-1 ring-primary/20' : 'hover:bg-accent/5'} ${hasAlerts ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-transparent'}`}>
      <div className="flex items-center p-1.5 cursor-pointer gap-2" onClick={() => toggleExpanded(reservation.id)}>
        {/* 左側: 時間・ソース */}
        <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 gap-0.5">
          <div className="font-mono font-bold text-sm leading-none text-foreground/90">
            {reservation.event_time || '--:--'}
          </div>
          <div className="flex items-center justify-center w-full">
             {getSourceIcon(reservation.reservation_source)}
          </div>
        </div>

        {/* メイン情報 */}
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-x-2 items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h4 className="font-bold text-xs leading-tight truncate">{reservation.scenario_title}</h4>
              {hasAlerts && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate">
              <span className="font-medium text-foreground/80">{reservation.customer_name}</span>
              <span className="font-mono opacity-70">#{reservation.reservation_number.slice(-4)}</span>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-0.5">
            <div className="scale-90 origin-right">{getStatusBadge(reservation.status)}</div>
            <div className={`text-[10px] font-mono ${reservation.payment_status === 'unpaid' ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
              ¥{(reservation.total_amount || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* 展開アイコン */}
        <div className="w-4 flex justify-center text-muted-foreground/50">
          <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* 展開エリア */}
      {isExpanded && (
        <div className="bg-muted/30 border-t px-3 py-2 text-xs animate-in slide-in-from-top-1">
          {hasAlerts && (
            <div className="mb-2 bg-red-50 border border-red-200 text-red-800 p-1.5 rounded text-[10px]">
              <ul className="list-disc list-inside">{alerts.map((a: any, i: number) => <li key={i}>{a.message}</li>)}</ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
             <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">詳細情報</div>
                <p className="font-mono text-[10px]">{getSourceLabel(reservation.reservation_source)}経由</p>
                {reservation.candidate_datetimes?.candidates && (
                  <div className="mt-1">
                    <div className="text-[10px] text-muted-foreground">候補日時</div>
                    {reservation.candidate_datetimes.candidates.map((c: any, i: number) => (
                      /* @ts-ignore */
                      <div key={i} className="text-[10px] font-mono">{format(new Date(c.date), 'M/d', { locale: ja })} {c.startTime}</div>
                    ))}
                  </div>
                )}
             </div>
             <div className="text-right">
               <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={(e) => e.stopPropagation()}>
                  詳細編集
               </Button>
               <div className="text-[9px] text-muted-foreground mt-1">
                 作成: {/* @ts-ignore */}{format(new Date(reservation.created_at), 'MM/dd HH:mm')}
               </div>
             </div>
          </div>
          {reservation.customer_notes && (
             <div className="mt-2 pt-2 border-t border-dashed">
               <div className="text-[10px] text-muted-foreground mb-0.5">備考</div>
               <p className="text-[10px] opacity-80">{reservation.customer_notes}</p>
             </div>
          )}
        </div>
      )}
    </div>
  )
}
